import { ref, computed, nextTick, watch, onMounted, onUnmounted } from 'vue'
import { useInventoryStore } from './useInventoryStore'
import { parseAccount299Clipboard } from '@shared/lib/clipboardParser'
import { exportAccount299Csv } from '@shared/lib/csvParser'
import { useTableSort } from '@shared/lib/useTableSort'
import { copySkusToClipboard, useExcelColumnFilter, withLoading, useUndoRedo } from '@shared'
import type { StoreAccount299Item } from './types'

export type Account299FilterType = 'all' | 'in_catalog' | 'nd' | 'duplicates' | 'non_standard'
export type Account299SortKey = 'sku' | 'name'

export interface Account299ConfirmDialogOptions {
  title: string
  description: string
  confirmText: string
  badge?: string
  isDanger?: boolean
  action: () => Promise<void>
}

export function useStoreAccount299Tab() {
  const store = useInventoryStore()
  const isReadOnly = computed(() => !!store.activeRevision?.isArchived)

  /* --- TOAST NOTIFICATION --- */
  const pasteNotification = ref<string | null>(null)
  let pasteNotifTimeout: any = null

  function showPasteNotif(msg: string) {
    pasteNotification.value = msg
    if (pasteNotifTimeout) clearTimeout(pasteNotifTimeout)
    pasteNotifTimeout = setTimeout(() => {
      pasteNotification.value = null
    }, 3500)
  }

  /* --- UNDO / REDO SYSTEM --- */
  const undoRedo = useUndoRedo({
    isReadOnly,
    onNotify: showPasteNotif,
  })
  const { pushAction: pushUndoAction } = undoRedo

  /* --- SEARCH & QUICK FILTERS --- */
  const searchQuery = ref('')
  const debouncedSearch = ref('')
  let searchDebounceTimer: any = null
  watch(searchQuery, (val) => {
    if (searchDebounceTimer) clearTimeout(searchDebounceTimer)
    searchDebounceTimer = setTimeout(() => {
      debouncedSearch.value = val
    }, 200)
  })

  const filterType = ref<Account299FilterType>('all')
  const isImportModalOpen = ref(false)
  const isMassMenuOpen = ref(false)
  const skuInputRef = ref<HTMLInputElement | null>(null)

  /* --- STATS & COUNTERS --- */
  const account299Stats = computed(() => {
    const items = store.account299Items
    const counts = new Map<string, number>()
    let nonStandard = 0
    let nd = 0
    let inCatalog = 0

    for (let i = 0; i < items.length; i++) {
      const sku = items[i].sku.trim()
      const skuLower = sku.toLowerCase()
      if (skuLower) {
        counts.set(skuLower, (counts.get(skuLower) || 0) + 1)
      }
      if (sku.length !== 7 || !/^\d{7}$/.test(sku)) {
        nonStandard++
      }
      if (store.isNotFoundInCatalog(sku)) {
        nd++
      } else {
        inCatalog++
      }
    }

    const dupes = new Set<string>()
    let duplicateCount = 0
    for (const [sku, count] of counts.entries()) {
      if (count > 1) {
        dupes.add(sku)
        duplicateCount += count
      }
    }

    return {
      duplicateSkuSet: dupes,
      duplicateCount,
      nonStandardCount: nonStandard,
      ndCount: nd,
      inCatalogCount: inCatalog,
    }
  })

  const duplicateSkuSet = computed(() => account299Stats.value.duplicateSkuSet)
  const duplicateCount = computed(() => account299Stats.value.duplicateCount)
  const nonStandardCount = computed(() => account299Stats.value.nonStandardCount)
  const ndCount = computed(() => account299Stats.value.ndCount)
  const inCatalogCount = computed(() => account299Stats.value.inCatalogCount)

  /* --- INLINE ADD ROW STATE --- */
  const newRow = ref({
    sku: '',
  })

  function generateRandomSku() {
    if (store.catalogItems.length > 0) {
      const rand = store.catalogItems[Math.floor(Math.random() * store.catalogItems.length)]
      newRow.value.sku = rand.sku
      return
    }
    newRow.value.sku = String(Math.floor(1000000 + Math.random() * 9000000))
  }

  async function handleAddRow() {
    if (isReadOnly.value) return
    const sku = newRow.value.sku.trim()
    if (!sku) {
      store.error = 'Укажите артикул / ЛК позиции'
      return
    }

    const name = store.catalogSkuMap.get(sku) || 'Н/Д'

    try {
      await store.addAccount299Item({ sku, name })
      pushUndoAction({
        description: `Добавление позиции 299: ${sku}`,
        undo: async () => {
          const found = store.account299Items.find((i) => i.sku === sku)
          if (found) await store.removeAccount299Item(found.id)
        },
        redo: async () => {
          await store.addAccount299Item({ sku, name })
        },
      })
      newRow.value.sku = ''
      showPasteNotif(`Позиция ${sku} добавлена`)
      nextTick(() => {
        skuInputRef.value?.focus()
      })
    } catch (err) {
      console.error('Ошибка добавления позиции в 299:', err)
    }
  }

  async function handlePaste(e: ClipboardEvent) {
    if (isReadOnly.value) return
    const text = e.clipboardData?.getData('text')
    if (!text) return

    const catalogMap = store.catalogSkuMap
    const rows = parseAccount299Clipboard(text, 'sku', catalogMap)
    if (rows.length === 0) return

    if (rows.length > 1 || (rows.length === 1 && (rows[0].sku || rows[0].name))) {
      e.preventDefault()
      if (rows.length === 1) {
        newRow.value.sku = rows[0].sku
        showPasteNotif('Значение заполнено из буфера')
      } else {
        store.error = null

        try {
          await withLoading(
            {
              title: 'Вставка счёта 299',
              message: `Обработка и автоподвязка ${rows.length} позиций...`,
              details: 'Пожалуйста, подождите, данные сохраняются в базу данных',
              icon: '🏷️',
              total: rows.length,
              current: 0,
              unit: 'поз.',
              stage: 'Запись счёта 299 в SQLite',
            },
            async (tracker) => {
              await store.importAccount299Batch(rows, false, (processed, total, chunkIdx, totalChunks) => {
                tracker.setChunk(chunkIdx, totalChunks, 200)
                tracker.step(
                  processed,
                  total,
                  `Пакет ${chunkIdx} из ${totalChunks}`,
                  `Сохранение пакета ${chunkIdx}/${totalChunks} (${processed} из ${total} поз.)...`
                )
              })
              pushUndoAction({
                description: `Вставка ${rows.length} позиций счета 299`,
                undo: async () => {
                  const skus = new Set(rows.map((r) => r.sku))
                  const ids = store.account299Items.filter((i) => skus.has(i.sku)).map((i) => i.id)
                  if (ids.length > 0) await store.deleteAccount299ItemsBatch(ids)
                },
                redo: async () => {
                  await store.importAccount299Batch(rows, false)
                },
              })
              showPasteNotif(`Успешно вставлено ${rows.length} позиций счета 299`)
            }
          )
        } catch (err) {
          console.error('Ошибка вставки счета 299 из буфера:', err)
        }
      }
    }
  }

  /* --- FILTERING & SORTING --- */
  const filteredItems = computed(() => {
    let result = store.account299Items

    if (debouncedSearch.value.trim()) {
      const q = debouncedSearch.value.toLowerCase().trim()
      result = result.filter(
        (item) =>
          item.sku.toLowerCase().includes(q) ||
          store.getAccount299ItemName(item.sku, item.name).toLowerCase().includes(q)
      )
    }

    if (filterType.value === 'in_catalog') {
      result = result.filter((item) => !store.isNotFoundInCatalog(item.sku))
    } else if (filterType.value === 'nd') {
      result = result.filter((item) => store.isNotFoundInCatalog(item.sku))
    } else if (filterType.value === 'duplicates') {
      result = result.filter((item) => duplicateSkuSet.value.has(item.sku.trim().toLowerCase()))
    } else if (filterType.value === 'non_standard') {
      result = result.filter((item) => !/^\d{7}$/.test(item.sku.trim()))
    }

    return result
  })

  const {
    columnFilters,
    getDistinctValues,
    setColumnFilter,
    clearAllColumnFilters,
    activeFilterCount: excelFilterCount,
    filteredItems: excelFilteredItems,
  } = useExcelColumnFilter<StoreAccount299Item>(
    filteredItems,
    {
      name: (item) => store.getAccount299ItemName(item.sku, item.name),
    }
  )

  const { sortKey, sortDirection, toggleSort, resetSort, sortedItems } = useTableSort<StoreAccount299Item, Account299SortKey>(
    excelFilteredItems,
    null,
    null,
    {
      name: (item) => store.getAccount299ItemName(item.sku, item.name),
    }
  )

  const isFilterActive = computed(() => {
    return !!(searchQuery.value.trim() || filterType.value !== 'all' || sortKey.value || excelFilterCount.value > 0)
  })

  function handleResetFilters() {
    searchQuery.value = ''
    debouncedSearch.value = ''
    filterType.value = 'all'
    resetSort()
    clearAllColumnFilters()
  }

  /* --- SELECTION SYSTEM --- */
  const selectedIds = ref<Set<string>>(new Set())

  const isAllSelected = computed(() => {
    if (sortedItems.value.length === 0) return false
    return sortedItems.value.every((i) => selectedIds.value.has(i.id))
  })

  const isSomeSelected = computed(() => {
    if (isAllSelected.value) return false
    return sortedItems.value.some((i) => selectedIds.value.has(i.id))
  })

  function toggleSelectAll() {
    if (isAllSelected.value) {
      selectedIds.value = new Set()
    } else {
      const newSet = new Set(selectedIds.value)
      for (const item of sortedItems.value) {
        newSet.add(item.id)
      }
      selectedIds.value = newSet
    }
  }

  function toggleSelectItem(id: string) {
    const newSet = new Set(selectedIds.value)
    if (newSet.has(id)) {
      newSet.delete(id)
    } else {
      newSet.add(id)
    }
    selectedIds.value = newSet
  }

  function clearSelection() {
    selectedIds.value = new Set()
  }

  watch(
    () => store.account299Items,
    (newItems) => {
      if (selectedIds.value.size === 0) return
      if (!newItems || newItems.length === 0) {
        selectedIds.value = new Set()
        return
      }
      const currentIdSet = new Set(newItems.map((i) => i.id))
      let changed = false
      const updated = new Set<string>()
      for (const id of selectedIds.value) {
        if (currentIdSet.has(id)) {
          updated.add(id)
        } else {
          changed = true
        }
      }
      if (changed) {
        selectedIds.value = updated
      }
    }
  )

  /* --- CONFIRMATION DIALOG --- */
  const confirmDialog = ref<Account299ConfirmDialogOptions | null>(null)

  function openConfirmDialog(opts: Account299ConfirmDialogOptions) {
    confirmDialog.value = opts
  }

  function closeConfirmDialog() {
    confirmDialog.value = null
  }

  async function executeConfirmDialog() {
    if (!confirmDialog.value) return
    const action = confirmDialog.value.action
    const title = confirmDialog.value.title
    closeConfirmDialog()
    await nextTick()
    if (!action) return
    try {
      await withLoading(
        {
          title: title || 'Выполнение операции',
          message: 'Пожалуйста, подождите, данные счёта 299 обновляются...',
          icon: '⚡',
        },
        async () => {
          await action()
        }
      )
    } catch (err) {
      console.error('Ошибка выполнения действия:', err)
    }
  }

  /* --- ACTIONS --- */
  function handleDeleteSingle(item: StoreAccount299Item) {
    if (isReadOnly.value) return
    const resolvedName = store.getAccount299ItemName(item.sku, item.name)
    openConfirmDialog({
      title: 'Удалить позицию счета 299',
      description: `Вы уверены, что хотите удалить позицию «${resolvedName}» (ЛК: ${item.sku})?`,
      confirmText: 'Удалить',
      badge: `ЛК: ${item.sku}`,
      isDanger: true,
      action: async () => {
        const deletedItem = { ...item }
        await store.removeAccount299Item(item.id)
        selectedIds.value.delete(item.id)
        pushUndoAction({
          description: `Удаление позиции 299: ${deletedItem.sku}`,
          undo: async () => {
            await store.addAccount299Item({ sku: deletedItem.sku, name: deletedItem.name })
          },
          redo: async () => {
            const found = store.account299Items.find((i) => i.sku === deletedItem.sku)
            if (found) await store.removeAccount299Item(found.id)
          },
        })
        showPasteNotif('Позиция удалена')
      },
    })
  }

  function handleDeduplicate() {
    if (isReadOnly.value || duplicateCount.value === 0) return
    openConfirmDialog({
      title: 'Удалить дубликаты счета 299',
      description: `Будет оставлена только одна (первая) запись для каждого уникального артикула, а все повторяющиеся строки удалены.`,
      confirmText: 'Удалить дубликаты',
      badge: `⚡ ${duplicateCount.value} поз.`,
      isDanger: false,
      action: async () => {
        await store.removeAccount299Duplicates(true)
        clearSelection()
        showPasteNotif('Дубликаты счета 299 удалены')
      },
    })
  }

  function handleRemoveNonStandard() {
    if (isReadOnly.value || nonStandardCount.value === 0) return
    openConfirmDialog({
      title: 'Удалить нестандартные артикулы',
      description: `Будет удалено ${nonStandardCount.value} позиций счета 299 с кодом ЛК не из 7 цифр.`,
      confirmText: 'Удалить нестандартные',
      badge: `⚠️ ${nonStandardCount.value} поз.`,
      isDanger: true,
      action: async () => {
        await store.removeAccount299NonStandard()
        clearSelection()
        showPasteNotif(`Удалено ${nonStandardCount.value} нестандартных позиций`)
      },
    })
  }

  function handleRemoveNotFound() {
    if (isReadOnly.value || ndCount.value === 0) return
    openConfirmDialog({
      title: 'Удалить позиции Н/Д',
      description: `Будет удалено ${ndCount.value} позиций, отсутствующих в справочнике «Товары магазина».`,
      confirmText: 'Удалить Н/Д',
      badge: `⚠️ ${ndCount.value} поз.`,
      isDanger: true,
      action: async () => {
        await store.removeAccount299NotFound()
        clearSelection()
        showPasteNotif(`Удалено ${ndCount.value} позиций со статусом Н/Д`)
      },
    })
  }

  function handleRemoveFiltered() {
    if (isReadOnly.value || sortedItems.value.length === 0) return
    const count = sortedItems.value.length
    openConfirmDialog({
      title: 'Удалить отфильтрованные позиции',
      description: `Будет удалено ${count} позиций, отображаемых по текущему фильтру или поиску.`,
      confirmText: `Удалить ${count} поз.`,
      badge: `🔍 ${count} поз.`,
      isDanger: true,
      action: async () => {
        const ids = sortedItems.value.map((i) => i.id)
        await store.deleteAccount299ItemsBatch(ids)
        clearSelection()
        showPasteNotif(`Успешно удалено ${count} позиций`)
      },
    })
  }

  function handleDeleteSelected() {
    if (isReadOnly.value || selectedIds.value.size === 0) return
    const count = selectedIds.value.size
    openConfirmDialog({
      title: 'Удалить выбранные позиции',
      description: `Вы действительно хотите удалить ${count} отмеченных позиций из счета 299?`,
      confirmText: `Удалить (${count})`,
      badge: `✓ ${count} выбрано`,
      isDanger: true,
      action: async () => {
        const selectedSet = selectedIds.value
        const idList = Array.from(selectedSet)
        const itemsToDelete = count <= 500 ? store.account299Items.filter((i) => selectedSet.has(i.id)) : []
        await store.deleteAccount299ItemsBatch(idList)
        clearSelection()
        if (itemsToDelete.length > 0) {
          const deletedData = itemsToDelete.map((it) => ({ sku: it.sku, name: it.name }))
          pushUndoAction({
            description: `Удаление ${itemsToDelete.length} позиций счета 299`,
            undo: async () => {
              await store.importAccount299Batch(deletedData, false)
            },
            redo: async () => {
              const skuSet = new Set(deletedData.map((d) => d.sku))
              const ids = store.account299Items.filter((i) => skuSet.has(i.sku)).map((i) => i.id)
              if (ids.length > 0) await store.deleteAccount299ItemsBatch(ids)
            },
          })
        }
        showPasteNotif(`Успешно удалено ${count} позиций`)
      },
    })
  }

  function handleClearAll() {
    if (isReadOnly.value || store.totalAccount299Count === 0) return
    openConfirmDialog({
      title: 'Очистить список счета 299',
      description: `Вы уверены, что хотите полностью удалить все ${store.totalAccount299Count} позиций счета 299 для текущей ревизии?`,
      confirmText: 'Очистить все',
      badge: `🗑️ ${store.totalAccount299Count} поз.`,
      isDanger: true,
      action: async () => {
        await store.clearAccount299()
        clearSelection()
        showPasteNotif('Список счета 299 полностью очищен')
      },
    })
  }

  function handleExportCsv() {
    if (sortedItems.value.length === 0) return
    const exportItems = sortedItems.value.map((item) => ({
      ...item,
      name: store.getAccount299ItemName(item.sku, item.name),
    }))
    const csv = exportAccount299Csv(exportItems)
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `account_299_${store.activeStoreNumber || 'export'}.csv`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
    showPasteNotif('Файл CSV успешно экспортирован')
  }

  async function handleCsvImport(items: { sku: string; name: string }[], replaceAll: boolean) {
    try {
      await withLoading(
        {
          title: 'Импорт позиций счёта 299',
          message: `Сохранение и автоподвязка ${items.length} позиций...`,
          details: 'Пожалуйста, подождите, данные записываются в базу',
          icon: '📥',
          total: items.length,
          current: 0,
          unit: 'поз.',
          stage: 'Импорт файла CSV в SQLite',
        },
        async (tracker) => {
          await store.importAccount299Batch(items, replaceAll, (processed, total, chunkIdx, totalChunks) => {
            tracker.setChunk(chunkIdx, totalChunks, 200)
            tracker.step(
              processed,
              total,
              `Пакет ${chunkIdx} из ${totalChunks}`,
              `Сохранение пакета ${chunkIdx}/${totalChunks} (${processed} из ${total} поз.)...`
            )
          })
          showPasteNotif(`Импортировано ${items.length} позиций счета 299`)
        }
      )
    } catch (err) {
      console.error('Ошибка CSV-импорта 299:', err)
    }
  }

  async function handleRebindNames() {
    if (isReadOnly.value || store.totalAccount299Count === 0) return
    isMassMenuOpen.value = false
    await withLoading(
      {
        title: 'Автоподвязка наименований',
        message: 'Сопоставление артикулов со справочником каталога...',
        details: 'Пожалуйста, подождите, наименования обновляются',
        icon: '🔄',
      },
      async () => {
        const updated = await store.rebindAccount299Names()
        showPasteNotif(updated > 0 ? `Обновлены наименования у ${updated} позиций` : 'Все наименования соответствуют каталогу')
      }
    )
  }

  /* --- SKU CLIPBOARD COPY HANDLERS --- */
  async function handleCopyFilteredSkus() {
    if (sortedItems.value.length === 0) return
    isMassMenuOpen.value = false
    const skus = sortedItems.value.map((i) => i.sku)
    await copySkusToClipboard(skus, { label: 'Текущие ЛК' })
    showPasteNotif(`Скопировано ${skus.length} ЛК в буфер обмена`)
  }

  async function handleCopySelectedSkus() {
    if (selectedIds.value.size === 0) return
    isMassMenuOpen.value = false
    const idSet = selectedIds.value
    const skus = store.account299Items.filter((i) => idSet.has(i.id)).map((i) => i.sku)
    await copySkusToClipboard(skus, { label: 'Выбранные ЛК' })
    showPasteNotif(`Скопировано ${skus.length} ЛК в буфер обмена`)
  }

  async function handleCopyNotFoundSkus() {
    isMassMenuOpen.value = false
    const skus = store.account299Items.filter((i) => store.isNotFoundInCatalog(i.sku)).map((i) => i.sku)
    if (skus.length === 0) return
    await copySkusToClipboard(skus, { label: 'ЛК со статусом Н/Д' })
    showPasteNotif(`Скопировано ${skus.length} ЛК (Н/Д) в буфер обмена`)
  }

  async function handleCopyAllSkus() {
    isMassMenuOpen.value = false
    const skus = store.account299Items.map((i) => i.sku)
    if (skus.length === 0) return
    await copySkusToClipboard(skus, { label: 'Все ЛК счета 299' })
    showPasteNotif(`Скопировано ${skus.length} ЛК в буфер обмена`)
  }

  function handleDocClick(e: MouseEvent) {
    const target = e.target as HTMLElement | null
    if (!target?.closest('#account299-mass-menu-wrapper')) {
      isMassMenuOpen.value = false
    }
  }

  onMounted(() => {
    document.addEventListener('click', handleDocClick)
  })

  onUnmounted(() => {
    document.removeEventListener('click', handleDocClick)
  })

  /* --- EDIT MODAL --- */
  const editingItem = ref<StoreAccount299Item | null>(null)
  const editForm = ref({ sku: '', name: '' })

  function openEditModal(item: StoreAccount299Item) {
    editingItem.value = item
    editForm.value = {
      sku: item.sku,
      name: item.name || '',
    }
  }

  function closeEditModal() {
    editingItem.value = null
  }

  async function handleSaveEdit() {
    if (!editingItem.value) return
    const skuClean = editForm.value.sku.replace(/\D/g, '').slice(0, 7) || editForm.value.sku.trim()
    let name = editForm.value.name.trim()
    if (!name && store.catalogSkuMap.has(skuClean)) {
      name = store.catalogSkuMap.get(skuClean)!
    }
    await store.updateAccount299Item({
      id: editingItem.value.id,
      sku: skuClean,
      name: name || `Товар ${skuClean}`,
    })
    closeEditModal()
    showPasteNotif('Позиция 299 обновлена')
  }

  return {
    store,
    isReadOnly,
    undoRedo,
    searchQuery,
    debouncedSearch,
    filterType,
    isImportModalOpen,
    isMassMenuOpen,
    skuInputRef,
    pasteNotification,
    showPasteNotif,
    newRow,
    generateRandomSku,
    handleAddRow,
    handlePaste,
    account299Stats,
    duplicateSkuSet,
    duplicateCount,
    nonStandardCount,
    ndCount,
    inCatalogCount,
    columnFilters,
    getDistinctValues,
    setColumnFilter,
    sortKey,
    sortDirection,
    toggleSort,
    sortedItems,
    isFilterActive,
    handleResetFilters,
    selectedIds,
    isAllSelected,
    isSomeSelected,
    toggleSelectAll,
    toggleSelectItem,
    clearSelection,
    confirmDialog,
    openConfirmDialog,
    closeConfirmDialog,
    executeConfirmDialog,
    handleDeleteSingle,
    editingItem,
    editForm,
    openEditModal,
    closeEditModal,
    handleSaveEdit,
    handleDeduplicate,
    handleRemoveNonStandard,
    handleRemoveNotFound,
    handleRemoveFiltered,
    handleDeleteSelected,
    handleClearAll,
    handleExportCsv,
    handleCsvImport,
    handleRebindNames,
    handleCopyFilteredSkus,
    handleCopySelectedSkus,
    handleCopyNotFoundSkus,
    handleCopyAllSkus,
  }
}
