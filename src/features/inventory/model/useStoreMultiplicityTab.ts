import { ref, computed, nextTick, watch, onMounted, onUnmounted } from 'vue'
import { useInventoryStore } from './useInventoryStore'
import { useTableSort } from '@shared/lib/useTableSort'
import { copySkusToClipboard, useExcelColumnFilter, withLoading, useUndoRedo } from '@shared'
import type { StoreMultiplicityItem } from './types'

export type MultiplicityFilterType = 'all' | 'in_catalog' | 'nd' | 'gt_one' | 'duplicates'
export type MultiplicitySortKey = 'sku' | 'name' | 'multiplicity'

export interface MultiplicityConfirmDialogOptions {
  title: string
  description: string
  confirmText: string
  badge?: string
  isDanger?: boolean
  action: () => Promise<void>
}

export function useStoreMultiplicityTab() {
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

  const filterType = ref<MultiplicityFilterType>('all')
  const isMassMenuOpen = ref(false)
  const skuInputRef = ref<HTMLInputElement | null>(null)

  /* --- STATS & COUNTERS --- */
  const multiplicityStats = computed(() => {
    const items = store.multiplicityItems
    const counts = new Map<string, number>()
    let nd = 0
    let inCatalog = 0
    let gtOne = 0

    for (let i = 0; i < items.length; i++) {
      const sku = items[i].sku.trim()
      const skuLower = sku.toLowerCase()
      if (skuLower) {
        counts.set(skuLower, (counts.get(skuLower) || 0) + 1)
      }
      if (store.isNotFoundInCatalog(sku)) {
        nd++
      } else {
        inCatalog++
      }
      if (items[i].multiplicity > 1) {
        gtOne++
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
      ndCount: nd,
      inCatalogCount: inCatalog,
      multiplicityGtOneCount: gtOne,
    }
  })

  const duplicateSkuSet = computed(() => multiplicityStats.value.duplicateSkuSet)
  const duplicateCount = computed(() => multiplicityStats.value.duplicateCount)
  const ndCount = computed(() => multiplicityStats.value.ndCount)
  const inCatalogCount = computed(() => multiplicityStats.value.inCatalogCount)
  const multiplicityGtOneCount = computed(() => multiplicityStats.value.multiplicityGtOneCount)

  /* --- RESOLVE NAME --- */
  function getDisplayName(item: StoreMultiplicityItem): string {
    const catalogName = store.catalogSkuMap.get(item.sku.trim())
    if (catalogName) return catalogName
    if (item.name && item.name !== 'Н/Д' && !item.name.startsWith('Товар ') && item.name !== 'Товар без названия') {
      return item.name
    }
    return 'Н/Д'
  }

  /* --- INLINE ADD ROW STATE --- */
  const newRow = ref({
    sku: '',
    multiplicity: 1,
  })

  function pickRandomCatalogSku() {
    const catalogList = store.catalogItems
    if (!catalogList || catalogList.length === 0) {
      store.error = 'Справочник каталога пуст'
      return
    }
    const randomIndex = Math.floor(Math.random() * catalogList.length)
    const chosen = catalogList[randomIndex]
    newRow.value.sku = chosen.sku
    showPasteNotif(`Выбран случайный товар: ${chosen.sku}`)
  }

  async function handleAddRow() {
    if (isReadOnly.value) return
    const sku = newRow.value.sku.trim()
    if (!sku) {
      store.error = 'Укажите артикул / ЛК позиции'
      return
    }
    const multiplicity = Number(newRow.value.multiplicity)
    if (!multiplicity || multiplicity < 1) {
      store.error = 'Укажите кратность ≥ 1'
      return
    }

    try {
      await store.addMultiplicityItem({ sku, multiplicity })
      pushUndoAction({
        description: `Добавление кратности: ${sku} (×${multiplicity})`,
        undo: async () => {
          const found = store.multiplicityItems.find((i) => i.sku === sku)
          if (found) await store.removeMultiplicityItem(found.id)
        },
        redo: async () => {
          await store.addMultiplicityItem({ sku, multiplicity })
        },
      })
      newRow.value.sku = ''
      newRow.value.multiplicity = 1
      showPasteNotif(`Позиция ${sku} добавлена (кратность: ×${multiplicity})`)
      nextTick(() => {
        skuInputRef.value?.focus()
      })
    } catch (err) {
      console.error('Ошибка добавления позиции в кратность:', err)
    }
  }

  async function handlePasteSku(e: ClipboardEvent) {
    if (isReadOnly.value) return
    const text = e.clipboardData?.getData('text')
    if (!text) return

    const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean)
    if (lines.length === 0) return

    if (lines.length === 1 && !lines[0].includes('\t') && !lines[0].includes(';')) {
      const cleanDigits = lines[0].replace(/\D/g, '').slice(0, 7)
      if (cleanDigits) {
        newRow.value.sku = cleanDigits
        e.preventDefault()
      }
      return
    }

    e.preventDefault()
    const parsedItems: { sku: string; multiplicity: number }[] = []
    for (const line of lines) {
      const parts = line.split(/[\t;]+/).map((p) => p.trim())
      const sku = parts[0]?.replace(/\D/g, '').slice(0, 7)
      if (!sku) continue
      let mult = 1
      if (parts.length > 1) {
        const num = parseInt(parts[parts.length - 1], 10)
        if (!isNaN(num) && num >= 1) {
          mult = num
        }
      }
      parsedItems.push({ sku, multiplicity: mult })
    }

    if (parsedItems.length === 0) return

    if (parsedItems.length === 1) {
      newRow.value.sku = parsedItems[0].sku
      newRow.value.multiplicity = parsedItems[0].multiplicity
      showPasteNotif(`Заполнено: ${parsedItems[0].sku} (кратность: ×${parsedItems[0].multiplicity})`)
      return
    }

    try {
      await withLoading(
        {
          title: 'Вставка позиций кратности',
          message: `Подготовка к сохранению ${parsedItems.length} позиций...`,
          details: 'Пожалуйста, подождите, данные сохраняются в базу',
          icon: '📐',
          current: 0,
          total: parsedItems.length,
          unit: 'поз.',
        },
        async (tracker) => {
          await store.addMultiplicityBatch(parsedItems, (processed, total, currentSku) => {
            tracker.step(
              processed,
              total,
              currentSku ? `Артикул: ${currentSku}` : undefined,
              `Сохранение в базу данных (${processed} из ${total})...`
            )
          })
          pushUndoAction({
            description: `Вставка ${parsedItems.length} позиций кратности`,
            undo: async () => {
              const skusToDel = new Set(parsedItems.map((p) => p.sku))
              const ids = store.multiplicityItems.filter((i) => skusToDel.has(i.sku)).map((i) => i.id)
              if (ids.length > 0) await store.deleteMultiplicityItemsBatch(ids)
            },
            redo: async () => {
              await store.addMultiplicityBatch(parsedItems)
            },
          })
          showPasteNotif(`Успешно добавлено ${parsedItems.length} позиций кратности`)
        }
      )
    } catch (err) {
      console.error('Ошибка вставки кратности из буфера:', err)
    }
  }

  /* --- INLINE EDITING --- */
  const inlineEditing = ref<{ id: string; multiplicity: number } | null>(null)

  function startInlineEdit(item: StoreMultiplicityItem) {
    if (isReadOnly.value) return
    inlineEditing.value = {
      id: item.id,
      multiplicity: item.multiplicity,
    }
  }

  function cancelInlineEdit() {
    inlineEditing.value = null
  }

  async function saveInlineEdit(item: StoreMultiplicityItem) {
    if (!inlineEditing.value || inlineEditing.value.id !== item.id) return
    const newMultiplicity = Number(inlineEditing.value.multiplicity)
    if (!newMultiplicity || newMultiplicity < 1) {
      cancelInlineEdit()
      return
    }
    if (newMultiplicity !== item.multiplicity) {
      const prevMultiplicity = item.multiplicity
      await store.updateMultiplicityItem({
        id: item.id,
        sku: item.sku,
        name: item.name,
        multiplicity: newMultiplicity,
      })
      pushUndoAction({
        description: `Кратность для ${item.sku}: ×${newMultiplicity}`,
        undo: async () => {
          await store.updateMultiplicityItem({
            id: item.id,
            sku: item.sku,
            name: item.name,
            multiplicity: prevMultiplicity,
          })
        },
        redo: async () => {
          await store.updateMultiplicityItem({
            id: item.id,
            sku: item.sku,
            name: item.name,
            multiplicity: newMultiplicity,
          })
        },
      })
      showPasteNotif(`Кратность для ${item.sku} обновлена: ×${newMultiplicity}`)
    }
    inlineEditing.value = null
  }

  /* --- FILTERING & SORTING --- */
  const preFilteredItems = computed(() => {
    let result = store.multiplicityItems

    const q = debouncedSearch.value.trim().toLowerCase()
    if (q) {
      result = result.filter((item) => {
        const name = getDisplayName(item).toLowerCase()
        const sku = item.sku.toLowerCase()
        return sku.includes(q) || name.includes(q)
      })
    }

    if (filterType.value === 'in_catalog') {
      result = result.filter((i) => !store.isNotFoundInCatalog(i.sku))
    } else if (filterType.value === 'nd') {
      result = result.filter((i) => store.isNotFoundInCatalog(i.sku))
    } else if (filterType.value === 'gt_one') {
      result = result.filter((i) => i.multiplicity > 1)
    } else if (filterType.value === 'duplicates') {
      result = result.filter((i) => duplicateSkuSet.value.has(i.sku.trim().toLowerCase()))
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
  } = useExcelColumnFilter<StoreMultiplicityItem>(
    () => preFilteredItems.value,
    {
      sku: (item) => item.sku,
      name: (item) => getDisplayName(item),
      multiplicity: (item) => `${item.multiplicity}`,
    }
  )

  const {
    sortedItems,
    sortKey,
    sortDirection,
    toggleSort,
    resetSort,
  } = useTableSort(excelFilteredItems, null, null, {
    name: (item) => getDisplayName(item),
  })

  const isFilterActive = computed(() => {
    return (
      filterType.value !== 'all' ||
      debouncedSearch.value.trim().length > 0 ||
      excelFilterCount.value > 0
    )
  })

  function resetFilters() {
    filterType.value = 'all'
    searchQuery.value = ''
    clearAllColumnFilters()
    resetSort()
  }

  /* --- CHECKBOX SELECTION --- */
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
    () => store.multiplicityItems,
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
  const confirmDialog = ref<MultiplicityConfirmDialogOptions | null>(null)

  function openConfirmDialog(opts: MultiplicityConfirmDialogOptions) {
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
          message: 'Пожалуйста, подождите, данные обновляются...',
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
  function handleDeleteSingle(item: StoreMultiplicityItem) {
    if (isReadOnly.value) return
    const resolvedName = getDisplayName(item)
    openConfirmDialog({
      title: 'Удалить позицию кратности',
      description: `Вы уверены, что хотите удалить позицию «${resolvedName}» (ЛК: ${item.sku}, кратность: ×${item.multiplicity})?`,
      confirmText: 'Удалить',
      badge: `ЛК: ${item.sku}`,
      isDanger: true,
      action: async () => {
        const deletedItem = { ...item }
        await store.removeMultiplicityItem(item.id)
        selectedIds.value.delete(item.id)
        pushUndoAction({
          description: `Удаление позиции: ${deletedItem.sku}`,
          undo: async () => {
            await store.addMultiplicityItem({
              sku: deletedItem.sku,
              multiplicity: deletedItem.multiplicity,
            })
          },
          redo: async () => {
            const found = store.multiplicityItems.find((i) => i.sku === deletedItem.sku)
            if (found) await store.removeMultiplicityItem(found.id)
          },
        })
        showPasteNotif('Позиция удалена')
      },
    })
  }

  function handleDeleteSelected() {
    if (isReadOnly.value || selectedIds.value.size === 0) return
    const count = selectedIds.value.size
    openConfirmDialog({
      title: 'Удалить выбранные позиции',
      description: `Вы действительно хотите удалить ${count} отмеченных позиций кратности?`,
      confirmText: `Удалить (${count})`,
      badge: `✓ ${count} выбрано`,
      isDanger: true,
      action: async () => {
        const selectedSet = selectedIds.value
        const idList = Array.from(selectedSet)
        const itemsToDelete = count <= 500 ? store.multiplicityItems.filter((i) => selectedSet.has(i.id)) : []
        await store.deleteMultiplicityItemsBatch(idList)
        clearSelection()
        if (itemsToDelete.length > 0) {
          const deletedData = itemsToDelete.map((it) => ({ sku: it.sku, name: it.name, multiplicity: it.multiplicity }))
          pushUndoAction({
            description: `Удаление ${itemsToDelete.length} позиций кратности`,
            undo: async () => {
              await store.addMultiplicityBatch(deletedData)
            },
            redo: async () => {
              const skuSet = new Set(deletedData.map((d) => d.sku))
              const ids = store.multiplicityItems.filter((i) => skuSet.has(i.sku)).map((i) => i.id)
              if (ids.length > 0) await store.deleteMultiplicityItemsBatch(ids)
            },
          })
        }
        showPasteNotif(`Успешно удалено ${count} позиций`)
      },
    })
  }

  function handleClearAll() {
    if (isReadOnly.value || store.totalMultiplicityCount === 0) return
    openConfirmDialog({
      title: 'Очистить список кратности',
      description: `Вы уверены, что хотите полностью удалить все ${store.totalMultiplicityCount} позиций кратности для текущей ревизии?`,
      confirmText: 'Очистить все',
      badge: `🗑️ ${store.totalMultiplicityCount} поз.`,
      isDanger: true,
      action: async () => {
        await store.clearMultiplicity()
        clearSelection()
        showPasteNotif('Список кратности полностью очищен')
      },
    })
  }

  function handleExportCsv() {
    if (sortedItems.value.length === 0) return
    const headers = 'ЛК (Артикул);Наименование;Кратность'
    const rows = sortedItems.value.map((item) => {
      const name = getDisplayName(item).replace(/;/g, ' ')
      return `${item.sku};${name};${item.multiplicity}`
    })
    const csv = '\uFEFF' + [headers, ...rows].join('\r\n')
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `multiplicity_${store.activeStoreNumber || 'export'}.csv`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
    showPasteNotif('Файл CSV успешно экспортирован')
  }

  async function handleCopySelectedSkus() {
    if (selectedIds.value.size === 0) return
    isMassMenuOpen.value = false
    const idSet = selectedIds.value
    const skus = store.multiplicityItems.filter((i) => idSet.has(i.id)).map((i) => i.sku)
    await copySkusToClipboard(skus, { label: 'Выбранные ЛК' })
    showPasteNotif(`Скопировано ${skus.length} ЛК в буфер обмена`)
  }

  async function handleCopyFilteredSkus() {
    if (sortedItems.value.length === 0) return
    isMassMenuOpen.value = false
    const skus = sortedItems.value.map((i) => i.sku)
    await copySkusToClipboard(skus, { label: 'Отфильтрованные ЛК' })
    showPasteNotif(`Скопировано ${skus.length} ЛК в буфер обмена`)
  }

  async function handleCopyAllSkus() {
    isMassMenuOpen.value = false
    const skus = store.multiplicityItems.map((i) => i.sku)
    if (skus.length === 0) return
    await copySkusToClipboard(skus, { label: 'Все ЛК кратности' })
    showPasteNotif(`Скопировано ${skus.length} ЛК в буфер обмена`)
  }

  function handleDocClick(e: MouseEvent) {
    const target = e.target as HTMLElement | null
    if (!target?.closest('#multiplicity-mass-menu-wrapper')) {
      isMassMenuOpen.value = false
    }
  }

  function handleGlobalKeyDown(e: KeyboardEvent) {
    if (e.key === 'Escape') {
      if (isMassMenuOpen.value) {
        isMassMenuOpen.value = false
        return
      }
      if (confirmDialog.value) {
        closeConfirmDialog()
        return
      }
      if (inlineEditing.value) {
        cancelInlineEdit()
        return
      }
      if (selectedIds.value.size > 0) {
        clearSelection()
        return
      }
    }

    if (e.key === 'Delete' && selectedIds.value.size > 0 && !inlineEditing.value) {
      const activeEl = document.activeElement
      const isInput = activeEl?.tagName === 'INPUT' || activeEl?.tagName === 'TEXTAREA'
      if (!isInput) {
        e.preventDefault()
        handleDeleteSelected()
      }
    }
  }

  onMounted(() => {
    document.addEventListener('click', handleDocClick)
    window.addEventListener('keydown', handleGlobalKeyDown)
  })

  onUnmounted(() => {
    document.removeEventListener('click', handleDocClick)
    window.removeEventListener('keydown', handleGlobalKeyDown)
  })

  return {
    store,
    isReadOnly,
    undoRedo,
    searchQuery,
    debouncedSearch,
    filterType,
    isMassMenuOpen,
    skuInputRef,
    pasteNotification,
    showPasteNotif,
    newRow,
    pickRandomCatalogSku,
    handleAddRow,
    handlePasteSku,
    multiplicityStats,
    duplicateSkuSet,
    duplicateCount,
    ndCount,
    inCatalogCount,
    multiplicityGtOneCount,
    getDisplayName,
    columnFilters,
    getDistinctValues,
    setColumnFilter,
    sortKey,
    sortDirection,
    toggleSort,
    sortedItems,
    isFilterActive,
    resetFilters,
    selectedIds,
    isAllSelected,
    isSomeSelected,
    toggleSelectAll,
    toggleSelectItem,
    clearSelection,
    inlineEditing,
    startInlineEdit,
    cancelInlineEdit,
    saveInlineEdit,
    confirmDialog,
    openConfirmDialog,
    closeConfirmDialog,
    executeConfirmDialog,
    handleDeleteSingle,
    handleDeleteSelected,
    handleClearAll,
    handleExportCsv,
    handleCopySelectedSkus,
    handleCopyFilteredSkus,
    handleCopyAllSkus,
  }
}
