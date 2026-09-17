/**
 * Утилиты форматирования дат для ревизий и инвентаризации
 */

export function parseUtcDate(dateStr?: string | null): Date | null {
  if (!dateStr) return null
  const cleaned = dateStr.trim()
  if (!cleaned) return null
  
  // Если строка формата SQLite "YYYY-MM-DD HH:MM:SS"
  const isoStr = cleaned.includes('T') ? cleaned : cleaned.replace(' ', 'T')
  const withZone = isoStr.endsWith('Z') || isoStr.includes('+') ? isoStr : isoStr + 'Z'
  const date = new Date(withZone)
  
  if (isNaN(date.getTime())) {
    const fallbackDate = new Date(cleaned)
    return isNaN(fallbackDate.getTime()) ? null : fallbackDate
  }
  return date
}

export function formatDateTime(dateStr?: string | null): string {
  const date = parseUtcDate(dateStr)
  if (!date) return ''
  
  return new Intl.DateTimeFormat('ru-RU', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date)
}

export function formatDateShort(dateStr?: string | null): string {
  const date = parseUtcDate(dateStr)
  if (!date) return ''
  
  return new Intl.DateTimeFormat('ru-RU', {
    day: '2-digit',
    month: '2-digit',
    year: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date)
}

/** Форматирование только даты ДД.ММ.ГГГГ */
export function formatDateOnly(dateStr?: string | null): string {
  if (!dateStr) return ''
  // Если формат YYYY-MM-DD
  if (/^\d{4}-\d{2}-\d{2}$/.test(dateStr.trim())) {
    const [y, m, d] = dateStr.trim().split('-')
    return `${d}.${m}.${y}`
  }
  const date = parseUtcDate(dateStr)
  if (!date) return dateStr || ''
  
  return new Intl.DateTimeFormat('ru-RU', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).format(date)
}

/** Форматирование диапазона дат проведения ревизии */
export function formatDateRange(startStr?: string | null, endStr?: string | null): string {
  if (!startStr && !endStr) return ''
  const start = formatDateOnly(startStr)
  const end = formatDateOnly(endStr)
  if (start && end) {
    if (start === end) return start
    return `${start} – ${end}`
  }
  return start || end || ''
}

/** Получить сегодняшнюю дату в формате YYYY-MM-DD (локальное время) */
export function getTodayIsoDate(): string {
  const now = new Date()
  const year = now.getFullYear()
  const month = String(now.getMonth() + 1).padStart(2, '0')
  const day = String(now.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

