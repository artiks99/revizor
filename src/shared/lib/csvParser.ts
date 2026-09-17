/**
 * CSV Parser Utility for Store Catalog and Store Stock
 */

import { parseFactClipboard, type FactClipboardRow } from './clipboardParser'

export interface ParsedCatalogRow {
  sku: string
  name: string
  barcode?: string
}

export interface ParsedStockRow {
  sku: string
  name: string
  quantity: number
}

export interface ParsedFactRow {
  sku: string
  name: string
  quantity: number
  unit: string
  location: string
}

/**
 * Читает File с автоопределением кодировки (UTF-8 или Windows-1251)
 */
export async function readCsvFileAsText(file: File): Promise<string> {
  const buffer = await file.arrayBuffer()
  const bytes = new Uint8Array(buffer)

  // Попытка декодировать в UTF-8
  try {
    const utf8Decoder = new TextDecoder('utf-8', { fatal: true })
    return utf8Decoder.decode(bytes)
  } catch {
    // Если UTF-8 не прошел (например, файл из 1C/Excel в Windows-1251)
    try {
      const winDecoder = new TextDecoder('windows-1251', { fatal: false })
      return winDecoder.decode(bytes)
    } catch {
      // Fallback
      return new TextDecoder().decode(bytes)
    }
  }
}

/**
 * Определяет разделитель CSV по первой строке
 */
function detectDelimiter(firstLine: string): string {
  // Tab is checked first — it's the standard clipboard delimiter for Excel/1C.
  // When counts are equal, tab wins over comma/semicolon to avoid splitting
  // on commas inside product names (e.g. "Нап 7ап 0,25л ж/б").
  const delimiters = ['\t', ';', ',', '|']
  let bestDelimiter = '\t'
  let maxCount = -1

  for (const d of delimiters) {
    const count = firstLine.split(d).length - 1
    if (count > maxCount) {
      maxCount = count
      bestDelimiter = d
    }
  }

  // If tab is present at all, prefer it even if another delimiter has
  // the same count — tabs are never part of cell content.
  if (maxCount > 0) {
    const tabCount = firstLine.split('\t').length - 1
    if (tabCount > 0 && tabCount === maxCount) {
      return '\t'
    }
  }

  return bestDelimiter
}

/**
 * Разбивает CSV-строку на ячейки с учетом кавычек
 */
function parseCsvLine(line: string, delimiter: string): string[] {
  // Быстрый путь: если в строке нет кавычек, стандартный split работает в десятки раз быстрее
  if (!line.includes('"')) {
    const parts = line.split(delimiter)
    for (let i = 0; i < parts.length; i++) {
      parts[i] = parts[i].trim()
    }
    return parts
  }

  const result: string[] = []
  let current = ''
  let inQuotes = false

  for (let i = 0; i < line.length; i++) {
    const char = line[i]

    if (char === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"'
        i++
      } else {
        inQuotes = !inQuotes
      }
    } else if (char === delimiter && !inQuotes) {
      result.push(current.trim())
      current = ''
    } else {
      current += char
    }
  }
  result.push(current.trim())
  return result
}

/**
 * Парсит строки CSV
 */
export function parseRawCsv(content: string): string[][] {
  if (!content || !content.trim()) return []

  const rawLines = content.split(/\r\n|\r|\n/)
  const lines: string[] = []
  for (let i = 0; i < rawLines.length; i++) {
    const trimmed = rawLines[i].trim()
    if (trimmed.length > 0) {
      lines.push(trimmed)
    }
  }

  if (lines.length === 0) return []

  const delimiter = detectDelimiter(lines[0])
  const result: string[][] = new Array(lines.length)
  for (let i = 0; i < lines.length; i++) {
    result[i] = parseCsvLine(lines[i], delimiter)
  }
  return result
}

/**
 * Нормализация артикула/ЛК: убираем пробелы, берем цифры или очищенную строку
 */
