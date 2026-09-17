import { defineStore } from 'pinia'
import { ref, computed, watch } from 'vue'
import * as XLSX from 'xlsx'
import type { ThresholdItem, DecisionResult, PercentCalcInputs } from './types'

const STORAGE_KEY = 'revizor_percent_calc_state'

const DEFAULT_INPUTS: PercentCalcInputs = {
  grossRevenue: 37264352,
  vatRate: 16,
  daysCount: 106,
  writeOffAmount: 857326,
  surplusAmount: 221539,
}

export const usePercentCalcStore = defineStore('dashboardPercentCalc', () => {
  // State
  const grossRevenue = ref<number>(DEFAULT_INPUTS.grossRevenue)
  const vatRate = ref<number>(DEFAULT_INPUTS.vatRate)
  const daysCount = ref<number>(DEFAULT_INPUTS.daysCount)
  const writeOffAmount = ref<number>(DEFAULT_INPUTS.writeOffAmount)
  const surplusAmount = ref<number>(DEFAULT_INPUTS.surplusAmount)

  // Load saved state from LocalStorage
  function loadPersistedState() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY)
      if (raw) {
        const parsed = JSON.parse(raw)
        if (typeof parsed.grossRevenue === 'number') grossRevenue.value = parsed.grossRevenue
        if (typeof parsed.vatRate === 'number') vatRate.value = parsed.vatRate
        if (typeof parsed.daysCount === 'number') daysCount.value = parsed.daysCount
        if (typeof parsed.writeOffAmount === 'number') writeOffAmount.value = parsed.writeOffAmount
        if (typeof parsed.surplusAmount === 'number') surplusAmount.value = parsed.surplusAmount
      }
    } catch (e) {
      console.warn('[PercentCalc] Не удалось загрузить сохранённое состояние:', e)
    }
  }

  // Save to LocalStorage on change
  watch(
    [grossRevenue, vatRate, daysCount, writeOffAmount, surplusAmount],
    () => {
      try {
        const data = {
          grossRevenue: grossRevenue.value,
          vatRate: vatRate.value,
          daysCount: daysCount.value,
          writeOffAmount: writeOffAmount.value,
          surplusAmount: surplusAmount.value,
        }
        localStorage.setItem(STORAGE_KEY, JSON.stringify(data))
      } catch (e) {
        console.warn('[PercentCalc] Не удалось сохранить состояние:', e)
      }
    },
    { deep: true }
  )

  // Computed Calculations (из inventory_calc.xlsx)
  const netRevenue = computed<number>(() => {
    const rate = Math.max(0, Math.min(100, vatRate.value || 0))
    return (grossRevenue.value || 0) * (1 - rate / 100)
  })

  const dailyRevenue = computed<number>(() => {
    const days = daysCount.value || 0
    if (days <= 0) return 0
    return netRevenue.value / days
  })

  const netWriteOff = computed<number>(() => {
    return (writeOffAmount.value || 0) - (surplusAmount.value || 0)
  })

  const lossPercentage = computed<number>(() => {
    if (!netRevenue.value || netRevenue.value <= 0) return 0
    return (netWriteOff.value / netRevenue.value) * 100
  })

  // Решение по премии / взысканию
  const decision = computed<DecisionResult>(() => {
    const wOff = netWriteOff.value
    const pct = lossPercentage.value

    if (wOff < 0) {
      return {
        type: 'profit',
        title: 'Профит (плюс)',
        subtitle: 'Премия сохраняется? Проверьте данные вручную',
        color: 'cyan',
      }
    }

    if (pct <= 0.89) {
      return {
        type: 'bonus_300',
        title: 'Премия 300 000 тг',
        subtitle: 'Потери до 0.89% — максимальная премиальная категория',
        color: 'emerald',
      }
    }

    if (pct <= 1.4) {
      return {
        type: 'bonus_200',
        title: 'Премия 200 000 тг',
        subtitle: 'Потери до 1.40% — вторая премиальная категория',
        color: 'indigo',
      }
    }

    if (pct <= 2.59) {
      return {
        type: 'standard',
        title: 'Нет премии, взысканий нет',
        subtitle: 'Потери в пределах допустимой нормы (до 2.59%)',
        color: 'amber',
      }
    }

    if (pct < 3.0) {
      return {
        type: 'penalty',
        title: 'Дисциплинарное взыскание',
        subtitle: 'Потери от 2.60% до 2.99% — зона дисциплинарной ответственности',
        color: 'rose',
      }
    }

    return {
      type: 'termination',
      title: 'Увольнение',
      subtitle: 'Потери 3.00% и выше — критическое превышение лимита потерь',
      color: 'red',
    }
  })

  // Пороги денежные (в тенге / тг)
  const thresholds = computed<ThresholdItem[]>(() => {
    const net = netRevenue.value
    const pct = lossPercentage.value
    const isProfit = netWriteOff.value < 0

    return [
      {
        percent: 0.89,
        label: 'Порог 0.89%',
        amount: net * 0.0089,
        description: 'Верхняя граница премии 300 000 тг',
        isCurrentTier: !isProfit && pct <= 0.89,
      },
      {
        percent: 1.4,
        label: 'Порог 1.40%',
        amount: net * 0.014,
        description: 'Верхняя граница премии 200 000 тг',
        isCurrentTier: !isProfit && pct > 0.89 && pct <= 1.4,
      },
      {
        percent: 2.59,
        label: 'Порог 2.59%',
        amount: net * 0.0259,
        description: 'Предельная сумма без взысканий (норма)',
        isCurrentTier: !isProfit && pct > 1.4 && pct <= 2.59,
      },
      {
        percent: 2.6,
        label: 'Порог 2.60%',
        amount: net * 0.026,
        description: 'Начало диапазона взысканий',
        isCurrentTier: !isProfit && pct >= 2.6 && pct <= 2.99,
      },
      {
        percent: 2.99,
        label: 'Порог 2.99%',
        amount: net * 0.0299,
        description: 'Конец диапазона взысканий',
        isCurrentTier: !isProfit && pct >= 2.6 && pct <= 2.99,
      },
      {
        percent: 3.0,
        label: 'Порог 3.00%',
        amount: net * 0.03,
        description: 'Порог увольнения (начало)',
        isCurrentTier: !isProfit && pct >= 3.0,
      },
    ]
  })

  // Reset to default sample values
  function resetToDefaults() {
    grossRevenue.value = DEFAULT_INPUTS.grossRevenue
    vatRate.value = DEFAULT_INPUTS.vatRate
    daysCount.value = DEFAULT_INPUTS.daysCount
    writeOffAmount.value = DEFAULT_INPUTS.writeOffAmount
    surplusAmount.value = DEFAULT_INPUTS.surplusAmount
  }

  // Clear to zero
  function clearAll() {
    grossRevenue.value = 0
    vatRate.value = 16
    daysCount.value = 0
    writeOffAmount.value = 0
    surplusAmount.value = 0
  }

  // Parse from Excel file
  async function importFromXlsx(file: File): Promise<boolean> {
    const buffer = await file.arrayBuffer()
    const wb = XLSX.read(buffer, { type: 'array' })
    const sheetName = wb.SheetNames.includes('InventoryCalc') ? 'InventoryCalc' : wb.SheetNames[0]
    const ws = wb.Sheets[sheetName]
    if (!ws) return false

    // Try reading cell positions B2..B6
    const b2 = ws['B2']?.v
    const b3 = ws['B3']?.v
    const b4 = ws['B4']?.v
    const b5 = ws['B5']?.v
    const b6 = ws['B6']?.v

    if (typeof b2 === 'number') grossRevenue.value = b2
    if (typeof b3 === 'number') vatRate.value = b3
    if (typeof b4 === 'number') daysCount.value = b4
    if (typeof b5 === 'number') writeOffAmount.value = b5
    if (typeof b6 === 'number') surplusAmount.value = b6

    return true
  }

  // Export to Excel file identically to inventory_calc.xlsx
  function exportToXlsx() {
    const wsData = [
      ['Параметр', 'Значение', 'Пояснение'],
      ['Общая выручка (грязная)', grossRevenue.value, 'Введите общую выручку за период (с НДС)'],
      ['НДС (%)', vatRate.value, 'Ставка НДС (в процентах)'],
      ['Дней в периоде', daysCount.value, 'Количество дней в периоде (включительно)'],
      ['Сумма списания (расходы)', writeOffAmount.value, 'Сумма списания (введите)'],
      ['Сумма плюсов (излишки, +)', surplusAmount.value, 'Сумма плюсов (введите)'],
      ['', '', ''],
      ['Расчёты', '', ''],
      ['Чистая выручка (без НДС)', Number(netRevenue.value.toFixed(2)), 'Выручка без НДС'],
      ['Среднедневная выручка', Number(dailyRevenue.value.toFixed(2)), 'Чистая выручка разделить на дни'],
      ['Чистое списание (после плюсов)', Number(netWriteOff.value.toFixed(2)), 'Списание минус плюсы'],
      ['Процент потерь (%)', Number(lossPercentage.value.toFixed(2)), 'Процент чистого списания от чистой выручки'],
      ['', '', ''],
      ['Порог 0.89% (денежный)', Number((netRevenue.value * 0.0089).toFixed(2)), 'Верхняя граница премии 300000'],
      ['Порог 1.40% (денежный)', Number((netRevenue.value * 0.014).toFixed(2)), 'Верхняя граница премии 200000'],
      ['Порог 2.59% (денежный)', Number((netRevenue.value * 0.0259).toFixed(2)), 'Предельная сумма без взысканий'],
      ['Порог 2.60% (денежный)', Number((netRevenue.value * 0.026).toFixed(2)), 'Начало диапазона взысканий'],
      ['Порог 2.99% (денежный)', Number((netRevenue.value * 0.0299).toFixed(2)), 'Конец диапазона взысканий'],
      ['Порог 3.00% (денежный)', Number((netRevenue.value * 0.03).toFixed(2)), 'Порог увольнения (начало)'],
      ['', '', ''],
      ['Решение по премии/взысканию', decision.value.title, 'Категория по проценту потерь'],
    ]

    const ws = XLSX.utils.aoa_to_sheet(wsData)
    ws['!cols'] = [{ wch: 35 }, { wch: 22 }, { wch: 45 }]

    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'InventoryCalc')

    const dateStr = new Date().toISOString().slice(0, 10)
    XLSX.writeFile(wb, `Расчет_процента_инвентаризации_${dateStr}.xlsx`)
  }

  // Initialize
  loadPersistedState()

  return {
    grossRevenue,
    vatRate,
    daysCount,
    writeOffAmount,
    surplusAmount,
    netRevenue,
    dailyRevenue,
    netWriteOff,
    lossPercentage,
    decision,
    thresholds,
    resetToDefaults,
    clearAll,
    importFromXlsx,
    exportToXlsx,
  }
})
