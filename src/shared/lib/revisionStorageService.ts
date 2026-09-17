import { invoke } from '@tauri-apps/api/core'

/**
 * Сервис управления файловой структурой ревизий.
 *
 * Оборачивает Tauri-команды для работы с папками магазинов/ревизий.
 * Структура: магазины/{номер_магазина}_{дата}/revision.db
 */

/** Создать папку «магазины» если не существует. Возвращает абсолютный путь. */
export async function ensureStoresDir(): Promise<string> {
  return await invoke<string>('ensure_stores_dir')
}

/** Гарантировать существование папки ревизии на диске */
export async function ensureRevisionDir(dirPath: string): Promise<void> {
  if (!dirPath) return
  try {
    await invoke<void>('ensure_revision_dir', { dirPath })
  } catch (err) {
    console.warn('[revisionStorageService] Failed to ensure revision dir:', err)
  }
}

/** Получить базовый путь к папке «магазины» */
export async function getStoresBasePath(): Promise<string> {
  return await invoke<string>('get_stores_base_path')
}

/**
 * Создать папку для новой ревизии.
 * Формат: {номер_магазина}_{дата_начала}-{дата_окончания}
 * Возвращает абсолютный путь к созданной папке.
 */
export async function createRevisionDir(
  storeNumber: string,
  startDate: string,
  endDate?: string
): Promise<string> {
  return await invoke<string>('create_revision_dir', {
    storeNumber,
    startDate,
    endDate: endDate || null,
  })
}

/**
 * Переименовать папку ревизии при изменении дат проведения.
 * Возвращает новый абсолютный путь к папке ревизии.
 */
export async function renameRevisionDir(
  dirPath: string,
  storeNumber: string,
  startDate: string,
  endDate: string
): Promise<string> {
  return await invoke<string>('rename_revision_dir', {
    dirPath,
    storeNumber,
    startDate,
    endDate,
  })
}

/**
 * Удалить папку ревизии и все её содержимое.
 * Безопасно: проверяет что путь внутри папки «магазины».
 */
export async function deleteRevisionDir(dirPath: string): Promise<void> {
  await invoke<void>('delete_revision_dir', { dirPath })
}

/**
 * Очистить осиротевшие папки (которых нет в актуальном списке путей ревизий).
 */
export async function cleanupOrphanRevisionDirs(validPaths: string[]): Promise<void> {
  try {
    await invoke<void>('cleanup_orphan_revision_dirs', { validPaths })
  } catch (err) {
    console.warn('[revisionStorageService] Failed to cleanup orphan dirs:', err)
  }
}

/**
 * Построить путь к SQLite-файлу ревизии из пути папки.
 * Формат для tauri-plugin-sql: sqlite:{путь}/revision.db
 */
export function getRevisionDbUri(dirPath: string): string {
  // Нормализуем путь для SQLite URI
  const normalized = dirPath.replace(/\\/g, '/')
  return `sqlite:${normalized}/revision.db`
}

/**
 * Открыть папку ревизии в Проводнике Windows
 */
export async function openRevisionFolder(dirPath: string): Promise<void> {
  if (!dirPath) return
  await invoke<void>('open_revision_folder', { dirPath })
}

/**
 * Переместить папку ревизии в подпапку «архив».
 * Возвращает новый абсолютный путь к папке ревизии.
 */
export async function moveRevisionToArchive(dirPath: string): Promise<string> {
  return await invoke<string>('move_revision_to_archive', { dirPath })
}

/**
 * Восстановить папку ревизии из «архива» обратно в «магазины».
 * Возвращает новый абсолютный путь к папке ревизии.
 */
export async function restoreRevisionFromArchive(dirPath: string): Promise<string> {
  return await invoke<string>('restore_revision_from_archive', { dirPath })
}