export function cleanSku(val: string): string {
  if (!val) return ''
  const trimmed = val.trim()
  const digitsOnly = trimmed.replace(/\D/g, '')
  if (digitsOnly.length >= 6 && digitsOnly.length <= 8) {
    return digitsOnly.slice(0, 7)
  }
  return trimmed
}

/**
 * Очистка штрихкода (удаление кавычек, лишних пробелов и суффиксов чисел с плавающей точкой)
 */
export function cleanBarcode(val: string): string {
  if (!val) return ''
  let cleaned = val.replace(/^["']|["']$/g, '').trim()
  if (/^\d+\.0$/.test(cleaned)) {
    cleaned = cleaned.slice(0, -2)
  }
  return cleaned
}

/**
 * Парсит CSV каталога товаров магазина (ячейка A: ЛК, ячейка B: Название, ячейка C: Штрихкод)
 */
export function parseCatalogCsv(content: string, catalogMap?: Map<string, string>): ParsedCatalogRow[] {
  const rows = parseRawCsv(content)
  if (rows.length === 0) return []

  let skuIndex = -1
  let nameIndex = -1
  let barcodeIndex = -1
  let startIndex = 0

  // Проверяем наличие заголовка
  const header = rows[0].map((h) => h.toLowerCase().trim())
  const hasHeader = header.some(
    (col) =>
      col.includes('лк') ||
      col.includes('артикул') ||
      col.includes('назван') ||
      col.includes('наименов') ||
      col.includes('sku') ||
      col.includes('name') ||
      col.includes('товар') ||
      col.includes('штрих') ||
      col.includes('barcode') ||
      col.includes('шк') ||
      col.includes('код')
  )

  if (hasHeader) {
    startIndex = 1
    const foundBarcode = header.findIndex(
      (h) =>
        h.includes('штрих') ||
        h.includes('barcode') ||
        h.includes('шк') ||
        h.includes('ean') ||
        h.includes('баркод')
    )

    // Приоритет колонок артикула / ЛК: исключаем 'штрихкод'
    let foundSku = header.findIndex(
      (h) =>
        h === 'артикул' ||
        h.startsWith('артикул') ||
        h.includes('артикул') ||
        h === 'лк' ||
        h.startsWith('лк') ||
        h.includes('лк') ||
        h.includes('sku')
    )
    if (foundSku === -1) {
      foundSku = header.findIndex(
        (h) => (h.includes('код') || h.includes('code')) && !h.includes('штрих') && !h.includes('шк') && !h.includes('ean')
      )
    }

    const foundName = header.findIndex(
      (h) => h.includes('назван') || h.includes('наименов') || h.includes('name') || h.includes('товар')
    )

    if (foundSku !== -1) skuIndex = foundSku
    if (foundName !== -1) nameIndex = foundName
    if (foundBarcode !== -1) barcodeIndex = foundBarcode

    // Fallbacks
    if (skuIndex === -1) {
      skuIndex = barcodeIndex === 0 ? 2 : 0
      if (skuIndex >= header.length) skuIndex = 0
    }
    if (nameIndex === -1) {
      nameIndex = 1 < header.length && skuIndex !== 1 && barcodeIndex !== 1 ? 1 : 0
    }
    if (barcodeIndex === -1 && header.length > 2 && skuIndex !== 2 && nameIndex !== 2) {
      barcodeIndex = 2
    }
  } else {
    // Без заголовка: A: ЛК, B: Название, C: Штрихкод (или A: ШК, B: Название, C: ЛК)
    if (rows[0].length >= 3) {
      const col0IsSku = /^\d{5,8}$/.test((rows[0][0] || '').trim())
      const col2IsSku = /^\d{5,8}$/.test((rows[0][2] || '').trim())
      if (!col0IsSku && col2IsSku) {
        barcodeIndex = 0
        nameIndex = 1
        skuIndex = 2
      } else {
        skuIndex = 0
        nameIndex = 1
        barcodeIndex = 2
      }
    } else if (rows[0].length === 2) {
      skuIndex = 0
      nameIndex = 1
    } else {
      skuIndex = 0
    }
  }

  // Агрегируем строки по SKU, собирая уникальные реальные штрихкоды
  const productMap = new Map<string, { sku: string; name: string; barcodes: Set<string> }>()
  const orderedSkus: string[] = []

  for (let i = startIndex; i < rows.length; i++) {
    const row = rows[i]
    if (row.length === 0 || (row.length === 1 && !row[0].trim())) continue

    let sku = skuIndex !== -1 && row[skuIndex] ? cleanSku(row[skuIndex]) : ''
    let name = nameIndex !== -1 && row[nameIndex] ? (row[nameIndex] || '').replace(/^["']|["']$/g, '').trim() : ''
    let barcode = barcodeIndex !== -1 && row[barcodeIndex] ? cleanBarcode(row[barcodeIndex]) : ''

    // Если нет отдельного SKU, но есть barcode
    if (!sku && barcode) {
      if (/^\d{5,8}$/.test(barcode)) {
        sku = cleanSku(barcode)
        barcode = ''
      }
    }

    if (sku.length === 6 && catalogMap) {
      for (let d = 0; d <= 9; d++) {
        const testSku = `${sku}${d}`
        if (catalogMap.has(testSku)) {
          if (!name) name = catalogMap.get(testSku)!
          sku = testSku
          break
        }
      }
    }

    if (sku && !name && catalogMap && catalogMap.has(sku)) {
      name = catalogMap.get(sku)!
    }

    if (!sku) continue

    if (!productMap.has(sku)) {
      productMap.set(sku, {
        sku,
        name: name || `Товар ${sku}`,
        barcodes: new Set<string>(),
      })
      orderedSkus.push(sku)
    }

    const prod = productMap.get(sku)!
    if (name && (!prod.name || prod.name.startsWith('Товар '))) {
      prod.name = name
    }

    // Добавляем штрихкод, если он не совпадает с самим артикулом (ЛК)
    if (barcode && barcode !== sku && !prod.barcodes.has(barcode)) {
      prod.barcodes.add(barcode)
    }
  }

  const items: ParsedCatalogRow[] = []
  for (const s of orderedSkus) {
    const prod = productMap.get(s)!
    // Приоритизируем EAN-13 (13 цифр), затем EAN-8 (8 цифр), затем прочие
    const sortedBcs = Array.from(prod.barcodes).sort((a, b) => {
      const aRank = a.length === 13 ? 0 : a.length === 8 ? 1 : 2
      const bRank = b.length === 13 ? 0 : b.length === 8 ? 1 : 2
      return aRank - bRank
    })

    items.push({
      sku: prod.sku,
      name: prod.name,
      barcode: sortedBcs.join(', '),
    })
  }

  return items
}

/**
 * Парсит CSV системных остатков (ЛК, Название, Количество)
 */
export function parseStockCsv(content: string, catalogMap?: Map<string, string>): ParsedStockRow[] {
  const rows = parseRawCsv(content)
  if (rows.length === 0) return []

  let skuIndex = -1
  let nameIndex = -1
  let qtyIndex = -1
  let startIndex = 0

  // Проверяем наличие заголовка
  const header = rows[0].map((h) => h.toLowerCase())
  const hasHeader = header.some(
    (col) =>
      col.includes('лк') ||
      col.includes('артикул') ||
      col.includes('назван') ||
      col.includes('наименов') ||
      col.includes('кол') ||
      col.includes('остат') ||
      col.includes('qty') ||
      col.includes('quantity') ||
      col.includes('sku') ||
      col.includes('код')
  )

  if (hasHeader) {
    startIndex = 1
    skuIndex = header.findIndex(
      (h) => h.includes('лк') || h.includes('артикул') || h.includes('sku') || h.includes('код')
    )
    nameIndex = header.findIndex(
      (h) => h.includes('назван') || h.includes('наименов') || h.includes('name') || h.includes('товар')
    )
    qtyIndex = header.findIndex(
      (h) => h.includes('кол') || h.includes('остат') || h.includes('qty') || h.includes('quantity') || h.includes('к-во')
    )
  }

  const items: ParsedStockRow[] = []

  for (let i = startIndex; i < rows.length; i++) {
    const row = rows[i]
    if (row.length === 0 || (row.length === 1 && !row[0].trim())) continue

    let sku = ''
    let name = ''
    let quantity = 0

    if (skuIndex !== -1 || qtyIndex !== -1 || nameIndex !== -1) {
      if (skuIndex !== -1) sku = cleanSku(row[skuIndex] || '')
      if (nameIndex !== -1) name = (row[nameIndex] || '').replace(/^["']|["']$/g, '').trim()
      if (qtyIndex !== -1) {
        const qtyStr = (row[qtyIndex] || '0').replace(/\s/g, '').replace(',', '.')
        quantity = parseFloat(qtyStr) || 0
      }
    } else if (row.length === 2) {
      const col0 = (row[0] || '').trim()
      const col1 = (row[1] || '').trim()
      const d0 = col0.replace(/\D/g, '')
      const d1 = col1.replace(/\D/g, '')

      if (d0.length === 6 && d1.length === 1) {
        sku = d0 + d1
      } else {
        const isNum1 = col1 !== '' && !isNaN(Number(col1.replace(',', '.')))
        if (isNum1) {
          sku = cleanSku(col0)
          quantity = parseFloat(col1.replace(',', '.')) || 0
        } else {
          sku = cleanSku(col0)
          name = col1.replace(/^["']|["']$/g, '').trim()
        }
      }
    } else if (row.length >= 3) {
      const col0 = (row[0] || '').trim()
      const col1 = (row[1] || '').trim()
      const d0 = col0.replace(/\D/g, '')
      const d1 = col1.replace(/\D/g, '')

      if (d0.length === 6 && d1.length === 1) {
        sku = d0 + d1
        name = (row[2] || '').replace(/^["']|["']$/g, '').trim()
        if (row[3]) {
          const qtyStr = (row[3] || '0').replace(/\s/g, '').replace(',', '.')
          quantity = parseFloat(qtyStr) || 0
        }
      } else {
        sku = cleanSku(row[0] || '')
        name = (row[1] || '').replace(/^["']|["']$/g, '').trim()
        const qtyStr = (row[2] || '0').replace(/\s/g, '').replace(',', '.')
        quantity = parseFloat(qtyStr) || 0
      }
    }

    if (sku.length === 6 && catalogMap) {
      for (let d = 0; d <= 9; d++) {
        const testSku = `${sku}${d}`
        if (catalogMap.has(testSku)) {
          if (!name) name = catalogMap.get(testSku)!
          sku = testSku
          break
        }
      }
    }

    if (!name && sku && catalogMap && catalogMap.has(sku)) {
      name = catalogMap.get(sku)!
    }

    if (sku) {
      items.push({
        sku,
        name: name || `Товар ${sku}`,
        quantity,
      })
    }
  }

  return items
}

export interface ParsedAccount299Row {
  sku: string
  name: string
}

/**
 * Парсит CSV счета 299 (ЛК, [Название])
 */
export function parseAccount299Csv(content: string, catalogMap?: Map<string, string>): ParsedAccount299Row[] {
  const rows = parseRawCsv(content)
  if (rows.length === 0) return []

  let skuIndex = -1
  let nameIndex = -1
  let startIndex = 0

  const header = rows[0].map((h) => h.toLowerCase())
  const hasHeader = header.some(
    (col) =>
      col.includes('лк') ||
      col.includes('артикул') ||
      col.includes('назван') ||
      col.includes('наименов') ||
      col.includes('sku') ||
      col.includes('name') ||
      col.includes('код')
  )

  if (hasHeader) {
    startIndex = 1
    const foundSku = header.findIndex(
      (h) => h.includes('лк') || h.includes('артикул') || h.includes('sku') || h.includes('код')
    )
    const foundName = header.findIndex(
      (h) => h.includes('назван') || h.includes('наименов') || h.includes('name') || h.includes('товар')
    )
    if (foundSku !== -1) skuIndex = foundSku
    if (foundName !== -1) nameIndex = foundName
  }

  const items: ParsedAccount299Row[] = []

  for (let i = startIndex; i < rows.length; i++) {
    const row = rows[i]
    if (row.length === 0 || (row.length === 1 && !row[0].trim())) continue

    let sku = ''
    let name = ''

    if (skuIndex !== -1 || nameIndex !== -1) {
      if (skuIndex !== -1) sku = cleanSku(row[skuIndex] || '')
      if (nameIndex !== -1) name = (row[nameIndex] || '').replace(/^["']|["']$/g, '').trim()
    } else if (row.length === 1) {
      sku = cleanSku(row[0] || '')
    } else if (row.length >= 2) {
      const col0 = (row[0] || '').trim()
      const col1 = (row[1] || '').trim()
      const d0 = col0.replace(/\D/g, '')
      const d1 = col1.replace(/\D/g, '')

      if (d0.length === 6 && (d1.length === 1 || d1.length === 2)) {
        sku = d0 + d1
        if (row[2]) name = (row[2] || '').replace(/^["']|["']$/g, '').trim()
      } else if (/^\d{1,4}$/.test(col0) && d1.length === 6 && (row[2] || '').replace(/\D/g, '').length === 1) {
        sku = d1 + (row[2] || '').replace(/\D/g, '')
        if (row[3]) name = (row[3] || '').replace(/^["']|["']$/g, '').trim()
      } else {
        sku = cleanSku(col0)
        name = col1.replace(/^["']|["']$/g, '').trim()
      }
    }

    if (sku.length === 6 && catalogMap) {
      for (let d = 0; d <= 9; d++) {
        const testSku = `${sku}${d}`
        if (catalogMap.has(testSku)) {
          if (!name || /^\d+$/.test(name.trim())) {
            name = catalogMap.get(testSku)!
          }
          sku = testSku
          break
        }
      }
    }

    if ((!name || /^\d+$/.test(name.trim())) && sku && catalogMap) {
      if (catalogMap.has(sku)) {
        name = catalogMap.get(sku)!
      }
    }

    if (sku) {
      items.push({
        sku,
        name: (!name || /^\d+$/.test(name.trim())) ? `Товар ${sku}` : name,
      })
    }
  }

  return items
}

/**
 * Экспорт позиций счета 299 в формат CSV (с разделителем ;)
 */
export function exportAccount299Csv(items: { sku: string; name: string }[]): string {
  const header = 'ЛК;Наименование'
  const lines = items.map((item) => {
    const cleanName = (item.name || '').replace(/;/g, ',').replace(/"/g, '""')
    return `${item.sku};"${cleanName}"`
  })
  return [header, ...lines].join('\r\n')
}

/**
 * Парсит CSV фактической ревизии (ЛК, [Название], [Количество], [Локация])
 */
export function parseFactCsv(content: string, catalogMap?: Map<string, string>): ParsedFactRow[] {
  return parseFactClipboard(content, 'sku', catalogMap)
}

/**
 * Экспорт позиций фактической ревизии в формат CSV
 */
export function exportFactCsv(items: { sku: string; name: string; quantity: number; unit?: string; location?: string }[]): string {
  const header = 'ЛК;Наименование;Количество;Ед;Локация'
  const lines = items.map((item) => {
    const cleanName = (item.name || '').replace(/;/g, ',').replace(/"/g, '""')
    const cleanLoc = (item.location || '').replace(/;/g, ',').replace(/"/g, '""')
    return `${item.sku};"${cleanName}";${item.quantity};"${item.unit || 'шт.'}";"${cleanLoc}"`
  })
  return [header, ...lines].join('\r\n')
}

