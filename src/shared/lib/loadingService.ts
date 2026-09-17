import { ref, readonly } from 'vue'

export interface LoadingOptions {
  /** Заголовок операции (например: "Вставка товаров", "Загрузка ревизии") */
  title: string
  /** Подробное сообщение или текущий этап (например: "Обработка позиций...") */
  message?: string
  /** Дополнительное описание (например: "Данные сохраняются в базу данных...") */
  details?: string
  /** Контекстная иконка/эмодзи: 📥, 📦, 📊, 🏷️, 🔄, 🕒, 🗑️, 📤, ⚙️, 📐 */
  icon?: string
  /** Прогресс от 0 до 100 (если заданы current и total, вычисляется автоматически) */
  progress?: number | null
  /** Текущее количество обработанных элементов (например: 1200) */
  current?: number
  /** Общее количество элементов (например: 17393) */
  total?: number
  /** Единица измерения (например: "поз.", "строк", "файлов", "товаров") — по умолчанию "поз." */
  unit?: string
  /** Что именно сейчас обрабатывается (например: "Артикул 1039482", "Лист 1", "Пакет 4/18") */
  currentItem?: string
  /** Текущий этап/фаза (например: "Этап 1: Чтение буфера", "Запись в базу данных") */
  stage?: string
  /** Текст пакета/чанка (например: "Пакет 14 из 495") */
  chunkText?: string
  /** Показывать ли плашку безопасной транзакции */
  showSafeWarning?: boolean
  /** Текст оставшегося времени или ручной текст остатка */
  remainingText?: string
  /** Текст скорости (например: "2 400 поз./сек") */
  speedText?: string
}

export interface InternalLoadingState extends LoadingOptions {
  isActive: boolean
  startTime: number
  elapsedSeconds: number
  elapsedText: string
  remainingCount: number | null
  etaText: string
}

function formatThousands(num: number): string {
  return num.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ' ')
}

function formatElapsed(seconds: number): string {
  if (seconds < 60) {
    return `${seconds.toFixed(1)} сек.`
  }
  const mins = Math.floor(seconds / 60)
  const secs = Math.floor(seconds % 60)
  return `${mins} мин. ${secs < 10 ? '0' : ''}${secs} сек.`
}

let timerInterval: ReturnType<typeof setInterval> | null = null

function startTimer() {
  stopTimer()
  state.value.startTime = Date.now()
  state.value.elapsedSeconds = 0
  state.value.elapsedText = '0.0 сек.'
  timerInterval = setInterval(() => {
    if (!state.value.isActive) {
      stopTimer()
      return
    }
    const sec = (Date.now() - state.value.startTime) / 1000
    state.value.elapsedSeconds = sec
    state.value.elapsedText = formatElapsed(sec)
  }, 100)
}

function stopTimer() {
  if (timerInterval !== null) {
    clearInterval(timerInterval)
    timerInterval = null
  }
}

const state = ref<InternalLoadingState>({
  isActive: false,
  title: 'Загрузка...',
  message: '',
  details: '',
  icon: '⏳',
  progress: null,
  current: undefined,
  total: undefined,
  unit: 'поз.',
  currentItem: '',
  stage: '',
  chunkText: '',
  showSafeWarning: false,
  remainingText: '',
  speedText: '',
  startTime: 0,
  elapsedSeconds: 0,
  elapsedText: '0.0 сек.',
  remainingCount: null,
  etaText: '',
})

function applyProgressCalculations(opts: Partial<LoadingOptions>) {
  const current = opts.current !== undefined ? opts.current : state.value.current
  const total = opts.total !== undefined ? opts.total : state.value.total
  const unit = opts.unit !== undefined ? opts.unit : (state.value.unit || 'поз.')

  if (total !== undefined && total > 0 && current !== undefined) {
    const safeCurrent = Math.max(0, current)
    state.value.progress = Math.min(100, Math.max(0, (safeCurrent / total) * 100))

    const remaining = Math.max(0, total - safeCurrent)
    state.value.remainingCount = remaining

    const elapsedSec = (Date.now() - state.value.startTime) / 1000

    if (elapsedSec > 0.25 && safeCurrent > 0) {
      const rate = safeCurrent / elapsedSec
      state.value.speedText = `${formatThousands(Math.round(rate))} ${unit}/сек`

      if (remaining > 0 && rate > 0) {
        const etaSec = remaining / rate
        if (etaSec < 1) {
          state.value.etaText = '< 1 сек.'
        } else if (etaSec < 60) {
          state.value.etaText = `≈ ${Math.ceil(etaSec)} сек.`
        } else {
          const mins = Math.floor(etaSec / 60)
          const secs = Math.round(etaSec % 60)
          state.value.etaText = `≈ ${mins} мин. ${secs} сек.`
        }
        state.value.remainingText = opts.remainingText || `Осталось: ${formatThousands(remaining)} ${unit} (${state.value.etaText})`
      } else if (remaining === 0) {
        state.value.etaText = ''
        state.value.remainingText = opts.remainingText || 'Завершение сохранения...'
      }
    } else {
      state.value.remainingText = opts.remainingText || `Осталось: ${formatThousands(remaining)} ${unit}`
    }
  } else if (opts.progress !== undefined) {
    state.value.progress = opts.progress
    if (opts.remainingText) {
      state.value.remainingText = opts.remainingText
    }
  }
}

