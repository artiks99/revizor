import { ref, computed, watch, nextTick, onMounted, onUnmounted } from 'vue'
import { useInventoryStore } from './useInventoryStore'
import { parseStockClipboard } from '@shared/lib/clipboardParser'
import { useTableSort } from '@shared/lib/useTableSort'
import { copySkusToClipboard } from '@shared/lib/clipboard'
import { useExcelColumnFilter } from '@shared/lib/useExcelColumnFilter'
import { withLoading } from '@shared/lib/loadingService'
import { useUndoRedo } from '@shared/lib/useUndoRedo'
import type { StoreStockItem } from './types'

export type StockFilterStatus = 'all' | 'in_299' | 'nd' | 'duplicates' | 'non_standard' | 'positive' | 'zero'
export type StockSortKey = 'sku' | 'name' | 'quantity'

export function useStoreStockTab() {
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

  const filterStatus = ref<StockFilterStatus>('all')

  const isImportModalOpen = ref(false)
  const isMassMenuOpen = ref(false)
  const skuInputRef = ref<HTMLInputElement | null>(null)

  function getCatalogMap() {
    return store.catalogSkuMap
  }

  /* --- INLINE ADD ROW STATE --- */
  const newRow = ref({
    sku: '',
    name: '',
    quantity: 0,
  })

  // Auto-fill name when SKU matches catalog item
  watch(
    () => newRow.value.sku,
    (val) => {
      const cleaned = val.replace(/\D/g, '').slice(0, 7) || val.trim()
      if (cleaned.length >= 3) {
        const name = store.catalogSkuMap.get(cleaned)
        if (name) {
          newRow.value.name = name
        }
      }
    }
  )

  function handleNameInput() {
    const trimmed = newRow.value.name.trim().toLowerCase()
    if (trimmed && !newRow.value.sku) {
      const sku = store.catalogNameMap.get(trimmed)
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
    if (!newRow.value.name.trim()) return

    const cleanedSku = newRow.value.sku.replace(/\D/g, '').slice(0, 7) || newRow.value.sku.trim()
    if (!cleanedSku) return

    await store.addStockItem(cleanedSku, newRow.value.name.trim(), Number(newRow.value.quantity) || 0)
    const addedSku = cleanedSku
    const addedName = newRow.value.name.trim()
    const addedQty = Number(newRow.value.quantity) || 0
    pushUndoAction({
      description: `Добавление остатка: ${addedSku}`,
      undo: async () => {
        const found = store.stockItems.find((i) => i.sku === addedSku)
        if (found) await store.removeStockItem(found.id)
      },
      redo: async () => {
        await store.addStockItem(addedSku, addedName, addedQty)
      },
    })

    newRow.value = {
      sku: '',
      name: '',
      quantity: 0,
    }

    skuInputRef.value?.focus()
  }

  async function handlePaste(e: ClipboardEvent, field: 'sku' | 'name' | 'quantity') {
    if (isReadOnly.value) return
    const text = e.clipboardData?.getData('text')
    if (!text) return

    const catalogMap = getCatalogMap()
    const rows = parseStockClipboard(text, field, catalogMap)
    if (rows.length === 0) return

    if (rows.length > 1 || (rows.length === 1 && (rows[0].sku || rows[0].quantity > 0 || rows[0].name))) {
      e.preventDefault()
      if (rows.length === 1) {
        if (field === 'sku') {
          newRow.value.sku = rows[0].sku
          if (rows[0].name) newRow.value.name = rows[0].name
        } else if (field === 'name') {
          newRow.value.name = rows[0].name
        } else if (field === 'quantity') {
          newRow.value.quantity = rows[0].quantity
        }
        if (rows[0].quantity && field !== 'quantity' && !newRow.value.quantity) {
          newRow.value.quantity = rows[0].quantity
        }
        showPasteNotif('Значение заполнено из буфера обмена')
      } else {
        store.error = null

        const seenPaste = new Set<string>()
        let duplicatePasteCount = 0
        const processedRows: typeof rows = []
        for (const r of rows) {
          const skuKey = r.sku.trim().toLowerCase()
          if (skuKey) {
            if (seenPaste.has(skuKey)) {
              duplicatePasteCount++
            } else {
              seenPaste.add(skuKey)
              processedRows.push(r)
            }
          } else {
            processedRows.push(r)
          }
        }

        try {
          await withLoading(
            {
              title: 'Вставка остатков',
              message: `Обработка и сохранение ${processedRows.length} позиций...`,
              details: duplicatePasteCount > 0 ? `Исключено ${duplicatePasteCount} повторок от штрихкодов` : 'Пожалуйста, подождите, остатки сохраняются в базу данных',
              icon: '📊',
              total: processedRows.length,
              current: 0,
              unit: 'поз.',
              stage: 'Запись в базу данных SQLite',
            },
            async (tracker) => {
              await store.importStockBatch(processedRows, false, (processed, total, chunkIdx, totalChunks) => {
                tracker.setChunk(chunkIdx, totalChunks, 200)
                tracker.step(
                  processed,
                  total,
                  `Пакет ${chunkIdx} из ${totalChunks}`,
                  `Сохранение пакета ${chunkIdx}/${totalChunks} (${processed} из ${total} поз.)...`
                )
              })
              pushUndoAction({
                description: `Вставка ${processedRows.length} позиций остатков`,
                undo: async () => {
                  const skus = new Set(processedRows.map((r) => r.sku))
                  const ids = store.stockItems.filter((i) => skus.has(i.sku)).map((i) => i.id)
                  if (ids.length > 0) await store.deleteStockItemsBatch(ids)
                },
                redo: async () => {
                  await store.importStockBatch(processedRows, false)
                },
              })
              const extraMsg = duplicatePasteCount > 0 ? ` (исключено ${duplicatePasteCount} повторок)` : ''
              showPasteNotif(`Успешно вставлено ${processedRows.length} позиций${extraMsg}`)
            }
          )
        } catch (err) {
          console.error('Ошибка вставки остатков из буфера:', err)
        }
      }
    }
  }

  /* --- STATS & COMPUTED --- */
  const stockStats = computed(() => {
    const items = store.stockItems
    const counts = new Map<string, number>()
    let nonStandard = 0
    let nd = 0
    let inCatalog = 0
    let in299 = 0
    let positive = 0
    let zero = 0

    for (let i = 0; i < items.length; i++) {
      const item = items[i]
      const sku = item.sku.trim()
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
      if (store.isAccount299Item(sku)) {
        in299++
      }
      if (item.quantity > 0) {
        positive++
      } else {
        zero++
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
      duplicateStockSkuSet: dupes,
      duplicateStockCount: duplicateCount,
      redundantDuplicateCount: Math.max(0, duplicateCount - dupes.size),
      nonStandardStockCount: nonStandard,
      ndCount: nd,
      inCatalogCount: inCatalog,
      in299Count: in299,
      positiveCount: positive,
      zeroCount: zero,
    }
  })

  const duplicateStockSkuSet = computed(() => stockStats.value.duplicateStockSkuSet)
  const duplicateStockCount = computed(() => stockStats.value.duplicateStockCount)
  const redundantDuplicateCount = computed(() => stockStats.value.redundantDuplicateCount)
  const nonStandardStockCount = computed(() => stockStats.value.nonStandardStockCount)
  const ndCount = computed(() => stockStats.value.ndCount)
  const inCatalogCount = computed(() => stockStats.value.inCatalogCount)
  const in299Count = computed(() => stockStats.value.in299Count)
  const positiveCount = computed(() => stockStats.value.positiveCount)
  const zeroCount = computed(() => stockStats.value.zeroCount)

  const repeatStockIdSet = computed(() => {
    const seen = new Set<string>()
    const repeats = new Set<string>()
    for (const item of store.stockItems) {
      const sku = item.sku.trim().toLowerCase()
      if (!sku) continue
      if (seen.has(sku)) {
        repeats.add(item.id)
      } else {
        seen.add(sku)
      }
    }
    return repeats
  })

  /* --- FILTERING PIPELINE --- */
  const filteredStock = computed(() => {
    let result = store.stockItems

    if (debouncedSearch.value.trim()) {
      const q = debouncedSearch.value.toLowerCase().trim()
      result = result.filter(
        (item) =>
          item.sku.toLowerCase().includes(q) ||
          store.getStockItemName(item.sku, item.name).toLowerCase().includes(q)
      )
    }

    if (filterStatus.value === 'in_299') {
      result = result.filter((item) => store.isAccount299Item(item.sku))
    } else if (filterStatus.value === 'nd') {
      result = result.filter((item) => store.isNotFoundInCatalog(item.sku))
    } else if (filterStatus.value === 'duplicates') {
      result = result.filter((item) => duplicateStockSkuSet.value.has(item.sku.trim().toLowerCase()))
    } else if (filterStatus.value === 'non_standard') {
      result = result.filter((item) => !/^\d{7}$/.test(item.sku.trim()))
    } else if (filterStatus.value === 'positive') {
      result = result.filter((item) => item.quantity > 0)
    } else if (filterStatus.value === 'zero') {
      result = result.filter((item) => item.quantity <= 0)
    }

    return result
  })

  const {
    columnFilters,
    getDistinctValues,
    setColumnFilter,
    clearAllColumnFilters,
    activeFilterCount: excelFilterCount,
    filteredItems: excelFilteredStock,
  } = useExcelColumnFilter<StoreStockItem>(
    filteredStock,
    {
      name: (item) => store.getStockItemName(item.sku, item.name),
      quantity: (item) => `${item.quantity} шт.`,
    }
  )

  const { sortKey, sortDirection, toggleSort, resetSort, sortedItems } = useTableSort<StoreStockItem, StockSortKey>(
    excelFilteredStock,
    null,
    null,
    {
      name: (item) => store.getStockItemName(item.sku, item.name),
    }
  )

  const isFilterActive = computed(() => {
    return !!(searchQuery.value.trim() || filterStatus.value !== 'all' || sortKey.value || excelFilterCount.value > 0)
  })

  function handleResetFilters() {
    searchQuery.value = ''
    debouncedSearch.value = ''
    filterStatus.value = 'all'
    resetSort()
    clearAllColumnFilters()
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
    () => store.stockItems,
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
          message: 'Пожалуйста, подождите, остатки обновляются в базе данных...',
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
    const deletedItem = store.stockItems.find((i) => i.id === id)
    await store.removeStockItem(id)
    selectedIds.value.delete(id)
    if (deletedItem) {
      pushUndoAction({
        description: `Удаление остатка: ${deletedItem.sku}`,
        undo: async () => {
          await store.addStockItem(deletedItem.sku, deletedItem.name, deletedItem.quantity)
        },
        redo: async () => {
          const found = store.stockItems.find((i) => i.sku === deletedItem.sku)
          if (found) await store.removeStockItem(found.id)
        },
      })
    }
  }

  async function handleClearStock() {
    if (isReadOnly.value) return
    openConfirmDialog({
      title: 'Полная очистка остатков',
      description: 'Вы действительно хотите полностью очистить весь список системных остатков магазина? Это действие нельзя отменить.',
      confirmText: 'Очистить полностью',
      isDanger: true,
      action: async () => {
        await store.clearStock()
        clearSelection()
        showPasteNotif('Остатки успешно очищены')
      },
    })
  }

  async function handleImportStock(items: { sku: string; name: string; quantity: number }[], replaceAll: boolean) {
    if (isReadOnly.value) return
    await withLoading(
      {
        title: 'Импорт системных остатков',
        message: `Сохранение ${items.length} позиций остатков...`,
        details: 'Пожалуйста, подождите, данные записываются в базу',
        icon: '📥',
        total: items.length,
        current: 0,
        unit: 'поз.',
        stage: 'Импорт файла CSV в SQLite',
      },
      async (tracker) => {
        await store.importStockBatch(items, replaceAll, (processed, total, chunkIdx, totalChunks) => {
          tracker.setChunk(chunkIdx, totalChunks, 200)
          tracker.step(
            processed,
            total,
            `Пакет ${chunkIdx} из ${totalChunks}`,
            `Сохранение пакета ${chunkIdx}/${totalChunks} (${processed} из ${total} поз.)...`
          )
        })
      }
    )
  }

  function handleMergeDuplicates() {
    if (isReadOnly.value || duplicateStockCount.value === 0) return
    openConfirmDialog({
      title: 'Объединить дубликаты остатков',
      description: `Найдено ${duplicateStockCount.value} дублирующихся строк. Все повторяющиеся позиции с одинаковым артикулом будут объединены в одну чистую запись, а их остатки (количество) — просуммированы.`,
      confirmText: 'Объединить дубликаты',
      badge: `⚡ ${duplicateStockCount.value} поз.`,
      isDanger: false,
      action: async () => {
        await store.mergeStockDuplicates()
        clearSelection()
        showPasteNotif('Дубликаты успешно объединены')
      },
    })
  }

  function handleRemoveDuplicatesOnly() {
    if (isReadOnly.value || duplicateStockCount.value === 0) return
    openConfirmDialog({
      title: 'Удалить повторы (оставить по 1 шт)',
      description: `Будет оставлена ровно 1 первая запись на каждый артикул с её исходным количеством (без задвоения). Лишние строки-повторки от разных штрихкодов будут удалены. Сохранится товаров: ${duplicateStockSkuSet.value.size}, будет удалено повторок: ${redundantDuplicateCount.value}.`,
      confirmText: 'Оставить по 1 шт',
      badge: `🗑️ ${redundantDuplicateCount.value} повторок`,
      isDanger: true,
      action: async () => {
        await store.removeStockDuplicates(true)
        clearSelection()
        showPasteNotif(`Успешно удалено ${redundantDuplicateCount.value} повторок, сохранено по 1 записи`)
      },
    })
  }

  function handleRemoveNonStandard() {
    if (isReadOnly.value || nonStandardStockCount.value === 0) return
    openConfirmDialog({
      title: 'Удалить нестандартные артикулы',
      description: `Будет удалено ${nonStandardStockCount.value} позиций, чей артикул не соответствует стандартному формату (не ровно 7 цифр).`,
      confirmText: 'Удалить нестандартные',
      badge: `⚠️ ${nonStandardStockCount.value} поз.`,
      isDanger: true,
      action: async () => {
        await store.removeStockNonStandard()
        clearSelection()
        showPasteNotif(`Удалено ${nonStandardStockCount.value} нестандартных позиций`)
      },
    })
  }

  function handleRemoveNotFound() {
    if (isReadOnly.value || ndCount.value === 0) return
    openConfirmDialog({
      title: 'Удалить позиции со статусом Н/Д',
      description: `Будет удалено ${ndCount.value} позиций, которых нет в справочнике товаров магазина.`,
      confirmText: 'Удалить Н/Д',
      badge: `⚠️ ${ndCount.value} поз.`,
      isDanger: true,
      action: async () => {
        await store.removeStockNotFound()
        clearSelection()
        showPasteNotif(`Удалено ${ndCount.value} позиций Н/Д`)
      },
    })
  }

  function handleRemoveZero() {
    if (isReadOnly.value || zeroCount.value === 0) return
    openConfirmDialog({
      title: 'Удалить товары с нулевым остатком',
      description: `Будет удалено ${zeroCount.value} позиций с нулевым или отрицательным количеством.`,
      confirmText: 'Удалить с остатком 0',
      badge: `⭕ ${zeroCount.value} поз.`,
      isDanger: true,
      action: async () => {
        await store.removeStockZero()
        clearSelection()
        showPasteNotif(`Удалено ${zeroCount.value} позиций с остатком 0`)
      },
    })
  }

  function handleRemoveFiltered() {
    if (isReadOnly.value || sortedItems.value.length === 0) return
    const count = sortedItems.value.length
    openConfirmDialog({
      title: 'Удалить все найденные/отфильтрованные позиции',
      description: `Будет безвозвратно удалено ${count} позиций, соответствующих текущему активному фильтру или поисковому запросу.`,
      confirmText: `Удалить ${count} поз.`,
      badge: `🔍 ${count} поз.`,
      isDanger: true,
      action: async () => {
        const ids = sortedItems.value.map((i) => i.id)
        await store.deleteStockItemsBatch(ids)
        clearSelection()
        showPasteNotif(`Успешно удалено ${count} отфильтрованных позиций`)
      },
    })
  }

  function handleDeleteSelected() {
    if (isReadOnly.value || selectedIds.value.size === 0) return
    const count = selectedIds.value.size
    const isAllDuplicatesSelected = filterStatus.value === 'duplicates' && count >= sortedItems.value.length

    openConfirmDialog({
      title: isAllDuplicatesSelected ? 'Удалить ВСЕ выбранные товары (в 0)?' : 'Удалить выбранные позиции',
      description: isAllDuplicatesSelected
        ? `Внимание! Вы выбрали абсолютно ВСЕ строки (включая первые экземпляры товаров). Это приведёт к полному удалению этих позиций в 0. Если вы хотите сохранить товары и удалить только лишние повторки от штрихкодов, отмените это действие и нажмите «Оставить по 1 шт».`
        : `Вы уверены, что хотите удалить ${count} отмеченных позиций из системных остатков?`,
      confirmText: isAllDuplicatesSelected ? `Удалить всё в 0 (${count} поз.)` : `Удалить выбранные (${count})`,
      badge: `✓ ${count} выбрано`,
      isDanger: true,
      action: async () => {
        const selectedSet = selectedIds.value
        const idList = Array.from(selectedSet)
        const itemsToDelete = count <= 500 ? store.stockItems.filter((i) => selectedSet.has(i.id)) : []
        await store.deleteStockItemsBatch(idList)
        clearSelection()
        if (itemsToDelete.length > 0) {
          const deletedData = itemsToDelete.map((it) => ({ sku: it.sku, name: it.name, quantity: it.quantity }))
          pushUndoAction({
            description: `Удаление ${itemsToDelete.length} позиций остатков`,
            undo: async () => {
              await store.importStockBatch(deletedData, false)
            },
            redo: async () => {
              const skuSet = new Set(deletedData.map((d) => d.sku))
              const ids = store.stockItems.filter((i) => skuSet.has(i.sku)).map((i) => i.id)
              if (ids.length > 0) await store.deleteStockItemsBatch(ids)
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
    await copySkusToClipboard(skus, { label: 'Остатки: ЛК' })
    showPasteNotif(`Скопировано ${skus.length} ЛК в буфер обмена`)
  }

  async function handleCopySelectedSkus() {
    if (selectedIds.value.size === 0) return
    isMassMenuOpen.value = false
    const idSet = selectedIds.value
    const skus = store.stockItems.filter((i) => idSet.has(i.id)).map((i) => i.sku)
    await copySkusToClipboard(skus, { label: 'Выбранные ЛК' })
    showPasteNotif(`Скопировано ${skus.length} ЛК в буфер обмена`)
  }

  async function handleCopyNotFoundSkus() {
    isMassMenuOpen.value = false
    const skus = store.stockItems.filter((i) => store.isNotFoundInCatalog(i.sku)).map((i) => i.sku)
    if (skus.length === 0) return
    await copySkusToClipboard(skus, { label: 'ЛК со статусом Н/Д' })
    showPasteNotif(`Скопировано ${skus.length} ЛК (Н/Д) в буфер обмена`)
  }

  function handleDocClick(e: MouseEvent) {
    const target = e.target as HTMLElement | null
    if (!target?.closest('#mass-actions-menu-wrapper')) {
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
  const editingItem = ref<StoreStockItem | null>(null)
  const editForm = ref({ sku: '', name: '', quantity: 0 })

  function openEditModal(item: StoreStockItem) {
    editingItem.value = item
    editForm.value = {
      sku: item.sku,
      name: item.name || '',
      quantity: item.quantity,
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
    await store.updateStockItem({
      id: editingItem.value.id,
      sku: skuClean,
      name: name || `Товар ${skuClean}`,
      quantity: Number(editForm.value.quantity) || 0,
    })
    closeEditModal()
    showPasteNotif('Остаток обновлен')
  }

  return {
    store,
    isReadOnly,
    editingItem,
    editForm,
    openEditModal,
    closeEditModal,
    handleSaveEdit,
    undoRedo,
    searchQuery,
    debouncedSearch,
    filterStatus,
    isImportModalOpen,
    isMassMenuOpen,
    skuInputRef,
    pasteNotification,
    showPasteNotif,
    newRow,
    handleNameInput,
    generateRandomSku,
    handleAddRow,
    handlePaste,
    stockStats,
    duplicateStockSkuSet,
    duplicateStockCount,
    redundantDuplicateCount,
    nonStandardStockCount,
    ndCount,
    inCatalogCount,
    in299Count,
    positiveCount,
    zeroCount,
    repeatStockIdSet,
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
    isPartiallySelected,
    toggleSelectAll,
    toggleSelectItem,
    clearSelection,
    confirmDialog,
    executeConfirmDialog,
    handleDeleteItem,
    handleClearStock,
    handleImportStock,
    handleMergeDuplicates,
    handleRemoveDuplicatesOnly,
    handleRemoveNonStandard,
    handleRemoveNotFound,
    handleRemoveZero,
    handleRemoveFiltered,
    handleDeleteSelected,
    handleCopyFilteredSkus,
    handleCopySelectedSkus,
    handleCopyNotFoundSkus,
  }
}
