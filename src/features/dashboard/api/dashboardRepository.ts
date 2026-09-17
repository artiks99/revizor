import type { DatabaseProvider } from '@shared/lib/db'
import { SqliteDatabaseProvider } from '@shared/lib/db'
import { getRevisionDbUri } from '@shared/lib/revisionStorageService'
import type { DashboardWidget, RevisionMetadata, RevisionStats, MissingSkuItem, LocationStatsItem } from '../model/types'

/** Кэш DatabaseProvider по revisionId */
const revDbCache = new Map<string, DatabaseProvider>()

/** Получить DatabaseProvider для конкретной ревизии */
function getTargetDb(db: DatabaseProvider, rev: RevisionMetadata): DatabaseProvider {
  if (rev.dirPath) {
    if (revDbCache.has(rev.id)) {
      return revDbCache.get(rev.id)!
    }
    const uri = getRevisionDbUri(rev.dirPath)
    const provider = new SqliteDatabaseProvider(uri)
    revDbCache.set(rev.id, provider)
    return provider
  }
  return db
}

/**
 * Репозиторий дашборда — инкапсулирует SQL-запросы дашборда и статистики.
 */
export function createDashboardRepository(db: DatabaseProvider) {
  return {
    /** Получить агрегированные данные для виджетов главной страницы */
    async getWidgets(targetRevisionId?: string): Promise<DashboardWidget[]> {
      const allRevisions = await this.getAllRevisions()
      const activeRevisions = allRevisions.filter((r) => !r.isArchived)

      let targetRevisions: RevisionMetadata[] = []
      if (targetRevisionId && targetRevisionId !== 'all') {
        const found = allRevisions.find((r) => r.id === targetRevisionId || r.storeNumber === targetRevisionId)
        if (found) {
          targetRevisions = [found]
        }
      } else {
        targetRevisions = activeRevisions.length > 0 ? activeRevisions : allRevisions
      }

      if (targetRevisions.length === 0) {
        return [
          {
            id: 'total-items',
            title: 'Всего позиций',
            value: 0,
            icon: '📦',
            trend: 'neutral',
          },
          {
            id: 'active-audits',
            title: 'Активные ревизии',
            value: 0,
            icon: '📋',
            trend: 'neutral',
          },
          {
            id: 'discrepancies',
            title: 'Расхождения',
            value: 0,
            icon: '⚠️',
            trend: 'neutral',
          },
          {
            id: 'locations',
            title: 'Локации',
            value: 0,
            icon: '📍',
            trend: 'neutral',
          },
        ]
      }

      let totalUniqueSkus = 0
      let totalItemsQty = 0
      let totalPositions = 0
      let totalLocations = 0
      let totalDiscrepancies = 0
      let totalStockQty = 0

      for (const rev of targetRevisions) {
        const targetDb = getTargetDb(db, rev)
        const isStandalone = Boolean(rev.dirPath)
        const params = isStandalone ? [] : [rev.id]

        try {
          // 1. Позиции и количество из факта
          const factQuery = isStandalone
            ? `SELECT COUNT(DISTINCT sku) as uniqueSkus, COUNT(*) as positions, COALESCE(SUM(quantity), 0) as totalQty FROM inventory_items WHERE sku != '' AND sku IS NOT NULL`
            : `SELECT COUNT(DISTINCT sku) as uniqueSkus, COUNT(*) as positions, COALESCE(SUM(quantity), 0) as totalQty FROM inventory_items WHERE sku != '' AND sku IS NOT NULL AND (revision_id = $1 OR store_number = $1)`
          const factRows = await targetDb.select<{ uniqueSkus: number; positions: number; totalQty: number }>(factQuery, params)
          totalUniqueSkus += factRows[0]?.uniqueSkus ?? 0
          totalPositions += factRows[0]?.positions ?? 0
          totalItemsQty += factRows[0]?.totalQty ?? 0
        } catch (err) {
          console.warn(`[dashboardRepository] fact count query failed for ${rev.storeNumber}:`, err)
        }

        try {
          // 2. Локации
          const locQuery = isStandalone
            ? `SELECT COUNT(DISTINCT location) as cnt FROM inventory_items WHERE location != '' AND location IS NOT NULL`
            : `SELECT COUNT(DISTINCT location) as cnt FROM inventory_items WHERE location != '' AND location IS NOT NULL AND (revision_id = $1 OR store_number = $1)`
          const locRows = await targetDb.select<{ cnt: number }>(locQuery, params)
          totalLocations += locRows[0]?.cnt ?? 0
        } catch (err) {
          console.warn(`[dashboardRepository] locations count query failed for ${rev.storeNumber}:`, err)
        }

        try {
          // 3. Остаток магазина
          const stockQtyQuery = isStandalone
            ? `SELECT COALESCE(SUM(quantity), 0) as total FROM store_stock WHERE sku != '' AND sku IS NOT NULL`
            : `SELECT COALESCE(SUM(quantity), 0) as total FROM store_stock WHERE sku != '' AND sku IS NOT NULL AND (revision_id = $1 OR store_number = $1)`
          const stockQtyRows = await targetDb.select<{ total: number }>(stockQtyQuery, params)
          totalStockQty += stockQtyRows[0]?.total ?? 0
        } catch (_) {}

        try {
          // 4. Расхождения: ЛК, где факт != остаток (включая не забитые ЛК из остатка и излишки)
          const discQuery = isStandalone
            ? `SELECT COUNT(*) as cnt FROM (
                 SELECT sku FROM (
                   SELECT sku, quantity as stock_qty, 0 as fact_qty FROM store_stock WHERE sku != '' AND sku IS NOT NULL
                   UNION ALL
                   SELECT sku, 0 as stock_qty, quantity as fact_qty FROM inventory_items WHERE sku != '' AND sku IS NOT NULL
                 )
                 GROUP BY sku
                 HAVING ROUND(SUM(stock_qty), 3) != ROUND(SUM(fact_qty), 3)
               )`
            : `SELECT COUNT(*) as cnt FROM (
                 SELECT sku FROM (
                   SELECT sku, quantity as stock_qty, 0 as fact_qty FROM store_stock WHERE sku != '' AND sku IS NOT NULL AND (revision_id = $1 OR store_number = $1)
                   UNION ALL
                   SELECT sku, 0 as stock_qty, quantity as fact_qty FROM inventory_items WHERE sku != '' AND sku IS NOT NULL AND (revision_id = $1 OR store_number = $1)
                 )
                 GROUP BY sku
                 HAVING ROUND(SUM(stock_qty), 3) != ROUND(SUM(fact_qty), 3)
               )`
          const discRows = await targetDb.select<{ cnt: number }>(discQuery, params)
          let discCount = discRows[0]?.cnt ?? 0

          // Если store_stock пуст, проверяем незабитые ЛК из store_general
          if (discCount === 0) {
            const missingGeneralQuery = isStandalone
              ? `SELECT COUNT(DISTINCT g.sku) as cnt FROM store_general g WHERE g.sku != '' AND g.sku IS NOT NULL AND g.sku NOT IN (SELECT sku FROM inventory_items WHERE sku != '' AND sku IS NOT NULL)`
              : `SELECT COUNT(DISTINCT g.sku) as cnt FROM store_general g WHERE g.sku != '' AND g.sku IS NOT NULL AND (g.revision_id = $1 OR g.store_number = $1) AND g.sku NOT IN (SELECT sku FROM inventory_items WHERE sku != '' AND sku IS NOT NULL AND (revision_id = $1 OR store_number = $1))`
            const missingGeneralRows = await targetDb.select<{ cnt: number }>(missingGeneralQuery, params)
            discCount = missingGeneralRows[0]?.cnt ?? 0
          }

          totalDiscrepancies += discCount
        } catch (err) {
          console.warn(`[dashboardRepository] discrepancy query failed for ${rev.storeNumber}:`, err)
        }
      }

      // Вычисление процента или единиц для карточки "Всего позиций"
      let itemsTrendValue: string | undefined
      if (totalStockQty > 0) {
        const percent = Math.min(100, Number(((totalItemsQty / totalStockQty) * 100).toFixed(1)))
        itemsTrendValue = `${percent}% занесено`
      } else if (totalItemsQty > 0) {
        itemsTrendValue = `${totalItemsQty.toLocaleString('ru-RU')} шт.`
      }

      const activeCount = activeRevisions.length
      const archivedCount = allRevisions.length - activeCount

      return [
        {
          id: 'total-items',
          title: 'Всего позиций',
          value: totalUniqueSkus,
          icon: '📦',
          trend: totalUniqueSkus > 0 ? 'up' : 'neutral',
          trendValue: itemsTrendValue,
        },
        {
          id: 'active-audits',
          title: 'Активные ревизии',
          value: activeCount,
          icon: '📋',
          trend: 'neutral',
          trendValue: archivedCount > 0 ? `${archivedCount} в архиве` : undefined,
        },
        {
          id: 'discrepancies',
          title: 'Расхождения',
          value: totalDiscrepancies,
          icon: '⚠️',
          trend: totalDiscrepancies > 0 ? 'down' : 'neutral',
          trendValue: totalDiscrepancies > 0 ? `+${totalDiscrepancies}` : 'Все сошлись',
        },
        {
          id: 'locations',
          title: 'Локации',
          value: totalLocations,
          icon: '📍',
          trend: 'neutral',
          trendValue: totalPositions > 0 ? `${totalPositions.toLocaleString('ru-RU')} записей` : undefined,
        },
      ]
    },

    /** Получить список всех ревизий (включая архивные) */
    async getAllRevisions(): Promise<RevisionMetadata[]> {
      try {
        const rows = await db.select<{
          id: string
          storeNumber: string
          startDate: string
          endDate: string
          isArchived: number
          dirPath: string
        }>(
          `SELECT 
            id, 
            store_number as storeNumber, 
            start_date as startDate, 
            end_date as endDate, 
            is_archived as isArchived, 
            dir_path as dirPath 
           FROM revisions 
           ORDER BY start_date DESC, created_at DESC`
        )
        return rows.map((r) => ({
          id: r.id,
          storeNumber: r.storeNumber,
          startDate: r.startDate,
          endDate: r.endDate,
          isArchived: Boolean(r.isArchived),
          dirPath: r.dirPath || '',
        }))
      } catch (err) {
        console.error('[dashboardRepository] Error fetching revisions:', err)
        return []
      }
    },

    /** Получить подробную статистику по конкретной ревизии */
    async getRevisionStatistics(rev: RevisionMetadata): Promise<RevisionStats> {
      let isArchived = rev.isArchived
      try {
        const metaRows = await db.select<{ is_archived: number }>(
          `SELECT is_archived FROM revisions WHERE id = $1 OR store_number = $1 LIMIT 1`,
          [rev.id]
        )
        if (metaRows.length > 0) {
          isArchived = Boolean(metaRows[0].is_archived)
        }
      } catch (_) {}

      const targetDb = getTargetDb(db, rev)
      const isStandalone = Boolean(rev.dirPath)

      // Гарантируем индексы для мгновенного выполнения запросов
      if (isStandalone) {
        try {
          await targetDb.execute(`CREATE INDEX IF NOT EXISTS idx_items_sku ON inventory_items (sku)`)
          await targetDb.execute(`CREATE INDEX IF NOT EXISTS idx_general_sku ON store_general (sku)`)
          await targetDb.execute(`CREATE INDEX IF NOT EXISTS idx_catalog_sku ON store_catalog (sku)`)
          await targetDb.execute(`CREATE INDEX IF NOT EXISTS idx_stock_sku ON store_stock (sku)`)
          await targetDb.execute(`CREATE INDEX IF NOT EXISTS idx_299_sku ON store_account_299 (sku)`)
          await targetDb.execute(`CREATE INDEX IF NOT EXISTS idx_multiplicity_sku ON store_multiplicity (sku)`)
        } catch (_) {}
      }

      // 1) Кол-во лк на складе (повторки считаются за 1)
      const p1 = (async () => {
        try {
          const query = isStandalone
            ? `SELECT COUNT(DISTINCT sku) as cnt FROM inventory_items WHERE sku != '' AND sku IS NOT NULL`
            : `SELECT COUNT(DISTINCT sku) as cnt FROM inventory_items WHERE sku != '' AND sku IS NOT NULL AND (revision_id = $1 OR store_number = $1)`
          const params = isStandalone ? [] : [rev.id]
          const rows = await targetDb.select<{ cnt: number }>(query, params)
          return rows[0]?.cnt ?? 0
        } catch (err) {
          console.warn(`[dashboardRepository] factSkuCount query failed for ${rev.storeNumber}:`, err)
          return 0
        }
      })()

      // 2) Кол-во товара на складе (сумма посчитанного товара из факта)
      const p2 = (async () => {
        try {
          const query = isStandalone
            ? `SELECT COALESCE(SUM(quantity), 0) as total FROM inventory_items`
            : `SELECT COALESCE(SUM(quantity), 0) as total FROM inventory_items WHERE (revision_id = $1 OR store_number = $1)`
          const params = isStandalone ? [] : [rev.id]
          const rows = await targetDb.select<{ total: number }>(query, params)
          return rows[0]?.total ?? 0
        } catch (err) {
          console.warn(`[dashboardRepository] factTotalQuantity query failed for ${rev.storeNumber}:`, err)
          return 0
        }
      })()

      // 3) Кол-во локаций (из факта)
      const p3 = (async () => {
        try {
          const query = isStandalone
            ? `SELECT COUNT(DISTINCT location) as cnt FROM inventory_items WHERE location != '' AND location IS NOT NULL`
            : `SELECT COUNT(DISTINCT location) as cnt FROM inventory_items WHERE location != '' AND location IS NOT NULL AND (revision_id = $1 OR store_number = $1)`
          const params = isStandalone ? [] : [rev.id]
          const rows = await targetDb.select<{ cnt: number }>(query, params)
          return rows[0]?.cnt ?? 0
        } catch (err) {
          console.warn(`[dashboardRepository] factLocationsCount query failed for ${rev.storeNumber}:`, err)
          return 0
        }
      })()

      // 4) Кол-во лк не забитые на склад (те лк из общего, которые не учтены в факте и имеют остаток > 0)
      const p4 = (async () => {
        try {
          const query = isStandalone
            ? `SELECT 
                 g.sku, 
                 COALESCE(c.name, s.name, '') as name,
                 s.quantity as stockQty
               FROM store_general g
               JOIN (
                 SELECT sku, MAX(name) as name, SUM(quantity) as quantity
                 FROM store_stock
                 WHERE sku != '' AND sku IS NOT NULL
                 GROUP BY sku
                 HAVING SUM(quantity) > 0
               ) s ON s.sku = g.sku
               LEFT JOIN store_catalog c ON c.sku = g.sku
               WHERE g.sku != '' AND g.sku IS NOT NULL
                 AND g.sku NOT IN (SELECT sku FROM inventory_items WHERE sku != '' AND sku IS NOT NULL)
               ORDER BY g.sku ASC`
            : `SELECT 
                 g.sku, 
                 COALESCE(c.name, s.name, '') as name,
                 s.quantity as stockQty
               FROM store_general g
               JOIN (
                 SELECT sku, MAX(name) as name, SUM(quantity) as quantity
                 FROM store_stock
                 WHERE sku != '' AND sku IS NOT NULL AND (revision_id = $1 OR store_number = $1)
                 GROUP BY sku
                 HAVING SUM(quantity) > 0
               ) s ON s.sku = g.sku
               LEFT JOIN store_catalog c ON c.sku = g.sku AND (c.revision_id = $1 OR c.store_number = $1)
               WHERE g.sku != '' AND g.sku IS NOT NULL AND (g.revision_id = $1 OR g.store_number = $1)
                 AND g.sku NOT IN (SELECT sku FROM inventory_items WHERE sku != '' AND sku IS NOT NULL AND (revision_id = $1 OR store_number = $1))
               ORDER BY g.sku ASC`
          const params = isStandalone ? [] : [rev.id]
          let rows = await targetDb.select<MissingSkuItem>(query, params)

          if (rows.length === 0) {
            // Если в таблице «Общее» нет данных, используем остатки магазина > 0 без факта
            const countGeneralQuery = isStandalone
              ? `SELECT COUNT(*) as cnt FROM store_general WHERE sku != '' AND sku IS NOT NULL`
              : `SELECT COUNT(*) as cnt FROM store_general WHERE sku != '' AND sku IS NOT NULL AND (revision_id = $1 OR store_number = $1)`
            const generalCheck = await targetDb.select<{ cnt: number }>(countGeneralQuery, params)
            if ((generalCheck[0]?.cnt ?? 0) === 0) {
              const fallbackQuery = isStandalone
                ? `SELECT 
                     s.sku, 
                     COALESCE(c.name, s.name, '') as name,
                     s.quantity as stockQty
                   FROM (
                     SELECT sku, MAX(name) as name, SUM(quantity) as quantity
                     FROM store_stock
                     WHERE sku != '' AND sku IS NOT NULL
                     GROUP BY sku
                     HAVING SUM(quantity) > 0
                   ) s
                   LEFT JOIN store_catalog c ON c.sku = s.sku
                   WHERE s.sku NOT IN (SELECT sku FROM inventory_items WHERE sku != '' AND sku IS NOT NULL)
                   ORDER BY s.sku ASC`
                : `SELECT 
                     s.sku, 
                     COALESCE(c.name, s.name, '') as name,
                     s.quantity as stockQty
                   FROM (
                     SELECT sku, MAX(name) as name, SUM(quantity) as quantity
                     FROM store_stock
                     WHERE sku != '' AND sku IS NOT NULL AND (revision_id = $1 OR store_number = $1)
                     GROUP BY sku
                     HAVING SUM(quantity) > 0
                   ) s
                   LEFT JOIN store_catalog c ON c.sku = s.sku AND (c.revision_id = $1 OR c.store_number = $1)
                   WHERE s.sku NOT IN (SELECT sku FROM inventory_items WHERE sku != '' AND sku IS NOT NULL AND (revision_id = $1 OR store_number = $1))
                   ORDER BY s.sku ASC`
              rows = await targetDb.select<MissingSkuItem>(fallbackQuery, params)
            }
          }
          return rows
        } catch (err) {
          console.warn(`[dashboardRepository] missingGeneralSkus query failed for ${rev.storeNumber}:`, err)
          return []
        }
      })()

      // 5) Детализация локаций
      const p5 = (async () => {
        try {
          const query = isStandalone
            ? `SELECT location, COUNT(*) as count, COALESCE(SUM(quantity), 0) as totalQty
               FROM inventory_items
               WHERE location != '' AND location IS NOT NULL
               GROUP BY location
               ORDER BY totalQty DESC, count DESC`
            : `SELECT location, COUNT(*) as count, COALESCE(SUM(quantity), 0) as totalQty
               FROM inventory_items
               WHERE location != '' AND location IS NOT NULL AND (revision_id = $1 OR store_number = $1)
               GROUP BY location
               ORDER BY totalQty DESC, count DESC`
          const params = isStandalone ? [] : [rev.id]
          return await targetDb.select<LocationStatsItem>(query, params)
        } catch (err) {
          console.warn(`[dashboardRepository] locations query failed for ${rev.storeNumber}:`, err)
          return []
        }
      })()

      // 6) Сумма товаров из общего (по остаткам store_stock для позиций из общего store_general)
      const p6 = (async () => {
        try {
          const query = isStandalone
            ? `SELECT COALESCE(SUM(s.quantity), 0) as total
               FROM store_stock s
               JOIN store_general g ON g.sku = s.sku
               WHERE s.sku != '' AND s.sku IS NOT NULL`
            : `SELECT COALESCE(SUM(s.quantity), 0) as total
               FROM store_stock s
               JOIN store_general g ON g.sku = s.sku
               WHERE s.sku != '' AND s.sku IS NOT NULL
                 AND (s.revision_id = $1 OR s.store_number = $1)
                 AND (g.revision_id = $1 OR g.store_number = $1)`
          const params = isStandalone ? [] : [rev.id]
          const rows = await targetDb.select<{ total: number }>(query, params)
          let total = rows[0]?.total ?? 0

          // Если в general ничего не сматчилось, пробуем общую сумму store_stock
          if (total === 0) {
            const fallbackQuery = isStandalone
              ? `SELECT COALESCE(SUM(quantity), 0) as total FROM store_stock WHERE sku != '' AND sku IS NOT NULL`
              : `SELECT COALESCE(SUM(quantity), 0) as total FROM store_stock WHERE sku != '' AND sku IS NOT NULL AND (revision_id = $1 OR store_number = $1)`
            const fallbackRows = await targetDb.select<{ total: number }>(fallbackQuery, params)
            total = fallbackRows[0]?.total ?? 0
          }
          return total
        } catch (err) {
          console.warn(`[dashboardRepository] generalTotalQuantity query failed for ${rev.storeNumber}:`, err)
          return 0
        }
      })()

      // 7) Кол-во лк 299 на складе (уникальные ЛК 299, посчитанные в факте)
      const p7 = (async () => {
        try {
          const query = isStandalone
            ? `SELECT COUNT(DISTINCT f.sku) as cnt
               FROM inventory_items f
               JOIN store_account_299 a ON a.sku = f.sku
               WHERE f.sku != '' AND f.sku IS NOT NULL`
            : `SELECT COUNT(DISTINCT f.sku) as cnt
               FROM inventory_items f
               JOIN store_account_299 a ON a.sku = f.sku
               WHERE f.sku != '' AND f.sku IS NOT NULL
                 AND (f.revision_id = $1 OR f.store_number = $1)
                 AND (a.revision_id = $1 OR a.store_number = $1)`
          const params = isStandalone ? [] : [rev.id]
          const rows = await targetDb.select<{ cnt: number }>(query, params)
          return rows[0]?.cnt ?? 0
        } catch (err) {
          console.warn(`[dashboardRepository] fact299SkuCount query failed for ${rev.storeNumber}:`, err)
          return 0
        }
      })()

      // 8) Кол-во лк 299 на остатке магазина (всего ЛК 299 числящихся на магазине)
      const p8 = (async () => {
        try {
          const query = isStandalone
            ? `SELECT COUNT(DISTINCT s.sku) as cnt
               FROM store_stock s
               JOIN store_account_299 a ON a.sku = s.sku
               WHERE s.sku != '' AND s.sku IS NOT NULL`
            : `SELECT COUNT(DISTINCT s.sku) as cnt
               FROM store_stock s
               JOIN store_account_299 a ON a.sku = s.sku
               WHERE s.sku != '' AND s.sku IS NOT NULL
                 AND (s.revision_id = $1 OR s.store_number = $1)
                 AND (a.revision_id = $1 OR a.store_number = $1)`
          const params = isStandalone ? [] : [rev.id]
          const rows = await targetDb.select<{ cnt: number }>(query, params)
          let cnt = rows[0]?.cnt ?? 0

          // Если в store_stock нет соответствий, берем число уникальных ЛК из store_account_299
          if (cnt === 0) {
            const fallbackQuery = isStandalone
              ? `SELECT COUNT(DISTINCT sku) as cnt FROM store_account_299 WHERE sku != '' AND sku IS NOT NULL`
              : `SELECT COUNT(DISTINCT sku) as cnt FROM store_account_299 WHERE sku != '' AND sku IS NOT NULL AND (revision_id = $1 OR store_number = $1)`
            const fallbackRows = await targetDb.select<{ cnt: number }>(fallbackQuery, params)
            cnt = fallbackRows[0]?.cnt ?? 0
          }
          return cnt
        } catch (err) {
          console.warn(`[dashboardRepository] stock299SkuCount query failed for ${rev.storeNumber}:`, err)
          return 0
        }
      })()

      // 9) Основные кратности коробок на остатке магазина (кратности > 1, исключая сошедшиеся ЛК где факт == остаток)
      const p9 = (async () => {
        try {
          const query = isStandalone
            ? `SELECT m.multiplicity, COUNT(DISTINCT s.sku) as skuCount, COALESCE(SUM(s.quantity), 0) as totalStockQty
               FROM store_stock s
               JOIN store_multiplicity m ON m.sku = s.sku
               LEFT JOIN (
                 SELECT sku, COALESCE(SUM(quantity), 0) as fact_qty
                 FROM inventory_items
                 WHERE sku != '' AND sku IS NOT NULL
                 GROUP BY sku
               ) f ON f.sku = s.sku
               WHERE m.multiplicity > 1 AND s.sku != '' AND s.sku IS NOT NULL
                 AND ROUND(s.quantity, 3) != ROUND(COALESCE(f.fact_qty, 0), 3)
               GROUP BY m.multiplicity
               ORDER BY skuCount DESC, m.multiplicity ASC`
            : `SELECT m.multiplicity, COUNT(DISTINCT s.sku) as skuCount, COALESCE(SUM(s.quantity), 0) as totalStockQty
               FROM store_stock s
               JOIN store_multiplicity m ON m.sku = s.sku
               LEFT JOIN (
                 SELECT sku, COALESCE(SUM(quantity), 0) as fact_qty
                 FROM inventory_items
                 WHERE sku != '' AND sku IS NOT NULL AND (revision_id = $1 OR store_number = $1)
                 GROUP BY sku
               ) f ON f.sku = s.sku
               WHERE m.multiplicity > 1 AND s.sku != '' AND s.sku IS NOT NULL
                 AND (s.revision_id = $1 OR s.store_number = $1)
                 AND (m.revision_id = $1 OR m.store_number = $1)
                 AND ROUND(s.quantity, 3) != ROUND(COALESCE(f.fact_qty, 0), 3)
               GROUP BY m.multiplicity
               ORDER BY skuCount DESC, m.multiplicity ASC`
          const params = isStandalone ? [] : [rev.id]
          const rows = await targetDb.select<{ multiplicity: number; skuCount: number; totalStockQty: number }>(query, params)

          if (rows.length === 0) {
            // Фолбэк на таблицу кратностей, если остатки еще не загружены
            const fallbackQuery = isStandalone
              ? `SELECT multiplicity, COUNT(DISTINCT sku) as skuCount, 0 as totalStockQty
                 FROM store_multiplicity
                 WHERE multiplicity > 1 AND sku != '' AND sku IS NOT NULL
                 GROUP BY multiplicity
                 ORDER BY skuCount DESC, multiplicity ASC`
              : `SELECT multiplicity, COUNT(DISTINCT sku) as skuCount, 0 as totalStockQty
                 FROM store_multiplicity
                 WHERE multiplicity > 1 AND sku != '' AND sku IS NOT NULL
                   AND (revision_id = $1 OR store_number = $1)
                 GROUP BY multiplicity
                 ORDER BY skuCount DESC, multiplicity ASC`
            return await targetDb.select<{ multiplicity: number; skuCount: number; totalStockQty: number }>(fallbackQuery, params)
          }

          return rows
        } catch (err) {
          console.warn(`[dashboardRepository] topMultiplicities query failed for ${rev.storeNumber}:`, err)
          return []
        }
      })()

      // 10) Уникальные ЛК на остатке магазина (где quantity > 0)
      const p10 = (async () => {
        try {
          const query = isStandalone
            ? `SELECT COUNT(DISTINCT sku) as cnt FROM store_stock WHERE sku != '' AND sku IS NOT NULL AND quantity > 0`
            : `SELECT COUNT(DISTINCT sku) as cnt FROM store_stock WHERE sku != '' AND sku IS NOT NULL AND quantity > 0 AND (revision_id = $1 OR store_number = $1)`
          const params = isStandalone ? [] : [rev.id]
          const rows = await targetDb.select<{ cnt: number }>(query, params)
          let cnt = rows[0]?.cnt ?? 0
          if (cnt === 0) {
            const fallbackQuery = isStandalone
              ? `SELECT COUNT(DISTINCT sku) as cnt FROM store_stock WHERE sku != '' AND sku IS NOT NULL`
              : `SELECT COUNT(DISTINCT sku) as cnt FROM store_stock WHERE sku != '' AND sku IS NOT NULL AND (revision_id = $1 OR store_number = $1)`
            const fallbackRows = await targetDb.select<{ cnt: number }>(fallbackQuery, params)
            cnt = fallbackRows[0]?.cnt ?? 0
          }
          return cnt
        } catch (err) {
          console.warn(`[dashboardRepository] stockSkuCount query failed for ${rev.storeNumber}:`, err)
          return 0
        }
      })()

      // 11) Общая сумма остатков магазина в штуках
      const p11 = (async () => {
        try {
          const query = isStandalone
            ? `SELECT COALESCE(SUM(quantity), 0) as total FROM store_stock WHERE sku != '' AND sku IS NOT NULL`
            : `SELECT COALESCE(SUM(quantity), 0) as total FROM store_stock WHERE sku != '' AND sku IS NOT NULL AND (revision_id = $1 OR store_number = $1)`
          const params = isStandalone ? [] : [rev.id]
          const rows = await targetDb.select<{ total: number }>(query, params)
          return rows[0]?.total ?? 0
        } catch (err) {
          console.warn(`[dashboardRepository] stockTotalQuantity query failed for ${rev.storeNumber}:`, err)
          return 0
        }
      })()

      const [
        factSkuCount,
        factTotalQuantity,
        factLocationsCount,
        missingGeneralSkus,
        locations,
        generalTotalQuantity,
        fact299SkuCount,
        rawStock299SkuCount,
        topMultiplicities,
        stockSkuCount,
        stockTotalQuantity,
      ] = await Promise.all([
        p1, p2, p3, p4, p5, p6, p7, p8, p9, p10, p11
      ])

      // Корректировка: если на остатке 299 меньше, чем найдено в факте, берем максимум
      const stock299SkuCount = Math.max(rawStock299SkuCount, fact299SkuCount)
      const hall299SkuCount = Math.max(0, stock299SkuCount - fact299SkuCount)
      const hall299Percent = stock299SkuCount > 0 ? Number(((hall299SkuCount / stock299SkuCount) * 100).toFixed(1)) : 0
      const finalStockTotal = stockTotalQuantity > 0 ? stockTotalQuantity : generalTotalQuantity
      const enteredSumPercent = finalStockTotal > 0 ? Number(((factTotalQuantity / finalStockTotal) * 100).toFixed(1)) : 0

      return {
        revisionId: rev.id,
        storeNumber: rev.storeNumber,
        startDate: rev.startDate,
        endDate: rev.endDate,
        isArchived,
        factSkuCount,
        stockSkuCount,
        factTotalQuantity,
        stockTotalQuantity: finalStockTotal,
        factLocationsCount,
        missingGeneralSkuCount: missingGeneralSkus.length,
        generalTotalQuantity,
        enteredSumPercent,
        fact299SkuCount,
        stock299SkuCount,
        hall299SkuCount,
        hall299Percent,
        topMultiplicities,
        missingGeneralSkus,
        locations,
      }
    },

    /** Получить краткую статистику по всем ревизиям для сводной таблицы */
    async getAllRevisionsStatistics(revisions?: RevisionMetadata[]): Promise<RevisionStats[]> {
      const currentRevs = await this.getAllRevisions()
      const results: RevisionStats[] = []
      for (const rev of currentRevs) {
        try {
          const stats = await this.getRevisionStatistics(rev)
          results.push(stats)
        } catch (err) {
          console.error(`[dashboardRepository] Error loading stats for ${rev.id}:`, err)
        }
      }
      return results
    },
  }
}

export type DashboardRepository = ReturnType<typeof createDashboardRepository>

