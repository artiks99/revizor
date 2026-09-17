import { ref, computed, type Ref } from 'vue'

export const EMPTY_VALUE_KEY = '__EMPTY__'

export interface DistinctValueItem {
  key: string
  label: string
  count: number
  isEmpty: boolean
}

export type ColumnExtractorMap<T> = Record<
  string,
  (item: T) => string | number | boolean | null | undefined
>

export function useExcelColumnFilter<T>(
  sourceItems?: Ref<T[]> | (() => T[]),
  extractors?: ColumnExtractorMap<T>
) {
  // Map of columnKey -> Set of allowed stringified keys (null means no filter applied on that column)
  const columnFilters = ref<Record<string, Set<string> | null>>({})

  function getRawItems(): T[] {
    if (!sourceItems) return []
    return typeof sourceItems === 'function' ? sourceItems() : sourceItems.value
  }

  function getExtractor(key: string): (item: T) => any {
    if (extractors && extractors[key]) {
      return extractors[key]
    }
    return (item: T) => (item as any)[key]
  }

  function formatValueKey(rawVal: any): string {
    if (rawVal === null || rawVal === undefined || String(rawVal).trim() === '') {
      return EMPTY_VALUE_KEY
    }
    return String(rawVal).trim()
  }

  /**
   * Вычисляет уникальные значения для колонки и количество их повторений
   */
  function getDistinctValues(key: string, overrideItems?: T[]): DistinctValueItem[] {
    const rawList = overrideItems || getRawItems()
    const extractor = getExtractor(key)
    const counts = new Map<string, { label: string; count: number; isEmpty: boolean }>()

    let emptyCount = 0

    for (let i = 0; i < rawList.length; i++) {
      const item = rawList[i]
      const rawVal = extractor(item)
      const formattedKey = formatValueKey(rawVal)

      if (formattedKey === EMPTY_VALUE_KEY) {
        emptyCount++
      } else {
        const existing = counts.get(formattedKey)
        if (existing) {
          existing.count++
        } else {
          counts.set(formattedKey, {
            label: String(rawVal).trim(),
            count: 1,
            isEmpty: false,
          })
        }
      }
    }

    const result: DistinctValueItem[] = []

    if (emptyCount > 0) {
      result.push({
        key: EMPTY_VALUE_KEY,
        label: '(Пустые)',
        count: emptyCount,
        isEmpty: true,
      })
    }

    const sortedEntries = Array.from(counts.entries()).sort((a, b) => {
      return a[1].label.localeCompare(b[1].label, 'ru', { numeric: true, sensitivity: 'base' })
    })

    for (const [vKey, info] of sortedEntries) {
      result.push({
        key: vKey,
        label: info.label,
        count: info.count,
        isEmpty: false,
      })
    }

    return result
  }

  function setColumnFilter(key: string, allowedKeys: Set<string> | null) {
    if (!allowedKeys) {
      const next = { ...columnFilters.value }
      delete next[key]
      columnFilters.value = next
    } else {
      columnFilters.value = {
        ...columnFilters.value,
        [key]: allowedKeys,
      }
    }
  }

  function clearColumnFilter(key: string) {
    setColumnFilter(key, null)
  }

  function clearAllColumnFilters() {
    columnFilters.value = {}
  }

  function isColumnFiltered(key: string): boolean {
    return !!columnFilters.value[key]
  }

  const activeFilterCount = computed(() => {
    return Object.keys(columnFilters.value).filter((k) => !!columnFilters.value[k]).length
  })

  const filteredItems = computed<T[]>(() => {
    const rawList = getRawItems()
    const activeKeys = Object.keys(columnFilters.value).filter((k) => !!columnFilters.value[k])

    if (activeKeys.length === 0) {
      return rawList
    }

    return rawList.filter((item) => {
      for (const key of activeKeys) {
        const allowedSet = columnFilters.value[key]
        if (!allowedSet) continue

        const extractor = getExtractor(key)
        const rawVal = extractor(item)
        const vKey = formatValueKey(rawVal)

        if (!allowedSet.has(vKey)) {
          return false
        }
      }
      return true
    })
  })

  const hasActiveFilters = computed(() => activeFilterCount.value > 0)

  return {
    columnFilters,
    getDistinctValues,
    setColumnFilter,
    clearColumnFilter,
    clearAllColumnFilters,
    isColumnFiltered,
    activeFilterCount,
    hasActiveFilters,
    filteredItems,
  }
}
