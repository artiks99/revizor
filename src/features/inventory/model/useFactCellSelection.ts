import { ref, type Ref, type ComputedRef } from 'vue'
import type { useInventoryStore } from './useInventoryStore'
import { copyToClipboard } from '@shared/lib/clipboard'
import { parseLocationListFromClipboard, parseQuantityListFromClipboard } from '@shared/lib/clipboardParser'
import { withLoading } from '@shared/lib/loadingService'
import type { InventoryItem } from './types'

export interface CellSelection {
  field: 'location' | 'quantity' | 'sku' | 'row' | 'boxNumber'
  startRow: number
  endRow: number
  itemIds: string[]
}

export interface UseFactCellSelectionOptions {
  sortedItems: ComputedRef<InventoryItem[]>
  isReadOnly: ComputedRef<boolean>
  selectedIds: Ref<Set<string>>
  lastCopiedLocation: Ref<string>
  store: ReturnType<typeof useInventoryStore>
  pushUndoAction: (action: { description: string; undo: () => Promise<void>; redo: () => Promise<void> }) => void
  showPasteNotif: (msg: string) => void
  handleDeleteSelected: () => void
  startInlineEdit: (item: InventoryItem, field: 'sku' | 'location' | 'quantity' | 'boxNumber') => void
  isCheckboxDragging: Ref<boolean>
  checkboxDragStartIndex: Ref<number | null>
}