/**
 * Показать полноэкранный загрузочный оверлей с понятным описанием происходящего
 */
export function showLoading(options: LoadingOptions) {
  state.value = {
    isActive: true,
    title: options.title || 'Загрузка...',
    message: options.message || '',
    details: options.details || '',
    icon: options.icon || '⏳',
    progress: options.progress !== undefined ? options.progress : null,
    current: options.current,
    total: options.total,
    unit: options.unit || 'поз.',
    currentItem: options.currentItem || '',
    stage: options.stage || '',
    chunkText: options.chunkText || '',
    showSafeWarning: options.showSafeWarning ?? (options.total !== undefined && options.total >= 500),
    remainingText: options.remainingText || '',
    speedText: options.speedText || '',
    startTime: Date.now(),
    elapsedSeconds: 0,
    elapsedText: '0.0 сек.',
    remainingCount: null,
    etaText: '',
  }

  startTimer()
  applyProgressCalculations(options)
}

/**
 * Обновить параметры текущего оверлея на лету
 */
export function updateLoading(options: Partial<LoadingOptions>) {
  if (!state.value.isActive) return

  if (options.title !== undefined) state.value.title = options.title
  if (options.message !== undefined) state.value.message = options.message
  if (options.details !== undefined) state.value.details = options.details
  if (options.icon !== undefined) state.value.icon = options.icon
  if (options.unit !== undefined) state.value.unit = options.unit
  if (options.currentItem !== undefined) state.value.currentItem = options.currentItem
  if (options.stage !== undefined) state.value.stage = options.stage
  if (options.chunkText !== undefined) state.value.chunkText = options.chunkText
  if (options.showSafeWarning !== undefined) state.value.showSafeWarning = options.showSafeWarning
  if (options.current !== undefined) state.value.current = options.current
  if (options.total !== undefined) state.value.total = options.total

  applyProgressCalculations(options)
}

/**
 * Удобный хелпер для пошагового обновления прогресса
 */
export function setProgressStep(
  current: number,
  total?: number,
  currentItem?: string,
  message?: string
) {
  updateLoading({
    current,
    ...(total !== undefined ? { total } : {}),
    ...(currentItem !== undefined ? { currentItem } : {}),
    ...(message !== undefined ? { message } : {}),
  })
}

/**
 * Скрыть загрузочный оверлей
 */
export function hideLoading() {
  state.value.isActive = false
  stopTimer()
}

export type LoadingTracker = ((options: Partial<LoadingOptions>) => void) & {
  step: (current: number, total?: number, currentItem?: string, message?: string) => void
  setStage: (stage: string) => void
  setChunk: (chunkIndex: number, totalChunks: number, chunkSize?: number) => void
}

/**
 * Удобный хелпер-обёртка для безопасного выполнения асинхронных действий:
 * - открывает оверлей
 * - передаёт функцию update(options) с методом step() для динамического обновления этапов
 * - гарантированно закрывает оверлей в блоке finally
 */
export async function withLoading<T>(
  initialOptions: LoadingOptions,
  task: (tracker: LoadingTracker) => Promise<T>
): Promise<T> {
  showLoading(initialOptions)
  const tracker = ((options: Partial<LoadingOptions>) => {
    updateLoading(options)
  }) as LoadingTracker

  tracker.step = (current: number, total?: number, currentItem?: string, message?: string) => {
    setProgressStep(current, total, currentItem, message)
  }

  tracker.setStage = (stage: string) => {
    updateLoading({ stage })
  }

  tracker.setChunk = (chunkIndex: number, totalChunks: number, chunkSize?: number) => {
    const chunkInfo = chunkSize
      ? `Пакет ${chunkIndex} из ${totalChunks} (${chunkSize} поз./пакет)`
      : `Пакет ${chunkIndex} из ${totalChunks}`
    updateLoading({ chunkText: chunkInfo, currentItem: chunkInfo })
  }

  try {
    return await task(tracker)
  } finally {
    hideLoading()
  }
}

/**
 * Хук для использования состояния загрузки в компонентах
 */
export function useLoading() {
  return {
    loadingState: readonly(state),
    showLoading,
    updateLoading,
    setProgressStep,
    hideLoading,
    withLoading,
  }
}
