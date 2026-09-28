import { ref } from 'vue'
import { eventBus } from '@shared/lib/eventBus'
import { useInventoryStore } from './useInventoryStore'

export const VDS_BASE_URL = 'https://revizzzor.duckdns.org'

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

const serverInfo = ref<MobileServerInfo>({
  is_running: false,
  port: 443,
  local_ip: 'revizzzor.duckdns.org',
  url: VDS_BASE_URL,
  revision_id: '',
  store_number: '',
  last_scanned: null,
})

const isServerRunning = ref(false)
const isVdsOnline = ref(false)
const isSyncing = ref(false)
const recentActivities = ref<MobileSyncActivity[]>([])

let pollInterval: ReturnType<typeof setInterval> | null = null
let lastEventId = 0
let activeSyncRevId = ''

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

  async function checkServerStatus(): Promise<MobileServerInfo> {
    try {
      const resp = await fetch(`${VDS_BASE_URL}/api/status`, { signal: AbortSignal.timeout(4000) })
      if (resp.ok) {
        isVdsOnline.value = true
        isServerRunning.value = true
        serverInfo.value.is_running = true
      } else {
        isVdsOnline.value = false
        isServerRunning.value = false
        serverInfo.value.is_running = false
      }
    } catch {
      isVdsOnline.value = false
      isServerRunning.value = false
      serverInfo.value.is_running = false
    }
    return serverInfo.value
  }

  async function uploadDataToVds(revisionId: string, storeNumber: string) {
    try {
      isSyncing.value = true
      const tasks = store.distinctLocations || []
      const items = store.items.map((i) => ({
        id: i.id,
        sku: i.sku,
        name: i.name || '',
        barcode: (i as any).barcode || '',
        quantity: i.quantity || 1,
        location: i.location || '',
        box_number: i.boxNumber || '',
      }))
      const catalog = store.catalogItems.map((c) => ({
        sku: c.sku,
        name: c.name,
        barcode: c.barcode || '',
      }))
      const stock = store.stockItems.map((s) => ({
        sku: s.sku,
        name: s.name,
        quantity: s.quantity || 0,
      }))

      const resp = await fetch(`${VDS_BASE_URL}/api/sync/upload`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          revision_id: revisionId,
          store_number: storeNumber,
          tasks,
          items: items.slice(0, 50000),
          catalog: catalog.slice(0, 20000),
          stock: stock.slice(0, 20000),
        }),
      })
      if (resp.ok) {
        pushActivity(`Синхронизировано с VDS: ${tasks.length} зон, ${items.length} факт. поз., ${catalog.length} товаров`, 'connect')
      }
    } catch (err) {
      console.warn('[useMobileSync] uploadDataToVds error:', err)
    } finally {
      isSyncing.value = false
    }
  }

  async function pollEvents(revisionId: string, storeNumber: string) {
    if (!isVdsOnline.value) return
    try {
      const url = `${VDS_BASE_URL}/api/sync/events?rev=${encodeURIComponent(revisionId)}&store=${encodeURIComponent(storeNumber)}&after=${lastEventId}`
      const resp = await fetch(url, { signal: AbortSignal.timeout(3000) })
      if (!resp.ok) return

      const data = await resp.json()
      if (!data.success || !Array.isArray(data.events)) return

      for (const ev of data.events) {
        if (ev.id > lastEventId) {
          lastEventId = ev.id
        }
        const payload = ev.payload
        if (!payload) continue

        if (ev.event_type === 'item_scanned') {
          const qty = payload.add_qty || 1
          const boxPart = payload.box_number?.trim() ? `, № коробки: ${payload.box_number.trim()}` : ''
          const locPart = payload.location ? `"${payload.location}"` : 'без локации'
          const desc = `ШК ${payload.barcode || payload.sku} → ${locPart}${boxPart} (+${qty} шт.)`
          pushActivity(desc, 'scan')

          eventBus.emit('app:toast', {
            type: 'success',
            message: `📱 С телефона: ${desc}`,
          })

          await store.applyMobileScan({
            sku: payload.sku,
            name: payload.name,
            barcode: payload.barcode,
            addQty: qty,
            location: payload.location,
            boxNumber: payload.box_number,
          })
          await store.loadItems()
        } else if (ev.event_type === 'item_updated') {
          const qty = payload.quantity
          const desc = `Кол-во: ${qty} шт.`
          pushActivity(desc, 'scan')
          eventBus.emit('app:toast', {
            type: 'info',
            message: `📱 С телефона: ${desc}`,
          })
          if (payload.item_id) {
            await store.applyMobileItemUpdate(payload.item_id, qty)
            await store.loadItems()
          }
        } else if (ev.event_type === 'box_updated') {
          const box = payload.box_number || '—'
          const desc = `№ коробки: ${box} (${payload.location || ''})`
          pushActivity(desc, 'scan')
          eventBus.emit('app:toast', {
            type: 'info',
            message: `📱 С телефона: ${desc}`,
          })
          if (payload.item_id) {
            await store.applyMobileBoxUpdate(payload.item_id, payload.box_number)
            await store.loadItems()
          }
        } else if (ev.event_type === 'task_created') {
          const desc = `Создана локация: "${payload.task}"`
          pushActivity(desc, 'task')
          eventBus.emit('app:toast', {
            type: 'info',
            message: `📱 ${desc}`,
          })
          await store.loadItems()
        } else if (ev.event_type === 'task_completed') {
          const count = payload.items_count || 0
          const qty = payload.total_qty || 0
          const desc = `Завершена задача "${payload.task}": передано ${count} поз. (${qty} шт.)`
          pushActivity(desc, 'task')
          eventBus.emit('app:toast', {
            type: 'success',
            message: `📱 ${desc}`,
          })
          await store.loadItems()
          await store.loadAllStoreData()
        } else if (ev.event_type === 'task_deleted') {
          const desc = `Удалена локация: "${payload.task}"`
          pushActivity(desc, 'task')
          eventBus.emit('app:toast', {
            type: 'info',
            message: `📱 ${desc}`,
          })
          await store.loadItems()
        }
      }
    } catch (err) {
      console.warn('[useMobileSync] pollEvents error:', err)
    }
  }

  async function startServer(revisionId: string, storeNumber: string, _dirPath?: string, _port = 443): Promise<MobileServerInfo> {
    serverInfo.value.revision_id = revisionId
    serverInfo.value.store_number = storeNumber
    serverInfo.value.url = `${VDS_BASE_URL}/?store=${encodeURIComponent(storeNumber)}&rev=${encodeURIComponent(revisionId)}`

    await checkServerStatus()
    if (activeSyncRevId !== revisionId) {
      activeSyncRevId = revisionId
      lastEventId = 0
    }

    // Первичная выгрузка данных на VDS
    await uploadDataToVds(revisionId, storeNumber)

    // Запуск фонового поллинга сканов
    if (pollInterval) {
      clearInterval(pollInterval)
    }
    pollInterval = setInterval(() => {
      pollEvents(revisionId, storeNumber)
    }, 1200)

    // Первый опрос сразу
    pollEvents(revisionId, storeNumber)

    return serverInfo.value
  }

  async function stopServer(): Promise<void> {
    if (pollInterval) {
      clearInterval(pollInterval)
      pollInterval = null
    }
    isServerRunning.value = false
    serverInfo.value.is_running = false
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
    isVdsOnline,
    isSyncing,
    recentActivities,
    startServer,
    checkServerStatus,
    uploadDataToVds,
    stopServer,
    clearActivities,
    copyActivitiesToClipboard,
  }
}