export function useFactCellSelection(options: UseFactCellSelectionOptions) {
  const {
    sortedItems,
    isReadOnly,
    selectedIds,
    lastCopiedLocation,
    store,
    pushUndoAction,
    showPasteNotif,
    handleDeleteSelected,
    startInlineEdit,
    isCheckboxDragging,
    checkboxDragStartIndex,
  } = options

  const cellSelection = ref<CellSelection | null>(null)
  const isMouseDownDragging = ref(false)
  const dragStart = ref<{ field: 'location' | 'quantity' | 'sku' | 'row' | 'boxNumber'; index: number } | null>(null)

  function isCellSelected(index: number, field: string): boolean {
    if (!cellSelection.value) return false
    if (cellSelection.value.field !== field) return false
    const min = Math.min(cellSelection.value.startRow, cellSelection.value.endRow)
    const max = Math.max(cellSelection.value.startRow, cellSelection.value.endRow)
    return index >= min && index <= max
  }

  function isCellSelectionBottom(index: number, field: string): boolean {
    if (!isCellSelected(index, field)) return false
    const max = Math.max(cellSelection.value!.startRow, cellSelection.value!.endRow)
    return index === max
  }

  function getCellSelectionClasses(index: number, field: string): string {
    if (!isCellSelected(index, field)) return ''
    const min = Math.min(cellSelection.value!.startRow, cellSelection.value!.endRow)
    const max = Math.max(cellSelection.value!.startRow, cellSelection.value!.endRow)
    const isTop = index === min
    const isBottom = index === max

    const classes = [
      'bg-indigo-500/25 text-indigo-100 font-medium relative select-none shadow-inner',
      'border-x-2 border-indigo-500',
    ]
    if (isTop) {
      classes.push('border-t-2 border-indigo-500')
    } else {
      classes.push('border-t border-indigo-500/20')
    }
    if (isBottom) {
      classes.push('border-b-2 border-indigo-500')
    } else {
      classes.push('border-b border-indigo-500/20')
    }
    return classes.join(' ')
  }

  function onCellMouseDown(
    index: number,
    field: 'location' | 'quantity' | 'sku' | 'row' | 'boxNumber',
    itemId: string,
    e: MouseEvent
  ) {
    if (isReadOnly.value) return
    if (e.button !== 0) return // only left mouse button

    const target = e.target as HTMLElement
    if (target.tagName === 'INPUT' || target.tagName === 'BUTTON' || target.closest('button') || target.closest('input')) {
      return
    }

    isMouseDownDragging.value = true
    dragStart.value = { field, index }
    cellSelection.value = {
      field,
      startRow: index,
      endRow: index,
      itemIds: [itemId],
    }

    if (field === 'row') {
      selectedIds.value = new Set([itemId])
    }
  }

  function onCellMouseEnter(index: number, field: 'location' | 'quantity' | 'sku' | 'row' | 'boxNumber') {
    if (!isMouseDownDragging.value || !dragStart.value) return
    if (dragStart.value.field !== field) return

    const min = Math.min(dragStart.value.index, index)
    const max = Math.max(dragStart.value.index, index)
    const ids: string[] = []
    for (let i = min; i <= max; i++) {
      const item = sortedItems.value[i]
      if (item) ids.push(item.id)
    }

    cellSelection.value = {
      field,
      startRow: min,
      endRow: max,
      itemIds: ids,
    }

    if (field === 'row') {
      selectedIds.value = new Set(ids)
    }
  }

  function onWindowMouseUp() {
    isMouseDownDragging.value = false
    dragStart.value = null
    isCheckboxDragging.value = false
    checkboxDragStartIndex.value = null
  }

  async function handleCopySelectedCells() {
    if (!cellSelection.value || cellSelection.value.itemIds.length === 0) return
    const { field, itemIds } = cellSelection.value
    const itemsMap = new Map(sortedItems.value.map((i) => [i.id, i]))
    const values: string[] = []
    for (const id of itemIds) {
      const item = itemsMap.get(id)
      if (item) {
        if (field === 'location') values.push(item.location || '')
        else if (field === 'quantity') values.push(String(item.quantity))
        else if (field === 'boxNumber') values.push(item.boxNumber || '')
        else if (field === 'sku') values.push(item.sku)
        else values.push(item.sku)
      }
    }
    if (values.length > 0) {
      const textToCopy = values.join('\n')
      if (field === 'location' && values[0]) {
        lastCopiedLocation.value = values[0]
      }
      await copyToClipboard(textToCopy, {
        label: field === 'location' ? 'Локация' : (field === 'quantity' ? 'Количество' : (field === 'boxNumber' ? '№ коробки' : 'ЛК')),
        showToast: true,
      })
      showPasteNotif(`Скопировано ${values.length} ${field === 'sku' ? 'ЛК' : 'ячеек'} в буфер обмена`)
    }
  }

  async function handlePasteIntoSelectedRows(explicitText?: string) {
    if (isReadOnly.value || selectedIds.value.size === 0) return

    let text = explicitText || ''
    if (!text) {
      try {
        if (navigator.clipboard && navigator.clipboard.readText) {
          text = await navigator.clipboard.readText()
        }
      } catch (err) {
        console.warn('Clipboard read error:', err)
      }
      if (!text && lastCopiedLocation.value) {
        text = lastCopiedLocation.value
      }
    }

    if (!text || !text.trim()) {
      showPasteNotif('Буфер обмена пуст — сначала скопируйте локацию')
      return
    }

    const rawLines = parseLocationListFromClipboard(text)
    if (rawLines.length === 0) return

    const targetItems = sortedItems.value.filter((i) => selectedIds.value.has(i.id))
    if (targetItems.length === 0) return

    const isSingleValue = rawLines.length === 1
    const locationToApply = rawLines[0]

    const updates: { id: string; location: string }[] = []
    const prevUpdates: { id: string; location: string }[] = []
    for (let i = 0; i < targetItems.length; i++) {
      const loc = isSingleValue ? locationToApply : (i < rawLines.length ? rawLines[i] : targetItems[i].location || '')
      updates.push({
        id: targetItems[i].id,
        location: loc,
      })
      prevUpdates.push({
        id: targetItems[i].id,
        location: targetItems[i].location || '',
      })
    }

    try {
      await withLoading(
        {
          title: 'Вставка локации',
          message: isSingleValue
            ? `Установка локации «${locationToApply}» для ${updates.length} позиций...`
            : `Обновление локаций для ${updates.length} позиций...`,
          details: 'Пожалуйста, подождите, изменения сохраняются в базу данных...',
          icon: '📍',
        },
        async () => {
          await store.updateFactLocationsBatch(updates)
          pushUndoAction({
            description: isSingleValue ? `Вставка локации «${locationToApply}» (${updates.length} поз.)` : `Вставка ${updates.length} локаций`,
            undo: async () => {
              await store.updateFactLocationsBatch(prevUpdates)
            },
            redo: async () => {
              await store.updateFactLocationsBatch(updates)
            },
          })
          showPasteNotif(
            isSingleValue
              ? `Локация «${locationToApply}» установлена для ${updates.length} позиций`
              : `Локации обновлены для ${updates.length} позиций`
          )
        }
      )
    } catch (err) {
      console.error('Ошибка вставки локации:', err)
    }
  }

  async function handlePasteIntoSelectedCells() {
    if (!cellSelection.value || cellSelection.value.itemIds.length === 0) return
    const { field, itemIds } = cellSelection.value

    let text = ''
    try {
      if (navigator.clipboard && navigator.clipboard.readText) {
        text = await navigator.clipboard.readText()
      }
    } catch (err) {
      console.warn('Clipboard read error:', err)
    }
    if (!text && field === 'location' && lastCopiedLocation.value) {
      text = lastCopiedLocation.value
    }

    if (!text || !text.trim()) {
      showPasteNotif('Буфер обмена пуст — сначала скопируйте значение (Ctrl+C)')
      return
    }

    const rawLines = text.split(/\r?\n/).map((l) => l.trim()).filter((l) => l.length > 0)
    if (rawLines.length === 0) return

    if (field === 'location') {
      const locList = parseLocationListFromClipboard(text)
      if (locList.length === 0) {
        showPasteNotif('Буфер обмена пуст — сначала скопируйте локацию')
        return
      }
      const isSingleValue = locList.length === 1
      const locationToApply = locList[0]
      const updates: { id: string; location: string }[] = []
      const prevUpdates: { id: string; location: string }[] = []
      const itemsMap = new Map(store.items.map((i) => [i.id, i]))

      for (let i = 0; i < itemIds.length; i++) {
        const loc = isSingleValue ? locationToApply : (i < locList.length ? locList[i] : '')
        const currentItem = itemsMap.get(itemIds[i])
        updates.push({
          id: itemIds[i],
          location: loc,
        })
        prevUpdates.push({
          id: itemIds[i],
          location: currentItem?.location || '',
        })
      }

      try {
        await withLoading(
          {
            title: 'Вставка локации',
            message: isSingleValue
              ? `Установка локации «${locationToApply}» в ${updates.length} ячеек...`
              : `Вставка ${updates.length} локаций...`,
            details: 'Пожалуйста, подождите, данные сохраняются в базу...',
            icon: '📍',
          },
          async () => {
            await store.updateFactLocationsBatch(updates)
            pushUndoAction({
              description: isSingleValue ? `Вставка локации «${locationToApply}» (${updates.length} яч.)` : `Вставка ${updates.length} локаций`,
              undo: async () => {
                await store.updateFactLocationsBatch(prevUpdates)
              },
              redo: async () => {
                await store.updateFactLocationsBatch(updates)
              },
            })
            showPasteNotif(
              isSingleValue
                ? `Локация «${locationToApply}» установлена в ${updates.length} ячеек`
                : `Локации обновлены в ${updates.length} ячейках`
            )
          }
        )
      } catch (err) {
        console.error('Ошибка вставки локации в ячейки:', err)
      }
    } else if (field === 'quantity') {
      const qtyList = parseQuantityListFromClipboard(text)
      if (qtyList.length === 0) {
        showPasteNotif('Не удалось распознать числа для количества')
        return
      }
      const isSingleValue = qtyList.length === 1
      const qtyToApply = qtyList[0]
      const updates: { id: string; quantity: number }[] = []
      const prevUpdates: { id: string; quantity: number }[] = []
      const itemsMap = new Map(store.items.map((i) => [i.id, i]))

      for (let i = 0; i < itemIds.length; i++) {
        const q = isSingleValue ? qtyToApply : (i < qtyList.length ? qtyList[i] : 0)
        const currentItem = itemsMap.get(itemIds[i])
        updates.push({
          id: itemIds[i],
          quantity: q,
        })
        prevUpdates.push({
          id: itemIds[i],
          quantity: currentItem ? currentItem.quantity : 0,
        })
      }

      try {
        await withLoading(
          {
            title: 'Вставка количества',
            message: `Обновление количества в ${updates.length} ячейках...`,
            details: 'Пожалуйста, подождите, данные записываются в базу...',
            icon: '📝',
          },
          async () => {
            await store.updateFactQuantitiesBatch(updates)
            pushUndoAction({
              description: `Вставка количества (${updates.length} яч.)`,
              undo: async () => {
                await store.updateFactQuantitiesBatch(prevUpdates)
              },
              redo: async () => {
                await store.updateFactQuantitiesBatch(updates)
              },
            })
            showPasteNotif(`Количество обновлено в ${updates.length} ячейках`)
          }
        )
      } catch (err) {
        console.error('Ошибка вставки количества:', err)
      }
    } else if (field === 'sku') {
      const skuList = rawLines.map((l) => l.replace(/\D/g, '').slice(0, 7)).filter((l) => l.length > 0)
      if (skuList.length === 0) {
        showPasteNotif('Не найдено корректных артикулов для вставки')
        return
      }
      const isSingleValue = skuList.length === 1
      const skuToApply = skuList[0]
      const itemsMap = new Map(store.items.map((i) => [i.id, i]))
      const updates: { id: string; prevItem: InventoryItem; newItem: InventoryItem }[] = []

      for (let i = 0; i < itemIds.length; i++) {
        const currentItem = itemsMap.get(itemIds[i])
        if (!currentItem) continue
        const targetSku = isSingleValue ? skuToApply : (i < skuList.length ? skuList[i] : currentItem.sku)
        const targetName = store.catalogSkuMap.get(targetSku) || currentItem.name
        updates.push({
          id: itemIds[i],
          prevItem: { ...currentItem },
          newItem: { ...currentItem, sku: targetSku, name: targetName },
        })
      }

      try {
        await withLoading(
          {
            title: 'Вставка артикулов',
            message: `Обновление артикулов в ${updates.length} ячейках...`,
            details: 'Пожалуйста, подождите, данные сохраняются в базу...',
            icon: '🏷️',
          },
          async () => {
            for (const u of updates) {
              await store.updateItem(u.id, u.newItem)
            }
            pushUndoAction({
              description: isSingleValue ? `Вставка артикула «${skuToApply}» (${updates.length} яч.)` : `Вставка ${updates.length} артикулов`,
              undo: async () => {
                for (const u of updates) {
                  await store.updateItem(u.id, u.prevItem)
                }
              },
              redo: async () => {
                for (const u of updates) {
                  await store.updateItem(u.id, u.newItem)
                }
              },
            })
            showPasteNotif(
              isSingleValue
                ? `Артикул «${skuToApply}» установлен в ${updates.length} ячеек`
                : `Артикулы обновлены в ${updates.length} ячейках`
            )
          }
        )
      } catch (err) {
        console.error('Ошибка вставки артикулов в ячейки:', err)
      }
    } else if (field === 'boxNumber') {
      const boxList = rawLines.map((l) => l.trim()).filter((l) => l.length > 0)
      if (boxList.length === 0) {
        showPasteNotif('Буфер обмена пуст — сначала скопируйте номер коробки')
        return
      }
      const isSingleValue = boxList.length === 1
      const boxToApply = boxList[0]
      const updates: { id: string; boxNumber: string }[] = []
      const prevUpdates: { id: string; boxNumber: string }[] = []
      const itemsMap = new Map(store.items.map((i) => [i.id, i]))

      for (let i = 0; i < itemIds.length; i++) {
        const b = isSingleValue ? boxToApply : (i < boxList.length ? boxList[i] : '')
        const currentItem = itemsMap.get(itemIds[i])
        updates.push({
          id: itemIds[i],
          boxNumber: b,
        })
        prevUpdates.push({
          id: itemIds[i],
          boxNumber: currentItem?.boxNumber || '',
        })
      }

      try {
        await withLoading(
          {
            title: 'Вставка номера коробки',
            message: isSingleValue
              ? `Установка номера коробки «${boxToApply}» в ${updates.length} ячеек...`
              : `Вставка ${updates.length} номеров коробок...`,
            details: 'Пожалуйста, подождите, данные сохраняются в базу...',
            icon: '📦',
          },
          async () => {
            await store.updateFactBoxNumbersBatch(updates)
            pushUndoAction({
              description: isSingleValue ? `Вставка коробки «${boxToApply}» (${updates.length} яч.)` : `Вставка ${updates.length} номеров коробок`,
              undo: async () => {
                await store.updateFactBoxNumbersBatch(prevUpdates)
              },
              redo: async () => {
                await store.updateFactBoxNumbersBatch(updates)
              },
            })
            showPasteNotif(
              isSingleValue
                ? `Номер коробки «${boxToApply}» установлен в ${updates.length} ячеек`
                : `Номера коробок обновлены в ${updates.length} ячейках`
            )
          }
        )
      } catch (err) {
        console.error('Ошибка вставки номера коробки в ячейки:', err)
      }
    }
  }

  async function handleClearSelectedCells() {
    if (isReadOnly.value || !cellSelection.value || cellSelection.value.itemIds.length === 0) return
    const { field, itemIds } = cellSelection.value

    if (field === 'location') {
      const itemsMap = new Map(store.items.map((i) => [i.id, i]))
      const updates: { id: string; location: string }[] = []
      const prevUpdates: { id: string; location: string }[] = []

      for (const id of itemIds) {
        const item = itemsMap.get(id)
        if (item && item.location) {
          updates.push({ id, location: '' })
          prevUpdates.push({ id, location: item.location })
        }
      }

      if (updates.length === 0) {
        showPasteNotif('Выделенные ячейки локации уже пустые')
        return
      }

      try {
        await withLoading(
          {
            title: 'Очистка локации',
            message: `Очистка локации в ${updates.length} ячейках...`,
            details: 'Пожалуйста, подождите, данные сохраняются в базу...',
            icon: '🗑️',
          },
          async () => {
            await store.updateFactLocationsBatch(updates)
            pushUndoAction({
              description: `Очистка локации (${updates.length} яч.)`,
              undo: async () => {
                await store.updateFactLocationsBatch(prevUpdates)
              },
              redo: async () => {
                await store.updateFactLocationsBatch(updates)
              },
            })
            showPasteNotif(`Очищено ${updates.length} ячеек локации (Ctrl+Z для отмены)`)
          }
        )
      } catch (err) {
        console.error('Ошибка очистки ячеек локации:', err)
      }
    } else if (field === 'quantity') {
      const itemsMap = new Map(store.items.map((i) => [i.id, i]))
      const updates: { id: string; quantity: number }[] = []
      const prevUpdates: { id: string; quantity: number }[] = []

      for (const id of itemIds) {
        const item = itemsMap.get(id)
        if (item && item.quantity !== 0) {
          updates.push({ id, quantity: 0 })
          prevUpdates.push({ id, quantity: item.quantity })
        }
      }

      if (updates.length === 0) {
        showPasteNotif('Количество в выделенных ячейках уже равно 0')
        return
      }

      try {
        await withLoading(
          {
            title: 'Сброс количества',
            message: `Сброс количества в ${updates.length} ячейках...`,
            details: 'Пожалуйста, подождите, данные записываются в базу...',
            icon: '🗑️',
          },
          async () => {
            await store.updateFactQuantitiesBatch(updates)
            pushUndoAction({
              description: `Сброс количества (${updates.length} яч.)`,
              undo: async () => {
                await store.updateFactQuantitiesBatch(prevUpdates)
              },
              redo: async () => {
                await store.updateFactQuantitiesBatch(updates)
              },
            })
            showPasteNotif(`Количество сброшено в ${updates.length} ячейках (Ctrl+Z для отмены)`)
          }
        )
      } catch (err) {
        console.error('Ошибка сброса количества:', err)
      }
    } else if (field === 'boxNumber') {
      const itemsMap = new Map(store.items.map((i) => [i.id, i]))
      const updates: { id: string; boxNumber: string }[] = []
      const prevUpdates: { id: string; boxNumber: string }[] = []

      for (const id of itemIds) {
        const item = itemsMap.get(id)
        if (item && item.boxNumber) {
          updates.push({ id, boxNumber: '' })
          prevUpdates.push({ id, boxNumber: item.boxNumber })
        }
      }

      if (updates.length === 0) {
        showPasteNotif('Выделенные ячейки номера коробки уже пустые')
        return
      }

      try {
        await withLoading(
          {
            title: 'Очистка номера коробки',
            message: `Очистка номера коробки в ${updates.length} ячейках...`,
            details: 'Пожалуйста, подождите, данные сохраняются в базу...',
            icon: '🗑️',
          },
          async () => {
            await store.updateFactBoxNumbersBatch(updates)
            pushUndoAction({
              description: `Очистка номера коробки (${updates.length} яч.)`,
              undo: async () => {
                await store.updateFactBoxNumbersBatch(prevUpdates)
              },
              redo: async () => {
                await store.updateFactBoxNumbersBatch(updates)
              },
            })
            showPasteNotif(`Очищено ${updates.length} ячеек коробки (Ctrl+Z для отмены)`)
          }
        )
      } catch (err) {
        console.error('Ошибка очистки ячеек номера коробки:', err)
      }
    } else if (field === 'row') {
      handleDeleteSelected()
    }
  }

  async function handleGlobalKeyDown(e: KeyboardEvent) {
    if (isReadOnly.value) return

    const activeEl = document.activeElement
    const isEditing = activeEl && (
      activeEl.tagName === 'INPUT' ||
      activeEl.tagName === 'TEXTAREA' ||
      (activeEl as HTMLElement).isContentEditable
    )
    if (isEditing) {
      return
    }

    // Ctrl+C / Cmd+C (also check Russian 'с' / 'С')
    if ((e.ctrlKey || e.metaKey) && (e.key === 'c' || e.key === 'C' || e.key === 'с' || e.key === 'С')) {
      if (cellSelection.value && cellSelection.value.itemIds.length > 0) {
        e.preventDefault()
        await handleCopySelectedCells()
        return
      }
    }

    // Ctrl+V or Cmd+V (also check Russian 'м' / 'М')
    if ((e.ctrlKey || e.metaKey) && (e.key === 'v' || e.key === 'V' || e.key === 'м' || e.key === 'М')) {
      // 1. If cells are selected via Excel drag:
      if (cellSelection.value && cellSelection.value.itemIds.length > 0) {
        e.preventDefault()
        await handlePasteIntoSelectedCells()
        return
      }

      // 2. If rows are selected via checkboxes:
      if (selectedIds.value.size > 0) {
        e.preventDefault()
        await handlePasteIntoSelectedRows()
        return
      }
    }

    // Delete / Backspace: quickly clear data in selected cells or delete selected rows
    if (e.key === 'Delete' || e.key === 'Backspace') {
      if (cellSelection.value && cellSelection.value.itemIds.length > 0) {
        e.preventDefault()
        await handleClearSelectedCells()
        return
      }
      if (e.key === 'Delete' && selectedIds.value.size > 0) {
        e.preventDefault()
        handleDeleteSelected()
        return
      }
    }

    // Enter to edit single selected cell
    if (e.key === 'Enter' && cellSelection.value && cellSelection.value.itemIds.length === 1 && !isEditing) {
      const item = sortedItems.value[cellSelection.value.startRow]
      if (item && (cellSelection.value.field === 'location' || cellSelection.value.field === 'quantity' || cellSelection.value.field === 'sku')) {
        e.preventDefault()
        startInlineEdit(item, cellSelection.value.field)
        return
      }
    }

    // Escape to clear cell selection
    if (e.key === 'Escape') {
      if (cellSelection.value) {
        cellSelection.value = null
      }
    }
  }

  return {
    cellSelection,
    isMouseDownDragging,
    dragStart,
    isCellSelected,
    isCellSelectionBottom,
    getCellSelectionClasses,
    onCellMouseDown,
    onCellMouseEnter,
    onWindowMouseUp,
    handlePasteIntoSelectedCells,
    handlePasteIntoSelectedRows,
    handleClearSelectedCells,
    handleCopySelectedCells,
    handleGlobalKeyDown,
  }
}
