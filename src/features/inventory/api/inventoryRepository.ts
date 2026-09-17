import type { DatabaseProvider } from '@shared/lib/db'
import { SqliteDatabaseProvider } from '@shared/lib/db'
import type { InventoryItem, StoreCatalogItem, StoreStockItem, StoreAccount299Item, StoreMultiplicityItem, StoreGeneralItem, Revision } from '../model/types'
import { createRevisionDir, deleteRevisionDir, getRevisionDbUri, moveRevisionToArchive, restoreRevisionFromArchive, renameRevisionDir, cleanupOrphanRevisionDirs, ensureRevisionDir } from '@shared/lib/revisionStorageService'
import { showLoading, updateLoading, hideLoading } from '@shared'

const TABLE = 'inventory_items'
const CATALOG_TABLE = 'store_catalog'
const STOCK_TABLE = 'store_stock'
const ACCOUNT_299_TABLE = 'store_account_299'
const MULTIPLICITY_TABLE = 'store_multiplicity'
const GENERAL_TABLE = 'store_general'

/** Мастер-таблица ревизий (в главной БД) — содержит реестр и путь к папке */
const CREATE_REVISIONS_TABLE_SQL = `
  CREATE TABLE IF NOT EXISTS revisions (
    id           TEXT PRIMARY KEY,
    store_number TEXT NOT NULL,
    start_date   TEXT NOT NULL,
    end_date     TEXT NOT NULL,
    is_archived  INTEGER NOT NULL DEFAULT 0,
    dir_path     TEXT NOT NULL DEFAULT '',
    created_at   TEXT NOT NULL DEFAULT (datetime('now'))
  )
`

const CREATE_ITEMS_TABLE_SQL = `
  CREATE TABLE IF NOT EXISTS ${TABLE} (
    id           TEXT PRIMARY KEY,
    revision_id  TEXT NOT NULL DEFAULT '',
    store_number TEXT NOT NULL DEFAULT '',
    name         TEXT NOT NULL,
    sku          TEXT NOT NULL,
    category     TEXT NOT NULL DEFAULT '',
    quantity     INTEGER NOT NULL DEFAULT 0,
    unit         TEXT NOT NULL DEFAULT 'шт.',
    location     TEXT NOT NULL DEFAULT '',
    box_number   TEXT NOT NULL DEFAULT '',
    status       TEXT NOT NULL DEFAULT 'ok',
    last_audit_date TEXT,
    created_at   TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at   TEXT NOT NULL DEFAULT (datetime('now'))
  )
`

const CREATE_CATALOG_TABLE_SQL = `
  CREATE TABLE IF NOT EXISTS ${CATALOG_TABLE} (
    id           TEXT PRIMARY KEY,
    revision_id  TEXT NOT NULL DEFAULT '',
    store_number TEXT NOT NULL DEFAULT '',
    sku          TEXT NOT NULL,
    name         TEXT NOT NULL,
    barcode      TEXT NOT NULL DEFAULT '',
    created_at   TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at   TEXT NOT NULL DEFAULT (datetime('now'))
  )
`

const CREATE_STOCK_TABLE_SQL = `
  CREATE TABLE IF NOT EXISTS ${STOCK_TABLE} (
    id           TEXT PRIMARY KEY,
    revision_id  TEXT NOT NULL DEFAULT '',
    store_number TEXT NOT NULL DEFAULT '',
    sku          TEXT NOT NULL,
    name         TEXT NOT NULL,
    quantity     REAL NOT NULL DEFAULT 0,
    created_at   TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at   TEXT NOT NULL DEFAULT (datetime('now'))
  )
`

const CREATE_ACCOUNT_299_TABLE_SQL = `
  CREATE TABLE IF NOT EXISTS ${ACCOUNT_299_TABLE} (
    id           TEXT PRIMARY KEY,
    revision_id  TEXT NOT NULL DEFAULT '',
    store_number TEXT NOT NULL DEFAULT '',
    sku          TEXT NOT NULL,
    name         TEXT NOT NULL,
    created_at   TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at   TEXT NOT NULL DEFAULT (datetime('now'))
  )
`

const CREATE_MULTIPLICITY_TABLE_SQL = `
  CREATE TABLE IF NOT EXISTS ${MULTIPLICITY_TABLE} (
    id           TEXT PRIMARY KEY,
    revision_id  TEXT NOT NULL DEFAULT '',
    store_number TEXT NOT NULL DEFAULT '',
    sku          TEXT NOT NULL,
    name         TEXT NOT NULL,
    multiplicity INTEGER NOT NULL DEFAULT 1,
    created_at   TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at   TEXT NOT NULL DEFAULT (datetime('now'))
  )
`

const CREATE_GENERAL_TABLE_SQL = `
  CREATE TABLE IF NOT EXISTS ${GENERAL_TABLE} (
    id           TEXT PRIMARY KEY,
    revision_id  TEXT NOT NULL DEFAULT '',
    store_number TEXT NOT NULL DEFAULT '',
    sku          TEXT NOT NULL,
    created_at   TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at   TEXT NOT NULL DEFAULT (datetime('now'))
  )
`

/**
 * Репозиторий инвентаризации — инкапсулирует все SQL-запросы этой фичи.
 *
 * Принимает абстрактный DatabaseProvider → не зависит от конкретной БД.
 */
/**
 * Кэш открытых per-revision DatabaseProvider, чтобы не открывать заново на каждый запрос.
 * Ключ — revisionId, значение — SqliteDatabaseProvider.
 */
const revisionDbCache = new Map<string, DatabaseProvider>()

/**
 * Кэш dirPath по revisionId для быстрого доступа без постоянных запросов к master DB.
 * Ключ — revisionId, значение — абсолютный путь к папке.
 */
const dirPathCache = new Map<string, string>()

/** Получить (или создать) DatabaseProvider для конкретной ревизии */
async function getRevisionDb(dirPath: string, revisionId: string): Promise<DatabaseProvider> {
  if (revisionDbCache.has(revisionId)) {
    return revisionDbCache.get(revisionId)!
  }
  if (dirPath) {
    await ensureRevisionDir(dirPath)
  }
  const uri = getRevisionDbUri(dirPath)
  const provider = new SqliteDatabaseProvider(uri)
  // Включаем WAL и оптимизации производительности для быстрых выборок и сортировок
  try {
    await provider.execute('PRAGMA journal_mode = WAL;')
    await provider.execute('PRAGMA synchronous = NORMAL;')
    await provider.execute('PRAGMA temp_store = MEMORY;')
    await provider.execute('PRAGMA busy_timeout = 15000;')
  } catch (_) {}
  // Создаём таблицы данных в per-revision БД
  await provider.execute(CREATE_ITEMS_TABLE_STANDALONE_SQL)
  await provider.execute(CREATE_CATALOG_TABLE_STANDALONE_SQL)
  await provider.execute(CREATE_STOCK_TABLE_STANDALONE_SQL)
  await provider.execute(CREATE_ACCOUNT_299_TABLE_STANDALONE_SQL)
  await provider.execute(CREATE_MULTIPLICITY_TABLE_STANDALONE_SQL)
  await provider.execute(CREATE_GENERAL_TABLE_STANDALONE_SQL)
  // Миграция: добавляем updated_at к существующим таблицам, если колонки ещё нет
  const tablesToMigrate = [TABLE, CATALOG_TABLE, STOCK_TABLE, ACCOUNT_299_TABLE, MULTIPLICITY_TABLE, GENERAL_TABLE]
  for (const tbl of tablesToMigrate) {
    try {
      const cols = await provider.select<{ name: string }>(`PRAGMA table_info(${tbl})`)
      const hasUpdatedAt = cols.some((col) => col.name === 'updated_at')
      if (!hasUpdatedAt) {
        await provider.execute(`ALTER TABLE ${tbl} ADD COLUMN updated_at TEXT NOT NULL DEFAULT ''`)
        await provider.execute(`UPDATE ${tbl} SET updated_at = created_at WHERE updated_at = '' OR updated_at IS NULL`)
      }
    } catch (_) { /* таблица может ещё не существовать */ }
  }
  // Миграция: добавляем barcode к store_catalog, если колонки ещё нет
  try {
    const catalogCols = await provider.select<{ name: string }>(`PRAGMA table_info(${CATALOG_TABLE})`)
    const hasBarcode = catalogCols.some((col) => col.name === 'barcode')
    if (!hasBarcode) {
      await provider.execute(`ALTER TABLE ${CATALOG_TABLE} ADD COLUMN barcode TEXT NOT NULL DEFAULT ''`)
    }
  } catch (_) { /* таблица может ещё не существовать */ }
  // Миграция: добавляем box_number к inventory_items, если колонки ещё нет
  try {
    const itemCols = await provider.select<{ name: string }>(`PRAGMA table_info(${TABLE})`)
    const hasBoxNumber = itemCols.some((col) => col.name === 'box_number')
    if (!hasBoxNumber) {
      await provider.execute(`ALTER TABLE ${TABLE} ADD COLUMN box_number TEXT NOT NULL DEFAULT ''`)
    }
  } catch (_) { /* таблица может ещё не существовать */ }
  // Индексы
  try {
    await provider.execute(`CREATE INDEX IF NOT EXISTS idx_catalog_sku ON ${CATALOG_TABLE} (sku)`)
    await provider.execute(`CREATE INDEX IF NOT EXISTS idx_catalog_sku_name ON ${CATALOG_TABLE} (sku, name)`)
    await provider.execute(`CREATE INDEX IF NOT EXISTS idx_catalog_barcode ON ${CATALOG_TABLE} (barcode)`)
    await provider.execute(`CREATE INDEX IF NOT EXISTS idx_items_sku ON ${TABLE} (sku)`)
    await provider.execute(`CREATE INDEX IF NOT EXISTS idx_stock_sku ON ${STOCK_TABLE} (sku)`)
    await provider.execute(`CREATE INDEX IF NOT EXISTS idx_acc299_sku ON ${ACCOUNT_299_TABLE} (sku)`)
    await provider.execute(`CREATE INDEX IF NOT EXISTS idx_mult_sku ON ${MULTIPLICITY_TABLE} (sku)`)
    await provider.execute(`CREATE INDEX IF NOT EXISTS idx_general_sku ON ${GENERAL_TABLE} (sku)`)
  } catch (err) {
    console.error('[getRevisionDb] Failed to create indexes:', err)
  }
  revisionDbCache.set(revisionId, provider)
  return provider
}

