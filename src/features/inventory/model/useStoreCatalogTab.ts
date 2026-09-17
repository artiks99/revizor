import { ref, computed, nextTick, watch, onMounted, onUnmounted } from 'vue'
import { useInventoryStore } from './useInventoryStore'
import { parseCatalogClipboard } from '@shared/lib/clipboardParser'
import { useTableSort } from '@shared/lib/useTableSort'
import { copySkusToClipboard } from '@shared/lib/clipboard'
import { useExcelColumnFilter } from '@shared/lib/useExcelColumnFilter'
import { withLoading } from '@shared/lib/loadingService'
import { useUndoRedo } from '@shared/lib/useUndoRedo'
import type { StoreCatalogItem } from './types'

export type CatalogFilterType = 'all' | 'duplicates' | 'non_standard'
export type CatalogSortKey = 'sku' | 'name' | 'barcode'

export function useStoreCatalogTab() {
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

  const filterType = ref<CatalogFilterType>('all')

  const isImportModalOpen = ref(false)
  const isMassMenuOpen = ref(false)
  const skuInputRef = ref<HTMLInputElement | null>(null)

  /* --- STATS & COUNTERS --- */
  const catalogStats = computed(() => {
    const items = store.catalogItems
    const counts = new Map<string, number>()
    let nonStandard = 0

    for (let i = 0; i < items.length; i++) {
      const sku = items[i].sku.trim()
      const skuLower = sku.toLowerCase()
      if (skuLower) {
        counts.set(skuLower, (counts.get(skuLower) || 0) + 1)
      }
      if (sku.length !== 7 || !/^\d{7}$/.test(sku)) {
        nonStandard++
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
      duplicateCatalogCount: duplicateCount,
      nonStandardCatalogCount: nonStandard,
    }
  })

  const duplicateSkuSet = computed(() => catalogStats.value.duplicateSkuSet)
  const duplicateCatalogCount = computed(() => catalogStats.value.duplicateCatalogCount)
  const nonStandardCatalogCount = computed(() => catalogStats.value.nonStandardCatalogCount)

  /* --- INLINE ADD ROW STATE --- */
  const newRow = ref({
    sku: '',
    name: '',
    barcode: '',
  })

  function generateRandomSku() {
    newRow.value.sku = String(Math.floor(1000000 + Math.random() * 9000000))
  }

  async function handleAddRow() {
    if (isReadOnly.value) return
    if (!newRow.value.sku.trim()) {
      generateRandomSku()
    }
    if (!newRow.value.name.trim()) return

    const cleanedSku = newRow.value.sku.replace(/\D/g, '').slice(0, 7) || newRow.value.sku.trim()
    if (!cleanedSku) return

    await store.addCatalogItem(cleanedSku, newRow.value.name.trim(), newRow.value.barcode.trim())
    const addedSku = cleanedSku
    const addedName = newRow.value.name.trim()
    const addedBarcode = newRow.value.barcode.trim()
    pushUndoAction({
      description: `Добавление товара: ${addedSku}`,
      undo: async () => {
        const found = store.catalogItems.find((i) => i.sku === addedSku && i.barcode === addedBarcode)
        if (found) await store.removeCatalogItem(found.id)
      },
      redo: async () => {
        await store.addCatalogItem(addedSku, addedName, addedBarcode)
      },
    })

    newRow.value = {
      sku: '',
      name: '',
      barcode: '',
    }

    skuInputRef.value?.focus()
  }

  async function handlePaste(e: ClipboardEvent, field: 'sku' | 'name') {
    if (isReadOnly.value) return
    const text = e.clipboardData?.getData('text')
    if (!text) return

    const rows = parseCatalogClipboard(text, field, store.catalogSkuMap)
    if (rows.length === 0) return

    if (rows.length > 1 || (rows.length === 1 && (rows[0].sku || rows[0].name))) {
      e.preventDefault()
      if (rows.length === 1) {
        if (field === 'sku') {
          newRow.value.sku = rows[0].sku
          if (rows[0].name) newRow.value.name = rows[0].name
          if (rows[0].barcode) newRow.value.barcode = rows[0].barcode
        } else {
          newRow.value.name = rows[0].name
          if (rows[0].barcode) newRow.value.barcode = rows[0].barcode
        }
        showPasteNotif('Значение заполнено из буфера')
      } else {
        store.error = null

        try {
          await withLoading(
            {
              title: 'Вставка в каталог',
              message: `Обработка и сохранение ${rows.length} товаров...`,
              details: 'Пожалуйста, подождите, товары сохраняются в каталог...',
              icon: '📦',
              total: rows.length,
              current: 0,
              unit: 'товаров',
              stage: 'Запись каталога в SQLite',
            },
            async (tracker) => {
              await store.importCatalogBatch(rows, false, (processed, total, chunkIdx, totalChunks) => {
                tracker.setChunk(chunkIdx, totalChunks, 200)
                tracker.step(
                  processed,
                  total,
                  `Пакет ${chunkIdx} из ${totalChunks}`,
                  `Сохранение пакета ${chunkIdx}/${totalChunks} (${processed} из ${total} товаров)...`
                )
              })
              pushUndoAction({
                description: `Вставка ${rows.length} товаров в каталог`,
                undo: async () => {
                  const skus = new Set(rows.map((r) => r.sku))
                  const ids = store.catalogItems.filter((i) => skus.has(i.sku)).map((i) => i.id)
                  if (ids.length > 0) await store.deleteCatalogItemsBatch(ids)
                },
                redo: async () => {
                  await store.importCatalogBatch(rows, false)
                },
              })
              showPasteNotif(`Успешно вставлено ${rows.length} товаров в каталог`)
            }
          )
        } catch (err) {
          console.error('Ошибка вставки каталога из буфера:', err)
        }
      }
    }
  }

  /* --- FILTERING PIPELINE --- */
  const filteredCatalog = computed(() => {
    let result = store.catalogItems

    if (debouncedSearch.value.trim()) {
      const q = debouncedSearch.value.toLowerCase().trim()
      result = result.filter(
        (item) =>
          item.sku.toLowerCase().includes(q) ||
          item.name.toLowerCase().includes(q) ||
          (item.barcode || '').toLowerCase().includes(q)
      )
    }

    if (filterType.value === 'duplicates') {
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
    filteredItems: excelFilteredCatalog,
  } = useExcelColumnFilter<StoreCatalogItem>(filteredCatalog)

  const { sortKey, sortDirection, toggleSort, resetSort, sortedItems } = useTableSort<StoreCatalogItem, CatalogSortKey>(
    excelFilteredCatalog,
    null,
    null
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

  /* --- EDIT MODAL STATE --- */
  const editingItem = ref<StoreCatalogItem | null>(null)
  const editForm = ref({
    sku: '',
    name: '',
    barcode: '',
  })

  function openEditModal(item: StoreCatalogItem) {
    if (isReadOnly.value) return
    editingItem.value = item
    editForm.value = {
      sku: item.sku,
      name: item.name,
      barcode: item.barcode || '',
    }
  }

  function closeEditModal() {
    editingItem.value = null
  }

  async function handleSaveEdit() {
    if (!editingItem.value) return
    const sku = editForm.value.sku.trim()
    const name = editForm.value.name.trim()
    if (!sku || !name) return

    try {
      const prevItem = { ...editingItem.value }
      const barcode = editForm.value.barcode.trim()
      await store.updateCatalogItem({
        id: editingItem.value.id,
        sku,
        name,
        barcode,
      })
      pushUndoAction({
        description: `Редактирование товара ${sku}`,
        undo: async () => {
          await store.updateCatalogItem({
            id: prevItem.id,
            sku: prevItem.sku,
            name: prevItem.name,
            barcode: prevItem.barcode,
          })
        },
        redo: async () => {
          await store.updateCatalogItem({
            id: prevItem.id,
            sku,
            barcode,
            name,
          })
        },
      })
      closeEditModal()
      showPasteNotif(`Товар «${name}» успешно сохранен`)
    } catch (err) {
      console.error('Ошибка сохранения товара в каталоге:', err)
    }
  }

  /* --- SELECTION STATE --- */
  const selectedIds = ref<Set<string>>(new Set())

  const isAllSelected = computed(() => {
    if (sortedItems.value.length === 0) return false
    return sortedItems.value.every((item) => selectedIds.value.has(item.id))
  })

  const isPartiallySelected = computed(() => {
    if (sortedItems.value.length === 0) return false
    const count = sortedItems.value.filter((item) => selectedIds.value.has(item.id)).length
    return count > 0 && count < sortedItems.value.length
  })

  function toggleSelectAll() {
    if (isAllSelected.value) {
      const newSet = new Set(selectedIds.value)
      for (const item of sortedItems.value) {
        newSet.delete(item.id)
      }
      selectedIds.value = newSet
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
    () => store.catalogItems,
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

  /* --- CONFIRMATION DIALOG STATE --- */
  const confirmDialog = ref<{
    isOpen: boolean
    title: string
    description: string
    confirmText: string
    badge?: string
    isDanger?: boolean
    action: () => Promise<void>
  }>({
    isOpen: false,
    title: '',
    description: '',
    confirmText: 'Подтвердить',
    badge: undefined,
    isDanger: false,
    action: async () => {},
  })

  function openConfirmDialog(config: {
    title: string
    description: string
    confirmText: string
    badge?: string
    isDanger?: boolean
    action: () => Promise<void>
  }) {
    isMassMenuOpen.value = false
    confirmDialog.value = {
      isOpen: true,
      ...config,
    }
  }

  async function executeConfirmDialog() {
    const action = confirmDialog.value.action
    const title = confirmDialog.value.title
    confirmDialog.value.isOpen = false
    await nextTick()
    if (!action) return
    try {
      await withLoading(
        {
          title: title || 'Выполнение операции',
          message: 'Пожалуйста, подождите, каталог обновляется в базе данных...',
          icon: '⚡',
        },
        async () => {
          await action()
        }
      )
    } catch (err) {
      console.error('Ошибка выполнения массового действия:', err)
    }
  }

  /* --- ACTIONS --- */
  async function handleDeleteItem(id: string) {
    if (isReadOnly.value) return
    const deletedItem = store.catalogItems.find((i) => i.id === id)
    await store.removeCatalogItem(id)
    selectedIds.value.delete(id)
    if (deletedItem) {
      pushUndoAction({
        description: `Удаление товара: ${deletedItem.sku}`,
        undo: async () => {
          await store.addCatalogItem(deletedItem.sku, deletedItem.name)
        },
        redo: async () => {
          const found = store.catalogItems.find((i) => i.sku === deletedItem.sku)
          if (found) await store.removeCatalogItem(found.id)
        },
      })
    }
  }

  async function handleClearCatalog() {
    if (isReadOnly.value) return
    openConfirmDialog({
      title: 'Полная очистка каталога',
      description: 'Вы действительно хотите полностью очистить весь справочник товаров магазина? Это действие нельзя отменить.',
      confirmText: 'Очистить полностью',
      isDanger: true,
      action: async () => {
        await store.clearCatalog()
        clearSelection()
        showPasteNotif('Каталог товаров очищен')
      },
    })
  }

  async function handleImportCatalog(items: { sku: string; name: string; barcode?: string }[], replaceAll: boolean) {
    if (isReadOnly.value) return
    await withLoading(
      {
        title: 'Импорт каталога товаров',
        message: `Сохранение ${items.length} позиций в каталог...`,
        details: 'Пожалуйста, подождите, данные записываются в базу',
        icon: '📥',
        total: items.length,
        current: 0,
        unit: 'товаров',
        stage: 'Импорт файла CSV в SQLite',
      },
      async (tracker) => {
        await store.importCatalogBatch(items, replaceAll, (processed, total, chunkIdx, totalChunks) => {
          tracker.setChunk(chunkIdx, totalChunks, 200)
          tracker.step(
            processed,
            total,
            `Пакет ${chunkIdx} из ${totalChunks}`,
            `Сохранение пакета ${chunkIdx}/${totalChunks} (${processed} из ${total} товаров)...`
          )
        })
      }
    )
  }

  function handleDeduplicate() {
    if (isReadOnly.value || duplicateCatalogCount.value === 0) return
    openConfirmDialog({
      title: 'Удалить дубликаты каталога',
      description: `Будет оставлена только одна (первая) запись для каждого уникального артикула, а все повторяющиеся строки удалены.`,
      confirmText: 'Удалить дубликаты',
      badge: `⚡ ${duplicateCatalogCount.value} поз.`,
      isDanger: false,
      action: async () => {
        await store.deduplicateCatalog()
        clearSelection()
        showPasteNotif('Дубликаты каталога удалены')
      },
    })
  }

  function handleRemoveNonStandard() {
    if (isReadOnly.value || nonStandardCatalogCount.value === 0) return
    openConfirmDialog({
      title: 'Удалить нестандартные артикулы',
      description: `Будет удалено ${nonStandardCatalogCount.value} товаров с нестандартным кодом ЛК (не ровно 7 цифр).`,
      confirmText: 'Удалить нестандартные',
      badge: `⚠️ ${nonStandardCatalogCount.value} поз.`,
      isDanger: true,
      action: async () => {
        await store.removeCatalogNonStandard()
        clearSelection()
        showPasteNotif(`Удалено ${nonStandardCatalogCount.value} нестандартных позиций`)
      },
    })
  }

  function handleRemoveFiltered() {
    if (isReadOnly.value || sortedItems.value.length === 0) return
    const count = sortedItems.value.length
    openConfirmDialog({
      title: 'Удалить отфильтрованные товары',
      description: `Будет удалено ${count} товаров, отображаемых по текущему фильтру или поиску.`,
      confirmText: `Удалить ${count} поз.`,
      badge: `🔍 ${count} поз.`,
      isDanger: true,
      action: async () => {
        const ids = sortedItems.value.map((i) => i.id)
        await store.deleteCatalogItemsBatch(ids)
        clearSelection()
        showPasteNotif(`Успешно удалено ${count} товаров`)
      },
    })
  }

  function handleDeleteSelected() {
    if (isReadOnly.value || selectedIds.value.size === 0) return
    const count = selectedIds.value.size
    openConfirmDialog({
      title: 'Удалить выбранные товары',
      description: `Вы действительно хотите удалить ${count} отмеченных товаров из каталога?`,
      confirmText: `Удалить (${count})`,
      badge: `✓ ${count} выбрано`,
      isDanger: true,
      action: async () => {
        const selectedSet = selectedIds.value
        const idList = Array.from(selectedSet)
        const itemsToDelete = count <= 500 ? store.catalogItems.filter((i) => selectedSet.has(i.id)) : []
        await store.deleteCatalogItemsBatch(idList)
        clearSelection()
        if (itemsToDelete.length > 0) {
          const deletedData = itemsToDelete.map((it) => ({ sku: it.sku, name: it.name, barcode: it.barcode }))
          pushUndoAction({
            description: `Удаление ${itemsToDelete.length} товаров из каталога`,
            undo: async () => {
              await store.importCatalogBatch(deletedData, false)
            },
            redo: async () => {
              const skuSet = new Set(deletedData.map((d) => d.sku))
              const ids = store.catalogItems.filter((i) => skuSet.has(i.sku)).map((i) => i.id)
              if (ids.length > 0) await store.deleteCatalogItemsBatch(ids)
            },
          })
        }
        showPasteNotif(`Успешно удалено ${count} позиций`)
      },
    })
  }

  async function handleCopyFilteredSkus() {
    if (sortedItems.value.length === 0) return
    isMassMenuOpen.value = false
    const skus = sortedItems.value.map((i) => i.sku)
    await copySkusToClipboard(skus, { label: 'Каталог: ЛК' })
    showPasteNotif(`Скопировано ${skus.length} ЛК в буфер обмена`)
  }

  async function handleCopySelectedSkus() {
    if (selectedIds.value.size === 0) return
    isMassMenuOpen.value = false
    const idSet = selectedIds.value
    const skus = store.catalogItems.filter((i) => idSet.has(i.id)).map((i) => i.sku)
    await copySkusToClipboard(skus, { label: 'Выбранные ЛК' })
    showPasteNotif(`Скопировано ${skus.length} ЛК в буфер обмена`)
  }

  function handleDocClick(e: MouseEvent) {
    const target = e.target as HTMLElement | null
    if (!target?.closest('#catalog-mass-actions-menu-wrapper')) {
      isMassMenuOpen.value = false
    }
  }

  onMounted(() => {
    document.addEventListener('click', handleDocClick)
  })

  onUnmounted(() => {
    document.removeEventListener('click', handleDocClick)
  })

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
    catalogStats,
    duplicateSkuSet,
    duplicateCatalogCount,
    nonStandardCatalogCount,
    columnFilters,
    getDistinctValues,
    setColumnFilter,
    sortKey,
    sortDirection,
    toggleSort,
    sortedItems,
    isFilterActive,
    handleResetFilters,
    editingItem,
    editForm,
    openEditModal,
    closeEditModal,
    handleSaveEdit,
    selectedIds,
    isAllSelected,
    isPartiallySelected,
    toggleSelectAll,
    toggleSelectItem,
    clearSelection,
    confirmDialog,
    executeConfirmDialog,
    handleDeleteItem,
    handleClearCatalog,
    handleImportCatalog,
    handleDeduplicate,
    handleRemoveNonStandard,
    handleRemoveFiltered,
    handleDeleteSelected,
    handleCopyFilteredSkus,
    handleCopySelectedSkus,
  }
}
