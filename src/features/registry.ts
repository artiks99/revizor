import type { FeatureDefinition } from './types'

/*
 * ═══════════════════════════════════════════════════════════════
 *  FEATURE REGISTRY — Центральный реестр фичей приложения
 * ═══════════════════════════════════════════════════════════════
 *
 *  Добавить фичу:   1) Создать папку в features/  2) Добавить import + строку ниже
 *  Удалить фичу:    Закомментировать/удалить строку — фича исчезнет из роутинга и навигации
 */

import { dashboardFeature } from './dashboard'
import { inventoryFeature } from './inventory'

export const features: FeatureDefinition[] = [
  dashboardFeature,
  inventoryFeature,
  // ← Следующая фича добавляется здесь
].sort((a, b) => (a.order ?? 100) - (b.order ?? 100))
