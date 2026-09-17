import mitt from 'mitt'

/**
 * Типизированная шина событий для cross-feature коммуникации.
 *
 * Правило: фичи НЕ импортируют друг друга напрямую.
 * Для взаимодействия используют eventBus.emit() / eventBus.on().
 *
 * Добавляйте новые события в тип AppEvents.
 */
export type AppEvents = {
  /* ── inventory ── */
  'inventory:item-created': { id: string; name: string }
  'inventory:item-updated': { id: string }
  'inventory:item-deleted': { id: string }
  'inventory:count-changed': { total: number }

  /* ── revisions ── */
  'revision:create-requested': void
  'revision:edit-dates-requested': { id: string; storeNumber: string; startDate: string; endDate: string }
  'revision:created': { id?: string; storeNumber: string }
  'revision:deleted': { id?: string; storeNumber: string }
  'revision:archived': { id: string; storeNumber: string; isArchived: boolean }
  'revision:dates-updated': { id?: string; storeNumber?: string; startDate?: string; endDate?: string } | void

  /* ── dashboard ── */
  'dashboard:refresh-requested': void

  /* ── global ── */
  'app:db-ready': void
  'app:error': { message: string; source?: string }
  'app:toast': { message: string; type?: 'info' | 'success' | 'warning' | 'error'; duration?: number }
}

export const eventBus = mitt<AppEvents>()
