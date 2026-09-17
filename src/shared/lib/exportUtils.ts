import * as XLSX from 'xlsx'

export interface FactExportRow {
  index: number
  sku: string
  name: string
  mentions: number
  location: string
  quantity: number
  boxNumber?: string
  unit: string
  multiplicity?: number
  auditQuantity: number | string
  discrepancy: string
  status?: string
}

/**
 * Trigger download of a Blob in the browser (fallback)
 */
export function downloadFile(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

/**
 * Save binary data with native Windows SaveFileDialog in Tauri, or browser fallback
 */
async function saveFileData(filename: string, uint8Data: Uint8Array): Promise<string | null> {
  if (typeof window !== 'undefined' && ('__TAURI_INTERNALS__' in window || '__TAURI__' in window)) {
    try {
      const { invoke } = await import('@tauri-apps/api/core')
      const savedPath = await invoke<string>('save_file', {
        defaultFilename: filename,
        data: Array.from(uint8Data),
      })
      return savedPath
    } catch (err: any) {
      if (String(err) === 'CANCELLED') {
        return null
      }
      console.warn('Tauri save_file failed, falling back to browser download:', err)
    }
  }

  // Fallback for regular web browser
  const blob = new Blob([uint8Data.buffer as ArrayBuffer], {
    type: filename.endsWith('.xlsx')
      ? 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
      : 'text/csv;charset=utf-8;',
  })
  downloadFile(blob, filename)
  return filename
}

/**
 * Open folder containing file in Windows Explorer
 */
export async function showInFolder(filePath: string) {
  if (typeof window !== 'undefined' && ('__TAURI_INTERNALS__' in window || '__TAURI__' in window)) {
    try {
      const { invoke } = await import('@tauri-apps/api/core')
      await invoke('show_in_folder', { path: filePath })
    } catch (err) {
      console.error('show_in_folder error:', err)
    }
  }
}

/**
 * Export Fact data to Excel (.xlsx)
 */
export async function exportFactToExcel(rows: FactExportRow[], filename = 'Ревизия_Факт.xlsx'): Promise<string | null> {
  const data = rows.map((r) => ({
    '№': r.index,
    'Артикул': r.sku,
    'Наименование': r.name,
    'Упоминания': r.mentions,
    'Локация': r.location || '—',
    'Количество': r.quantity,
    '№ коробки': r.boxNumber || '—',
    'Ед. изм.': r.unit || 'шт.',
    'Кратность': r.multiplicity ?? 1,
    'Остаток аудит': typeof r.auditQuantity === 'number' ? r.auditQuantity : (r.auditQuantity || '—'),
    'Расхождения': r.discrepancy,
  }))

  const worksheet = XLSX.utils.json_to_sheet(data)

  // Set column widths
  worksheet['!cols'] = [
    { wch: 6 },  // №
    { wch: 14 }, // Артикул
    { wch: 45 }, // Наименование
    { wch: 14 }, // Упоминания
    { wch: 20 }, // Локация
    { wch: 14 }, // Количество
    { wch: 14 }, // № коробки
    { wch: 10 }, // Ед. изм.
    { wch: 12 }, // Кратность
    { wch: 16 }, // Остаток аудит
    { wch: 16 }, // Расхождения
  ]

  const workbook = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(workbook, worksheet, 'Фактическая ревизия')

  const excelBuffer = XLSX.write(workbook, { bookType: 'xlsx', type: 'array' })
  const finalFilename = filename.endsWith('.xlsx') ? filename : `${filename}.xlsx`
  return await saveFileData(finalFilename, new Uint8Array(excelBuffer))
}

/**
 * Export Fact data to CSV (.csv with UTF-8 BOM for 1C/Excel compatibility)
 */
export async function exportFactToCsv(
  rows: FactExportRow[],
  filename = 'Ревизия_Факт.csv',
  delimiter = ';'
): Promise<string | null> {
  const headers = [
    '№',
    'Артикул',
    'Наименование',
    'Упоминания',
    'Локация',
    'Количество',
    '№ коробки',
    'Ед. изм.',
    'Кратность',
    'Остаток аудит',
    'Расхождения',
  ]

  const escapeCsv = (val: string | number | null | undefined): string => {
    if (val === null || val === undefined) return ''
    const str = String(val)
    if (str.includes(delimiter) || str.includes('"') || str.includes('\n') || str.includes('\r')) {
      return `"${str.replace(/"/g, '""')}"`
    }
    return str
  }

  const lines: string[] = []
  lines.push(headers.map(escapeCsv).join(delimiter))

  for (const r of rows) {
    const rowValues = [
      r.index,
      r.sku,
      r.name,
      r.mentions,
      r.location || '—',
      r.quantity,
      r.boxNumber || '—',
      r.unit || 'шт.',
      r.multiplicity ?? 1,
      typeof r.auditQuantity === 'number' ? r.auditQuantity : (r.auditQuantity || '—'),
      r.discrepancy,
    ]
    lines.push(rowValues.map(escapeCsv).join(delimiter))
  }

  // UTF-8 BOM (\uFEFF)
  const csvContent = '\uFEFF' + lines.join('\r\n')
  const encoder = new TextEncoder()
  const bytes = encoder.encode(csvContent)
  const finalFilename = filename.endsWith('.csv') ? filename : `${filename}.csv`
  return await saveFileData(finalFilename, bytes)
}
