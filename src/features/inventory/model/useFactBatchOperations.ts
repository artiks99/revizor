import { ref, type Ref, type ComputedRef } from 'vue'
import type { useInventoryStore } from './useInventoryStore'
import { withLoading } from '@shared/lib/loadingService'
import type { InventoryItem } from './types'
import { exportFactToExcel, exportFactToCsv, type FactExportRow } from '@shared/lib/exportUtils'
import type { LocationClipboardEntry, BoxNumberClipboardEntry } from '@shared/lib/clipboardParser'

export interface ConfirmDialogState {
  isOpen: boolean
  title: string
  description: string
  confirmText: string
  badge?: string
  isDanger?: boolean
  action?: () => void | Promise<void>
}

export interface UseFactBatchOperationsOptions {
  store: ReturnType<typeof useInventoryStore>
  isReadOnly: ComputedRef<boolean>
  sortedItems: ComputedRef<InventoryItem[]>
  selectedIds: Ref<Set<string>>
  duplicateFactCount: ComputedRef<number>
  nonStandardFactCount: ComputedRef<number>
  ndFactCount: ComputedRef<number>
  pushUndoAction: (action: { description: string; undo: () => Promise<void>; redo: () => Promise<void> }) => void
  showPasteNotif: (msg: string) => void
  clearSelection: () => void
  getSkuMentions: (sku: string) => number
  getFactDiscrepancy: (item: { sku: string; quantity?: number }, explicitTotalQty?: number) => { diff: number; text: string; type: 'ok' | 'surplus' | 'shortage' }
}

