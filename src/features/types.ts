import type { RouteRecordRaw } from 'vue-router'
import type { DatabaseProvider } from '@shared/lib/db'

/**
 * Контракт фичи — каждая фича ОБЯЗАНА экспортировать объект этого типа.
 *
 * Feature Registry использует его для:
 * - регистрации маршрутов
 * - построения навигации (sidebar)
 * - инициализации (миграции БД, подписки на события)
 */
export interface FeatureDefinition {
  /** Уникальный идентификатор фичи (kebab-case) */
  id: string

  /** Отображаемое название (для sidebar, breadcrumbs) */
  label: string

  /** Иконка (emoji или HTML-entity) */
  icon: string

  /** Определение маршрута Vue Router */
  route: RouteRecordRaw

  /** Дополнительные маршруты фичи (если есть подстраницы) */
  routes?: RouteRecordRaw[]

  /** Порядок сортировки в навигации (меньше = выше) */
  order?: number

  /**
   * Хук инициализации фичи (вызывается один раз при запуске приложения).
   * Используется для: миграций БД, подписок на EventBus и т.д.
   */
  initialize?: (db: DatabaseProvider) => Promise<void>
}