/** Сбросить кэш и закрыть пул per-revision DB для ревизии перед переименованием */
async function closeRevisionDb(revisionId: string): Promise<void> {
  const dirPath = dirPathCache.get(revisionId)
  const toClose: DatabaseProvider[] = []

  for (const [key, provider] of revisionDbCache.entries()) {
    if (key === revisionId || (dirPath && key === dirPath)) {
      toClose.push(provider)
      revisionDbCache.delete(key)
    }
  }

  for (const provider of toClose) {
    try {
      await provider.close()
    } catch (err) {
      console.warn('[closeRevisionDb] Error closing database:', err)
    }
  }

  dirPathCache.delete(revisionId)
  if (dirPath) {
    dirPathCache.delete(dirPath)
  }
}

/* ── Standalone table DDL for per-revision databases (без revision_id/store_number — они не нужны) ── */

const CREATE_ITEMS_TABLE_STANDALONE_SQL = `
  CREATE TABLE IF NOT EXISTS ${TABLE} (
    id           TEXT PRIMARY KEY,
    name         TEXT NOT NULL,
    sku          TEXT NOT NULL,
    category     TEXT NOT NULL DEFAULT '',
    quantity     INTEGER NOT NULL DEFAULT 0,
    unit         TEXT NOT NULL DEFAULT 'шт.',
    location     TEXT NOT NULL DEFAULT '',
    box_number   TEXT NOT NULL DEFAULT '',
    status       TEXT NOT NULL DEFAULT 'ok',
    last_audit_date TEXT,
    created_at   TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at   TEXT NOT NULL DEFAULT (datetime('now'))
  )
`

const CREATE_CATALOG_TABLE_STANDALONE_SQL = `
  CREATE TABLE IF NOT EXISTS ${CATALOG_TABLE} (
    id           TEXT PRIMARY KEY,
    sku          TEXT NOT NULL,
    name         TEXT NOT NULL,
    barcode      TEXT NOT NULL DEFAULT '',
    created_at   TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at   TEXT NOT NULL DEFAULT (datetime('now'))
  )
`

const CREATE_STOCK_TABLE_STANDALONE_SQL = `
  CREATE TABLE IF NOT EXISTS ${STOCK_TABLE} (
    id           TEXT PRIMARY KEY,
    sku          TEXT NOT NULL,
    name         TEXT NOT NULL,
    quantity     REAL NOT NULL DEFAULT 0,
    created_at   TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at   TEXT NOT NULL DEFAULT (datetime('now'))
  )
`

const CREATE_ACCOUNT_299_TABLE_STANDALONE_SQL = `
  CREATE TABLE IF NOT EXISTS ${ACCOUNT_299_TABLE} (
    id           TEXT PRIMARY KEY,
    sku          TEXT NOT NULL,
    name         TEXT NOT NULL,
    created_at   TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at   TEXT NOT NULL DEFAULT (datetime('now'))
  )
`

const CREATE_MULTIPLICITY_TABLE_STANDALONE_SQL = `
  CREATE TABLE IF NOT EXISTS ${MULTIPLICITY_TABLE} (
    id           TEXT PRIMARY KEY,
    sku          TEXT NOT NULL,
    name         TEXT NOT NULL,
    multiplicity INTEGER NOT NULL DEFAULT 1,
    created_at   TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at   TEXT NOT NULL DEFAULT (datetime('now'))
  )
`

const CREATE_GENERAL_TABLE_STANDALONE_SQL = `
  CREATE TABLE IF NOT EXISTS ${GENERAL_TABLE} (
    id           TEXT PRIMARY KEY,
    sku          TEXT NOT NULL,
    created_at   TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at   TEXT NOT NULL DEFAULT (datetime('now'))
  )
`

