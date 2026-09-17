import { eventBus } from './eventBus'

export interface CopyOptions {
  label?: string
  message?: string
  showToast?: boolean
  duration?: number
}

/**
 * Копирует текст в буфер обмена с поддержкой fallback для сред без navigator.clipboard
 * и опциональным вызовом всплывающего уведомления (Toast).
 */
export async function copyToClipboard(
  text: string,
  options: CopyOptions = {}
): Promise<boolean> {
  const { label = 'ЛК', message, showToast = true, duration = 2500 } = options
  const cleanText = text?.trim()

  if (!cleanText) return false

  let success = false

  try {
    if (navigator?.clipboard && typeof navigator.clipboard.writeText === 'function') {
      await navigator.clipboard.writeText(cleanText)
      success = true
    } else {
      const textarea = document.createElement('textarea')
      textarea.value = cleanText
      textarea.style.position = 'fixed'
      textarea.style.left = '-9999px'
      textarea.style.top = '-9999px'
      textarea.style.opacity = '0'
      document.body.appendChild(textarea)
      textarea.focus()
      textarea.select()
      success = document.execCommand('copy')
      document.body.removeChild(textarea)
    }
  } catch (err) {
    console.error('Ошибка копирования в буфер обмена:', err)
    success = false
  }

  if (showToast) {
    if (success) {
      let toastMessage = message
      if (!toastMessage) {
        if (cleanText.includes('\n')) {
          const count = cleanText.split('\n').filter((l) => l.trim()).length
          toastMessage = `${label}: скопировано ${count} позиций в буфер`
        } else {
          toastMessage = `${label} скопирован: ${cleanText}`
        }
      }

      eventBus.emit('app:toast', {
        message: toastMessage,
        type: 'success',
        duration,
      })
    } else {
      eventBus.emit('app:toast', {
        message: `Не удалось скопировать ${label.toLowerCase()}`,
        type: 'error',
        duration,
      })
    }
  }

  return success
}

/**
 * Копирует массив артикулов (ЛК) в буфер обмена в формате столбика (по одному на строку)
 */
export async function copySkusToClipboard(
  skus: string[],
  options: { label?: string; showToast?: boolean; duration?: number } = {}
): Promise<boolean> {
  const cleanSkus = skus.map((s) => s?.trim()).filter(Boolean)
  if (cleanSkus.length === 0) return false

  const text = cleanSkus.join('\r\n')
  const count = cleanSkus.length
  const label = options.label || 'Список ЛК'

  return copyToClipboard(text, {
    label,
    message: `Скопировано ${count} ЛК в буфер обмена`,
    showToast: options.showToast ?? true,
    duration: options.duration ?? 2500,
  })
}

/**
 * Обработчик события copy для таблиц: извлекает только чистые ЛК из выделенного фрагмента.
 */
export function handleTableCopySkus(e: ClipboardEvent, knownSkus?: Set<string> | string[]) {
  const selection = window.getSelection()
  if (!selection || selection.isCollapsed) return

  const selectedText = selection.toString().trim()
  if (!selectedText) return

  const skuSet = knownSkus ? (knownSkus instanceof Set ? knownSkus : new Set(knownSkus)) : null
  const lines = selectedText.split(/\r?\n/)
  const extractedSkus: string[] = []

  for (const line of lines) {
    const trimmed = line.trim()
    if (!trimmed) continue
    if (skuSet) {
      if (skuSet.has(trimmed)) {
        extractedSkus.push(trimmed)
      } else {
        const match = trimmed.match(/\b\d{5,9}\b/)
        if (match && skuSet.has(match[0])) {
          extractedSkus.push(match[0])
        }
      }
    } else {
      const match = trimmed.match(/\b\d{5,9}\b/)
      if (match) {
        extractedSkus.push(match[0])
      }
    }
  }

  if (extractedSkus.length > 0) {
    e.preventDefault()
    e.clipboardData?.setData('text/plain', extractedSkus.join('\r\n'))
  }
}

