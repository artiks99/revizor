import { parseRawCsv, cleanSku, cleanBarcode } from './csvParser'

export interface FactClipboardRow {
  sku: string
  name: string
  quantity: number
  unit: string
  location: string
}

export interface StockClipboardRow {
  sku: string
  name: string
  quantity: number
}

export interface CatalogClipboardRow {
  sku: string
  name: string
  barcode?: string
}

/**
 * Parses raw text from clipboard into rows and columns
 */
export function getClipboardGrid(text: string): string[][] {
  if (!text || !text.trim()) return []
  return parseRawCsv(text)
}

/**
 * Splits a single text line into SKU and Name if it starts or ends with SKU digits
 */
function trySplitSingleLine(val: string): { sku: string; name: string } | null {
  const trimmed = val.trim()
  if (!trimmed) return null
  
  // If the whole string is only digits (or punctuation/spaces), it cannot be SKU + Name
  if (/^[\d\s.,\-_/]+$/.test(trimmed)) return null

  // Format: "1002001 - Название" or "1002001 Название"
  const startMatch = trimmed.match(/^(\d{5,8})\s*[-–—:|;,]?\s*(.+)$/)
  if (startMatch && startMatch[2].trim().length > 0) {
    const candidateName = startMatch[2].trim().replace(/^["']|["']$/g, '')
    // The name part must contain actual text/letters, not just trailing numbers
    if (/[^\d\s.,;:|\-–—"']/.test(candidateName)) {
      return {
        sku: cleanSku(startMatch[1]),
        name: candidateName,
      }
    }
  }

  // Format: "Название - 1002001" or "Название 1002001"
  const endMatch = trimmed.match(/^(.+?)\s*[-–—:|;,]?\s*(\d{5,8})$/)
  if (endMatch && endMatch[1].trim().length > 0) {
    const candidateName = endMatch[1].trim().replace(/^["']|["']$/g, '')
    if (/[^\d\s.,;:|\-–—"']/.test(candidateName)) {
      return {
        sku: cleanSku(endMatch[2]),
        name: candidateName,
      }
    }
  }

  return null
}

function isNumericString(val: string): boolean {
  if (!val) return false
  const clean = val.trim().replace(/\s/g, '').replace(',', '.')
  return clean !== '' && !isNaN(Number(clean))
}

function parseQtyValue(val: string): number {
  if (!val) return 0
  const clean = val.trim().replace(/\s/g, '').replace(',', '.')
  const num = parseFloat(clean)
  return isNaN(num) ? 0 : num
}

function isLikelySku(val: string): boolean {
  if (!val) return false
  const trimmed = val.trim()
  return /^\d{5,8}$/.test(trimmed)
}

/**
 * Smart parser for Fact Inventory items from clipboard
 */
export function parseFactClipboard(
  text: string,
  focusedField: 'sku' | 'name' | 'quantity' | 'location' = 'sku',
  catalogMap?: Map<string, string>
): FactClipboardRow[] {
  const grid = getClipboardGrid(text)
  if (grid.length === 0) return []

  // Check if first row is header
  let startIndex = 0
  let colSkuIdx = -1
  let colNameIdx = -1
  let colQtyIdx = -1
  let colLocIdx = -1

  if (grid.length > 0) {
    const firstRow = grid[0].map((c) => c.toLowerCase().trim())
    const hasHeader = firstRow.some(
      (c) =>
        c.includes('артикул') ||
        c.includes('наименов') ||
        c.includes('назван') ||
        c.includes('кол') ||
        c.includes('локация') ||
        c.includes('лк') ||
        c.includes('sku') ||
        c.includes('name') ||
        c.includes('код')
    )

    if (hasHeader) {
      startIndex = 1
      colSkuIdx = firstRow.findIndex(
        (c) => c.includes('лк') || c.includes('артикул') || c.includes('sku') || c.includes('код')
      )
      colNameIdx = firstRow.findIndex(
        (c) => c.includes('назван') || c.includes('наименов') || c.includes('name') || c.includes('товар')
      )
      colQtyIdx = firstRow.findIndex(
        (c) => c.includes('кол') || c.includes('остат') || c.includes('qty') || c.includes('quantity') || c.includes('к-во')
      )
      colLocIdx = firstRow.findIndex(
        (c) =>
          c.includes('локация') ||
          c.includes('место') ||
          c.includes('location') ||
          c.includes('ячейк') ||
          c.includes('адрес') ||
          c.includes('зона')
      )
    }
  }

  const results: FactClipboardRow[] = []

  for (let i = startIndex; i < grid.length; i++) {
    const row = grid[i]
    if (!row || row.length === 0 || (row.length === 1 && !row[0].trim())) continue

    let sku = ''
    let name = ''
    let quantity = 0
    let unit = 'шт.'
    let location = ''

    if (colSkuIdx !== -1 || colQtyIdx !== -1 || colNameIdx !== -1) {
      if (colSkuIdx !== -1) sku = cleanSku(row[colSkuIdx] || '')
      if (colNameIdx !== -1) name = (row[colNameIdx] || '').replace(/^["']|["']$/g, '').trim()
      if (colQtyIdx !== -1) quantity = parseQtyValue(row[colQtyIdx] || '')
      if (colLocIdx !== -1) location = (row[colLocIdx] || '').trim()
    } else if (row.length === 1) {
      const val = row[0].trim()
      if (focusedField === 'sku') {
        const split = trySplitSingleLine(val)
        if (split) {
          sku = split.sku
          name = split.name
        } else {
          sku = cleanSku(val)
        }
      } else if (focusedField === 'name') {
        name = val
      } else if (focusedField === 'quantity') {
        quantity = parseQtyValue(val)
      } else if (focusedField === 'location') {
        location = val
      } else {
        const split = trySplitSingleLine(val)
        if (split) {
          sku = split.sku
          name = split.name
        } else if (isLikelySku(val)) {
          sku = cleanSku(val)
        } else if (isNumericString(val)) {
          quantity = parseQtyValue(val)
        } else {
          name = val
        }
      }
    } else if (row.length === 2) {
      const col0 = row[0].trim()
      const col1 = row[1].trim()
      const d0 = col0.replace(/\D/g, '')
      const d1 = col1.replace(/\D/g, '')

      // Case 0: 6 digits + 1-2 digits LK part -> merge into 7-digit LK (e.g. 591115 + 0 = 5911150)
      if (d0.length === 6 && (d1.length === 1 || d1.length === 2)) {
        sku = d0 + d1
      } else if (isLikelySku(col0) && isNumericString(col1)) {
        sku = cleanSku(col0)
        quantity = parseQtyValue(col1)
      } else if (isNumericString(col0) && isLikelySku(col1)) {
        sku = cleanSku(col1)
        quantity = parseQtyValue(col0)
      } else if (isLikelySku(col0) && !isNumericString(col1)) {
        sku = cleanSku(col0)
        name = col1
      } else if (!isNumericString(col0) && isLikelySku(col1)) {
        name = col0
        sku = cleanSku(col1)
      } else if (!isLikelySku(col0) && isNumericString(col1)) {
        name = col0
        quantity = parseQtyValue(col1)
      } else {
        sku = cleanSku(col0)
        name = col1
      }
    } else if (row.length === 3) {
      const c0 = row[0].trim()
      const c1 = row[1].trim()
      const c2 = row[2].trim()
      const d0 = c0.replace(/\D/g, '')
      const d1 = c1.replace(/\D/g, '')
      const d2 = c2.replace(/\D/g, '')

      // Case 0a: [6-digit, 1-digit, Qty] (e.g. "591115" \t "0" \t "24")
      if (d0.length === 6 && d1.length === 1 && isNumericString(c2)) {
        sku = d0 + d1
        quantity = parseQtyValue(c2)
      }
      // Case 0b: [6-digit, 1-digit, Name] (e.g. "591115" \t "0" \t "Вода")
      else if (d0.length === 6 && d1.length === 1 && !isNumericString(c2)) {
        sku = d0 + d1
        name = c2
      }
      // Case 0c: [№ (1-4 digits), 6-digit, 1-digit] (e.g. "1" \t "591115" \t "0")
      else if (/^\d{1,4}$/.test(c0) && d1.length === 6 && d2.length === 1) {
        sku = d1 + d2
      } else if (isLikelySku(c0) && isNumericString(c1) && !isNumericString(c2)) {
        sku = cleanSku(c0)
        quantity = parseQtyValue(c1)
        unit = c2 || 'шт.'
      } else if (/^\d{1,4}$/.test(c0) && isLikelySku(c1) && isNumericString(c2)) {
        sku = cleanSku(c1)
        quantity = parseQtyValue(c2)
      } else if (/^\d{1,4}$/.test(c0) && isLikelySku(c1) && !isNumericString(c2)) {
        sku = cleanSku(c1)
        name = c2
      } else {
        sku = cleanSku(c0)
        name = c1
        quantity = parseQtyValue(c2)
      }
    } else if (row.length >= 4) {
      const c0 = row[0].trim()
      const c1 = row[1].trim()
      const c2 = row[2].trim()
      const c3 = row[3].trim()
      const c4 = (row[4] || '').trim()
      const d0 = c0.replace(/\D/g, '')
      const d1 = c1.replace(/\D/g, '')
      const d2 = c2.replace(/\D/g, '')

      // Case 0a: [№, 6-digit, 1-digit, Name, Qty?]
      if (/^\d{1,4}$/.test(c0) && d1.length === 6 && d2.length === 1) {
        sku = d1 + d2
        name = c3
        if (c4) {
          quantity = parseQtyValue(c4)
          if (row[5]) location = row[5].trim()
        }
      }
      // Case 0b: [6-digit, 1-digit, Name, Qty, Loc?]
      else if (d0.length === 6 && d1.length === 1) {
        sku = d0 + d1
        name = c2
        quantity = parseQtyValue(c3)
        if (c4) location = c4
      }
      // Case 0c: [№, 7-digit, Name, Qty, Loc?]
      else if (/^\d{1,4}$/.test(c0) && isLikelySku(c1)) {
        sku = cleanSku(c1)
        name = c2
        quantity = parseQtyValue(c3)
        if (c4) location = c4
      } else {
        sku = cleanSku(c0)
        name = c1
        quantity = parseQtyValue(c2)
        location = c3
      }
    }

    // If SKU is 6 digits and catalogMap is provided, check if 7-digit version exists in catalog
    if (sku.length === 6 && catalogMap) {
      for (let d = 0; d <= 9; d++) {
        const testSku = `${sku}${d}`
        if (catalogMap.has(testSku)) {
          if (!name || isNumericString(name) || name.startsWith('Товар ')) {
            name = catalogMap.get(testSku)!
          }
          sku = testSku
          break
        }
      }
    }

    if (!name && sku && catalogMap && catalogMap.has(sku)) {
      name = catalogMap.get(sku)!
    }

    if (sku || name || location || (quantity > 0 && focusedField !== 'quantity')) {
      results.push({
        sku: sku || cleanSku(String(Math.floor(1000000 + Math.random() * 9000000))),
        name: name || (sku ? `Товар ${sku}` : 'Товар без названия'),
        quantity,
        unit,
        location,
      })
    } else if (focusedField === 'quantity') {
      results.push({
        sku: '',
        name: '',
        quantity,
        unit,
        location,
      })
    }
  }

  return results
}

/**
 * Smart parser for Store Stock items from clipboard
 */
export function parseStockClipboard(
  text: string,
  focusedField: 'sku' | 'name' | 'quantity' = 'sku',
  catalogMap?: Map<string, string>
): StockClipboardRow[] {
  const grid = getClipboardGrid(text)
  if (grid.length === 0) return []

  let startIndex = 0
  let colSkuIdx = -1
  let colNameIdx = -1
  let colQtyIdx = -1

  if (grid.length > 0) {
    const firstRow = grid[0].map((c) => c.toLowerCase().trim())
    const hasHeader = firstRow.some(
      (c) =>
        c.includes('артикул') ||
        c.includes('наименов') ||
        c.includes('назван') ||
        c.includes('номенклатур') ||
        c.includes('кол') ||
        c.includes('остат') ||
        c.includes('лк') ||
        c.includes('sku') ||
        c.includes('quantity') ||
        c.includes('код')
    )

    if (hasHeader) {
      startIndex = 1
      colSkuIdx = firstRow.findIndex(
        (c) => c.includes('лк') || c.includes('артикул') || c.includes('sku') || c.includes('код') || c.includes('штрихкод')
      )
      colNameIdx = firstRow.findIndex(
        (c) => c.includes('назван') || c.includes('наименов') || c.includes('номенклатур') || c.includes('name') || c.includes('товар')
      )
      colQtyIdx = firstRow.findIndex(
        (c) => c.includes('кол') || c.includes('остат') || c.includes('qty') || c.includes('quantity') || c.includes('к-во')
      )
    }
  }

  const results: StockClipboardRow[] = []

  for (let i = startIndex; i < grid.length; i++) {
    const row = grid[i]
    if (!row || row.length === 0 || (row.length === 1 && !row[0].trim())) continue

    let sku = ''
    let name = ''
    let quantity = 0

    if (colSkuIdx !== -1 || colQtyIdx !== -1 || colNameIdx !== -1) {
      if (colSkuIdx !== -1) sku = cleanSku(row[colSkuIdx] || '')
      if (colNameIdx !== -1) name = (row[colNameIdx] || '').replace(/^["']|["']$/g, '').trim()
      if (colQtyIdx !== -1) quantity = parseQtyValue(row[colQtyIdx] || '')
    } else if (row.length === 1) {
      const val = row[0].trim()
      if (focusedField === 'sku') {
        const split = trySplitSingleLine(val)
        if (split) {
          sku = split.sku
          name = split.name
        } else {
          sku = cleanSku(val)
        }
      } else if (focusedField === 'name') {
        name = val
      } else if (focusedField === 'quantity') {
        quantity = parseQtyValue(val)
      } else {
        const split = trySplitSingleLine(val)
        if (split) {
          sku = split.sku
          name = split.name
        } else if (isLikelySku(val)) {
          sku = cleanSku(val)
        } else if (isNumericString(val)) {
          quantity = parseQtyValue(val)
        } else {
          name = val
        }
      }
    } else if (row.length === 2) {
      const col0 = row[0].trim()
      const col1 = row[1].trim()
      const d0 = col0.replace(/\D/g, '')
      const d1 = col1.replace(/\D/g, '')

      // Case 0: 6 digits + 1-2 digits LK part -> merge into 7-digit LK
      if (d0.length === 6 && (d1.length === 1 || d1.length === 2)) {
        sku = d0 + d1
      }
      // Case 1: Col0 is SKU and Col1 is numeric Quantity
      else if (isLikelySku(col0) && isNumericString(col1)) {
        sku = cleanSku(col0)
        quantity = parseQtyValue(col1)
      }
      // Case 2: Col0 is numeric Quantity and Col1 is SKU
      else if (isNumericString(col0) && isLikelySku(col1)) {
        sku = cleanSku(col1)
        quantity = parseQtyValue(col0)
      }
      // Case 3: Col0 is SKU and Col1 is product Name text
      else if (isLikelySku(col0) && !isNumericString(col1)) {
        sku = cleanSku(col0)
        name = col1
      }
      // Case 4: Col0 is product Name text and Col1 is SKU
      else if (!isNumericString(col0) && isLikelySku(col1)) {
        name = col0
        sku = cleanSku(col1)
      }
      // Case 5: Col0 is product Name text and Col1 is numeric Quantity
      else if (!isLikelySku(col0) && isNumericString(col1)) {
        name = col0
        quantity = parseQtyValue(col1)
      }
      // Default 2-column fallback
      else {
        sku = cleanSku(col0)
        name = col1
      }
    } else if (row.length === 3) {
      const c0 = row[0].trim()
      const c1 = row[1].trim()
      const c2 = row[2].trim()
      const d0 = c0.replace(/\D/g, '')
      const d1 = c1.replace(/\D/g, '')
      const d2 = c2.replace(/\D/g, '')

      // Case 0a: [6-digit, 1-digit, Qty]
      if (d0.length === 6 && d1.length === 1 && isNumericString(c2)) {
        sku = d0 + d1
        quantity = parseQtyValue(c2)
      }
      // Case 0b: [6-digit, 1-digit, Name]
      else if (d0.length === 6 && d1.length === 1 && !isNumericString(c2)) {
        sku = d0 + d1
        name = c2
      }
      // Case 0c: [№, 6-digit, 1-digit]
      else if (/^\d{1,4}$/.test(c0) && d1.length === 6 && d2.length === 1) {
        sku = d1 + d2
      } else if (isLikelySku(c0) && isNumericString(c1) && !isNumericString(c2)) {
        sku = cleanSku(c0)
        quantity = parseQtyValue(c1)
      } else if (/^\d{1,4}$/.test(c0) && isLikelySku(c1) && isNumericString(c2)) {
        sku = cleanSku(c1)
        quantity = parseQtyValue(c2)
      } else if (/^\d{1,4}$/.test(c0) && isLikelySku(c1) && !isNumericString(c2)) {
        sku = cleanSku(c1)
        name = c2
      } else {
        sku = cleanSku(c0)
        name = c1
        quantity = parseQtyValue(c2)
      }
    } else if (row.length >= 4) {
      const c0 = row[0].trim()
      const c1 = row[1].trim()
      const c2 = row[2].trim()
      const c3 = row[3].trim()
      const d0 = c0.replace(/\D/g, '')
      const d1 = c1.replace(/\D/g, '')
      const d2 = c2.replace(/\D/g, '')

      // Case 0a: [№, 6-digit, 1-digit, Name, Qty?]
      if (/^\d{1,4}$/.test(c0) && d1.length === 6 && d2.length === 1) {
        sku = d1 + d2
        name = c3
        if (row[4]) quantity = parseQtyValue(row[4])
      }
      // Case 0b: [6-digit, 1-digit, Name, Qty]
      else if (d0.length === 6 && d1.length === 1) {
        sku = d0 + d1
        name = c2
        quantity = parseQtyValue(c3)
      } else if (/^\d{1,4}$/.test(c0) && isLikelySku(c1)) {
        sku = cleanSku(c1)
        name = c2
        quantity = parseQtyValue(c3)
      } else {
        sku = cleanSku(c0)
        name = c1
        quantity = parseQtyValue(c2)
      }
    }

    // Auto-complete 6-digit SKU from catalogMap
    if (sku.length === 6 && catalogMap) {
      for (let d = 0; d <= 9; d++) {
        const testSku = `${sku}${d}`
        if (catalogMap.has(testSku)) {
          if (!name || isNumericString(name) || name.startsWith('Товар ')) {
            name = catalogMap.get(testSku)!
          }
          sku = testSku
          break
        }
      }
    }

    if (!name && sku && catalogMap && catalogMap.has(sku)) {
      name = catalogMap.get(sku)!
    }

    if (sku || name || (quantity > 0 && focusedField !== 'quantity')) {
      results.push({
        sku: sku || cleanSku(String(Math.floor(1000000 + Math.random() * 9000000))),
        name: name || (sku ? `Товар ${sku}` : 'Товар без названия'),
        quantity,
      })
    } else if (focusedField === 'quantity') {
      results.push({
        sku: '',
        name: '',
        quantity,
      })
    }
  }

  return results
}

/**
 * Smart parser for Store Catalog items from clipboard
 */
export function parseCatalogClipboard(
  text: string,
  focusedField: 'sku' | 'name' = 'sku',
  catalogMap?: Map<string, string>
): CatalogClipboardRow[] {
  const grid = getClipboardGrid(text)
  if (grid.length === 0) return []

  let startIndex = 0
  const firstRowStr = grid[0].join(' ').toLowerCase()
  if (
    firstRowStr.includes('артикул') ||
    firstRowStr.includes('наименов') ||
    firstRowStr.includes('лк') ||
    firstRowStr.includes('sku') ||
    firstRowStr.includes('name')
  ) {
    startIndex = 1
  }

  const results: CatalogClipboardRow[] = []

  for (let i = startIndex; i < grid.length; i++) {
    const row = grid[i]
    if (!row || row.length === 0 || (row.length === 1 && !row[0].trim())) continue

    let sku = ''
    let name = ''
    let barcode = ''

    if (row.length === 1) {
      const val = row[0].trim()
      if (focusedField === 'sku') {
        const split = trySplitSingleLine(val)
        if (split) {
          sku = split.sku
          name = split.name
        } else {
          sku = cleanSku(val)
        }
      } else if (focusedField === 'name') {
        name = val
      } else {
        const split = trySplitSingleLine(val)
        if (split) {
          sku = split.sku
          name = split.name
        } else if (/^\d{5,8}$/.test(val)) {
          sku = cleanSku(val)
        } else {
          name = val
        }
      }
    } else if (row.length >= 2) {
      const col0 = row[0].trim()
      const col1 = row[1].trim()
      const col2 = (row[2] || '').trim()
      const d0 = col0.replace(/\D/g, '')
      const d1 = col1.replace(/\D/g, '')
      const d2 = col2.replace(/\D/g, '')

      // Case 0a: [6-digit, 1-digit, Name?]
      if (d0.length === 6 && d1.length === 1) {
        sku = d0 + d1
        if (col2 && !isNumericString(col2)) {
          name = col2
        }
        if (row[3]) {
          barcode = cleanBarcode(row[3])
        }
      }
      // Case 0b: [№, 6-digit, 1-digit, Name?]
      else if (/^\d{1,4}$/.test(col0) && d1.length === 6 && d2.length === 1) {
        sku = d1 + d2
        if (row[3] && !isNumericString(row[3])) {
          name = row[3].trim()
        }
        if (row[4]) {
          barcode = cleanBarcode(row[4])
        }
      }
      // Case 1: [7-digit, Name, Barcode?]
      else if (/^\d{5,8}$/.test(col0.replace(/\D/g, '')) && !/^\d+$/.test(col1)) {
        sku = cleanSku(col0)
        name = col1
        if (col2) barcode = cleanBarcode(col2)
      }
      // Case 2: [Name, 7-digit, Barcode?]
      else if (/^\d{5,8}$/.test(col1.replace(/\D/g, '')) && !/^\d+$/.test(col0)) {
        name = col0
        sku = cleanSku(col1)
        if (col2) barcode = cleanBarcode(col2)
      } else {
        sku = cleanSku(col0)
        name = col1
        if (col2) barcode = cleanBarcode(col2)
      }
    }

    // Auto-complete 6-digit SKU from catalogMap
    if (sku.length === 6 && catalogMap) {
      for (let d = 0; d <= 9; d++) {
        const testSku = `${sku}${d}`
        if (catalogMap.has(testSku)) {
          if (!name || isNumericString(name) || name.startsWith('Товар ')) {
            name = catalogMap.get(testSku)!
          }
          sku = testSku
          break
        }
      }
    }

    if (!name && sku && catalogMap && catalogMap.has(sku)) {
      name = catalogMap.get(sku)!
    }

    if (sku || name) {
      results.push({
        sku: sku || cleanSku(String(Math.floor(1000000 + Math.random() * 9000000))),
        name: name || `Товар ${sku}`,
        barcode: barcode || '',
      })
    }
  }

  return results
}

export interface Account299ClipboardRow {
  sku: string
  name: string
}

/**
 * Smart parser for Account 299 items from clipboard.
 * Supports pasting purely a column of SKUs / LKs, or SKU + Name.
 * If name is absent, auto-binds name from catalogMap if found.
 */
export function parseAccount299Clipboard(
  text: string,
  focusedField: 'sku' | 'name' = 'sku',
  catalogMap?: Map<string, string>
): Account299ClipboardRow[] {
  const grid = getClipboardGrid(text)
  if (grid.length === 0) return []

  let startIndex = 0
  if (grid.length > 0) {
    const firstRowStr = grid[0].join(' ').toLowerCase()
    if (
      firstRowStr.includes('артикул') ||
      firstRowStr.includes('наименов') ||
      firstRowStr.includes('назван') ||
      firstRowStr.includes('лк') ||
      firstRowStr.includes('sku') ||
      firstRowStr.includes('name') ||
      firstRowStr.includes('код')
    ) {
      startIndex = 1
    }
  }

  const results: Account299ClipboardRow[] = []

  for (let i = startIndex; i < grid.length; i++) {
    const row = grid[i]
    if (!row || row.length === 0 || (row.length === 1 && !row[0].trim())) continue

    let sku = ''
    let name = ''

    if (row.length === 1) {
      const val = row[0].trim()
      if (focusedField === 'sku') {
        const split = trySplitSingleLine(val)
        if (split) {
          sku = split.sku
          name = split.name
        } else {
          sku = cleanSku(val)
        }
      } else if (focusedField === 'name') {
        name = val
      } else {
        const split = trySplitSingleLine(val)
        if (split) {
          sku = split.sku
          name = split.name
        } else {
          sku = cleanSku(val)
        }
      }
    } else if (row.length >= 2) {
      const col0 = row[0].trim()
      const col1 = row[1].trim()
      const col2 = (row[2] || '').trim()

      const digits0 = col0.replace(/\D/g, '')
      const digits1 = col1.replace(/\D/g, '')
      const digits2 = col2.replace(/\D/g, '')

      // Case 1: [LK_part1 (6 digits), LK_part2 (1-2 digits)] -> combine into 7-digit LK (e.g. 152004 + 8 = 1520048)
      if (digits0.length === 6 && digits1.length === 1) {
        sku = digits0 + digits1
        if (col2 && !isNumericString(col2)) {
          name = col2
        }
      }
      // Case 2: [№ (1-4 digits), LK_part1 (6 digits), LK_part2 (1 digit), Name?]
      else if (/^\d{1,4}$/.test(col0) && digits1.length === 6 && digits2.length === 1) {
        sku = digits1 + digits2
        if (row[3] && !isNumericString(row[3])) {
          name = row[3].trim()
        }
      }
      // Case 3: [№ (1-4 digits), 7-digit SKU, Name?]
      else if (/^\d{1,4}$/.test(col0) && isLikelySku(col1)) {
        sku = cleanSku(col1)
        if (col2 && !isNumericString(col2)) {
          name = col2
        }
      }
      // Case 4: [7-digit SKU, Text Name]
      else if (isLikelySku(col0) && !isNumericString(col1) && col1.length > 1) {
        sku = cleanSku(col0)
        name = col1
      }
      // Case 5: [Text Name, 7-digit SKU]
      else if (!isNumericString(col0) && col0.length > 1 && isLikelySku(col1)) {
        name = col0
        sku = cleanSku(col1)
      }
      // Case 6: [7-digit SKU, Quantity/Extra number] -> take only 7-digit SKU
      else if (digits0.length === 7) {
        sku = digits0
        if (col2 && !isNumericString(col2)) {
          name = col2
        }
      }
      // Fallback
      else {
        sku = cleanSku(col0)
        if (!isNumericString(col1)) {
          name = col1
        }
      }
    }

    // Auto-complete 6-digit SKU from catalogMap
    if (sku.length === 6 && catalogMap) {
      for (let d = 0; d <= 9; d++) {
        const testSku = `${sku}${d}`
        if (catalogMap.has(testSku)) {
          if (!name || isNumericString(name) || name === 'Н/Д') {
            name = catalogMap.get(testSku)!
          }
          sku = testSku
          break
        }
      }
    }

    // Auto-bind name from catalogMap if name is empty or pure numeric
    if ((!name || isNumericString(name)) && sku) {
      if (catalogMap && catalogMap.has(sku)) {
        name = catalogMap.get(sku)!
      } else {
        name = 'Н/Д'
      }
    }

    if (sku) {
      results.push({
        sku,
        name: name || 'Н/Д',
      })
    }
  }

  return results
}

/**
 * Извлекает список количеств из буфера обмена (по 1 числу на строку)
 */
export function parseQuantityListFromClipboard(text: string): number[] {
  if (!text || !text.trim()) return []
  const rawLines = text.split(/\r\n|\r|\n/)
  const results: number[] = []

  let startIndex = 0
  if (rawLines.length > 0) {
    const first = rawLines[0].toLowerCase().trim()
    if (first.includes('кол') || first.includes('qty') || first.includes('остат') || first.includes('штук') || first.includes('факт') || first.includes('количество')) {
      startIndex = 1
    }
  }

  for (let i = startIndex; i < rawLines.length; i++) {
    const line = rawLines[i].trim()
    if (!line) continue

    // Если строка разделена табами или точками с запятой
    const parts = line.split(/[\t;]/).map((p) => p.trim())
    let foundQty: number | null = null
    for (const part of parts) {
      const clean = part.replace(/\s/g, '').replace(',', '.')
      if (clean !== '' && !isNaN(Number(clean))) {
        foundQty = parseFloat(clean)
        break
      }
    }

    if (foundQty !== null) {
      results.push(foundQty)
    } else {
      const match = line.match(/-?\d+([.,]\d+)?/)
      if (match) {
        results.push(parseFloat(match[0].replace(',', '.')))
      } else {
        results.push(0)
      }
    }
  }

  return results
}

export interface LocationClipboardEntry {
  sku?: string
  location: string
}

function isExcelError(val: string): boolean {
  if (!val) return false
  const trimmed = val.trim()
  return /^#(N\/A|Н\/Д|ЗНАЧ|VALUE|REF|ССЫЛКА|DIV\/0|ДЕЛ\/0|NUM|ЧИСЛО|NAME\?|ИМЯ\?|NULL|ПУСТО)[!/]?$/i.test(trimmed)
}

/**
 * Извлекает список локаций (с опциональной привязкой к ЛК) из буфера обмена.
 * Автоматически пропускает:
 * - Пустые строки
 * - Служебные строки ошибок формул Excel (#N/A, #Н/Д, #VALUE!, #ССЫЛКА! и т.д.)
 * - Строку заголовков (Локация, Место, ЛК, Артикул и т.д.)
 * Если скопированы 2 колонки (ЛК и Локация), связывает их по артикулу для 100% точного сопоставления.
 */
export function parseLocationEntriesFromClipboard(text: string): LocationClipboardEntry[] {
  if (!text || !text.trim()) return []
  const rawLines = text.split(/\r\n|\r|\n/)
  if (rawLines.length === 0) return []

  let startIndex = 0
  let colSkuIdx = -1
  let colLocIdx = -1

  const isHeaderLocWord = (w: string): boolean => {
    const clean = w.toLowerCase().trim()
    if (!clean || /\d/.test(clean)) return false
    return (
      clean === 'локация' ||
      clean === 'локации' ||
      clean === 'место' ||
      clean === 'места' ||
      clean === 'место хранения' ||
      clean === 'местоположение' ||
      clean === 'location' ||
      clean === 'locations' ||
      clean === 'ячейка' ||
      clean === 'ячейки' ||
      clean === 'адрес' ||
      clean === 'адрес хранения' ||
      clean === 'ряд' ||
      clean === 'стеллаж' ||
      clean === 'зона'
    )
  }

  const isHeaderSkuWord = (w: string): boolean => {
    const clean = w.toLowerCase().trim()
    return clean.includes('лк') || clean.includes('артикул') || clean.includes('sku') || clean.includes('код')
  }

  // Проверяем первую строку на наличие заголовков
  const firstLine = rawLines[0].trim()
  const firstParts = firstLine.split(/[\t;]/).map((p) => p.trim())
  const hasLocHeader = firstParts.some((p) => isHeaderLocWord(p))
  const hasSkuHeader = firstParts.some((p) => isHeaderSkuWord(p))

  if (hasLocHeader || hasSkuHeader) {
    startIndex = 1
    colLocIdx = firstParts.findIndex((p) => isHeaderLocWord(p))
    colSkuIdx = firstParts.findIndex((p) => isHeaderSkuWord(p))
  }

  const results: LocationClipboardEntry[] = []

  for (let i = startIndex; i < rawLines.length; i++) {
    const raw = rawLines[i]
    const trimmed = raw.trim()
    if (!trimmed) continue
    if (isExcelError(trimmed)) continue

    if (raw.includes('\t') || raw.includes(';')) {
      const parts = raw.split(/[\t;]/).map((p) => p.trim())

      if (colLocIdx !== -1 && colLocIdx < parts.length) {
        const loc = parts[colLocIdx]
        if (!loc || isExcelError(loc)) continue
        let sku: string | undefined
        if (colSkuIdx !== -1 && colSkuIdx < parts.length && !isExcelError(parts[colSkuIdx])) {
          const rawSku = cleanSku(parts[colSkuIdx])
          if (/^\d{5,8}$/.test(rawSku)) sku = rawSku
        }
        results.push({ sku, location: loc })
      } else if (parts.length >= 2) {
        const p0 = parts[0]
        const p1 = parts[1]
        const clean0 = cleanSku(p0)
        const clean1 = cleanSku(p1)

        // Case 1: p0 - SKU, p1 - Location
        if (/^\d{5,8}$/.test(clean0) && !isExcelError(p1) && p1) {
          results.push({ sku: clean0, location: p1 })
        }
        // Case 2: p0 - Location, p1 - SKU
        else if (/^\d{5,8}$/.test(clean1) && !isExcelError(p0) && p0) {
          results.push({ sku: clean1, location: p0 })
        }
        // Case 3: p0 is #N/A (or similar), check p1
        else if (isExcelError(p0) && !isExcelError(p1) && p1) {
          results.push({ location: p1 })
        }
        // Case 4: Take first valid non-error part
        else {
          const validPart = parts.find((p) => p && !isExcelError(p))
          if (validPart) {
            results.push({ location: validPart })
          }
        }
      } else {
        const loc = parts[0]
        if (loc && !isExcelError(loc)) {
          results.push({ location: loc })
        }
      }
    } else {
      if (!isExcelError(trimmed)) {
        results.push({ location: trimmed })
      }
    }
  }

  return results
}

/**
 * Извлекает одномерный список локаций из буфера обмена (пропуская пустые строки и ошибки #N/A)
 */
export function parseLocationListFromClipboard(text: string): string[] {
  return parseLocationEntriesFromClipboard(text).map((e) => e.location)
}

export interface BoxNumberClipboardEntry {
  sku?: string
  boxNumber: string
}

/**
 * Извлекает список номеров коробок (с опциональной привязкой к ЛК) из буфера обмена.
 */
export function parseBoxNumberEntriesFromClipboard(text: string): BoxNumberClipboardEntry[] {
  if (!text || !text.trim()) return []
  const rawLines = text.split(/\r\n|\r|\n/)
  if (rawLines.length === 0) return []

  let startIndex = 0
  let colSkuIdx = -1
  let colBoxIdx = -1

  const isHeaderBoxWord = (w: string): boolean => {
    const clean = w.toLowerCase().trim()
    if (!clean) return false
    return (
      clean.includes('коробк') ||
      clean.includes('box') ||
      clean.includes('ящик') ||
      clean.includes('тара') ||
      clean === '№' ||
      clean === 'номер' ||
      clean === 'номер коробки' ||
      clean === '№ коробки'
    )
  }

  const isHeaderSkuWord = (w: string): boolean => {
    const clean = w.toLowerCase().trim()
    return clean.includes('лк') || clean.includes('артикул') || clean.includes('sku') || clean.includes('код')
  }

  const firstLine = rawLines[0].trim()
  const firstParts = firstLine.split(/[\t;]/).map((p) => p.trim())
  const hasBoxHeader = firstParts.some((p) => isHeaderBoxWord(p))
  const hasSkuHeader = firstParts.some((p) => isHeaderSkuWord(p))

  if (hasBoxHeader || hasSkuHeader) {
    startIndex = 1
    colBoxIdx = firstParts.findIndex((p) => isHeaderBoxWord(p))
    colSkuIdx = firstParts.findIndex((p) => isHeaderSkuWord(p))
  }

  const results: BoxNumberClipboardEntry[] = []

  for (let i = startIndex; i < rawLines.length; i++) {
    const raw = rawLines[i]
    const trimmed = raw.trim()
    if (!trimmed) continue
    if (isExcelError(trimmed)) continue

    if (raw.includes('\t') || raw.includes(';')) {
      const parts = raw.split(/[\t;]/).map((p) => p.trim())

      if (colBoxIdx !== -1 && colBoxIdx < parts.length) {
        const box = parts[colBoxIdx]
        if (!box || isExcelError(box)) continue
        let sku: string | undefined
        if (colSkuIdx !== -1 && colSkuIdx < parts.length && !isExcelError(parts[colSkuIdx])) {
          const rawSku = cleanSku(parts[colSkuIdx])
          if (/^\d{5,8}$/.test(rawSku)) sku = rawSku
        }
        results.push({ sku, boxNumber: box })
      } else if (parts.length >= 2) {
        const p0 = parts[0]
        const p1 = parts[1]
        const clean0 = cleanSku(p0)
        const clean1 = cleanSku(p1)

        // Case 1: p0 - SKU, p1 - Box
        if (/^\d{5,8}$/.test(clean0) && !isExcelError(p1) && p1) {
          results.push({ sku: clean0, boxNumber: p1 })
        }
        // Case 2: p0 - Box, p1 - SKU
        else if (/^\d{5,8}$/.test(clean1) && !isExcelError(p0) && p0) {
          results.push({ sku: clean1, boxNumber: p0 })
        }
        // Case 3: p0 is error, take p1
        else if (isExcelError(p0) && !isExcelError(p1) && p1) {
          results.push({ boxNumber: p1 })
        }
        // Case 4: first non-error part
        else {
          const validPart = parts.find((p) => p && !isExcelError(p))
          if (validPart) {
            results.push({ boxNumber: validPart })
          }
        }
      } else {
        const box = parts[0]
        if (box && !isExcelError(box)) {
          results.push({ boxNumber: box })
        }
      }
    } else {
      if (!isExcelError(trimmed)) {
        results.push({ boxNumber: trimmed })
      }
    }
  }

  return results
}


