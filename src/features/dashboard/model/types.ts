export interface DashboardWidget {
  id: string
  title: string
  value: string | number
  icon: string
  trend?: 'up' | 'down' | 'neutral'
  trendValue?: string
}

export interface RevisionMetadata {
  id: string
  storeNumber: string
  startDate: string
  endDate: string
  isArchived: boolean
  dirPath: string
}

export interface MissingSkuItem {
  sku: string
  name?: string
  stockQty?: number
}

export interface LocationStatsItem {
  location: string
  count: number
  totalQty: number
}

export interface MultiplicityStatsItem {
  multiplicity: number
  skuCount: number
  totalStockQty: number
}

export interface RevisionStats {
  revisionId: string
  storeNumber: string
  startDate: string
  endDate: string
  isArchived: boolean
  // 1) Кол-во лк на складе (повторки считаются за 1)(из факта)
  factSkuCount: number
  stockSkuCount: number
  // 2) Кол-во товара на складе (сумма) (общая сумма посчитанного колва товара из факта)
  factTotalQuantity: number
  stockTotalQuantity: number
  // 3) Кол-во локаций (из факта)
  factLocationsCount: number
  // 4) Кол-во лк не забитые на склад (те лк из общего, которые не учтены в факте)
  missingGeneralSkuCount: number
  // 5) Процент занесенной суммы товара на склад (сумма факта и сумма из общего)
  generalTotalQuantity: number
  enteredSumPercent: number
  // 6) 299 на складе и в зале
  fact299SkuCount: number
  stock299SkuCount: number
  hall299SkuCount: number
  hall299Percent: number
  // 7) Основные кратности коробок на остатке магазина
  topMultiplicities: MultiplicityStatsItem[]
  // Детализация
  missingGeneralSkus: MissingSkuItem[]
  locations: LocationStatsItem[]
}

export interface PercentCalcInputs {
  grossRevenue: number
  vatRate: number
  daysCount: number
  writeOffAmount: number
  surplusAmount: number
}

export interface ThresholdItem {
  percent: number
  label: string
  amount: number
  description: string
  isCurrentTier: boolean
}

export type DecisionType = 'profit' | 'bonus_300' | 'bonus_200' | 'standard' | 'penalty' | 'termination'

export interface DecisionResult {
  type: DecisionType
  title: string
  subtitle: string
  color: 'emerald' | 'indigo' | 'amber' | 'rose' | 'red' | 'cyan'
}

