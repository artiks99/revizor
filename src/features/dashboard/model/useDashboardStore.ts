import { defineStore } from 'pinia'
import { ref } from 'vue'
import type { DashboardWidget, RevisionMetadata } from './types'
import type { DashboardRepository } from '../api/dashboardRepository'

export const useDashboardStore = defineStore('dashboard', () => {
  const widgets = ref<DashboardWidget[]>([])
  const revisions = ref<RevisionMetadata[]>([])
  const selectedRevisionId = ref<string>('all')
  const isLoading = ref(false)
  const error = ref<string | null>(null)

  let repo: DashboardRepository | null = null

  function setRepository(repository: DashboardRepository) {
    repo = repository
  }

  async function loadWidgets(revId?: string) {
    if (!repo) {
      error.value = 'Dashboard repository not initialized'
      return
    }

    if (revId !== undefined) {
      selectedRevisionId.value = revId
    }

    isLoading.value = true
    error.value = null

    try {
      const [w, revs] = await Promise.all([
        repo.getWidgets(selectedRevisionId.value),
        repo.getAllRevisions(),
      ])
      widgets.value = w
      revisions.value = revs
    } catch (e) {
      error.value = e instanceof Error ? e.message : 'Unknown error'
    } finally {
      isLoading.value = false
    }
  }

  return {
    widgets,
    revisions,
    selectedRevisionId,
    isLoading,
    error,
    setRepository,
    loadWidgets,
  }
})
