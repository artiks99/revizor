import { ref } from 'vue'
import { check, type Update } from '@tauri-apps/plugin-updater'
import { invoke } from '@tauri-apps/api/core'
import { eventBus } from '@shared/lib/eventBus'

export type UpdateStatus =
  | 'idle'
  | 'checking'
  | 'available'
  | 'up-to-date'
  | 'downloading'
  | 'downloaded'
  | 'error'

export interface UpdateDetails {
  version: string
  currentVersion: string
  body?: string
  date?: string
}

const status = ref<UpdateStatus>('idle')
const updateInfo = ref<UpdateDetails | null>(null)
const downloadProgress = ref<number>(0)
const downloadedBytes = ref<number>(0)
const totalBytes = ref<number>(0)
const errorMessage = ref<string | null>(null)
const isModalOpen = ref<boolean>(false)

let pendingUpdate: Update | null = null

export function useAppUpdater() {
  /**
   * Проверить наличие обновлений через GitHub Releases
   * @param silent Если true, при отсутствии обновления не всплывает тост
   */
  async function checkForUpdates(silent = false) {
    if (status.value === 'checking' || status.value === 'downloading') {
      return
    }

    status.value = 'checking'
    errorMessage.value = null

    try {
      const update = await check()
      if (update) {
        pendingUpdate = update
        updateInfo.value = {
          version: update.version,
          currentVersion: update.currentVersion,
          body: update.body,
          date: update.date,
        }
        status.value = 'available'
        isModalOpen.value = true

        eventBus.emit('app:toast', {
          type: 'info',
          message: `Доступна новая версия v${update.version}!`,
        })
      } else {
        pendingUpdate = null
        status.value = 'up-to-date'
        eventBus.emit('app:toast', {
          type: 'success',
          message: 'Обновлений нет. У вас установлена актуальная версия!',
        })
      }
    } catch (err: unknown) {
      console.error('[useAppUpdater] Ошибка проверки обновлений:', err)
      const msg = err instanceof Error ? err.message : String(err)
      const isNotFound =
        msg.includes('404') ||
        msg.toLowerCase().includes('not found') ||
        msg.toLowerCase().includes('could not find')

      if (isNotFound) {
        status.value = 'up-to-date'
        errorMessage.value = null
        eventBus.emit('app:toast', {
          type: 'success',
          message: 'Обновлений нет. У вас установлена актуальная версия!',
        })
      } else {
        status.value = 'error'
        errorMessage.value = msg
        eventBus.emit('app:toast', {
          type: 'warning',
          message: `Проверка обновлений: ${msg}`,
        })
      }
    }
  }

  /**
   * Скачать и применить обновление
   */
  async function downloadAndInstall() {
    if (!pendingUpdate) return

    status.value = 'downloading'
    downloadProgress.value = 0
    downloadedBytes.value = 0
    totalBytes.value = 0
    errorMessage.value = null

    try {
      let downloaded = 0
      let total = 0

      await pendingUpdate.downloadAndInstall((event) => {
        switch (event.event) {
          case 'Started':
            total = event.data.contentLength ?? 0
            totalBytes.value = total
            break
          case 'Progress':
            downloaded += event.data.chunkLength
            downloadedBytes.value = downloaded
            if (total > 0) {
              downloadProgress.value = Math.min(100, Math.round((downloaded / total) * 100))
            }
            break
          case 'Finished':
            status.value = 'downloaded'
            downloadProgress.value = 100
            break
        }
      })

      status.value = 'downloaded'
      eventBus.emit('app:toast', {
        type: 'success',
        message: 'Обновление успешно загружено. Готово к перезапуску!',
      })
    } catch (err: unknown) {
      console.error('[useAppUpdater] Ошибка загрузки обновления:', err)
      status.value = 'error'
      errorMessage.value = err instanceof Error ? err.message : String(err)
      eventBus.emit('app:toast', {
        type: 'error',
        message: `Ошибка загрузки обновления: ${errorMessage.value}`,
      })
    }
  }

  /**
   * Перезапустить приложение для применения обновления
   */
  async function restartApp() {
    try {
      await invoke('restart_app')
    } catch (err) {
      console.error('[useAppUpdater] Ошибка перезапуска:', err)
    }
  }

  function openModal() {
    isModalOpen.value = true
  }

  function closeModal() {
    isModalOpen.value = false
  }

  return {
    status,
    updateInfo,
    downloadProgress,
    downloadedBytes,
    totalBytes,
    errorMessage,
    isModalOpen,
    checkForUpdates,
    downloadAndInstall,
    restartApp,
    openModal,
    closeModal,
  }
}