export function useFactBatchOperations(options: UseFactBatchOperationsOptions) {
  const {
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
  } = options

  const isExportDropdownOpen = ref(false)

  /* --- CONFIRMATION DIALOG STATE --- */
  const confirmDialog = ref<ConfirmDialogState>({
    isOpen: false,
    title: '',
    description: '',
    confirmText: 'Подтвердить',
    badge: '',
    isDanger: false,
  })

  function openConfirmDialog(config: {
    title: string
    description: string
    confirmText: string
    badge?: string
    isDanger?: boolean
    action: () => void | Promise<void>
  }) {
    confirmDialog.value = {
      isOpen: true,
      title: config.title,
      description: config.description,
      confirmText: config.confirmText,
      badge: config.badge || '',
      isDanger: config.isDanger ?? false,
      action: config.action,
    }
  }

  async function executeConfirmDialog() {
    if (confirmDialog.value.action) {
      await confirmDialog.value.action()
    }
    confirmDialog.value.isOpen = false
  }

  /* --- BATCH APPLY LOCATIONS --- */
  async function applyLocationsBatch(locInput: (string | LocationClipboardEntry)[]) {
    let targetItems: InventoryItem[] = []
    if (selectedIds.value.size > 0) {
      targetItems = sortedItems.value.filter((i) => selectedIds.value.has(i.id))
    } else {
      targetItems = sortedItems.value
    }

    if (targetItems.length === 0) {
      showPasteNotif('Нет позиций для обновления локаций')
      return
    }

    const entries: LocationClipboardEntry[] = locInput.map((e) =>
      typeof e === 'string' ? { location: e } : e
    )

    const hasSku = entries.some((e) => !!e.sku)
    const updates: { id: string; location: string }[] = []
    const prevUpdates: { id: string; location: string }[] = []

    if (hasSku) {
      const entryMap = new Map<string, string>()
      for (const e of entries) {
        if (e.sku) entryMap.set(e.sku, e.location)
      }
      for (const item of targetItems) {
        if (entryMap.has(item.sku)) {
          updates.push({
            id: item.id,
            location: entryMap.get(item.sku)!,
          })
          prevUpdates.push({
            id: item.id,
            location: item.location || '',
          })
        }
      }
    } else {
      const countToUpdate = Math.min(entries.length, targetItems.length)
      for (let i = 0; i < countToUpdate; i++) {
        updates.push({
          id: targetItems[i].id,
          location: entries[i].location,
        })
        prevUpdates.push({
          id: targetItems[i].id,
          location: targetItems[i].location || '',
        })
      }
    }

    if (updates.length === 0) {
      showPasteNotif('Не найдено позиций для обновления локаций')
      return
    }

    const countToUpdate = updates.length

    try {
      await withLoading(
        {
          title: 'Обновление локаций',
          message: `Обновление локаций для ${countToUpdate} позиций...`,
          details: 'Пожалуйста, подождите, данные сохраняются в базу',
          icon: '📍',
        },
        async () => {
          await store.updateFactLocationsBatch(updates)
          pushUndoAction({
            description: `Обновление локаций (${countToUpdate} поз.)`,
            undo: async () => {
              await store.updateFactLocationsBatch(prevUpdates)
            },
            redo: async () => {
              await store.updateFactLocationsBatch(updates)
            },
          })
          showPasteNotif(`Успешно обновлены локации для ${countToUpdate} позиций`)
        }
      )
    } catch (err) {
      console.error('Ошибка пакетного обновления локаций:', err)
    }
  }

  /* --- BATCH APPLY QUANTITIES --- */
  async function applyQuantitiesBatch(qtyList: number[]) {
    let targetItems: InventoryItem[] = []
    if (selectedIds.value.size > 0) {
      targetItems = sortedItems.value.filter((i) => selectedIds.value.has(i.id))
    } else {
      targetItems = sortedItems.value
    }

    if (targetItems.length === 0) {
      showPasteNotif('Нет позиций для обновления количества')
      return
    }

    const countToUpdate = Math.min(qtyList.length, targetItems.length)
    const updates: { id: string; quantity: number }[] = []
    const prevUpdates: { id: string; quantity: number }[] = []
    for (let i = 0; i < countToUpdate; i++) {
      updates.push({
        id: targetItems[i].id,
        quantity: qtyList[i],
      })
      prevUpdates.push({
        id: targetItems[i].id,
        quantity: targetItems[i].quantity,
      })
    }

    try {
      await withLoading(
        {
          title: 'Обновление количества',
          message: `Обновление количества для ${countToUpdate} позиций...`,
          details: 'Пожалуйста, подождите, данные записываются в базу',
          icon: '📝',
        },
        async () => {
          await store.updateFactQuantitiesBatch(updates)
          pushUndoAction({
            description: `Обновление количества (${countToUpdate} поз.)`,
            undo: async () => {
              await store.updateFactQuantitiesBatch(prevUpdates)
            },
            redo: async () => {
              await store.updateFactQuantitiesBatch(updates)
            },
          })
          showPasteNotif(`Успешно обновлено количество для ${countToUpdate} позиций`)
        }
      )
    } catch (err) {
      console.error('Ошибка пакетного обновления количества:', err)
    }
  }

  /* --- BATCH APPLY BOX NUMBERS --- */
  async function applyBoxNumbersBatch(boxInput: (string | BoxNumberClipboardEntry)[]) {
    let targetItems: InventoryItem[] = []
    if (selectedIds.value.size > 0) {
      targetItems = sortedItems.value.filter((i) => selectedIds.value.has(i.id))
    } else {
      targetItems = sortedItems.value
    }

    if (targetItems.length === 0) {
      showPasteNotif('Нет позиций для обновления номеров коробок')
      return
    }

    const entries: BoxNumberClipboardEntry[] = boxInput.map((e) =>
      typeof e === 'string' ? { boxNumber: e } : e
    )

    const hasSku = entries.some((e) => !!e.sku)
    const updates: { id: string; boxNumber: string }[] = []
    const prevUpdates: { id: string; boxNumber: string }[] = []

    if (hasSku) {
      const entryMap = new Map<string, string>()
      for (const e of entries) {
        if (e.sku) entryMap.set(e.sku, e.boxNumber)
      }
      for (const item of targetItems) {
        if (entryMap.has(item.sku)) {
          updates.push({
            id: item.id,
            boxNumber: entryMap.get(item.sku)!,
          })
          prevUpdates.push({
            id: item.id,
            boxNumber: item.boxNumber || '',
          })
        }
      }
    } else {
      const isSingle = entries.length === 1
      const singleBox = entries[0]?.boxNumber || ''
      const countToUpdate = isSingle ? targetItems.length : Math.min(entries.length, targetItems.length)
      for (let i = 0; i < countToUpdate; i++) {
        const boxVal = isSingle ? singleBox : entries[i].boxNumber
        updates.push({
          id: targetItems[i].id,
          boxNumber: boxVal,
        })
        prevUpdates.push({
          id: targetItems[i].id,
          boxNumber: targetItems[i].boxNumber || '',
        })
      }
    }

    if (updates.length === 0) {
      showPasteNotif('Не найдено позиций для обновления номеров коробок')
      return
    }

    const countToUpdate = updates.length

    try {
      await withLoading(
        {
          title: 'Обновление номеров коробок',
          message: `Обновление номеров коробок для ${countToUpdate} позиций...`,
          details: 'Пожалуйста, подождите, данные записываются в базу',
          icon: '📦',
        },
        async () => {
          await store.updateFactBoxNumbersBatch(updates)
          pushUndoAction({
            description: `Обновление номеров коробок (${countToUpdate} поз.)`,
            undo: async () => {
              await store.updateFactBoxNumbersBatch(prevUpdates)
            },
            redo: async () => {
              await store.updateFactBoxNumbersBatch(updates)
            },
          })
          showPasteNotif(`Успешно обновлены номера коробок для ${countToUpdate} позиций`)
        }
      )
    } catch (err) {
      console.error('Ошибка пакетного обновления номеров коробок:', err)
    }
  }

  /* --- MASS CLEANING / REMOVAL ACTIONS --- */
  function handleMergeDuplicates() {
    if (isReadOnly.value || duplicateFactCount.value === 0) return
    openConfirmDialog({
      title: 'Объединить дубликаты ревизии',
      description: `Будет объединено ${duplicateFactCount.value} дублирующихся позиций с одинаковым артикулом и локацией, а их количество просуммировано.`,
      confirmText: 'Объединить',
      badge: `⚡ ${duplicateFactCount.value} поз.`,
      isDanger: false,
      action: async () => {
        await store.mergeFactDuplicates()
        clearSelection()
        showPasteNotif('Дубликаты успешно объединены')
      },
    })
  }

  function handleRemoveDuplicatesOnly() {
    if (isReadOnly.value || duplicateFactCount.value === 0) return
    openConfirmDialog({
      title: 'Удалить повторы дубликатов',
      description: `Будет оставлена 1 первая запись для каждого повторяющегося артикула, а остальные удалены.`,
      confirmText: 'Удалить повторы',
      badge: `🗑️ ${duplicateFactCount.value} поз.`,
      isDanger: true,
      action: async () => {
        await store.removeFactDuplicates(true)
        clearSelection()
        showPasteNotif('Повторы дубликатов удалены')
      },
    })
  }

  function handleRemoveNonStandard() {
    if (isReadOnly.value || nonStandardFactCount.value === 0) return
    openConfirmDialog({
      title: 'Удалить нестандартные артикулы',
      description: `Будет удалено ${nonStandardFactCount.value} позиций с кодом ЛК не из 7 цифр.`,
      confirmText: 'Удалить нестандартные',
      badge: `⚠️ ${nonStandardFactCount.value} поз.`,
      isDanger: true,
      action: async () => {
        await store.removeFactNonStandard()
        clearSelection()
        showPasteNotif('Нестандартные позиции удалены')
      },
    })
  }

  function handleRemoveNotFound() {
    if (isReadOnly.value || ndFactCount.value === 0) return
    openConfirmDialog({
      title: 'Удалить позиции со статусом Н/Д',
      description: `Будет удалено ${ndFactCount.value} позиций, отсутствующих в каталоге товаров магазина.`,
      confirmText: 'Удалить Н/Д',
      badge: `⚠️ ${ndFactCount.value} поз.`,
      isDanger: true,
      action: async () => {
        await store.removeFactNotFound()
        clearSelection()
        showPasteNotif('Позиции Н/Д удалены')
      },
    })
  }

  function handleRemoveFiltered() {
    if (isReadOnly.value || sortedItems.value.length === 0) return
    const count = sortedItems.value.length
    openConfirmDialog({
      title: 'Удалить отфильтрованные позиции',
      description: `Будет безвозвратно удалено ${count} позиций, отображаемых по текущему фильтру или поиску.`,
      confirmText: `Удалить ${count} поз.`,
      badge: `🔍 ${count} поз.`,
      isDanger: true,
      action: async () => {
        const ids = sortedItems.value.map((i) => i.id)
        await store.deleteItemsBatch(ids)
        clearSelection()
        showPasteNotif(`Удалено ${count} отфильтрованных позиций`)
      },
    })
  }

  function handleDeleteSelected() {
    if (isReadOnly.value || selectedIds.value.size === 0) return
    const count = selectedIds.value.size
    openConfirmDialog({
      title: 'Удалить выбранные позиции',
      description: `Вы действительно хотите удалить ${count} отмеченных позиций из фактической ревизии?`,
      confirmText: `Удалить выбранные (${count})`,
      badge: `✓ ${count} выбрано`,
      isDanger: true,
      action: async () => {
        await store.deleteItemsBatch(Array.from(selectedIds.value))
        clearSelection()
        showPasteNotif(`Удалено ${count} выбранных позиций`)
      },
    })
  }

  function handleClearFact() {
    if (isReadOnly.value || store.items.length === 0) return
    openConfirmDialog({
      title: 'Очистить фактическую ревизию',
      description: `Будут безвозвратно удалены все (${store.items.length}) пересчитанные позиции фактической ревизии этого магазина. Вы уверены?`,
      confirmText: 'Очистить факт',
      isDanger: true,
      badge: '⚠️ Опасно',
      action: async () => {
        await store.clearFact()
        clearSelection()
        showPasteNotif('Фактическая ревизия полностью очищена')
      },
    })
  }

  async function handleDeleteRow(id: string) {
    if (isReadOnly.value) return
    const itemToDelete = store.items.find((i) => i.id === id)
    if (!itemToDelete) return
    await store.removeItem(id)
    pushUndoAction({
      description: `Удаление строки «${itemToDelete.sku}»`,
      undo: async () => {
        await store.addItem(itemToDelete)
      },
      redo: async () => {
        await store.removeItem(id)
      },
    })
    showPasteNotif(`Строка «${itemToDelete.sku}» удалена`)
  }

  /* --- EXPORT (EXCEL / CSV) --- */
  function getExportRows(): FactExportRow[] {
    let itemsToExport = sortedItems.value
    if (selectedIds.value.size > 0) {
      itemsToExport = sortedItems.value.filter((item) => selectedIds.value.has(item.id))
    }
    return itemsToExport.map((item, idx) => {
      const sku = item.sku.trim()
      const name = store.getFactItemName(sku, item.name)
      const mentions = getSkuMentions(sku)
      const stockQty = store.getStockItemQuantity(sku)
      const discrepancy = getFactDiscrepancy(item).text

      return {
        index: idx + 1,
        sku,
        name,
        mentions,
        location: item.location || '',
        quantity: item.quantity,
        boxNumber: item.boxNumber || '',
        unit: item.unit || 'шт.',
        multiplicity: store.getMultiplicityValue(sku),
        auditQuantity: stockQty !== null ? stockQty : '—',
        discrepancy,
      }
    })
  }

  async function handleExportExcel() {
    isExportDropdownOpen.value = false
    const rows = getExportRows()
    if (rows.length === 0) {
      showPasteNotif('Нет данных для выгрузки')
      return
    }
    const storeNum = store.activeStoreNumber || '1'
    const dateStr = new Date().toISOString().split('T')[0]
    const filename = `Ревизия_Факт_Магазин_${storeNum}_${dateStr}.xlsx`
    try {
      await withLoading(
        {
          title: 'Экспорт в Excel',
          message: `Формирование файла для ${rows.length} позиций...`,
          details: 'Пожалуйста, подождите, файл формируется и сохраняется',
          icon: '📊',
        },
        async () => {
          const savedPath = await exportFactToExcel(rows, filename)
          if (savedPath) {
            showPasteNotif(`Успешно сохранено: ${savedPath.split('\\').pop() || filename}`)
          }
        }
      )
    } catch (err) {
      console.error('Export Excel error:', err)
    }
  }

  async function handleExportCsv() {
    isExportDropdownOpen.value = false
    const rows = getExportRows()
    if (rows.length === 0) {
      showPasteNotif('Нет данных для выгрузки')
      return
    }
    const storeNum = store.activeStoreNumber || '1'
    const dateStr = new Date().toISOString().split('T')[0]
    const filename = `Ревизия_Факт_Магазин_${storeNum}_${dateStr}.csv`
    try {
      await withLoading(
        {
          title: 'Экспорт в CSV',
          message: `Формирование файла для ${rows.length} позиций...`,
          details: 'Пожалуйста, подождите, файл формируется и сохраняется',
          icon: '📄',
        },
        async () => {
          const savedPath = await exportFactToCsv(rows, filename)
          if (savedPath) {
            showPasteNotif(`Успешно сохранено: ${savedPath.split('\\').pop() || filename}`)
          }
        }
      )
    } catch (err) {
      console.error('Export CSV error:', err)
    }
  }

  return {
    isExportDropdownOpen,
    confirmDialog,
    openConfirmDialog,
    executeConfirmDialog,
    applyLocationsBatch,
    applyQuantitiesBatch,
    applyBoxNumbersBatch,
    handleMergeDuplicates,
    handleRemoveDuplicatesOnly,
    handleRemoveNonStandard,
    handleRemoveNotFound,
    handleRemoveFiltered,
    handleDeleteSelected,
    handleClearFact,
    handleDeleteRow,
    getExportRows,
    handleExportExcel,
    handleExportCsv,
  }
}