export function createInventoryRepository(db: DatabaseProvider) {
  /** Получить dirPath ревизии из кэша или из master DB (поддерживает и UUID, и store_number) */
  async function getDirPath(idOrStoreNumber: string): Promise<string> {
    if (!idOrStoreNumber) return ''
    if (dirPathCache.has(idOrStoreNumber)) {
      return dirPathCache.get(idOrStoreNumber)!
    }
    const rows = await db.select<{ id: string; store_number: string; dir_path: string }>(
      `SELECT id, store_number, dir_path FROM revisions WHERE (id = $1 OR store_number = $1) AND dir_path != '' ORDER BY is_archived ASC, start_date DESC LIMIT 1`,
      [idOrStoreNumber]
    )
    const dirPath = rows[0]?.dir_path || ''
    if (dirPath) {
      dirPathCache.set(idOrStoreNumber, dirPath)
      if (rows[0].id) dirPathCache.set(rows[0].id, dirPath)
      if (rows[0].store_number) dirPathCache.set(rows[0].store_number, dirPath)
    }
    return dirPath
  }

  /** Получить per-revision DB для ревизии (по её ID или номеру магазина) */
  async function getRevDb(revisionIdOrStoreNum: string): Promise<DatabaseProvider> {
    const dirPath = await getDirPath(revisionIdOrStoreNum)
    if (!dirPath) {
      console.warn(`[getRevDb] No dirPath found for "${revisionIdOrStoreNum}", fallback to master DB`)
      return db
    }
    return getRevisionDb(dirPath, dirPath)
  }

  return {
    /** Создать таблицы (миграция master DB) */
    async migrate(): Promise<void> {
      // 1. Проверяем структуру таблицы revisions в master DB
      try {
        const revCols = await db.select<{ name: string }>(`PRAGMA table_info(revisions)`)
        if (revCols.length > 0) {
          const hasStartDate = revCols.some((col) => col.name === 'start_date')
          const hasId = revCols.some((col) => col.name === 'id')
          if (!hasStartDate || !hasId) {
            console.log('[inventoryRepository] Migrating revisions table to new schema with dates...')
            await db.execute(`
              CREATE TABLE IF NOT EXISTS revisions_v2 (
                id           TEXT PRIMARY KEY,
                store_number TEXT NOT NULL,
                start_date   TEXT NOT NULL DEFAULT '',
                end_date     TEXT NOT NULL DEFAULT '',
                is_archived  INTEGER NOT NULL DEFAULT 0,
                dir_path     TEXT NOT NULL DEFAULT '',
                created_at   TEXT NOT NULL DEFAULT (datetime('now'))
              )
            `)
            await db.execute(`
              INSERT OR IGNORE INTO revisions_v2 (id, store_number, start_date, end_date, is_archived, created_at)
              SELECT store_number, store_number, date(created_at), date(created_at), 0, created_at FROM revisions
            `)
            await db.execute(`DROP TABLE revisions`)
            await db.execute(`ALTER TABLE revisions_v2 RENAME TO revisions`)
          } else {
            const hasIsArchived = revCols.some((col) => col.name === 'is_archived')
            if (!hasIsArchived) {
              await db.execute(`ALTER TABLE revisions ADD COLUMN is_archived INTEGER NOT NULL DEFAULT 0`)
            }
            // Добавляем dir_path если его нет
            const hasDirPath = revCols.some((col) => col.name === 'dir_path')
            if (!hasDirPath) {
              await db.execute(`ALTER TABLE revisions ADD COLUMN dir_path TEXT NOT NULL DEFAULT ''`)
            }
          }
        } else {
          await db.execute(CREATE_REVISIONS_TABLE_SQL)
        }
      } catch (err) {
        console.warn('[inventoryRepository] Error checking revisions table:', err)
        await db.execute(CREATE_REVISIONS_TABLE_SQL)
      }

      // 2. Обратная совместимость: создаём legacy-таблицы в master DB
      // (нужны для миграции старых данных в per-revision БД)
      await db.execute(CREATE_ITEMS_TABLE_SQL)
      await db.execute(CREATE_CATALOG_TABLE_SQL)
      await db.execute(CREATE_STOCK_TABLE_SQL)
      await db.execute(CREATE_ACCOUNT_299_TABLE_SQL)
      await db.execute(CREATE_MULTIPLICITY_TABLE_SQL)

      // 3. Обратная совместимость: проверяем наличие колонок revision_id и store_number
      const tablesToCheck = [TABLE, CATALOG_TABLE, STOCK_TABLE, ACCOUNT_299_TABLE, MULTIPLICITY_TABLE]
      for (const tableName of tablesToCheck) {
        try {
          const cols = await db.select<{ name: string }>(`PRAGMA table_info(${tableName})`)
          const hasRevisionId = cols.some((col) => col.name === 'revision_id')
          if (!hasRevisionId) {
            await db.execute(`ALTER TABLE ${tableName} ADD COLUMN revision_id TEXT NOT NULL DEFAULT ''`)
            await db.execute(`UPDATE ${tableName} SET revision_id = store_number WHERE revision_id = '' AND store_number != ''`)
          }
          const hasStoreNumber = cols.some((col) => col.name === 'store_number')
          if (!hasStoreNumber) {
            await db.execute(`ALTER TABLE ${tableName} ADD COLUMN store_number TEXT NOT NULL DEFAULT ''`)
          }
        } catch (err) {
          console.error(`[inventoryRepository] Migration check failed for ${tableName}:`, err)
        }
      }

      // 3.1. Проверяем наличие box_number в master DB TABLE
      try {
        const itemCols = await db.select<{ name: string }>(`PRAGMA table_info(${TABLE})`)
        const hasBoxNumber = itemCols.some((col) => col.name === 'box_number')
        if (!hasBoxNumber) {
          await db.execute(`ALTER TABLE ${TABLE} ADD COLUMN box_number TEXT NOT NULL DEFAULT ''`)
        }
      } catch (_) {}

      // 4. Миграция существующих ревизий без dir_path → создать им папки и перенести данные
      await this.migrateRevisionsToFolders()
    },

    /** Мигрировать ревизии без dir_path: создать папки и перенести данные из master DB */
    async migrateRevisionsToFolders(): Promise<void> {
      const revisionsWithoutDir = await db.select<{ id: string; store_number: string; start_date: string }>(
        `SELECT id, store_number, start_date FROM revisions WHERE dir_path = '' OR dir_path IS NULL`
      )

      if (revisionsWithoutDir.length === 0) return

      showLoading({
        title: 'Миграция базы данных',
        message: 'Перенос ревизий в изолированные папки...',
        details: 'Пожалуйста, подождите, настраивается файловая структура данных',
        icon: '⚙️',
      })

      try {
        for (let rIdx = 0; rIdx < revisionsWithoutDir.length; rIdx++) {
          const rev = revisionsWithoutDir[rIdx]
          updateLoading({
            title: 'Миграция базы данных',
            message: `Перенос данных магазина №${rev.store_number} (${rIdx + 1} из ${revisionsWithoutDir.length})...`,
            progress: Math.round((rIdx / revisionsWithoutDir.length) * 100),
          })

          try {
            console.log(`[inventoryRepository] Migrating revision ${rev.id} (store ${rev.store_number}) to folder...`)
            const dirPath = await createRevisionDir(rev.store_number, rev.start_date)
            const revDb = await getRevisionDb(dirPath, rev.id)

            // Перенос inventory_items (батчами по 100)
            const items = await db.select<any>(
              `SELECT id, name, sku, category, quantity, unit, location, status, last_audit_date, created_at, updated_at FROM ${TABLE} WHERE revision_id = $1 OR (revision_id = '' AND store_number = $1)`,
              [rev.id]
            )
            const chunkSize = 150
            for (let i = 0; i < items.length; i += chunkSize) {
              const chunk = items.slice(i, i + chunkSize)
              const placeholders: string[] = []
              const params: unknown[] = []
              chunk.forEach((item: any, idx: number) => {
                const base = idx * 11
                placeholders.push(`($${base + 1}, $${base + 2}, $${base + 3}, $${base + 4}, $${base + 5}, $${base + 6}, $${base + 7}, $${base + 8}, $${base + 9}, $${base + 10}, $${base + 11})`)
                params.push(item.id, item.name, item.sku, item.category || '', item.quantity, item.unit, item.location, item.status, item.last_audit_date, item.created_at, item.updated_at)
              })
              await revDb.execute(
                `INSERT OR IGNORE INTO ${TABLE} (id, name, sku, category, quantity, unit, location, status, last_audit_date, created_at, updated_at) VALUES ${placeholders.join(', ')}`,
                params
              )
            }

            // Перенос store_catalog (батчами по 150)
            const catalog = await db.select<any>(
              `SELECT id, sku, name, created_at FROM ${CATALOG_TABLE} WHERE revision_id = $1 OR (revision_id = '' AND store_number = $1)`,
              [rev.id]
            )
            for (let i = 0; i < catalog.length; i += chunkSize) {
              const chunk = catalog.slice(i, i + chunkSize)
              const placeholders: string[] = []
              const params: unknown[] = []
              chunk.forEach((item: any, idx: number) => {
                const base = idx * 4
                placeholders.push(`($${base + 1}, $${base + 2}, $${base + 3}, $${base + 4})`)
                params.push(item.id, item.sku, item.name, item.created_at)
              })
              await revDb.execute(
                `INSERT OR IGNORE INTO ${CATALOG_TABLE} (id, sku, name, created_at) VALUES ${placeholders.join(', ')}`,
                params
              )
            }

            // Перенос store_stock (батчами по 150)
            const stock = await db.select<any>(
              `SELECT id, sku, name, quantity, created_at FROM ${STOCK_TABLE} WHERE revision_id = $1 OR (revision_id = '' AND store_number = $1)`,
              [rev.id]
            )
            for (let i = 0; i < stock.length; i += chunkSize) {
              const chunk = stock.slice(i, i + chunkSize)
              const placeholders: string[] = []
              const params: unknown[] = []
              chunk.forEach((item: any, idx: number) => {
                const base = idx * 5
                placeholders.push(`($${base + 1}, $${base + 2}, $${base + 3}, $${base + 4}, $${base + 5})`)
                params.push(item.id, item.sku, item.name, item.quantity, item.created_at)
              })
              await revDb.execute(
                `INSERT OR IGNORE INTO ${STOCK_TABLE} (id, sku, name, quantity, created_at) VALUES ${placeholders.join(', ')}`,
                params
              )
            }

            // Перенос store_account_299 (батчами по 150)
            const acc299 = await db.select<any>(
              `SELECT id, sku, name, created_at FROM ${ACCOUNT_299_TABLE} WHERE revision_id = $1 OR (revision_id = '' AND store_number = $1)`,
              [rev.id]
            )
            for (let i = 0; i < acc299.length; i += chunkSize) {
              const chunk = acc299.slice(i, i + chunkSize)
              const placeholders: string[] = []
              const params: unknown[] = []
              chunk.forEach((item: any, idx: number) => {
                const base = idx * 4
                placeholders.push(`($${base + 1}, $${base + 2}, $${base + 3}, $${base + 4})`)
                params.push(item.id, item.sku, item.name, item.created_at)
              })
              await revDb.execute(
                `INSERT OR IGNORE INTO ${ACCOUNT_299_TABLE} (id, sku, name, created_at) VALUES ${placeholders.join(', ')}`,
                params
              )
            }

            // Обновляем dir_path в master DB
            await db.execute(`UPDATE revisions SET dir_path = $1 WHERE id = $2`, [dirPath, rev.id])
            dirPathCache.set(rev.id, dirPath)

            // Удаляем данные из master DB (уже перенесены)
            await db.execute(`DELETE FROM ${TABLE} WHERE revision_id = $1 OR store_number = $1`, [rev.id])
            await db.execute(`DELETE FROM ${CATALOG_TABLE} WHERE revision_id = $1 OR store_number = $1`, [rev.id])
            await db.execute(`DELETE FROM ${STOCK_TABLE} WHERE revision_id = $1 OR store_number = $1`, [rev.id])
            await db.execute(`DELETE FROM ${ACCOUNT_299_TABLE} WHERE revision_id = $1 OR store_number = $1`, [rev.id])

            console.log(`[inventoryRepository] Migrated revision ${rev.id} → ${dirPath}`)
          } catch (err) {
            console.error(`[inventoryRepository] Failed to migrate revision ${rev.id}:`, err)
          }
        }
      } finally {
        hideLoading()
      }
    },

    /** Получить все позиции конкретной ревизии / магазина */
    async getAll(revisionId: string): Promise<InventoryItem[]> {
      const revDb = await getRevDb(revisionId)
      const rows = await revDb.select<any>(
        `SELECT 
          id, 
          name, 
          sku, 
          category, 
          quantity, 
          unit, 
          location, 
          box_number as boxNumber,
          status, 
          last_audit_date as lastAuditDate, 
          created_at as createdAt, 
          updated_at as updatedAt 
         FROM ${TABLE} 
         ORDER BY rowid ASC`
      )
      return rows
    },

    /** Получить позицию по ID (ищет в текущей per-revision DB, нужен revisionId) */
    async getById(id: string, revisionId?: string): Promise<InventoryItem | null> {
      const targetDb = revisionId ? await getRevDb(revisionId) : db
      const rows = await targetDb.select<any>(
        `SELECT 
          id, 
          name, 
          sku, 
          category, 
          quantity, 
          unit, 
          location, 
          box_number as boxNumber,
          status, 
          last_audit_date as lastAuditDate, 
          created_at as createdAt, 
          updated_at as updatedAt 
         FROM ${TABLE} 
         WHERE id = $1`,
        [id],
      )
      return rows[0] ?? null
    },

    /** Создать новую позицию */
    async create(item: Omit<InventoryItem, 'createdAt' | 'updatedAt'> & { storeNumber: string; revisionId?: string }): Promise<void> {
      const revId = item.revisionId || item.storeNumber
      const revDb = await getRevDb(revId)
      await revDb.execute(
        `INSERT INTO ${TABLE} (id, name, sku, category, quantity, unit, location, box_number, status, last_audit_date)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
        [item.id, item.name, item.sku, item.category || '', item.quantity, item.unit, item.location, item.boxNumber || '', item.status, item.lastAuditDate],
      )
    },

    /** Пакетное создание позиций */
    async createBatch(
      revisionId: string,
      _storeNumber: string,
      items: { sku: string; name: string; quantity?: number; unit?: string; location?: string; boxNumber?: string }[],
      onProgress?: (processed: number, total: number, chunkIndex: number, totalChunks: number) => void
    ): Promise<void> {
      if (items.length === 0) return

      const revDb = await getRevDb(revisionId)
      const today = new Date().toISOString().split('T')[0]
      const chunkSize = 100
      const totalChunks = Math.ceil(items.length / chunkSize)

      for (let i = 0; i < items.length; i += chunkSize) {
        const chunk = items.slice(i, i + chunkSize)
        const chunkIndex = Math.floor(i / chunkSize) + 1
        const placeholders: string[] = []
        const params: unknown[] = []

        chunk.forEach((item, idx) => {
          const base = idx * 10
          placeholders.push(
            `($${base + 1}, $${base + 2}, $${base + 3}, $${base + 4}, $${base + 5}, $${base + 6}, $${base + 7}, $${base + 8}, $${base + 9}, $${base + 10})`
          )
          const id = crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).substring(2, 11)
          params.push(
            id,
            item.name,
            item.sku,
            '',
            item.quantity ?? 0,
            item.unit ?? 'шт.',
            item.location ?? '',
            item.boxNumber ?? '',
            'ok',
            today
          )
        })

        const query = `INSERT INTO ${TABLE} (id, name, sku, category, quantity, unit, location, box_number, status, last_audit_date) VALUES ${placeholders.join(', ')}`
        await revDb.execute(query, params)

        const processed = Math.min(items.length, i + chunk.length)
        onProgress?.(processed, items.length, chunkIndex, totalChunks)
      }
    },

    /** Обновить позицию */
    async update(id: string, item: Omit<InventoryItem, 'id' | 'createdAt' | 'updatedAt'>, revisionId?: string): Promise<void> {
      const targetDb = revisionId ? await getRevDb(revisionId) : db
      await targetDb.execute(
        `UPDATE ${TABLE} SET name = $1, sku = $2, category = $3, quantity = $4, unit = $5, location = $6, box_number = $7, status = $8, last_audit_date = $9, updated_at = datetime('now') WHERE id = $10`,
        [item.name, item.sku, item.category, item.quantity, item.unit, item.location, item.boxNumber || '', item.status, item.lastAuditDate, id],
      )
    },

    /** Удалить позицию */
    async remove(id: string, revisionId?: string): Promise<void> {
      const targetDb = revisionId ? await getRevDb(revisionId) : db
      await targetDb.execute(`DELETE FROM ${TABLE} WHERE id = $1`, [id])
    },

    /** Удалить несколько позиций */
    async removeBatch(ids: string[], revisionId?: string): Promise<void> {
      if (ids.length === 0) return
      const targetDb = revisionId ? await getRevDb(revisionId) : db
      const chunkSize = 200

      for (let i = 0; i < ids.length; i += chunkSize) {
        const chunk = ids.slice(i, i + chunkSize)
        const placeholders = chunk.map((_, idx) => `$${idx + 1}`).join(', ')
        await targetDb.execute(`DELETE FROM ${TABLE} WHERE id IN (${placeholders})`, chunk)
      }
    },

    /** Очистить все позиции фактической ревизии */
    async clearFact(revisionId: string): Promise<void> {
      const revDb = await getRevDb(revisionId)
      await revDb.execute(`DELETE FROM ${TABLE}`)
      try {
        await revDb.execute(`DELETE FROM mobile_tasks`)
        await revDb.execute(`DELETE FROM mobile_task_items`)
      } catch (_) {}
    },

    /** Пакетное обновление количества для существующих позиций */
    async updateQuantitiesBatch(updates: { id: string; quantity: number }[], revisionId?: string): Promise<void> {
      if (updates.length === 0) return
      const targetDb = revisionId ? await getRevDb(revisionId) : db
      const chunkSize = 80
      for (let i = 0; i < updates.length; i += chunkSize) {
        const chunk = updates.slice(i, i + chunkSize)
        const whenClauses: string[] = []
        const params: unknown[] = []
        const ids: string[] = []

        chunk.forEach((item, idx) => {
          const idParam = idx * 2 + 1
          const qtyParam = idx * 2 + 2
          whenClauses.push(`WHEN id = $${idParam} THEN $${qtyParam}`)
          params.push(item.id, item.quantity)
          ids.push(item.id)
        })

        const idPlaceholders = ids.map((_, idx) => `$${chunk.length * 2 + idx + 1}`).join(', ')
        const allParams = [...params, ...ids]

        const query = `UPDATE ${TABLE} SET quantity = CASE ${whenClauses.join(' ')} ELSE quantity END, updated_at = datetime('now') WHERE id IN (${idPlaceholders})`
        await targetDb.execute(query, allParams)
      }
    },

    /** Пакетное обновление локаций для существующих позиций */
    async updateLocationsBatch(updates: { id: string; location: string }[], revisionId?: string): Promise<void> {
      if (updates.length === 0) return
      const targetDb = revisionId ? await getRevDb(revisionId) : db
      const chunkSize = 80
      for (let i = 0; i < updates.length; i += chunkSize) {
        const chunk = updates.slice(i, i + chunkSize)
        const whenClauses: string[] = []
        const params: unknown[] = []
        const ids: string[] = []

        chunk.forEach((item, idx) => {
          const idParam = idx * 2 + 1
          const locParam = idx * 2 + 2
          whenClauses.push(`WHEN id = $${idParam} THEN $${locParam}`)
          params.push(item.id, item.location)
          ids.push(item.id)
        })

        const idPlaceholders = ids.map((_, idx) => `$${chunk.length * 2 + idx + 1}`).join(', ')
        const allParams = [...params, ...ids]

        const query = `UPDATE ${TABLE} SET location = CASE ${whenClauses.join(' ')} ELSE location END, updated_at = datetime('now') WHERE id IN (${idPlaceholders})`
        await targetDb.execute(query, allParams)
      }
    },

    /** Пакетное обновление номеров коробок для существующих позиций */
    async updateBoxNumbersBatch(updates: { id: string; boxNumber: string }[], revisionId?: string): Promise<void> {
      if (updates.length === 0) return
      const targetDb = revisionId ? await getRevDb(revisionId) : db
      const chunkSize = 80
      for (let i = 0; i < updates.length; i += chunkSize) {
        const chunk = updates.slice(i, i + chunkSize)
        const whenClauses: string[] = []
        const params: unknown[] = []
        const ids: string[] = []

        chunk.forEach((item, idx) => {
          const idParam = idx * 2 + 1
          const boxParam = idx * 2 + 2
          whenClauses.push(`WHEN id = $${idParam} THEN $${boxParam}`)
          params.push(item.id, item.boxNumber)
          ids.push(item.id)
        })

        const idPlaceholders = ids.map((_, idx) => `$${chunk.length * 2 + idx + 1}`).join(', ')
        const allParams = [...params, ...ids]

        const query = `UPDATE ${TABLE} SET box_number = CASE ${whenClauses.join(' ')} ELSE box_number END, updated_at = datetime('now') WHERE id IN (${idPlaceholders})`
        await targetDb.execute(query, allParams)
      }
    },

    /** Пакетное сохранение позиций ревизии с опцией полной замены */
    async saveFactBatch(
      revisionId: string,
      storeNumber: string,
      items: { sku: string; name: string; quantity?: number; unit?: string; location?: string; boxNumber?: string }[],
      replaceAll: boolean,
      onProgress?: (processed: number, total: number, chunkIndex: number, totalChunks: number) => void
    ): Promise<void> {
      if (replaceAll) {
        const revDb = await getRevDb(revisionId)
        await revDb.execute(`DELETE FROM ${TABLE}`)
        try {
          await revDb.execute(`DELETE FROM mobile_tasks`)
          await revDb.execute(`DELETE FROM mobile_task_items`)
        } catch (_) {}
      }
      if (items.length > 0) {
        await this.createBatch(revisionId, storeNumber, items, onProgress)
      }
    },

    /** Получить количество позиций конкретной ревизии */
    async count(revisionId: string): Promise<number> {
      const revDb = await getRevDb(revisionId)
      const rows = await revDb.select<{ cnt: number }>(`SELECT COUNT(*) as cnt FROM ${TABLE}`)
      return rows[0]?.cnt ?? 0
    },

    /** Создать ревизию магазина с датами проведения + создать папку на диске */
    async createRevision(data: { id?: string; storeNumber: string; startDate: string; endDate: string; isArchived?: boolean }): Promise<string> {
      const id = data.id || (crypto.randomUUID ? crypto.randomUUID() : `rev_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`)

      // Создаём папку ревизии на диске
      const dirPath = await createRevisionDir(data.storeNumber, data.startDate, data.endDate)

      await db.execute(
        `INSERT INTO revisions (id, store_number, start_date, end_date, is_archived, dir_path) VALUES ($1, $2, $3, $4, $5, $6)`,
        [id, data.storeNumber, data.startDate, data.endDate, data.isArchived ? 1 : 0, dirPath]
      )

      // Кэшируем dirPath
      dirPathCache.set(id, dirPath)

      // Инициализируем per-revision DB (создаёт таблицы)
      await getRevisionDb(dirPath, id)

      return id
    },

    /** Получить все ревизии */
    async getAllRevisions(): Promise<Revision[]> {
      const rows = await db.select<any>(
        `SELECT id, store_number as storeNumber, start_date as startDate, end_date as endDate, is_archived as isArchived, dir_path as dirPath, created_at as createdAt FROM revisions ORDER BY start_date DESC, created_at DESC`
      )

      return rows.map((r: any) => {
        // Кэшируем dirPath при загрузке (по id и по storeNumber для активных)
        if (r.dirPath) {
          dirPathCache.set(r.id, r.dirPath)
          if (!r.isArchived) {
            dirPathCache.set(r.storeNumber, r.dirPath)
          }
        }
        return {
          ...r,
          isArchived: Boolean(r.isArchived),
        }
      })
    },

    /** Переключить статус архивации ревизии (с физическим перемещением папки на диске) */
    async setRevisionArchived(revisionId: string, isArchived: boolean): Promise<void> {
      const currentDirPath = await getDirPath(revisionId)
      let newDirPath = currentDirPath

      if (currentDirPath) {
        updateLoading({
          title: isArchived ? 'Архивация ревизии' : 'Восстановление ревизии',
          message: isArchived ? 'Перемещение папки ревизии в архив на диске...' : 'Возврат папки ревизии из архива...',
          details: 'Файлы изолируются в защищённой папке архива',
          icon: isArchived ? '🗄️' : '↩️',
        })
        // Закрываем соединение перед перемещением папки
        await closeRevisionDb(revisionId)
        try {
          if (isArchived) {
            newDirPath = await moveRevisionToArchive(currentDirPath)
          } else {
            newDirPath = await restoreRevisionFromArchive(currentDirPath)
          }
          dirPathCache.set(revisionId, newDirPath)
        } catch (err) {
          console.error(`[inventoryRepository] Failed to move revision folder to/from archive:`, err)
        }
      }

      await db.execute(
        `UPDATE revisions SET is_archived = $1, dir_path = $2 WHERE id = $3 OR store_number = $3`,
        [isArchived ? 1 : 0, newDirPath, revisionId]
      )
    },

    /** Обновить даты проведения ревизии (с автоматическим переименованием папки на диске) */
    async updateRevisionDates(revisionId: string, startDate: string, endDate: string): Promise<void> {
      const rows = await db.select<{ id: string; store_number: string; dir_path: string }>(
        `SELECT id, store_number, dir_path FROM revisions WHERE id = $1 OR store_number = $1 LIMIT 1`,
        [revisionId]
      )

      let newDirPath = rows[0]?.dir_path || ''
      const storeNum = rows[0]?.store_number || revisionId

      if (newDirPath) {
        updateLoading({
          title: 'Переименование ревизии',
          message: 'Переименование папки ревизии на диске под новые даты...',
          details: `Магазин №${storeNum}: ${startDate} — ${endDate}`,
          icon: '📁',
        })
        // Закрываем соединение к per-revision DB перед переименованием папки
        await closeRevisionDb(revisionId)
        try {
          newDirPath = await renameRevisionDir(newDirPath, storeNum, startDate, endDate)
          dirPathCache.set(revisionId, newDirPath)
        } catch (err) {
          console.error('[inventoryRepository] Failed to rename revision folder on disk:', err)
        }
      }

      updateLoading({
        title: 'Обновление реестра',
        message: 'Сохранение новых дат и пути в базе данных...',
        icon: '💾',
      })

      await db.execute(
        `UPDATE revisions SET start_date = $1, end_date = $2, dir_path = $3 WHERE id = $4 OR store_number = $4`,
        [startDate, endDate, newDirPath, revisionId]
      )
    },

    /** Удалить ревизию и связанные товары, каталог, остатки и счет 299 + удалить папку */
    async deleteRevision(revisionId: string): Promise<void> {
      // Получаем dirPath до удаления записи
      const dirPath = await getDirPath(revisionId)

      // Закрываем per-revision DB
      await closeRevisionDb(revisionId)

      // Удаляем запись из master DB
      await db.execute(`DELETE FROM revisions WHERE id = $1 OR store_number = $1`, [revisionId])

      // Удаляем папку ревизии (содержит revision.db и все данные)
      if (dirPath) {
        try {
          await deleteRevisionDir(dirPath)
        } catch (err) {
          console.error(`[inventoryRepository] Failed to delete revision dir ${dirPath}:`, err)
        }
        dirPathCache.delete(revisionId)
      } else {
        // Fallback: удаляем данные из master DB (для старых ревизий без папки)
        await db.execute(`DELETE FROM ${TABLE} WHERE revision_id = $1 OR store_number = $1`, [revisionId])
        await db.execute(`DELETE FROM ${CATALOG_TABLE} WHERE revision_id = $1 OR store_number = $1`, [revisionId])
        await db.execute(`DELETE FROM ${STOCK_TABLE} WHERE revision_id = $1 OR store_number = $1`, [revisionId])
        await db.execute(`DELETE FROM ${ACCOUNT_299_TABLE} WHERE revision_id = $1 OR store_number = $1`, [revisionId])
        await db.execute(`DELETE FROM ${MULTIPLICITY_TABLE} WHERE revision_id = $1 OR store_number = $1`, [revisionId])
      }
    },

    /* --- CATALOG METHODS (Товары магазина) --- */

    async getCatalog(revisionId: string): Promise<StoreCatalogItem[]> {
      const revDb = await getRevDb(revisionId)
      const rows = await revDb.select<any>(
        `SELECT id, sku, name, barcode, created_at as createdAt, updated_at as updatedAt
         FROM ${CATALOG_TABLE}
         ORDER BY rowid ASC`
      )
      return rows.map((r: any) => ({ ...r, barcode: r.barcode || '' }))
    },

    async saveCatalogBatch(
      revisionId: string,
      _storeNumber: string,
      items: { sku: string; name: string; barcode?: string }[],
      replaceAll: boolean,
      onProgress?: (processed: number, total: number, chunkIndex: number, totalChunks: number) => void
    ): Promise<void> {
      const revDb = await getRevDb(revisionId)
      if (replaceAll) {
        await revDb.execute(`DELETE FROM ${CATALOG_TABLE}`)
      }
      if (items.length > 0) {
        // Временно удаляем индексы каталога на время массовой вставки (ускоряет запись в разы)
        try {
          await revDb.execute(`DROP INDEX IF EXISTS idx_catalog_sku`)
          await revDb.execute(`DROP INDEX IF EXISTS idx_catalog_sku_name`)
          await revDb.execute(`DROP INDEX IF EXISTS idx_catalog_barcode`)
        } catch (_) {}

        const chunkSize = 200
        const totalChunks = Math.ceil(items.length / chunkSize)
        for (let i = 0; i < items.length; i += chunkSize) {
          const chunk = items.slice(i, i + chunkSize)
          const chunkIndex = Math.floor(i / chunkSize) + 1
          const placeholders: string[] = []
          const params: unknown[] = []

          chunk.forEach((item, idx) => {
            const base = idx * 4
            placeholders.push(`($${base + 1}, $${base + 2}, $${base + 3}, $${base + 4})`)
            const id = crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).substring(2, 11)
            params.push(id, item.sku, item.name, item.barcode || '')
          })

          const query = `INSERT INTO ${CATALOG_TABLE} (id, sku, name, barcode) VALUES ${placeholders.join(', ')}`
          await revDb.execute(query, params)

          const processed = Math.min(items.length, i + chunk.length)
          onProgress?.(processed, items.length, chunkIndex, totalChunks)
        }

        // Пересоздаем индексы после завершения вставки
        try {
          await revDb.execute(`CREATE INDEX IF NOT EXISTS idx_catalog_sku ON ${CATALOG_TABLE} (sku)`)
          await revDb.execute(`CREATE INDEX IF NOT EXISTS idx_catalog_sku_name ON ${CATALOG_TABLE} (sku, name)`)
          await revDb.execute(`CREATE INDEX IF NOT EXISTS idx_catalog_barcode ON ${CATALOG_TABLE} (barcode)`)
        } catch (err) {
          console.error('[saveCatalogBatch] Error recreating indexes:', err)
        }
      }
    },

    async addCatalogItem(item: { revisionId?: string; storeNumber: string; sku: string; name: string; barcode?: string }): Promise<StoreCatalogItem> {
      const id = crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).substring(2, 11)
      const revId = item.revisionId || item.storeNumber
      const revDb = await getRevDb(revId)
      const now = new Date().toISOString()
      await revDb.execute(
        `INSERT INTO ${CATALOG_TABLE} (id, sku, name, barcode, created_at, updated_at) VALUES ($1, $2, $3, $4, $5, $6)`,
        [id, item.sku, item.name, item.barcode || '', now, now]
      )
      return {
        id,
        storeNumber: item.storeNumber || '',
        sku: item.sku,
        name: item.name,
        barcode: item.barcode || '',
        createdAt: now,
        updatedAt: now,
      }
    },

    /** Быстрая точечная синхронизация имени одного артикула в таблицах 299, факта и остатков */
    async syncSingleSkuFromCatalog(revisionId: string, sku: string, name: string): Promise<void> {
      const revDb = await getRevDb(revisionId)
      await revDb.execute(
        `UPDATE ${ACCOUNT_299_TABLE} SET name = $1, updated_at = datetime('now') WHERE sku = $2 AND name != $1`,
        [name, sku]
      )
      await revDb.execute(
        `UPDATE ${TABLE} SET name = $1, updated_at = datetime('now') WHERE sku = $2 AND name != $1`,
        [name, sku]
      )
      await revDb.execute(
        `UPDATE ${STOCK_TABLE} SET name = $1, updated_at = datetime('now') WHERE sku = $2 AND name != $1`,
        [name, sku]
      )
    },

    async updateCatalogItem(item: { id: string; sku: string; name: string; barcode?: string }, revisionId?: string): Promise<void> {
      const sku = (item.sku || '').trim()
      const name = (item.name || '').trim() || (sku ? `Товар ${sku}` : 'Товар')
      const barcode = (item.barcode || '').trim()
      const targetDb = revisionId ? await getRevDb(revisionId) : db
      await targetDb.execute(
        `UPDATE ${CATALOG_TABLE} SET sku = $1, name = $2, barcode = $3, updated_at = datetime('now') WHERE id = $4`,
        [sku, name, barcode, item.id]
      )
    },

    async deleteCatalogItem(id: string, revisionId?: string): Promise<void> {
      const targetDb = revisionId ? await getRevDb(revisionId) : db
      await targetDb.execute(`DELETE FROM ${CATALOG_TABLE} WHERE id = $1`, [id])
    },

    async deleteCatalogBatch(ids: string[], revisionId?: string): Promise<void> {
      if (ids.length === 0) return
      const targetDb = revisionId ? await getRevDb(revisionId) : db
      const chunkSize = 500

      for (let i = 0; i < ids.length; i += chunkSize) {
        const chunk = ids.slice(i, i + chunkSize)
        const placeholders = chunk.map((_, idx) => `$${idx + 1}`).join(', ')
        await targetDb.execute(`DELETE FROM ${CATALOG_TABLE} WHERE id IN (${placeholders})`, chunk)
      }
    },

    async clearCatalog(revisionId: string): Promise<void> {
      const revDb = await getRevDb(revisionId)
      await revDb.execute(`DELETE FROM ${CATALOG_TABLE}`)
    },

    /* --- STOCK METHODS (Системные остатки) --- */

    async getStock(revisionId: string): Promise<StoreStockItem[]> {
      const revDb = await getRevDb(revisionId)
      const rows = await revDb.select<any>(
        `SELECT id, sku, name, quantity, created_at as createdAt, updated_at as updatedAt
         FROM ${STOCK_TABLE}
         ORDER BY rowid ASC`
      )
      return rows
    },

    async saveStockBatch(
      revisionId: string,
      _storeNumber: string,
      items: { sku: string; name: string; quantity: number }[],
      replaceAll: boolean,
      onProgress?: (processed: number, total: number, chunkIndex: number, totalChunks: number) => void
    ): Promise<void> {
      const revDb = await getRevDb(revisionId)
      if (replaceAll) {
        await revDb.execute(`DELETE FROM ${STOCK_TABLE}`)
      }
      if (items.length > 0) {
        const chunkSize = 200
        const totalChunks = Math.ceil(items.length / chunkSize)
        for (let i = 0; i < items.length; i += chunkSize) {
          const chunk = items.slice(i, i + chunkSize)
          const chunkIndex = Math.floor(i / chunkSize) + 1
          const placeholders: string[] = []
          const params: unknown[] = []

          chunk.forEach((item, idx) => {
            const base = idx * 4
            placeholders.push(`($${base + 1}, $${base + 2}, $${base + 3}, $${base + 4})`)
            const id = crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).substring(2, 11)
            const sku = (item.sku || '').trim()
            const name = (item.name || '').trim() || (sku ? `Товар ${sku}` : 'Товар')
            const qty = typeof item.quantity === 'number' && !isNaN(item.quantity) ? item.quantity : 0
            params.push(id, sku, name, qty)
          })

          const query = `INSERT INTO ${STOCK_TABLE} (id, sku, name, quantity) VALUES ${placeholders.join(', ')}`
          await revDb.execute(query, params)

          const processed = Math.min(items.length, i + chunk.length)
          onProgress?.(processed, items.length, chunkIndex, totalChunks)
        }
      }
    },

    async addStockItem(item: { revisionId?: string; storeNumber: string; sku: string; name: string; quantity: number }): Promise<void> {
      const id = crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).substring(2, 11)
      const revId = item.revisionId || item.storeNumber
      const revDb = await getRevDb(revId)
      const sku = (item.sku || '').trim()
      const name = (item.name || '').trim() || (sku ? `Товар ${sku}` : 'Товар')
      const qty = typeof item.quantity === 'number' && !isNaN(item.quantity) ? item.quantity : 0
      await revDb.execute(
        `INSERT INTO ${STOCK_TABLE} (id, sku, name, quantity) VALUES ($1, $2, $3, $4)`,
        [id, sku, name, qty]
      )
    },

    async updateStockItem(item: { id: string; sku: string; name: string; quantity: number }, revisionId?: string): Promise<void> {
      const sku = (item.sku || '').trim()
      const name = (item.name || '').trim() || (sku ? `Товар ${sku}` : 'Товар')
      const qty = typeof item.quantity === 'number' && !isNaN(item.quantity) ? item.quantity : 0
      const targetDb = revisionId ? await getRevDb(revisionId) : db
      await targetDb.execute(
        `UPDATE ${STOCK_TABLE} SET sku = $1, name = $2, quantity = $3, updated_at = datetime('now') WHERE id = $4`,
        [sku, name, qty, item.id]
      )
    },

    async deleteStockItem(id: string, revisionId?: string): Promise<void> {
      const targetDb = revisionId ? await getRevDb(revisionId) : db
      await targetDb.execute(`DELETE FROM ${STOCK_TABLE} WHERE id = $1`, [id])
    },

    async deleteStockBatch(ids: string[], revisionId?: string): Promise<void> {
      if (ids.length === 0) return
      const targetDb = revisionId ? await getRevDb(revisionId) : db
      const chunkSize = 500

      for (let i = 0; i < ids.length; i += chunkSize) {
        const chunk = ids.slice(i, i + chunkSize)
        const placeholders = chunk.map((_, idx) => `$${idx + 1}`).join(', ')
        await targetDb.execute(`DELETE FROM ${STOCK_TABLE} WHERE id IN (${placeholders})`, chunk)
      }
    },

    async clearStock(revisionId: string): Promise<void> {
      const revDb = await getRevDb(revisionId)
      await revDb.execute(`DELETE FROM ${STOCK_TABLE}`)
    },

    async deduplicateStock(revisionId: string): Promise<void> {
      const revDb = await getRevDb(revisionId)
      await revDb.execute(
        `DELETE FROM ${STOCK_TABLE} WHERE rowid NOT IN (
           SELECT MIN(rowid) FROM ${STOCK_TABLE} GROUP BY LOWER(TRIM(sku))
         )`
      )
    },

    /* --- ACCOUNT 299 METHODS (Счет 299) --- */

    async getAccount299(revisionId: string): Promise<StoreAccount299Item[]> {
      const revDb = await getRevDb(revisionId)
      const rows = await revDb.select<any>(
        `SELECT id, sku, name, created_at as createdAt, updated_at as updatedAt
         FROM ${ACCOUNT_299_TABLE}
         ORDER BY rowid ASC`
      )
      return rows
    },

    async saveAccount299Batch(
      revisionId: string,
      _storeNumber: string,
      items: { sku: string; name: string }[],
      replaceAll: boolean,
      onProgress?: (processed: number, total: number, chunkIndex: number, totalChunks: number) => void
    ): Promise<void> {
      const revDb = await getRevDb(revisionId)
      if (replaceAll) {
        await revDb.execute(`DELETE FROM ${ACCOUNT_299_TABLE}`)
      }
      if (items.length > 0) {
        const chunkSize = 200
        const totalChunks = Math.ceil(items.length / chunkSize)
        for (let i = 0; i < items.length; i += chunkSize) {
          const chunk = items.slice(i, i + chunkSize)
          const chunkIndex = Math.floor(i / chunkSize) + 1
          const placeholders: string[] = []
          const params: unknown[] = []

          chunk.forEach((item, idx) => {
            const base = idx * 3
            placeholders.push(`($${base + 1}, $${base + 2}, $${base + 3})`)
            const id = crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).substring(2, 11)
            const sku = (item.sku || '').trim()
            const name = (item.name || '').trim() || (sku ? `Товар ${sku}` : 'Товар')
            params.push(id, sku, name)
          })

          const query = `INSERT INTO ${ACCOUNT_299_TABLE} (id, sku, name) VALUES ${placeholders.join(', ')}`
          await revDb.execute(query, params)

          const processed = Math.min(items.length, i + chunk.length)
          onProgress?.(processed, items.length, chunkIndex, totalChunks)
        }
      }
    },

    async addAccount299Item(item: { revisionId?: string; storeNumber: string; sku: string; name: string }): Promise<void> {
      const id = crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).substring(2, 11)
      const revId = item.revisionId || item.storeNumber
      const revDb = await getRevDb(revId)
      const sku = (item.sku || '').trim()
      const name = (item.name || '').trim() || (sku ? `Товар ${sku}` : 'Товар')
      await revDb.execute(
        `INSERT INTO ${ACCOUNT_299_TABLE} (id, sku, name) VALUES ($1, $2, $3)`,
        [id, sku, name]
      )
    },

    async updateAccount299Item(item: { id: string; sku: string; name: string }, revisionId?: string): Promise<void> {
      const sku = (item.sku || '').trim()
      const name = (item.name || '').trim() || (sku ? `Товар ${sku}` : 'Товар')
      const targetDb = revisionId ? await getRevDb(revisionId) : db
      await targetDb.execute(
        `UPDATE ${ACCOUNT_299_TABLE} SET sku = $1, name = $2, updated_at = datetime('now') WHERE id = $3`,
        [sku, name, item.id]
      )
    },

    async deleteAccount299Item(id: string, revisionId?: string): Promise<void> {
      const targetDb = revisionId ? await getRevDb(revisionId) : db
      await targetDb.execute(`DELETE FROM ${ACCOUNT_299_TABLE} WHERE id = $1`, [id])
    },

    async deleteAccount299Batch(ids: string[], revisionId?: string): Promise<void> {
      if (ids.length === 0) return
      const targetDb = revisionId ? await getRevDb(revisionId) : db
      const chunkSize = 500

      for (let i = 0; i < ids.length; i += chunkSize) {
        const chunk = ids.slice(i, i + chunkSize)
        const placeholders = chunk.map((_, idx) => `$${idx + 1}`).join(', ')
        await targetDb.execute(`DELETE FROM ${ACCOUNT_299_TABLE} WHERE id IN (${placeholders})`, chunk)
      }
    },

    async clearAccount299(revisionId: string): Promise<void> {
      const revDb = await getRevDb(revisionId)
      await revDb.execute(`DELETE FROM ${ACCOUNT_299_TABLE}`)
    },

    /* --- MULTIPLICITY METHODS (Кратность) --- */

    async getMultiplicity(revisionId: string): Promise<StoreMultiplicityItem[]> {
      const revDb = await getRevDb(revisionId)
      const rows = await revDb.select<any>(
        `SELECT id, sku, name, multiplicity, created_at as createdAt, updated_at as updatedAt
         FROM ${MULTIPLICITY_TABLE}
         ORDER BY rowid ASC`
      )
      return rows
    },

    async addMultiplicityItem(item: { revisionId?: string; storeNumber: string; sku: string; name: string; multiplicity: number }): Promise<void> {
      const id = crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).substring(2, 11)
      const revId = item.revisionId || item.storeNumber
      const revDb = await getRevDb(revId)
      const sku = (item.sku || '').trim()
      const name = (item.name || '').trim() || (sku ? `Товар ${sku}` : 'Товар')
      const multiplicity = item.multiplicity || 1
      await revDb.execute(
        `INSERT INTO ${MULTIPLICITY_TABLE} (id, sku, name, multiplicity) VALUES ($1, $2, $3, $4)`,
        [id, sku, name, multiplicity]
      )
    },

    async addMultiplicityBatch(
      items: { sku: string; name?: string; multiplicity?: number }[],
      revisionId: string,
      onProgress?: (processed: number, total: number, currentSku?: string) => void
    ): Promise<void> {
      if (items.length === 0) return
      const revDb = await getRevDb(revisionId)
      const chunkSize = 200

      for (let i = 0; i < items.length; i += chunkSize) {
        const chunk = items.slice(i, i + chunkSize)
        const placeholders: string[] = []
        const params: unknown[] = []

        chunk.forEach((item, idx) => {
          const base = idx * 4
          placeholders.push(`($${base + 1}, $${base + 2}, $${base + 3}, $${base + 4})`)
          const id = crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).substring(2, 11)
          const sku = (item.sku || '').trim()
          const name = (item.name || '').trim() || (sku ? `Товар ${sku}` : 'Товар')
          const multiplicity = item.multiplicity && item.multiplicity > 0 ? item.multiplicity : 1
          params.push(id, sku, name, multiplicity)
        })

        const query = `INSERT INTO ${MULTIPLICITY_TABLE} (id, sku, name, multiplicity) VALUES ${placeholders.join(', ')}`
        await revDb.execute(query, params)

        if (onProgress) {
          const currentCount = Math.min(i + chunk.length, items.length)
          const lastSku = chunk[chunk.length - 1]?.sku
          onProgress(currentCount, items.length, lastSku)
        }
      }
    },

    async updateMultiplicityItem(item: { id: string; sku: string; name: string; multiplicity: number }, revisionId?: string): Promise<void> {
      const sku = (item.sku || '').trim()
      const name = (item.name || '').trim() || (sku ? `Товар ${sku}` : 'Товар')
      const multiplicity = item.multiplicity || 1
      const targetDb = revisionId ? await getRevDb(revisionId) : db
      await targetDb.execute(
        `UPDATE ${MULTIPLICITY_TABLE} SET sku = $1, name = $2, multiplicity = $3, updated_at = datetime('now') WHERE id = $4`,
        [sku, name, multiplicity, item.id]
      )
    },

    async deleteMultiplicityItem(id: string, revisionId?: string): Promise<void> {
      const targetDb = revisionId ? await getRevDb(revisionId) : db
      await targetDb.execute(`DELETE FROM ${MULTIPLICITY_TABLE} WHERE id = $1`, [id])
    },

    async deleteMultiplicityBatch(ids: string[], revisionId?: string): Promise<void> {
      if (ids.length === 0) return
      const targetDb = revisionId ? await getRevDb(revisionId) : db
      const chunkSize = 500

      for (let i = 0; i < ids.length; i += chunkSize) {
        const chunk = ids.slice(i, i + chunkSize)
        const placeholders = chunk.map((_, idx) => `$${idx + 1}`).join(', ')
        await targetDb.execute(`DELETE FROM ${MULTIPLICITY_TABLE} WHERE id IN (${placeholders})`, chunk)
      }
    },

    async clearMultiplicity(revisionId: string): Promise<void> {
      const revDb = await getRevDb(revisionId)
      await revDb.execute(`DELETE FROM ${MULTIPLICITY_TABLE}`)
    },

    /* --- GENERAL (ОБЩЕЕ) METHODS --- */

    async getGeneral(revisionIdOrStoreNumber: string): Promise<StoreGeneralItem[]> {
      const revDb = await getRevDb(revisionIdOrStoreNumber)
      const rows = await revDb.select<{
        id: string
        sku: string
        created_at: string
        updated_at: string
      }>(
        `SELECT id, sku, created_at, COALESCE(NULLIF(updated_at, ''), created_at) as updated_at FROM ${GENERAL_TABLE} ORDER BY rowid ASC`
      )
      return rows.map((r) => ({
        id: r.id,
        sku: r.sku,
        createdAt: r.created_at,
        updatedAt: r.updated_at,
      }))
    },

    async addGeneralItem(item: { sku: string; revisionId: string; storeNumber: string }): Promise<StoreGeneralItem> {
      const revDb = await getRevDb(item.revisionId)
      const id = crypto.randomUUID()
      const now = new Date().toISOString()
      await revDb.execute(
        `INSERT INTO ${GENERAL_TABLE} (id, sku, created_at, updated_at)
         VALUES ($1, $2, $3, $3)`,
        [id, item.sku.trim(), now]
      )
      return {
        id,
        sku: item.sku.trim(),
        createdAt: now,
        updatedAt: now,
      }
    },

    async addGeneralBatch(
      items: { sku: string }[],
      revisionId: string,
      storeNumber: string,
      onProgress?: (processed: number, total: number, currentSku?: string) => void
    ): Promise<number> {
      if (items.length === 0) return 0
      const revDb = await getRevDb(revisionId)
      const CHUNK_SIZE = 150
      let totalInserted = 0
      const total = items.length
      const now = new Date().toISOString()

      try {
        for (let i = 0; i < items.length; i += CHUNK_SIZE) {
          const chunk = items.slice(i, i + CHUNK_SIZE)
          const placeholders: string[] = []
          const params: unknown[] = []

          chunk.forEach((item, idx) => {
            const base = idx * 4
            placeholders.push(`($${base + 1}, $${base + 2}, $${base + 3}, $${base + 4})`)
            const id = crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).substring(2, 11)
            params.push(id, item.sku.trim(), now, now)
          })

          await revDb.execute(
            `INSERT INTO ${GENERAL_TABLE} (id, sku, created_at, updated_at)
             VALUES ${placeholders.join(', ')}`,
            params
          )

          totalInserted += chunk.length
          if (onProgress) {
            const lastSku = chunk[chunk.length - 1]?.sku
            onProgress(totalInserted, total, lastSku)
          }
        }
      } catch (err) {
        console.error('[addGeneralBatch] Error:', err)
        throw err
      }
      return totalInserted
    },

    async updateGeneralItemSku(id: string, newSku: string, revisionId: string): Promise<void> {
      const revDb = await getRevDb(revisionId)
      await revDb.execute(
        `UPDATE ${GENERAL_TABLE} SET sku = $1, updated_at = datetime('now') WHERE id = $2`,
        [newSku.trim(), id]
      )
    },

    async deleteGeneralItem(id: string, revisionId: string): Promise<void> {
      const revDb = await getRevDb(revisionId)
      await revDb.execute(`DELETE FROM ${GENERAL_TABLE} WHERE id = $1`, [id])
    },

    async deleteGeneralItemsBatch(ids: string[], revisionId: string): Promise<void> {
      if (ids.length === 0) return
      const revDb = await getRevDb(revisionId)
      const CHUNK = 200

      for (let i = 0; i < ids.length; i += CHUNK) {
        const batch = ids.slice(i, i + CHUNK)
        const placeholders = batch.map((_, idx) => `$${idx + 1}`).join(', ')
        await revDb.execute(`DELETE FROM ${GENERAL_TABLE} WHERE id IN (${placeholders})`, batch)
      }
    },

    async clearGeneral(revisionId: string): Promise<void> {
      const revDb = await getRevDb(revisionId)
      await revDb.execute(`DELETE FROM ${GENERAL_TABLE}`)
    },

    /* --- CATALOG SYNC METHODS --- */

    /**
     * Синхронизировать наименования товаров в таблицах 299, факта и остатков из каталога магазина.
     * Быстрое обновление через UPDATE ... FROM (без коррелированных подзапросов).
     */
    async syncNamesFromCatalog(revisionId: string): Promise<void> {
      const revDb = await getRevDb(revisionId)

      // 1. Обновляем счет 299:
      // 1.1. Для позиций из каталога с отличающимся именем (UPDATE ... FROM)
      await revDb.execute(
        `UPDATE ${ACCOUNT_299_TABLE}
         SET name = c.name, updated_at = datetime('now')
         FROM ${CATALOG_TABLE} c
         WHERE ${ACCOUNT_299_TABLE}.sku = c.sku
           AND ${ACCOUNT_299_TABLE}.name != c.name`
      )

      // 1.2. Для отсутствующих в каталоге, у которых имя еще не 'Н/Д'
      await revDb.execute(
        `UPDATE ${ACCOUNT_299_TABLE}
         SET name = 'Н/Д',
         updated_at = datetime('now')
         WHERE name != 'Н/Д'
           AND NOT EXISTS (
             SELECT 1 FROM ${CATALOG_TABLE} c
             WHERE c.sku = ${ACCOUNT_299_TABLE}.sku
           )`
      )

      // 2. Обновляем факт (TABLE):
      // 2.1. Для позиций из каталога с отличающимся именем (UPDATE ... FROM)
      await revDb.execute(
        `UPDATE ${TABLE}
         SET name = c.name, updated_at = datetime('now')
         FROM ${CATALOG_TABLE} c
         WHERE ${TABLE}.sku = c.sku
           AND ${TABLE}.name != c.name`
      )

      // 2.2. Для отсутствующих в каталоге, у которых имя еще не 'Н/Д'
      await revDb.execute(
        `UPDATE ${TABLE}
         SET name = 'Н/Д',
         updated_at = datetime('now')
         WHERE name != 'Н/Д'
           AND NOT EXISTS (
             SELECT 1 FROM ${CATALOG_TABLE} c
             WHERE c.sku = ${TABLE}.sku
           )`
      )

      // 3. Обновляем остатки (STOCK_TABLE):
      // 3.1. Для позиций из каталога с отличающимся именем (UPDATE ... FROM)
      await revDb.execute(
        `UPDATE ${STOCK_TABLE}
         SET name = c.name, updated_at = datetime('now')
         FROM ${CATALOG_TABLE} c
         WHERE ${STOCK_TABLE}.sku = c.sku
           AND ${STOCK_TABLE}.name != c.name`
      )

      // 3.2. Для отсутствующих в каталоге, у которых имя еще не 'Н/Д'
      await revDb.execute(
        `UPDATE ${STOCK_TABLE}
         SET name = 'Н/Д',
         updated_at = datetime('now')
         WHERE name != 'Н/Д'
           AND NOT EXISTS (
             SELECT 1 FROM ${CATALOG_TABLE} c
             WHERE c.sku = ${STOCK_TABLE}.sku
           )`
      )
    },
  }
}

export type InventoryRepository = ReturnType<typeof createInventoryRepository>
