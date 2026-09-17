export interface FactLocationEntry {
  id: string
  location: string
  quantity: number
  unit: string
  boxNumber?: string
}

/**
 * Форматирует строку локации и номера коробки при наличии.
 */
export function formatLocationAndBox(location?: string, boxNumber?: string): string {
  const loc = (location || '').trim()
  const box = (boxNumber || '').trim()
  if (loc && box) {
    return `Локация: "${loc}", № коробки: ${box}`
  }
  if (loc) {
    return `Локация: "${loc}"`
  }
  if (box) {
    return `№ коробки: ${box}`
  }
  return 'без локации'
}

/**
 * Форматирует структурированную всплывающую подсказку (tooltip)
 * со списком мест и количеств, где товар был посчитан в ревизии факт.
 */
export function formatFactLocationTooltip(entries: FactLocationEntry[]): string {
  if (!entries || entries.length === 0) {
    return 'Товар не посчитан в фактической ревизии'
  }

  if (entries.length === 1) {
    const e = entries[0]
    const place = formatLocationAndBox(e.location, e.boxNumber)
    return `Посчитан в 1 месте:\n${place} — ${e.quantity} ${e.unit || 'шт.'}`
  }

  const totalQty = entries.reduce((sum, e) => sum + (Number(e.quantity) || 0), 0)
  const lines: string[] = [
    `Посчитан в ${entries.length} местах:`,
  ]
  entries.forEach((e, idx) => {
    const place = formatLocationAndBox(e.location, e.boxNumber)
    lines.push(`  ${idx + 1}. ${place} — ${e.quantity} ${e.unit || 'шт.'}`)
  })
  lines.push(`Итого факт: ${Number(totalQty.toFixed(3))} шт.`)
  return lines.join('\n')
}
