import { ref, onUnmounted } from 'vue'
import { invoke } from '@tauri-apps/api/core'
import { listen, type UnlistenFn } from '@tauri-apps/api/event'
import { eventBus } from '@shared/lib/eventBus'
import { useInventoryStore } from './useInventoryStore'

export interface MobileServerInfo {
  is_running: boolean
  port: number
  local_ip: string
  url: string
  revision_id: string
  store_number: string
  last_scanned: string | null
}

export interface MobileSyncActivity {
  id: string
  time: string
  text: string
  type: 'scan' | 'task' | 'connect'
}

const serverInfo = ref<MobileServerInfo | null>(null)
const isServerRunning = ref(false)
const recentActivities = ref<MobileSyncActivity[]>([])
let unlistenFn: UnlistenFn | null = null
let listenerPromise: Promise<UnlistenFn | null> | null = null

function pushActivity(text: string, type: 'scan' | 'task' | 'connect') {
  const now = new Date().toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
  const last = recentActivities.value[0]
  if (last && last.text === text && last.type === type) {
    return
  }
  recentActivities.value.unshift({
    id: `act_${Date.now()}_${Math.random()}`,
    time: now,
    text,
    type,
  })
  if (recentActivities.value.length > 2000) {
    recentActivities.value.pop()
  }
}

export function useMobileSync() {
  const store = useInventoryStore()

  async function initListener() {
    if (unlistenFn) return
    if (listenerPromise) {
      await listenerPromise
      return
    }

    listenerPromise = (async () => {
      try {
        const unlisten = await listen<any>('mobile-sync', async (event) => {
          const payload = event.payload
          if (!payload) return

          if (payload?.type === 'item_scanned') {
            const qty = payload.add_qty || 1
            const boxPart = payload.box_number?.trim() ? `, № коробки: ${payload.box_number.trim()}` : ''
            const locPart = payload.location ? `"${payload.location}"` : 'без локации'
            const desc = `ШК ${payload.barcode || payload.sku} → ${locPart}${boxPart} (+${qty} шт.)`
            pushActivity(desc, 'scan')

            eventBus.emit('app:toast', {
              type: 'success',
              message: `📱 С телефона: ${desc}`,
            })

            if (store.activeStoreNumber || store.activeRevisionId) {
              await store.loadItems()
              await store.loadAllStoreData()
            }
          } else if (payload?.type === 'item_updated') {
            const qty = payload.quantity
            const loc = payload.location ? `"${payload.location}"` : ''
            const box = payload.box_number ? `№ коробки: ${payload.box_number}` : ''
            const details = [loc, box].filter(Boolean).join(', ')
            const detailsStr = details ? ` (${details})` : ''
            const desc = `Кол-во: ${qty} шт.${detailsStr}`
            pushActivity(desc, 'scan')

            eventBus.emit('app:toast', {
              type: 'info',
              message: `📱 С телефона: ${desc}`,
            })

            if (payload.item_id) {
              const idx = store.items.findIndex((i) => i.id === payload.item_id)
              if (idx !== -1) {
                if (qty <= 0) {
                  store.items.splice(idx, 1)
                } else {
                  store.items[idx].quantity = qty
                  store.items[idx].updatedAt = new Date().toISOString()
                }
              }
            }

            if (store.activeStoreNumber || store.activeRevisionId) {
              await store.loadItems()
              await store.loadAllStoreData()
            }
          } else if (payload?.type === 'box_updated') {
            const box = payload.box_number || '—'
            const desc = `№ коробки: ${box} (${payload.location || ''})`
            pushActivity(desc, 'scan')

            eventBus.emit('app:toast', {
              type: 'info',
              message: `📱 С телефона: ${desc}`,
            })

            if (payload.item_id) {
              const idx = store.items.findIndex((i) => i.id === payload.item_id)
              if (idx !== -1) {
                store.items[idx].boxNumber = payload.box_number || ''
                store.items[idx].updatedAt = new Date().toISOString()
              }
            }

            if (store.activeStoreNumber || store.activeRevisionId) {
              await store.loadItems()
              await store.loadAllStoreData()
            }
          } else if (payload?.type === 'task_created') {
            const desc = `Создана локация: "${payload.task}"`
            pushActivity(desc, 'task')

            eventBus.emit('app:toast', {
              type: 'info',
              message: `📱 ${desc}`,
            })
          } else if (payload?.type === 'task_completed') {
            const count = payload.items_count || 0
            const qty = payload.total_qty || 0
            const desc = `Завершена задача "${payload.task}": передано ${count} поз. (${qty} шт.)`
            pushActivity(desc, 'task')

            eventBus.emit('app:toast', {
              type: 'success',
              message: `📱 ${desc}`,
            })

            if (store.activeStoreNumber || store.activeRevisionId) {
              await store.loadItems()
              await store.loadAllStoreData()
            }
          } else if (payload?.type === 'task_deleted') {
            const desc = `Удалена локация: "${payload.task}"`
            pushActivity(desc, 'task')

            eventBus.emit('app:toast', {
              type: 'info',
              message: `📱 ${desc}`,
            })

            if (store.activeStoreNumber || store.activeRevisionId) {
              await store.loadItems()
            }
          }
        })
        unlistenFn = unlisten
        return unlisten
      } catch (err) {
        console.warn('[useMobileSync] Failed to register mobile-sync listener:', err)
        listenerPromise = null
        return null
      }
    })()

    await listenerPromise
  }

  // Автоматически регистрируем слушатель при вызове useMobileSync
  initListener()

  async function startServer(revisionId: string, storeNumber: string, dirPath: string, port = 4820): Promise<MobileServerInfo> {
    await initListener()
    try {
      const info = await invoke<MobileServerInfo>('start_mobile_server', {
        revisionId,
        storeNumber,
        dirPath,
        port,
      })
      serverInfo.value = info
      isServerRunning.value = info.is_running
      return info
    } catch (err) {
      console.error('[useMobileSync] startServer error:', err)
      throw err
    }
  }

  async function checkServerStatus(port = 4820): Promise<MobileServerInfo> {
    try {
      const info = await invoke<MobileServerInfo>('get_mobile_server_info', { port })
      serverInfo.value = info
      isServerRunning.value = info.is_running
      return info
    } catch (err) {
      console.warn('[useMobileSync] checkServerStatus error:', err)
      return {
        is_running: false,
        port,
        local_ip: '127.0.0.1',
        url: '',
        revision_id: '',
        store_number: '',
        last_scanned: null,
      }
    }
  }

  async function stopServer(): Promise<void> {
    try {
      await invoke('stop_mobile_server')
      isServerRunning.value = false
      if (serverInfo.value) {
        serverInfo.value.is_running = false
      }
    } catch (err) {
      console.error('[useMobileSync] stopServer error:', err)
    }
  }

  function clearActivities() {
    recentActivities.value = []
  }

  function copyActivitiesToClipboard(): boolean {
    if (recentActivities.value.length === 0) return false
    const text = recentActivities.value
      .slice()
      .reverse()
      .map((a) => `[${a.time}] ${a.text}`)
      .join('\n')
    navigator.clipboard.writeText(text)
    return true
  }

  return {
    serverInfo,
    isServerRunning,
    recentActivities,
    initListener,
    startServer,
    checkServerStatus,
    stopServer,
    clearActivities,
    copyActivitiesToClipboard,
  }
}
