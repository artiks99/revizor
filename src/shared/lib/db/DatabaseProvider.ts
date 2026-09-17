/**
 * DatabaseProvider — абстракция доступа к данным (Repository Pattern).
 *
 * Любая фича работает ТОЛЬКО через этот интерфейс.
 * Для смены хранилища (SQLite → PostgreSQL → REST API) достаточно
 * написать новую реализацию, не трогая логику фичей.
 */
export interface DatabaseProvider {
  /** Выполнить запрос на изменение (INSERT / UPDATE / DELETE) */
  execute(query: string, params?: unknown[]): Promise<QueryResult>

  /** Выполнить SELECT-запрос и вернуть типизированный массив строк */
  select<T = Record<string, unknown>>(query: string, params?: unknown[]): Promise<T[]>

  /** Закрыть соединение */
  close(): Promise<void>
}

export interface QueryResult {
  rowsAffected: number
  lastInsertId?: number
}
