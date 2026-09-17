import type { FeatureDefinition } from '../types'
import type { DatabaseProvider } from '@shared/lib/db'
import { createDashboardRepository } from './api/dashboardRepository'
import { useDashboardStore } from './model/useDashboardStore'
import { useDashboardStatsStore } from './model/useDashboardStats'
import { eventBus } from '@shared/lib/eventBus'

export const dashboardFeature: FeatureDefinition = {
  id: 'dashboard',
  label: 'Дашборд',
  icon: '📊',
  order: 0,
  route: {
    path: '/dashboard',
    name: 'dashboard',
    component: () => import('./ui/DashboardPage.vue'),
    meta: { featureId: 'dashboard' },
  },
  routes: [
    {
      path: '/dashboard',
      name: 'dashboard',
      component: () => import('./ui/DashboardPage.vue'),
      meta: { featureId: 'dashboard' },
    },
    {
      path: '/dashboard/statistics',
      name: 'dashboard-statistics',
      component: () => import('./ui/DashboardStatisticsPage.vue'),
      meta: { featureId: 'dashboard' },
    },
    {
      path: '/dashboard/percent',
      name: 'dashboard-percent',
      component: () => import('./ui/DashboardPercentPage.vue'),
      meta: { featureId: 'dashboard' },
    },
  ],
  async initialize(db: DatabaseProvider) {
    const repo = createDashboardRepository(db)
    const store = useDashboardStore()
    store.setRepository(repo)

    const statsStore = useDashboardStatsStore()
    statsStore.setRepository(repo)

    // Reload widgets & stats on inventory and revision changes
    const reloadAll = () => {
      store.loadWidgets()
      statsStore.refresh()
    }

    eventBus.on('inventory:count-changed', reloadAll)
    eventBus.on('inventory:item-deleted', reloadAll)
    eventBus.on('revision:created', reloadAll)
    eventBus.on('revision:deleted', reloadAll)
    eventBus.on('revision:archived', reloadAll)
    eventBus.on('revision:dates-updated', reloadAll)

    console.log('[feature:dashboard] initialized with repo and statsStore')
  },
}

