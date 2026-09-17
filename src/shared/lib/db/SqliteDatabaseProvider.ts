import Database from '@tauri-apps/plugin-sql'
import type { DatabaseProvider, QueryResult } from './DatabaseProvider'

/**
 * Реализация DatabaseProvider для SQLite через Tauri plugin-sql.
 *
 * Для замены на другую БД — создайте новый класс, реализующий DatabaseProvider.
 */
export class SqliteDatabaseProvider implements DatabaseProvider {
  private db: Database | null = null
  private readonly dbPath: string

  constructor(dbPath = 'sqlite:revizor.db') {
    this.dbPath = dbPath
  }

  private async getDb(): Promise<Database> {
    if (!this.db) {
      this.db = await Database.load(this.dbPath)
      try {
        await this.db.execute('PRAGMA busy_timeout = 15000;')
      } catch (_) {}
    }
    return this.db
  }

  async execute(query: string, params: unknown[] = []): Promise<QueryResult> {
    const db = await this.getDb()
    const result = await db.execute(query, params)
    return {
      rowsAffected: result.rowsAffected,
      lastInsertId: result.lastInsertId,
    }
  }

  async select<T = Record<string, unknown>>(query: string, params: unknown[] = []): Promise<T[]> {
    const db = await this.getDb()
    return await db.select<T[]>(query, params) as unknown as T[]
  }

  async close(): Promise<void> {
    if (this.db) {
      try {
        // Обязательно передаем this.dbPath, иначе tauri-plugin-sql закроет ВСЕ пулы приложения!
        await this.db.close(this.dbPath)
      } catch (err) {
        console.warn(`[SqliteDatabaseProvider] Failed to close pool ${this.dbPath}:`, err)
      }
      this.db = null
    }
  }
}
