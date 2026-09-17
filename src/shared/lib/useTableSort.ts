import { ref, computed, type Ref } from 'vue'

export type SortDirection = 'asc' | 'desc' | null

export interface SortState<K extends string = string> {
  key: K | null
  direction: SortDirection
}

export function useTableSort<T, K extends string = string>(
  items: Ref<T[]> | (() => T[]),
  defaultKey: K | null = null,
  defaultDirection: SortDirection = null,
  customExtractors?: Partial<Record<K, (item: T) => string | number | boolean | null | undefined>>
) {
  const sortKey = ref<K | null>(defaultKey) as Ref<K | null>
  const sortDirection = ref<SortDirection>(defaultDirection)

  function toggleSort(key: K) {
    if (sortKey.value === key) {
      if (sortDirection.value === 'asc') {
        sortDirection.value = 'desc'
      } else if (sortDirection.value === 'desc') {
        sortKey.value = null
        sortDirection.value = null
      } else {
        sortDirection.value = 'asc'
      }
    } else {
      sortKey.value = key
      sortDirection.value = 'asc'
    }
  }

  function setSort(key: K, direction: SortDirection) {
    sortKey.value = key
    sortDirection.value = direction
  }

  function resetSort() {
    sortKey.value = defaultKey
    sortDirection.value = defaultDirection
  }

  const sortedItems = computed<T[]>(() => {
    const rawList = typeof items === 'function' ? items() : items.value
    if (!sortKey.value || !sortDirection.value) {
      return rawList
    }

    const key = sortKey.value
    const dir = sortDirection.value === 'asc' ? 1 : -1
    const extractor = customExtractors?.[key]

    return [...rawList].sort((a, b) => {
      let valA: any = extractor ? extractor(a) : (a as any)[key]
      let valB: any = extractor ? extractor(b) : (b as any)[key]

      if (valA === valB) return 0
      if (valA == null || valA === '') return 1
      if (valB == null || valB === '') return -1

      if (typeof valA === 'number' && typeof valB === 'number') {
        return (valA - valB) * dir
      }

      if (typeof valA === 'boolean' && typeof valB === 'boolean') {
        return (valA === valB ? 0 : valA ? 1 : -1) * dir
      }

      const strA = String(valA)
      const strB = String(valB)
      return strA.localeCompare(strB, 'ru', { numeric: true, sensitivity: 'base' }) * dir
    })
  })

  return {
    sortKey,
    sortDirection,
    toggleSort,
    setSort,
    resetSort,
    sortedItems,
  }
}
