import type { FeatureDefinition } from '../types'
import type { DatabaseProvider } from '@shared/lib/db'
import { createInventoryRepository } from './api/inventoryRepository'
import { useInventoryStore } from './model/useInventoryStore'
import { getTodayIsoDate } from '@shared/lib/formatDate'
import { ensureStoresDir } from '@shared/lib/revisionStorageService'

export const inventoryFeature: FeatureDefinition = {
  id: 'inventory',
  label: 'Инвентаризация',
  icon: '📦',
  order: 10,
  route: {
    path: '/inventory/:storeNumber?',
    name: 'inventory',
    component: () => import('./ui/InventoryPage.vue'),
    meta: { featureId: 'inventory' },
  },
  async initialize(db: DatabaseProvider) {
    // Гарантируем существование папки «магазины»
    try {
      await ensureStoresDir()
    } catch (err) {
      console.error('[feature:inventory] Failed to ensure stores dir:', err)
    }

    const repo = createInventoryRepository(db)
    
    // Run DB migrations
    await repo.migrate()

    const store = useInventoryStore()
    store.setRepository(repo)
    await store.loadRevisions()

    // Set default active store with canonical UUID
    if (store.revisions.length > 0) {
      const existing = store.revisions.find(
        (r) => r.id === store.activeRevisionId || r.storeNumber === store.activeRevisionId
      )
      if (existing) {
        store.setActiveRevisionId(existing.id)
      } else {
        const defaultRev = store.activeRevisions[0] || store.revisions[0]
        store.setActiveRevisionId(defaultRev.id)
      }
    }

    console.log('[feature:inventory] initialized with SQLite repo')
  },
}

/* Re-export types for consumers who need them */
export type { InventoryItem, InventoryItemStatus, Revision } from './model/types'
