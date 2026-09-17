import { ref, computed, watch, onMounted, onUnmounted, nextTick } from 'vue'
import { useInventoryStore } from './useInventoryStore'
import { useTableSort } from '@shared/lib/useTableSort'
import { useExcelColumnFilter } from '@shared/lib/useExcelColumnFilter'
import { copySkusToClipboard } from '@shared/lib/clipboard'
import { withLoading } from '@shared/lib/loadingService'
import { useUndoRedo } from '@shared/lib/useUndoRedo'
import { copyToClipboard } from '@shared/lib/clipboard'
import {
  parseFactClipboard,
  parseQuantityListFromClipboard,
  parseLocationEntriesFromClipboard,
  parseBoxNumberEntriesFromClipboard,
} from '@shared/lib/clipboardParser'
import type { InventoryItem, InventoryItemStatus } from './types'
import { useFactCellSelection } from './useFactCellSelection'
import { useFactBatchOperations } from './useFactBatchOperations'

export type FactFilterStatus = 'all' | '299' | 'nd' | 'in_catalog' | 'duplicates' | 'non_standard' | 'mult_gt_1'

export function useStoreFactTab() {
  const store = useInventoryStore()
  const isReadOnly = computed(() => !!store.activeRevision?.isArchived)

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

  const filterStatus = ref<FactFilterStatus>('all')
  const selectedLocation = ref<string | null>(null)

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

  /* --- UNDO / REDO SYSTEM (Ctrl+Z / Ctrl+Y) --- */
  const undoRedo = useUndoRedo({
    isReadOnly,
    onNotify: showPasteNotif,
  })
  const { pushAction: pushUndoAction, undo: handleUndo, redo: handleRedo } = undoRedo

  /* --- STATS & COUNTERS --- */
  const distinctLocations = computed(() => {
    const locSet = new Set<string>()
    for (const item of store.items) {
      if (item.location && item.location.trim()) {
        locSet.add(item.location.trim())
      }
    }
    return Array.from(locSet).sort((a, b) => a.localeCompare(b, undefined, { numeric: true }))
  })

  const factStats = computed(() => {
    const counts = new Map<string, number>()
    let nonStandard = 0
    let nd = 0
    let inCatalog = 0
    let in299 = 0
    let multGt1 = 0

    for (const item of store.items) {
      const sku = item.sku.trim()
      counts.set(sku, (counts.get(sku) || 0) + 1)

      if (!/^\d{7}$/.test(sku)) {
        nonStandard++
      }
      if (store.isNotFoundInCatalog(sku)) {
        nd++
      } else {
        inCatalog++
      }
      if (store.isAccount299Item(sku)) {
        in299++
      }
      if (store.getMultiplicityValue(sku) > 1) {
        multGt1++
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
      skuCounts: counts,
      duplicateSkuSet: dupes,
      duplicateCount,
      nonStandardCount: nonStandard,
      ndCount: nd,
      inCatalogCount: inCatalog,
      in299Count: in299,
      multGt1Count: multGt1,
    }
  })

  const duplicateSkuSet = computed(() => factStats.value.duplicateSkuSet)
  const duplicateFactCount = computed(() => factStats.value.duplicateCount)
  const nonStandardFactCount = computed(() => factStats.value.nonStandardCount)
  const ndFactCount = computed(() => factStats.value.ndCount)
  const inCatalogFactCount = computed(() => factStats.value.inCatalogCount)
  const account299FactCount = computed(() => factStats.value.in299Count)
  const multGt1FactCount = computed(() => factStats.value.multGt1Count)

  function getSkuMentions(sku: string): number {
    return factStats.value.skuCounts.get(sku.trim()) || 0
  }

  const skuTooltipMap = computed(() => {
    const skuMap = new Map<
      string,
      {
        totalQty: number
        locations: Map<string, { qty: number; boxes: Set<string> }>
        noLocationQty: number
        noLocationBoxes: Set<string>
      }
    >()

    for (const item of store.items) {
      const sku = item.sku.trim()
      let data = skuMap.get(sku)
      if (!data) {
        data = {
          totalQty: 0,
          locations: new Map(),
          noLocationQty: 0,
          noLocationBoxes: new Set(),
        }
        skuMap.set(sku, data)
      }

      data.totalQty += item.quantity

      const loc = item.location?.trim()
      const box = item.boxNumber?.trim()
      if (loc) {
        let locData = data.locations.get(loc)
        if (!locData) {
          locData = { qty: 0, boxes: new Set() }
          data.locations.set(loc, locData)
        }
        locData.qty += item.quantity
        if (box) locData.boxes.add(box)
      } else {
        data.noLocationQty += item.quantity
        if (box) data.noLocationBoxes.add(box)
      }
    }

    const result = new Map<string, string>()
    for (const [sku, data] of skuMap.entries()) {
      const parts: string[] = []
      const mult = store.getMultiplicityValue(sku)
      if (mult > 1) {
        parts.push(`Кратность: ${mult}`)
      }
      parts.push(`Всего в ревизии: ${data.totalQty} шт.`)

      if (data.locations.size > 0 || data.noLocationQty > 0) {
        parts.push('Разбивка по местам:')
        for (const [loc, locData] of data.locations.entries()) {
          let str = ` • ${loc}: ${locData.qty} шт.`
          if (locData.boxes.size > 0) {
            str += ` (кор. ${Array.from(locData.boxes).join(', ')})`
          }
          parts.push(str)
        }
        if (data.noLocationQty > 0) {
          let str = ` • Без локации: ${data.noLocationQty} шт.`
          if (data.noLocationBoxes.size > 0) {
            str += ` (кор. ${Array.from(data.noLocationBoxes).join(', ')})`
          }
          parts.push(str)
        }
      }
      result.set(sku, parts.join('\n'))
    }
    return result
  })

  function getItemTooltip(item: InventoryItem): string {
    return skuTooltipMap.value.get(item.sku.trim()) || ''
  }

  const isFilterActive = computed(() => {
    return (
      filterStatus.value !== 'all' ||
      selectedLocation.value !== null ||
      searchQuery.value.trim() !== '' ||
      hasActiveExcelFilters.value
    )
  })

  function handleResetFilters() {
    filterStatus.value = 'all'
    selectedLocation.value = null
    searchQuery.value = ''
    debouncedSearch.value = ''
    clearAllColumnFilters()
  }

  /* --- FILTERING PIPELINE --- */
  const preFilteredItems = computed(() => {
    let result = store.items

    if (filterStatus.value === 'duplicates') {
      result = result.filter((item) => duplicateSkuSet.value.has(item.sku.trim()))
    } else if (filterStatus.value === 'non_standard') {
      result = result.filter((item) => !/^\d{7}$/.test(item.sku.trim()))
    } else if (filterStatus.value === 'nd') {
      result = result.filter((item) => store.isNotFoundInCatalog(item.sku.trim()))
    } else if (filterStatus.value === 'in_catalog') {
      result = result.filter((item) => !store.isNotFoundInCatalog(item.sku.trim()))
    } else if (filterStatus.value === '299') {
      result = result.filter((item) => store.isAccount299Item(item.sku.trim()))
    } else if (filterStatus.value === 'mult_gt_1') {
      result = result.filter((item) => store.getMultiplicityValue(item.sku.trim()) > 1)
    }

    if (selectedLocation.value !== null) {
      if (selectedLocation.value === '__empty__') {
        result = result.filter((item) => !item.location || !item.location.trim())
      } else {
        result = result.filter(
          (item) => item.location && item.location.trim() === selectedLocation.value
        )
      }
    }

    if (debouncedSearch.value.trim()) {
      const q = debouncedSearch.value.trim().toLowerCase()
      result = result.filter((item) => {
        const skuMatch = item.sku.toLowerCase().includes(q)
        const nameMatch = store.getFactItemName(item.sku, item.name).toLowerCase().includes(q)
        const locMatch = item.location ? item.location.toLowerCase().includes(q) : false
        const boxMatch = item.boxNumber ? item.boxNumber.toLowerCase().includes(q) : false
        return skuMatch || nameMatch || locMatch || boxMatch
      })
    }

    return result
  })

  /* --- DISCREPANCIES --- */
  const skuFactTotalQtyMap = computed(() => {
    const map = new Map<string, number>()
    for (const item of store.items) {
      const sku = item.sku.trim().toLowerCase()
      map.set(sku, (map.get(sku) || 0) + item.quantity)
    }
    return map
  })

  function getFactDiscrepancy(
    item: { sku: string; quantity?: number },
    explicitTotalQty?: number
  ): {
    diff: number
    text: string
    type: 'ok' | 'surplus' | 'shortage'
  } {
    const cleanSku = (item.sku || '').trim()
    if (!cleanSku) {
      return { diff: 0, text: 'ОК', type: 'ok' }
    }

    const skuLower = cleanSku.toLowerCase()
    const totalFactQty =
      explicitTotalQty !== undefined
        ? explicitTotalQty
        : (skuFactTotalQtyMap.value.get(skuLower) ?? (Number(item.quantity) || 0))
    const stockQty = store.getStockItemQuantity(cleanSku)

    if (stockQty === null) {
      if (totalFactQty === 0) {
        return { diff: 0, text: 'ОК', type: 'ok' }
      }
      return {
        diff: totalFactQty,
        text: totalFactQty > 0 ? `+${totalFactQty}` : `${totalFactQty}`,
        type: totalFactQty > 0 ? 'surplus' : 'shortage',
      }
    }

    const diff = Number((totalFactQty - stockQty).toFixed(3))
    if (diff === 0) {
      return { diff: 0, text: 'ОК', type: 'ok' }
    }
    if (diff > 0) {
      return { diff, text: `+${diff}`, type: 'surplus' }
    }
    return { diff, text: `${diff}`, type: 'shortage' }
  }

  /* --- EXCEL COLUMN FILTER COMPOSABLE --- */
  type FactSortKey =
    | 'sku'
    | 'name'
    | 'mentions'
    | 'quantity'
    | 'boxNumber'
    | 'multiplicity'
    | 'location'
    | 'audit'
    | 'discrepancy'
    | 'updatedAt'

  const {
    filteredItems,
    columnFilters,
    setColumnFilter,
    clearColumnFilter,
    clearAllColumnFilters,
    getDistinctValues,
    hasActiveFilters: hasActiveExcelFilters,
  } = useExcelColumnFilter<InventoryItem>(() => preFilteredItems.value, {
    name: (item) => store.getFactItemName(item.sku, item.name),
    mentions: (item) => String(getSkuMentions(item.sku)),
    quantity: (item) => `${item.quantity} ${item.unit || 'шт.'}`,
    boxNumber: (item) => item.boxNumber || '',
    multiplicity: (item) => `x${store.getMultiplicityValue(item.sku)}`,
    location: (item) => item.location || '',
    audit: (item) => {
      const q = store.getStockItemQuantity(item.sku)
      return q !== null ? `${q} шт.` : '—'
    },
    discrepancy: (item) => getFactDiscrepancy(item).text,
    updatedAt: (item) => item.updatedAt || '',
  })

  /* --- TABLE SORT --- */
  const { sortKey, sortDirection, toggleSort, sortedItems } = useTableSort<InventoryItem, FactSortKey>(
    filteredItems,
    null,
    null,
    {
      name: (item) => store.getFactItemName(item.sku, item.name),
      mentions: (item) => getSkuMentions(item.sku),
      boxNumber: (item) => item.boxNumber || '',
      multiplicity: (item) => store.getMultiplicityValue(item.sku),
      audit: (item) => store.getStockItemQuantity(item.sku) ?? -1,
      discrepancy: (item) => getFactDiscrepancy(item).diff,
      updatedAt: (item) => item.updatedAt || '',
    }
  )

  /* --- SELECTION (CHECKBOXES) --- */
  const selectedIds = ref<Set<string>>(new Set())
  const lastSelectedRowIndex = ref<number | null>(null)
  const isCheckboxDragging = ref(false)
  const checkboxDragStartIndex = ref<number | null>(null)
  const checkboxDragTargetState = ref(false)
  const checkboxInitialSelectedSet = ref<Set<string>>(new Set())

  const isAllSelected = computed(() => {
    return sortedItems.value.length > 0 && selectedIds.value.size === sortedItems.value.length
  })

  const isPartiallySelected = computed(() => {
    return selectedIds.value.size > 0 && selectedIds.value.size < sortedItems.value.length
  })

  function toggleSelectAll() {
    if (isAllSelected.value) {
      selectedIds.value = new Set()
    } else {
      selectedIds.value = new Set(sortedItems.value.map((i) => i.id))
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

  function onCheckboxCellMouseDown(id: string, index: number, event: MouseEvent) {
    if (isReadOnly.value || event.button !== 0) return

    if (event.shiftKey && lastSelectedRowIndex.value !== null) {
      const start = Math.min(lastSelectedRowIndex.value, index)
      const end = Math.max(lastSelectedRowIndex.value, index)
      const newSet = new Set(selectedIds.value)
      const shouldSelect = !selectedIds.value.has(id)
      for (let i = start; i <= end; i++) {
        const rowItem = sortedItems.value[i]
        if (rowItem) {
          if (shouldSelect) newSet.add(rowItem.id)
          else newSet.delete(rowItem.id)
        }
      }
      selectedIds.value = newSet
      lastSelectedRowIndex.value = index
      return
    }

    isCheckboxDragging.value = true
    checkboxDragStartIndex.value = index
    const willSelect = !selectedIds.value.has(id)
    checkboxDragTargetState.value = willSelect
    checkboxInitialSelectedSet.value = new Set(selectedIds.value)

    const newSet = new Set(selectedIds.value)
    if (willSelect) {
      newSet.add(id)
    } else {
      newSet.delete(id)
    }
    selectedIds.value = newSet
    lastSelectedRowIndex.value = index
  }

  function onCheckboxCellMouseEnter(index: number) {
    if (!isCheckboxDragging.value || checkboxDragStartIndex.value === null) return

    const start = Math.min(checkboxDragStartIndex.value, index)
    const end = Math.max(checkboxDragStartIndex.value, index)
    const newSet = new Set(checkboxInitialSelectedSet.value)

    for (let i = start; i <= end; i++) {
      const rowItem = sortedItems.value[i]
      if (rowItem) {
        if (checkboxDragTargetState.value) {
          newSet.add(rowItem.id)
        } else {
          newSet.delete(rowItem.id)
        }
      }
    }
    selectedIds.value = newSet
    lastSelectedRowIndex.value = index
  }

  function handleCheckboxClick(id: string, index: number, event: MouseEvent) {
    onCheckboxCellMouseDown(id, index, event)
  }

  function clearSelection() {
    selectedIds.value = new Set()
    lastSelectedRowIndex.value = null
  }

  /* --- SINGLE COPY HELPERS --- */
  const copiedLocationId = ref<string | null>(null)
  const copiedNameId = ref<string | null>(null)
  const copiedSkuId = ref<string | null>(null)
  const lastCopiedLocation = ref<string>('')
  let copiedLocTimer: any = null
  let copiedNameTimer: any = null
  let copiedSkuTimer: any = null

  async function handleCopyLocation(location: string, itemId: string) {
    if (!location) return
    lastCopiedLocation.value = location.trim()
    const ok = await copyToClipboard(location.trim(), {
      label: 'Локация',
      message: `Локация «${location.trim()}» скопирована в буфер обмена`,
      showToast: true,
    })
    if (ok) {
      copiedLocationId.value = itemId
      if (copiedLocTimer) clearTimeout(copiedLocTimer)
      copiedLocTimer = setTimeout(() => {
        copiedLocationId.value = null
      }, 1500)
      showPasteNotif(`Локация «${location.trim()}» скопирована`)
    }
  }

  async function handleCopyName(name: string, itemId: string) {
    if (!name) return
    const ok = await copyToClipboard(name.trim(), {
      label: 'Наименование',
      message: `Наименование скопировано в буфер обмена`,
      showToast: true,
    })
    if (ok) {
      copiedNameId.value = itemId
      if (copiedNameTimer) clearTimeout(copiedNameTimer)
      copiedNameTimer = setTimeout(() => {
        copiedNameId.value = null
      }, 1500)
      showPasteNotif(`Наименование скопировано`)
    }
  }

  async function handleCopySkuSingle(sku: string, itemId: string) {
    if (!sku) return
    const ok = await copyToClipboard(sku.trim(), {
      label: 'ЛК',
      message: `Артикул «${sku.trim()}» скопирован в буфер обмена`,
      showToast: true,
    })
    if (ok) {
      copiedSkuId.value = itemId
      if (copiedSkuTimer) clearTimeout(copiedSkuTimer)
      copiedSkuTimer = setTimeout(() => {
        copiedSkuId.value = null
      }, 1500)
      showPasteNotif(`Артикул «${sku.trim()}» скопирован`)
    }
  }

  async function handleCopyFilteredSkus() {
    const skus = sortedItems.value.map((item) => item.sku)
    await copySkusToClipboard(skus, { label: 'отфильтрованных позиций' })
    showPasteNotif(`Скопировано ${skus.length} ЛК`)
  }

  async function handleCopyNotFoundSkus() {
    const skus = store.items
      .filter((item) => store.isNotFoundInCatalog(item.sku.trim()))
      .map((item) => item.sku)
    await copySkusToClipboard(skus, { label: 'позиций Н/Д' })
    showPasteNotif(`Скопировано ${skus.length} ЛК (Н/Д)`)
  }

  async function handleCopySelectedSkus() {
    if (selectedIds.value.size === 0) return
    const skus = sortedItems.value
      .filter((item) => selectedIds.value.has(item.id))
      .map((item) => item.sku)
    await copySkusToClipboard(skus, { label: 'выбранных позиций' })
    showPasteNotif(`Скопировано ${skus.length} выбранных ЛК`)
  }

  /* --- INLINE EDITING --- */
  const inlineEditing = ref<{
    id: string
    field: 'sku' | 'location' | 'quantity' | 'boxNumber'
    value: string | number
  } | null>(null)

  function startInlineEdit(item: InventoryItem, field: 'sku' | 'location' | 'quantity' | 'boxNumber') {
    if (isReadOnly.value) return
    inlineEditing.value = {
      id: item.id,
      field,
      value:
        field === 'quantity'
          ? item.quantity
          : field === 'sku'
          ? item.sku
          : field === 'boxNumber'
          ? item.boxNumber || ''
          : item.location || '',
    }
  }

  function cancelInlineEdit() {
    inlineEditing.value = null
  }

  async function saveInlineEdit(item: InventoryItem) {
    if (!inlineEditing.value || inlineEditing.value.id !== item.id) return
    const { field, value } = inlineEditing.value
    inlineEditing.value = null

    if (field === 'sku') {
      const rawVal = String(value || '').trim()
      const cleanedSku = rawVal.replace(/\D/g, '').slice(0, 7)
      if (!cleanedSku || cleanedSku === item.sku) return

      const resolvedName = store.catalogSkuMap.get(cleanedSku) || item.name
      const prevSku = item.sku
      const prevName = item.name
      try {
        await store.updateItem(item.id, {
          sku: cleanedSku,
          name: resolvedName,
          category: item.category || '',
          quantity: item.quantity,
          unit: item.unit || 'шт.',
          location: item.location || '',
          boxNumber: item.boxNumber || '',
          status: item.status || 'ok',
          lastAuditDate: item.lastAuditDate || new Date().toISOString().split('T')[0],
        })
        pushUndoAction({
          description: `Изменение артикула: ${cleanedSku}`,
          undo: async () => {
            await store.updateItem(item.id, {
              sku: prevSku,
              name: prevName,
              category: item.category || '',
              quantity: item.quantity,
              unit: item.unit || 'шт.',
              location: item.location || '',
              boxNumber: item.boxNumber || '',
              status: item.status || 'ok',
              lastAuditDate: item.lastAuditDate || new Date().toISOString().split('T')[0],
            })
          },
          redo: async () => {
            await store.updateItem(item.id, {
              sku: cleanedSku,
              name: resolvedName,
              category: item.category || '',
              quantity: item.quantity,
              unit: item.unit || 'шт.',
              location: item.location || '',
              boxNumber: item.boxNumber || '',
              status: item.status || 'ok',
              lastAuditDate: item.lastAuditDate || new Date().toISOString().split('T')[0],
            })
          },
        })
        showPasteNotif(`Артикул обновлен: ${cleanedSku}`)
      } catch (err) {
        console.error('Ошибка обновления артикула:', err)
      }
    } else if (field === 'quantity') {
      const newQty = typeof value === 'number' ? value : parseFloat(String(value))
      if (isNaN(newQty) || newQty < 0 || newQty === item.quantity) return
      const prevQty = item.quantity

      try {
        await store.updateItem(item.id, {
          sku: item.sku,
          name: item.name,
          category: item.category || '',
          quantity: newQty,
          unit: item.unit || 'шт.',
          location: item.location || '',
          boxNumber: item.boxNumber || '',
          status: item.status || 'ok',
          lastAuditDate: item.lastAuditDate || new Date().toISOString().split('T')[0],
        })
        pushUndoAction({
          description: `Изменение количества: ${newQty}`,
          undo: async () => {
            await store.updateItem(item.id, {
              sku: item.sku,
              name: item.name,
              category: item.category || '',
              quantity: prevQty,
              unit: item.unit || 'шт.',
              location: item.location || '',
              boxNumber: item.boxNumber || '',
              status: item.status || 'ok',
              lastAuditDate: item.lastAuditDate || new Date().toISOString().split('T')[0],
            })
          },
          redo: async () => {
            await store.updateItem(item.id, {
              sku: item.sku,
              name: item.name,
              category: item.category || '',
              quantity: newQty,
              unit: item.unit || 'шт.',
              location: item.location || '',
              boxNumber: item.boxNumber || '',
              status: item.status || 'ok',
              lastAuditDate: item.lastAuditDate || new Date().toISOString().split('T')[0],
            })
          },
        })
        showPasteNotif(`Количество обновлено: ${newQty}`)
      } catch (err) {
        console.error('Ошибка обновления количества:', err)
      }
    } else if (field === 'location') {
      const newLoc = String(value || '').trim()
      if (newLoc === (item.location || '')) return
      const prevLoc = item.location || ''

      try {
        await store.updateItem(item.id, {
          sku: item.sku,
          name: item.name,
          category: item.category || '',
          quantity: item.quantity,
          unit: item.unit || 'шт.',
          location: newLoc,
          boxNumber: item.boxNumber || '',
          status: item.status || 'ok',
          lastAuditDate: item.lastAuditDate || new Date().toISOString().split('T')[0],
        })
        pushUndoAction({
          description: `Изменение локации: ${newLoc || 'без локации'}`,
          undo: async () => {
            await store.updateItem(item.id, {
              sku: item.sku,
              name: item.name,
              category: item.category || '',
              quantity: item.quantity,
              unit: item.unit || 'шт.',
              location: prevLoc,
              boxNumber: item.boxNumber || '',
              status: item.status || 'ok',
              lastAuditDate: item.lastAuditDate || new Date().toISOString().split('T')[0],
            })
          },
          redo: async () => {
            await store.updateItem(item.id, {
              sku: item.sku,
              name: item.name,
              category: item.category || '',
              quantity: item.quantity,
              unit: item.unit || 'шт.',
              location: newLoc,
              boxNumber: item.boxNumber || '',
              status: item.status || 'ok',
              lastAuditDate: item.lastAuditDate || new Date().toISOString().split('T')[0],
            })
          },
        })
        showPasteNotif(`Локация обновлена: ${newLoc || 'без локации'}`)
      } catch (err) {
        console.error('Ошибка обновления локации:', err)
      }
    } else if (field === 'boxNumber') {
      const newBox = String(value || '').trim()
      if (newBox === (item.boxNumber || '')) return
      const prevBox = item.boxNumber || ''

      try {
        await store.updateItem(item.id, {
          sku: item.sku,
          name: item.name,
          category: item.category || '',
          quantity: item.quantity,
          unit: item.unit || 'шт.',
          location: item.location || '',
          boxNumber: newBox,
          status: item.status || 'ok',
          lastAuditDate: item.lastAuditDate || new Date().toISOString().split('T')[0],
        })
        pushUndoAction({
          description: `Изменение номера коробки: ${newBox || 'без коробки'}`,
          undo: async () => {
            await store.updateItem(item.id, {
              sku: item.sku,
              name: item.name,
              category: item.category || '',
              quantity: item.quantity,
              unit: item.unit || 'шт.',
              location: item.location || '',
              boxNumber: prevBox,
              status: item.status || 'ok',
              lastAuditDate: item.lastAuditDate || new Date().toISOString().split('T')[0],
            })
          },
          redo: async () => {
            await store.updateItem(item.id, {
              sku: item.sku,
              name: item.name,
              category: item.category || '',
              quantity: item.quantity,
              unit: item.unit || 'шт.',
              location: item.location || '',
              boxNumber: newBox,
              status: item.status || 'ok',
              lastAuditDate: item.lastAuditDate || new Date().toISOString().split('T')[0],
            })
          },
        })
        showPasteNotif(`Номер коробки обновлен: ${newBox || 'без коробки'}`)
      } catch (err) {
        console.error('Ошибка обновления номера коробки:', err)
      }
    }
  }

  /* --- BATCH OPERATIONS COMPOSABLE --- */
  const batchOps = useFactBatchOperations({
    store,
    isReadOnly,
    sortedItems,
    selectedIds,
    duplicateFactCount,
    nonStandardFactCount,
    ndFactCount,
    pushUndoAction,
    showPasteNotif,
    clearSelection,
    getSkuMentions,
    getFactDiscrepancy,
  })

  /* --- CELL SELECTION COMPOSABLE --- */
  const cellSelection = useFactCellSelection({
    sortedItems,
    isReadOnly,
    selectedIds,
    lastCopiedLocation,
    store,
    pushUndoAction,
    showPasteNotif,
    handleDeleteSelected: batchOps.handleDeleteSelected,
    startInlineEdit,
    isCheckboxDragging,
    checkboxDragStartIndex,
  })

  /* --- INLINE ADD ROW --- */
  const skuInputRef = ref<HTMLInputElement | null>(null)
  const newRow = ref({
    sku: '',
    name: '',
    quantity: 1,
    boxNumber: '',
    unit: 'шт.',
    location: '',
    status: 'ok' as InventoryItemStatus,
  })

  watch(
    () => newRow.value.sku,
    (val) => {
      const cleaned = val.replace(/\D/g, '').slice(0, 7)
      if (cleaned.length >= 3) {
        const name = store.catalogSkuMap.get(cleaned)
        if (name) {
          newRow.value.name = name
        }
      }
    }
  )

  function handleNameInput() {
    const trimmedName = newRow.value.name.trim().toLowerCase()
    if (trimmedName && !newRow.value.sku) {
      const sku = store.catalogNameMap.get(trimmedName)
      if (sku) {
        newRow.value.sku = sku
      }
    }
  }

  function generateRandomSku() {
    if (store.catalogItems.length > 0) {
      const randomItem = store.catalogItems[Math.floor(Math.random() * store.catalogItems.length)]
      newRow.value.sku = randomItem.sku
      newRow.value.name = randomItem.name
    } else {
      newRow.value.sku = String(Math.floor(1000000 + Math.random() * 9000000))
    }
  }

  async function handleAddRow() {
    if (isReadOnly.value) return
    if (!newRow.value.sku.trim()) {
      generateRandomSku()
    }

    const cleanedSku = newRow.value.sku.replace(/\D/g, '').slice(0, 7)
    if (cleanedSku.length !== 7) return

    const resolvedName = store.catalogSkuMap.get(cleanedSku) || newRow.value.name.trim() || 'Н/Д'

    try {
      await store.addItem({
        id: crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).substring(2, 11),
        sku: cleanedSku,
        name: resolvedName,
        category: '',
        quantity: Number(newRow.value.quantity) || 0,
        unit: newRow.value.unit.trim() || 'шт.',
        location: newRow.value.location.trim(),
        boxNumber: newRow.value.boxNumber.trim(),
        status: newRow.value.status || 'ok',
        lastAuditDate: new Date().toISOString().split('T')[0],
      })

      newRow.value = {
        sku: '',
        name: '',
        quantity: 1,
        boxNumber: '',
        unit: 'шт.',
        location: '',
        status: 'ok',
      }

      skuInputRef.value?.focus()
      showPasteNotif('Позиция успешно добавлена')
    } catch (err) {
      console.error('Ошибка добавления позиции:', err)
    }
  }

  async function handlePaste(e: ClipboardEvent, field: 'sku' | 'name' | 'quantity' | 'location' | 'boxNumber') {
    if (isReadOnly.value) return
    const text = e.clipboardData?.getData('text')
    if (!text) return

    // SPECIAL CASE: Pasting into boxNumber field
    if (field === 'boxNumber') {
      const boxEntries = parseBoxNumberEntriesFromClipboard(text)
      if (boxEntries.length > 1 || (boxEntries.length === 1 && selectedIds.value.size > 0)) {
        e.preventDefault()
        await batchOps.applyBoxNumbersBatch(boxEntries)
        return
      } else if (boxEntries.length === 1) {
        e.preventDefault()
        newRow.value.boxNumber = boxEntries[0].boxNumber
        showPasteNotif('Номер коробки вставлен')
        return
      }
    }

    // SPECIAL CASE: Pasting into quantity field
    if (field === 'quantity') {
      const qtyList = parseQuantityListFromClipboard(text)
      if (qtyList.length > 1 || (qtyList.length === 1 && (selectedIds.value.size > 0 || store.items.length > 0))) {
        if (qtyList.length > 1) {
          e.preventDefault()
          await batchOps.applyQuantitiesBatch(qtyList)
          return
        }
      }
    }

    // SPECIAL CASE: Pasting into location field
    if (field === 'location') {
      const locEntries = parseLocationEntriesFromClipboard(text)
      if (locEntries.length > 1 || (locEntries.length === 1 && (selectedIds.value.size > 0 || store.items.length > 0))) {
        if (locEntries.length > 1) {
          e.preventDefault()
          await batchOps.applyLocationsBatch(locEntries)
          return
        }
      }
    }

    const catalogMap = store.catalogSkuMap
    const rows = parseFactClipboard(text, field === 'boxNumber' ? 'location' : field, catalogMap)
    if (rows.length === 0) return

    if (rows.length === 1) {
      e.preventDefault()
      if (field === 'sku') {
        newRow.value.sku = rows[0].sku
        if (rows[0].name) newRow.value.name = rows[0].name
      } else if (field === 'name') {
        newRow.value.name = rows[0].name
      } else if (field === 'quantity') {
        newRow.value.quantity = rows[0].quantity
      } else if (field === 'location') {
        newRow.value.location = rows[0].location
      } else if (field === 'boxNumber') {
        newRow.value.boxNumber = text.trim()
      }
      if (rows[0].quantity && field !== 'quantity' && !newRow.value.quantity) newRow.value.quantity = rows[0].quantity
      if (rows[0].location && field !== 'location' && !newRow.value.location) newRow.value.location = rows[0].location
      showPasteNotif('Значение вставлено из буфера обмена')
    } else if (rows.length > 1) {
      if (field === 'boxNumber') {
        const boxEntries = parseBoxNumberEntriesFromClipboard(text)
        if (boxEntries.length > 0) {
          e.preventDefault()
          await batchOps.applyBoxNumbersBatch(boxEntries)
          return
        }
      }
      const hasValidItems = rows.some((r) => r.sku || r.name)
      if (!hasValidItems && field === 'quantity') {
        const qtyList = parseQuantityListFromClipboard(text)
        if (qtyList.length > 0) {
          e.preventDefault()
          await batchOps.applyQuantitiesBatch(qtyList)
          return
        }
      }
      e.preventDefault()
      store.error = null

      try {
        await withLoading(
          {
            title: 'Вставка из буфера обмена',
            message: `Обработка и загрузка ${rows.length} позиций...`,
            details: 'Пожалуйста, подождите, данные сохраняются и отображаются в таблице...',
            icon: '📥',
            total: rows.length,
            current: 0,
            unit: 'поз.',
            stage: 'Запись позиций в SQLite',
          },
          async (tracker) => {
            await store.addItemsBatch(
              rows.filter((r) => r.sku || r.name),
              (processed, total, chunkIdx, totalChunks) => {
                tracker.setChunk(chunkIdx, totalChunks, 150)
                tracker.step(
                  processed,
                  total,
                  `Пакет ${chunkIdx} из ${totalChunks}`,
                  `Сохранение пакета ${chunkIdx}/${totalChunks} (${processed} из ${total} поз.)...`
                )
              }
            )
            showPasteNotif(`Успешно вставлено ${rows.length} позиций`)
          }
        )
      } catch (err) {
        console.error('Ошибка вставки из буфера:', err)
      }
    }
  }

  /* --- MODAL DIALOGS STATE --- */
  const isMassMenuOpen = ref(false)
  const isPasteQuantitiesModalOpen = ref(false)
  const isPasteLocationsModalOpen = ref(false)
  const isImportModalOpen = ref(false)

  const modalTargetItems = computed(() => {
    if (selectedIds.value.size > 0) {
      return sortedItems.value.filter((i) => selectedIds.value.has(i.id))
    }
    return sortedItems.value
  })

  function openPasteQuantitiesModal() {
    isMassMenuOpen.value = false
    isPasteQuantitiesModalOpen.value = true
  }

  function openPasteLocationsModal() {
    isMassMenuOpen.value = false
    isPasteLocationsModalOpen.value = true
  }

  async function handleImportFact(
    itemsToImport: { sku: string; name: string; quantity: number; unit?: string; location?: string }[],
    replaceAll: boolean
  ) {
    isImportModalOpen.value = false
    if (itemsToImport.length === 0) return

    try {
      await withLoading(
        {
          title: 'Импорт из файла',
          message: `Импорт ${itemsToImport.length} позиций...`,
          details: 'Пожалуйста, подождите, данные записываются в базу',
          icon: '📥',
        },
        async () => {
          if (replaceAll) {
            await store.clearFact()
          }
          await store.addItemsBatch(itemsToImport)
          showPasteNotif(`Импортировано ${itemsToImport.length} позиций`)
        }
      )
    } catch (err) {
      console.error('Ошибка импорта факта:', err)
    }
  }

  /* --- ADD / EDIT ITEM MODAL STATE --- */
  const isModalOpen = ref(false)
  const modalMode = ref<'add' | 'edit'>('add')
  const editingItemId = ref<string | null>(null)
  const modalForm = ref({
    sku: '',
    name: '',
    quantity: 1,
    boxNumber: '',
    unit: 'шт.',
    location: '',
    status: 'ok' as InventoryItemStatus,
  })
  const modalErrors = ref({
    sku: '',
    name: '',
    quantity: '',
  })

  function openAddModal() {
    modalMode.value = 'add'
    editingItemId.value = null
    modalForm.value = {
      sku: '',
      name: '',
      quantity: 1,
      boxNumber: '',
      unit: 'шт.',
      location: '',
      status: 'ok',
    }
    modalErrors.value = { sku: '', name: '', quantity: '' }
    isModalOpen.value = true
  }

  function openEditModal(item: InventoryItem) {
    modalMode.value = 'edit'
    editingItemId.value = item.id
    modalForm.value = {
      sku: item.sku,
      name: store.getFactItemName(item.sku, item.name),
      quantity: item.quantity,
      boxNumber: item.boxNumber || '',
      unit: item.unit || 'шт.',
      location: item.location || '',
      status: item.status || 'ok',
    }
    modalErrors.value = { sku: '', name: '', quantity: '' }
    isModalOpen.value = true
  }

  function setModalGeneratedSKU() {
    if (store.catalogItems.length > 0) {
      const randomItem = store.catalogItems[Math.floor(Math.random() * store.catalogItems.length)]
      modalForm.value.sku = randomItem.sku
      if (!modalForm.value.name) {
        modalForm.value.name = randomItem.name
      }
    } else {
      modalForm.value.sku = String(Math.floor(1000000 + Math.random() * 9000000))
    }
  }

  watch(
    () => modalForm.value.sku,
    (val) => {
      if (modalMode.value === 'add') {
        const cleaned = val.replace(/\D/g, '').slice(0, 7)
        if (cleaned.length >= 3) {
          const name = store.catalogSkuMap.get(cleaned)
          if (name) {
            modalForm.value.name = name
          }
        }
      }
    }
  )

  function validateModalForm(): boolean {
    modalErrors.value = { sku: '', name: '', quantity: '' }
    let valid = true

    const cleanedSku = modalForm.value.sku.replace(/\D/g, '').slice(0, 7)
    if (!cleanedSku) {
      modalErrors.value.sku = 'Артикул обязателен'
      valid = false
    } else if (cleanedSku.length !== 7) {
      modalErrors.value.sku = 'Артикул должен содержать 7 цифр'
      valid = false
    }

    if (!modalForm.value.name.trim()) {
      modalForm.value.name = store.catalogSkuMap.get(cleanedSku) || 'Н/Д'
    }

    if (modalForm.value.quantity < 0 || isNaN(modalForm.value.quantity)) {
      modalErrors.value.quantity = 'Количество должно быть ≥ 0'
      valid = false
    }

    return valid
  }

  async function handleModalSave() {
    if (!validateModalForm()) return
    const cleanedSku = modalForm.value.sku.replace(/\D/g, '').slice(0, 7)

    try {
      if (modalMode.value === 'add') {
        await store.addItem({
          id: crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).substring(2, 11),
          sku: cleanedSku,
          name: modalForm.value.name.trim(),
          category: '',
          quantity: Number(modalForm.value.quantity) || 0,
          unit: modalForm.value.unit.trim() || 'шт.',
          location: modalForm.value.location.trim(),
          boxNumber: modalForm.value.boxNumber.trim(),
          status: modalForm.value.status,
          lastAuditDate: new Date().toISOString().split('T')[0],
        })
        showPasteNotif('Позиция успешно добавлена')
      } else if (editingItemId.value) {
        await store.updateItem(editingItemId.value, {
          sku: cleanedSku,
          name: modalForm.value.name.trim(),
          category: '',
          quantity: Number(modalForm.value.quantity) || 0,
          unit: modalForm.value.unit.trim() || 'шт.',
          location: modalForm.value.location.trim(),
          boxNumber: modalForm.value.boxNumber.trim(),
          status: modalForm.value.status,
          lastAuditDate: new Date().toISOString().split('T')[0],
        })
        showPasteNotif('Позиция успешно обновлена')
      }
      isModalOpen.value = false
    } catch (err) {
      console.error('Ошибка сохранения:', err)
    }
  }

  /* --- CLICK OUTSIDE HANDLER --- */
  function handleDocClick(e: MouseEvent) {
    const target = e.target as HTMLElement | null
    if (!target) return

    if (isMassMenuOpen.value && !target.closest('.mass-actions-container')) {
      isMassMenuOpen.value = false
    }

    if (batchOps.isExportDropdownOpen.value && !target.closest('.export-actions-container')) {
      batchOps.isExportDropdownOpen.value = false
    }
  }

  /* --- EVENT LISTENERS REGISTRATION --- */
  onMounted(() => {
    window.addEventListener('keydown', cellSelection.handleGlobalKeyDown)
    window.addEventListener('mouseup', cellSelection.onWindowMouseUp)
    document.addEventListener('click', handleDocClick)
  })

  onUnmounted(() => {
    window.removeEventListener('keydown', cellSelection.handleGlobalKeyDown)
    window.removeEventListener('mouseup', cellSelection.onWindowMouseUp)
    document.removeEventListener('click', handleDocClick)
  })

  return {
    store,
    isReadOnly,
    searchQuery,
    filterStatus,
    selectedLocation,
    pasteNotification,
    showPasteNotif,
    undoRedo,
    handleUndo,
    handleRedo,
    distinctLocations,
    factStats,
    duplicateSkuSet,
    duplicateFactCount,
    nonStandardFactCount,
    ndFactCount,
    inCatalogFactCount,
    account299FactCount,
    multGt1FactCount,
    getSkuMentions,
    skuTooltipMap,
    getItemTooltip,
    isFilterActive,
    handleResetFilters,
    skuFactTotalQtyMap,
    getFactDiscrepancy,
    // Excel Column Filters
    columnFilters,
    setColumnFilter,
    clearColumnFilter,
    clearAllColumnFilters,
    getDistinctValues,
    hasActiveExcelFilters,
    // Sort & Items
    sortKey,
    sortDirection,
    toggleSort,
    sortedItems,
    // Selection
    selectedIds,
    isAllSelected,
    isPartiallySelected,
    toggleSelectAll,
    toggleSelectItem,
    onCheckboxCellMouseDown,
    onCheckboxCellMouseEnter,
    handleCheckboxClick,
    clearSelection,
    // Single Copy Helpers
    copiedLocationId,
    copiedNameId,
    copiedSkuId,
    lastCopiedLocation,
    handleCopyLocation,
    handleCopyName,
    handleCopySkuSingle,
    handleCopyFilteredSkus,
    handleCopyNotFoundSkus,
    handleCopySelectedSkus,
    // Inline editing
    inlineEditing,
    startInlineEdit,
    cancelInlineEdit,
    saveInlineEdit,
    // Inline Add
    skuInputRef,
    newRow,
    handleNameInput,
    generateRandomSku,
    handleAddRow,
    handlePaste,
    // Modals state
    isMassMenuOpen,
    isPasteQuantitiesModalOpen,
    isPasteLocationsModalOpen,
    isImportModalOpen,
    modalTargetItems,
    openPasteQuantitiesModal,
    openPasteLocationsModal,
    handleImportFact,
    // Add/Edit modal
    isModalOpen,
    modalMode,
    editingItemId,
    modalForm,
    modalErrors,
    openAddModal,
    openEditModal,
    setModalGeneratedSKU,
    handleModalSave,
    // Batch operations
    batchOps,
    // Cell selection
    ...cellSelection,
  }
}
