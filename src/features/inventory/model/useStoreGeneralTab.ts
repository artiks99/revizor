import { ref, computed, watch } from 'vue'
import { useInventoryStore } from './useInventoryStore'
import { useTableSort } from '@shared/lib/useTableSort'
import { useExcelColumnFilter } from '@shared/lib/useExcelColumnFilter'
import { copySkusToClipboard } from '@shared/lib/clipboard'
import { withLoading } from '@shared/lib/loadingService'
import { useUndoRedo } from '@shared/lib/useUndoRedo'
import { formatDateTime } from '@shared/lib/formatDate'
import type { StoreGeneralItem } from './types'

export interface GeneralRowView {
  id: string
  sku: string
  name: string
  mentionsCount: number
  factQuantity: number
  multiplicity: number
  stockQuantity: number | null
  discrepancy: number | null
  is299: boolean
  isNotFoundInCatalog: boolean
  locationTooltip: string
  createdAt?: string
  updatedAt?: string
}

export type GeneralFilterType = 'all' | 'discrepancies' | 'no_fact' | 'is_299' | 'mult_gt_1' | 'nd'

export function useStoreGeneralTab() {
  const store = useInventoryStore()
  const isReadOnly = computed(() => !!store.activeRevision?.isArchived)

  // Notification toast
  const notificationMsg = ref<string | null>(null)
  let notifTimeout: ReturnType<typeof setTimeout> | null = null

  function showNotification(msg: string) {
    notificationMsg.value = msg
    if (notifTimeout) clearTimeout(notifTimeout)
    notifTimeout = setTimeout(() => {
      notificationMsg.value = null
    }, 3000)
  }

  // Undo / Redo
  const undoRedo = useUndoRedo({
    isReadOnly,
    onNotify: showNotification,
  })
  const { pushAction: pushUndoAction } = undoRedo

  // Search & Quick filter
  const searchQuery = ref('')
  const debouncedSearch = ref('')
  let searchTimer: ReturnType<typeof setTimeout> | null = null

  watch(searchQuery, (val) => {
    if (searchTimer) clearTimeout(searchTimer)
    searchTimer = setTimeout(() => {
      debouncedSearch.value = val.trim().toLowerCase()
    }, 200)
  })

  const quickFilter = ref<GeneralFilterType>('all')

  // Enriched rows with auto-bound fields
  const enrichedRows = computed<GeneralRowView[]>(() => {
    const rawItems = store.generalItems
    return rawItems.map((item) => {
      const cleanSku = item.sku.trim()
      const catalogName = store.catalogSkuMap.get(cleanSku)
      const isNd = store.isNotFoundInCatalog(cleanSku)
      const name = catalogName || (isNd ? 'Н/Д' : 'Товар без названия')
      const mentionsCount = store.getFactSkuCount(cleanSku)
      const factQuantity = store.getFactSkuQuantity(cleanSku)
      const multiplicity = store.getMultiplicityValue(cleanSku)
      const stockQuantity = store.getStockItemQuantity(cleanSku)
      const discrepancy = stockQuantity !== null ? Number((factQuantity - stockQuantity).toFixed(3)) : null
      const is299 = store.isAccount299Item(cleanSku)
      const locationTooltip = store.getFactLocationTooltip(cleanSku)

      return {
        id: item.id,
        sku: cleanSku,
        name,
        mentionsCount,
        factQuantity,
        multiplicity,
        stockQuantity,
        discrepancy,
        is299,
        isNotFoundInCatalog: isNd,
        locationTooltip,
        createdAt: item.createdAt,
        updatedAt: item.updatedAt,
      }
    })
  })

  // Quick filter statistics
  const filterStats = computed(() => {
    let discrepancies = 0
    let noFact = 0
    let is299Count = 0
    let multGt1 = 0
    let ndCount = 0

    for (const row of enrichedRows.value) {
      if (row.discrepancy !== null && row.discrepancy !== 0) discrepancies++
      if (row.mentionsCount === 0) noFact++
      if (row.is299) is299Count++
      if (row.multiplicity > 1) multGt1++
      if (row.isNotFoundInCatalog) ndCount++
    }

    return {
      total: enrichedRows.value.length,
      discrepancies,
      noFact,
      is299Count,
      multGt1,
      ndCount,
    }
  })

  // Pre-filtered rows before column filtering (quick filter + text search)
  const preFilteredRows = computed<GeneralRowView[]>(() => {
    let list = enrichedRows.value

    // 1. Quick filter
    if (quickFilter.value === 'discrepancies') {
      list = list.filter((r) => r.discrepancy !== null && r.discrepancy !== 0)
    } else if (quickFilter.value === 'no_fact') {
      list = list.filter((r) => r.mentionsCount === 0)
    } else if (quickFilter.value === 'is_299') {
      list = list.filter((r) => r.is299)
    } else if (quickFilter.value === 'mult_gt_1') {
      list = list.filter((r) => r.multiplicity > 1)
    } else if (quickFilter.value === 'nd') {
      list = list.filter((r) => r.isNotFoundInCatalog)
    }

    // 2. Search query
    const q = debouncedSearch.value
    if (q) {
      list = list.filter((r) => r.sku.toLowerCase().includes(q) || r.name.toLowerCase().includes(q))
    }

    return list
  })

  // Excel column filtering with full distinct value stats and counts
  const {
    columnFilters,
    getDistinctValues,
    setColumnFilter,
    clearColumnFilter,
    clearAllColumnFilters,
    activeFilterCount: excelFilterCount,
    filteredItems: filteredRows,
  } = useExcelColumnFilter<GeneralRowView>(
    () => preFilteredRows.value,
    {
      sku: (r) => r.sku,
      name: (r) => r.name,
      mentionsCount: (r) => `${r.mentionsCount}`,
      factQuantity: (r) => `${r.factQuantity} шт.`,
      multiplicity: (r) => `x${r.multiplicity}`,
      stockQuantity: (r) => `${r.stockQuantity} шт.`,
      discrepancy: (r) => (r.discrepancy !== null ? `${r.discrepancy > 0 ? '+' : ''}${r.discrepancy} шт.` : '—'),
      is299: (r) => (r.is299 ? 'Да' : 'Нет'),
      updatedAt: (r) => (r.updatedAt ? formatDateTime(r.updatedAt) : '—'),
    }
  )

  // Sorting
  const { sortKey, sortDirection, toggleSort, resetSort, sortedItems: sortedRows } = useTableSort<GeneralRowView>(
    filteredRows,
    'sku',
    'asc'
  )

  function resetAllFilters() {
    quickFilter.value = 'all'
    searchQuery.value = ''
    clearAllColumnFilters()
    resetSort()
  }

  // Row selection
  const selectedIds = ref<Set<string>>(new Set())

  const isAllSelected = computed(() => {
    return sortedRows.value.length > 0 && sortedRows.value.every((r) => selectedIds.value.has(r.id))
  })

  const isSomeSelected = computed(() => {
    return selectedIds.value.size > 0 && !isAllSelected.value
  })

  function toggleSelectAll() {
    if (isAllSelected.value) {
      selectedIds.value.clear()
    } else {
      for (const row of sortedRows.value) {
        selectedIds.value.add(row.id)
      }
    }
  }

  function toggleSelectRow(id: string) {
    if (selectedIds.value.has(id)) {
      selectedIds.value.delete(id)
    } else {
      selectedIds.value.add(id)
    }
  }

  function clearSelection() {
    selectedIds.value.clear()
  }

  // Adding single LK
  const newSku = ref('')

  async function handleAddSingleSku() {
    if (isReadOnly.value) return
    const skuClean = newSku.value.trim().replace(/\D/g, '')
    if (!skuClean) {
      showNotification('Введите корректный артикул (цифры)')
      return
    }

    try {
      const created = await store.addGeneralItem(skuClean)
      if (created) {
        newSku.value = ''
        pushUndoAction({
          description: `Добавление артикула ${skuClean}`,
          undo: async () => {
            await store.removeGeneralItem(created.id)
          },
          redo: async () => {
            await store.addGeneralItem(skuClean)
          },
        })
        showNotification(`Артикул ${skuClean} добавлен`)
      }
    } catch (e) {
      showNotification('Ошибка добавления артикула')
    }
  }

  // Paste handler
  async function handlePasteSku(e: ClipboardEvent) {
    if (isReadOnly.value) return
    const text = e.clipboardData?.getData('text')
    if (!text) return

    const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean)
    if (lines.length === 0) return

    // Single value without delimiters
    if (lines.length === 1 && !lines[0].includes('\t') && !lines[0].includes(';') && !lines[0].includes(',')) {
      const cleanDigits = lines[0].replace(/\D/g, '').slice(0, 7)
      if (cleanDigits) {
        newSku.value = cleanDigits
        e.preventDefault()
      }
      return
    }

    // Tabular or multiline paste
    e.preventDefault()
    const parsedSkus: string[] = []
    for (const line of lines) {
      if (!line) continue
      if (line.includes('\t') || line.includes(';')) {
        const firstCol = line.split(/[\t;]+/)[0]?.trim()
        const sku = firstCol ? firstCol.replace(/\D/g, '').slice(0, 7) : ''
        if (sku && sku.length >= 4) {
          parsedSkus.push(sku)
        }
      } else {
        const tokens = line.split(/[,\s]+/).map((t) => t.trim()).filter(Boolean)
        for (const token of tokens) {
          const sku = token.replace(/\D/g, '').slice(0, 7)
          if (sku && sku.length >= 4) {
            parsedSkus.push(sku)
          }
        }
      }
    }

    if (parsedSkus.length === 0) return

    if (parsedSkus.length === 1) {
      newSku.value = parsedSkus[0]
      showNotification(`Заполнено: ${parsedSkus[0]}`)
      return
    }

    const itemsToAdd = parsedSkus.map((sku) => ({ sku }))
    try {
      await withLoading(
        {
          title: 'Вставка артикулов в «Общее»',
          message: `Сохранение ${itemsToAdd.length} артикулов...`,
          icon: '📋',
          current: 0,
          total: itemsToAdd.length,
          unit: 'поз.',
        },
        async (tracker) => {
          await store.addGeneralBatch(itemsToAdd, (processed, total, currentSku) => {
            tracker.step(
              processed,
              total,
              currentSku ? `Артикул: ${currentSku}` : undefined,
              `Сохранение в БД (${processed} из ${total})...`
            )
          })
          pushUndoAction({
            description: `Вставка ${itemsToAdd.length} артикулов в общее`,
            undo: async () => {
              const skusSet = new Set(parsedSkus)
              const ids = store.generalItems.filter((i) => skusSet.has(i.sku)).map((i) => i.id)
              if (ids.length > 0) await store.deleteGeneralItemsBatch(ids)
            },
            redo: async () => {
              await store.addGeneralBatch(itemsToAdd)
            },
          })
          showNotification(`Успешно добавлено ${itemsToAdd.length} артикулов`)
        }
      )
    } catch (err) {
      console.error('Ошибка вставки ЛК:', err)
      showNotification('Ошибка вставки позиций')
    }
  }

  // Delete selected
  async function handleDeleteSelected() {
    if (isReadOnly.value || selectedIds.value.size === 0) return
    const selectedSet = selectedIds.value
    const ids = Array.from(selectedSet)
    const itemsToDelete = ids.length <= 500 ? store.generalItems.filter((i) => selectedSet.has(i.id)) : []

    try {
      await store.deleteGeneralItemsBatch(ids)
      clearSelection()
      if (itemsToDelete.length > 0) {
        pushUndoAction({
          description: `Удаление ${ids.length} позиций из общего`,
          undo: async () => {
            await store.addGeneralBatch(itemsToDelete.map((i) => ({ sku: i.sku })))
          },
          redo: async () => {
            await store.deleteGeneralItemsBatch(ids)
          },
        })
      }
      showNotification(`Удалено ${ids.length} позиций`)
    } catch (err) {
      console.error('Ошибка удаления позиций:', err)
      showNotification('Ошибка удаления позиций')
    }
  }

  // Delete single row
  async function handleDeleteRow(row: GeneralRowView) {
    if (isReadOnly.value) return
    try {
      await store.removeGeneralItem(row.id)
      selectedIds.value.delete(row.id)
      pushUndoAction({
        description: `Удаление артикула ${row.sku}`,
        undo: async () => {
          await store.addGeneralItem(row.sku)
        },
        redo: async () => {
          await store.removeGeneralItem(row.id)
        },
      })
      showNotification(`Артикул ${row.sku} удален`)
    } catch (err) {
      showNotification('Ошибка удаления позиции')
    }
  }

  // Copy selected SKUs
  function handleCopySelected() {
    const ids = selectedIds.value
    const skus = store.generalItems.filter((i) => ids.has(i.id)).map((i) => i.sku)
    if (skus.length === 0) return
    copySkusToClipboard(skus)
    showNotification(`Скопировано ${skus.length} ЛК в буфер обмена`)
  }

  // Copy all visible SKUs
  function handleCopyAllVisible() {
    const skus = sortedRows.value.map((r) => r.sku)
    if (skus.length === 0) return
    copySkusToClipboard(skus)
    showNotification(`Скопировано ${skus.length} ЛК в буфер обмена`)
  }

  // Export to CSV
  function exportToCsv() {
    const rows = sortedRows.value
    if (rows.length === 0) {
      showNotification('Нет данных для экспорта')
      return
    }

    const headers = [
      '№',
      'ЛК (Артикул)',
      'Наименование',
      'Упоминаний в факте',
      'Посчитано на складе',
      'Кратность',
      'Системный остаток',
      'Расхождение',
      'Счет 299',
      'Дата изменения',
    ]

    const csvLines = [headers.join(';')]
    rows.forEach((r, idx) => {
      const line = [
        idx + 1,
        `"${r.sku}"`,
        `"${r.name.replace(/"/g, '""')}"`,
        r.mentionsCount,
        r.factQuantity,
        r.multiplicity,
        r.stockQuantity !== null ? r.stockQuantity : '',
        r.discrepancy !== null ? r.discrepancy : '',
        r.is299 ? 'Да' : 'Нет',
        r.updatedAt ? `"${formatDateTime(r.updatedAt)}"` : '',
      ]
      csvLines.push(line.join(';'))
    })

    const blob = new Blob(['\ufeff' + csvLines.join('\r\n')], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `Общее_Магазин_${store.activeStoreNumber || 'ревизия'}.csv`
    link.click()
    URL.revokeObjectURL(url)
    showNotification('CSV успешно экспортирован')
  }

  return {
    store,
    isReadOnly,
    notificationMsg,
    showNotification,
    undoRedo,
    searchQuery,
    quickFilter,
    filterStats,
    sortedRows,
    sortKey,
    sortDirection,
    toggleSort,
    resetAllFilters,
    columnFilters,
    setColumnFilter,
    clearColumnFilter,
    clearAllColumnFilters,
    getDistinctValues,
    selectedIds,
    isAllSelected,
    isSomeSelected,
    toggleSelectAll,
    toggleSelectRow,
    clearSelection,
    newSku,
    handleAddSingleSku,
    handlePasteSku,
    handleDeleteSelected,
    handleDeleteRow,
    handleCopySelected,
    handleCopyAllVisible,
    exportToCsv,
  }
}
