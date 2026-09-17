import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import type { RevisionMetadata, RevisionStats } from './types'
import type { DashboardRepository } from '../api/dashboardRepository'
import { eventBus } from '@shared/lib/eventBus'

export const useDashboardStatsStore = defineStore('dashboard-stats', () => {
  let repo: DashboardRepository | null = null

  const revisions = ref<RevisionMetadata[]>([])
  const selectedRevisionId = ref<string>('')
  const currentStats = ref<RevisionStats | null>(null)
  const allStats = ref<RevisionStats[]>([])
  const isLoading = ref(false)
  const isAllStatsLoading = ref(false)
  const error = ref<string | null>(null)

  // Active view tab: 'missing' (не забитые ЛК) | 'locations' (локации) | 'all' (сводная таблица)
  const activeTab = ref<'missing' | 'locations' | 'all'>('missing')
  const searchQuery = ref('')

  function setRepository(repository: DashboardRepository) {
    repo = repository
  }

  const activeRevisions = computed(() => revisions.value.filter((r) => !r.isArchived))
  const archivedRevisions = computed(() => revisions.value.filter((r) => r.isArchived))

  const selectedRevision = computed<RevisionMetadata | null>(() => {
    if (!selectedRevisionId.value || selectedRevisionId.value === 'all') return null
    return revisions.value.find((r) => r.id === selectedRevisionId.value) || null
  })

  /** Фильтрация незабитых ЛК по строке поиска */
  const filteredMissingSkus = computed(() => {
    if (!currentStats.value) return []
    const list = currentStats.value.missingGeneralSkus
    const q = searchQuery.value.trim().toLowerCase()
    if (!q) return list
    return list.filter(
      (item) => item.sku.toLowerCase().includes(q) || (item.name && item.name.toLowerCase().includes(q))
    )
  })

  /** Фильтрация локаций по строке поиска */
  const filteredLocations = computed(() => {
    if (!currentStats.value) return []
    const list = currentStats.value.locations
    const q = searchQuery.value.trim().toLowerCase()
    if (!q) return list
    return list.filter((item) => item.location.toLowerCase().includes(q))
  })

  /** Загрузить список ревизий */
  async function loadRevisions(): Promise<void> {
    if (!repo) return
    try {
      const revs = await repo.getAllRevisions()
      revisions.value = revs

      // Если ревизия еще не выбрана — выбираем первую активную или первую из списка
      if (!selectedRevisionId.value && revs.length > 0) {
        const firstActive = revs.find((r) => !r.isArchived) || revs[0]
        selectedRevisionId.value = firstActive.id
      }
    } catch (err) {
      console.error('[useDashboardStats] Error loading revisions:', err)
      error.value = 'Ошибка загрузки ревизий'
    }
  }

  /** Загрузить статистику для выбранной ревизии */
  async function loadCurrentStats(): Promise<void> {
    if (!repo) return
    if (!selectedRevisionId.value || selectedRevisionId.value === 'all') {
      currentStats.value = null
      if (selectedRevisionId.value === 'all') {
        await loadAllRevisionsStats()
      }
      return
    }

    const rev = revisions.value.find((r) => r.id === selectedRevisionId.value)
    if (!rev) {
      currentStats.value = null
      return
    }

    isLoading.value = true
    error.value = null
    try {
      currentStats.value = await repo.getRevisionStatistics(rev)
    } catch (err) {
      console.error('[useDashboardStats] Error loading stats:', err)
      error.value = 'Не удалось рассчитать статистику'
    } finally {
      isLoading.value = false
    }
  }

  /** Загрузить статистику по всем ревизиям для сводной таблицы */
  async function loadAllRevisionsStats(): Promise<void> {
    if (!repo) return
    isAllStatsLoading.value = true
    try {
      await loadRevisions()
      allStats.value = await repo.getAllRevisionsStatistics(revisions.value)
    } catch (err) {
      console.error('[useDashboardStats] Error loading all revisions stats:', err)
    } finally {
      isAllStatsLoading.value = false
    }
  }

  /** Скопировать все незабитые ЛК в буфер обмена (только артикулы, один на строку) */
  async function copyMissingSkus(): Promise<void> {
    const list = filteredMissingSkus.value.length > 0 ? filteredMissingSkus.value : (currentStats.value?.missingGeneralSkus || [])
    if (list.length === 0) return
    const text = list.map((item) => item.sku).join('\n')
    try {
      if (navigator?.clipboard) {
        await navigator.clipboard.writeText(text)
        eventBus.emit('app:toast', {
          type: 'success',
          message: `Скопировано ${list.length} ЛК в буфер обмена`,
        })
      }
    } catch (err) {
      console.error('[useDashboardStats] Clipboard write error:', err)
    }
  }

  /** Полная перезагрузка */
  async function refresh(): Promise<void> {
    await loadRevisions()
    if (selectedRevisionId.value === 'all' || activeTab.value === 'all') {
      await loadAllRevisionsStats()
    }
    if (selectedRevisionId.value !== 'all') {
      await loadCurrentStats()
    }
  }

  // Подписка на изменения ревизий из других частей приложения
  eventBus.on('revision:archived', async () => {
    await refresh()
  })
  eventBus.on('revision:created', async () => {
    await refresh()
  })
  eventBus.on('revision:deleted', async () => {
    await refresh()
  })
  eventBus.on('revision:dates-updated', async () => {
    await refresh()
  })

  return {
    revisions,
    activeRevisions,
    archivedRevisions,
    selectedRevisionId,
    selectedRevision,
    currentStats,
    allStats,
    isLoading,
    isAllStatsLoading,
    error,
    activeTab,
    searchQuery,
    filteredMissingSkus,
    filteredLocations,
    setRepository,
    loadRevisions,
    loadCurrentStats,
    loadAllRevisionsStats,
    copyMissingSkus,
    refresh,
  }
})
