import { ref, computed } from 'vue'
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

export interface ConnectedClient {
  client_id: string
  revision_id: string
  store_number: string
  user_name: string
  device_name: string
  user_agent: string
  ip: string
  last_action: string
  last_seen: string
  connected_at: string
  seconds_ago: number
  status: 'online' | 'idle' | 'offline'
}

export interface MobileSyncActivity {
  id: string
  time: string
  text: string
  type: 'scan' | 'task' | 'update' | 'connect'
  userName?: string
  deviceName?: string
  sku?: string
  qty?: number
  location?: string
  boxNumber?: string
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
const connectedClients = ref<ConnectedClient[]>([])

let pollInterval: ReturnType<typeof setInterval> | null = null
let lastEventId = 0
let activeSyncRevId = ''
let isPolling = false
const processedEventIds = new Set<number>()

function loadSavedActivities(revisionId: string) {
  if (!revisionId) return
  try {
    const raw = localStorage.getItem(`revizor_vds_activities_${revisionId}`)
    if (raw) {
      const parsed = JSON.parse(raw)
      if (Array.isArray(parsed)) {
        recentActivities.value = parsed
        return
      }
    }
  } catch (_) {}
  recentActivities.value = []
}

function saveActivities(revisionId: string) {
  if (!revisionId) return
  try {
    localStorage.setItem(
      `revizor_vds_activities_${revisionId}`,
      JSON.stringify(recentActivities.value.slice(0, 300))
    )
  } catch (_) {}
}

function pushActivity(
  text: string,
  type: 'scan' | 'task' | 'update' | 'connect',
  extra?: {
    userName?: string
    deviceName?: string
    sku?: string
    qty?: number
    location?: string
    boxNumber?: string
    time?: string
  },
  revisionId?: string
) {
  const timeStr = extra?.time || new Date().toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
  const last = recentActivities.value[0]
  if (last && last.text === text && last.type === type && last.userName === extra?.userName) {
    return
  }
  recentActivities.value.unshift({
    id: `act_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    time: timeStr,
    text,
    type,
    userName: extra?.userName,
    deviceName: extra?.deviceName,
    sku: extra?.sku,
    qty: extra?.qty,
    location: extra?.location,
    boxNumber: extra?.boxNumber,
  })
  if (recentActivities.value.length > 500) {
    recentActivities.value.pop()
  }
  const rev = revisionId || activeSyncRevId
  if (rev) {
    saveActivities(rev)
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
    if (!revisionId) return
    try {
      isSyncing.value = true

      // Гарантируем загрузку всех справочников из локальной БД SQLite, если они еще не подгружены в память
      if (!store.multiplicityItems || store.multiplicityItems.length === 0) {
        await store.loadMultiplicity()
      }
      if (!store.catalogItems || store.catalogItems.length === 0) {
        await store.loadCatalog()
      }
      if (!store.stockItems || store.stockItems.length === 0) {
        await store.loadStock()
      }
      if (!store.items || store.items.length === 0) {
        await store.loadItems()
      }

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

      const multiplicity = (store.multiplicityItems || []).map((m) => ({
        sku: String(m.sku || '').trim(),
        name: m.name || '',
        multiplicity: Number(m.multiplicity) || 1,
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
          multiplicity: multiplicity.slice(0, 20000),
        }),
      })
      if (resp.ok) {
        pushActivity(`Синхронизировано с VDS: ${tasks.length} зон, ${items.length} факт. поз., ${catalog.length} товаров, ${multiplicity.length} кратн.`, 'connect')
      }
    } catch (err) {
      console.warn('[useMobileSync] uploadDataToVds error:', err)
    } finally {
      isSyncing.value = false
    }
  }

  let clientPollCounter = 0

  async function fetchConnectedClients(revisionId: string, storeNumber: string) {
    if (!revisionId) return
    try {
      const resp = await fetch(
        `${VDS_BASE_URL}/api/clients?rev=${encodeURIComponent(revisionId)}&store=${encodeURIComponent(storeNumber)}`,
        { signal: AbortSignal.timeout(3500) }
      )
      if (resp.ok) {
        const data = await resp.json()
        if (data.success && Array.isArray(data.clients)) {
          connectedClients.value = data.clients
        }
      }
    } catch (_) {}
  }

  async function pollEvents(revisionId: string, storeNumber: string) {
    if (!revisionId || isPolling) return
    isPolling = true
    try {
      clientPollCounter++
      if (clientPollCounter % 2 === 1) {
        fetchConnectedClients(revisionId, storeNumber).catch(() => {})
      }

      const url = `${VDS_BASE_URL}/api/sync/events?rev=${encodeURIComponent(revisionId)}&store=${encodeURIComponent(storeNumber)}&after=${lastEventId}`
      const resp = await fetch(url, { signal: AbortSignal.timeout(4000) })
      if (!resp.ok) {
        isVdsOnline.value = false
        return
      }
      isVdsOnline.value = true
      isServerRunning.value = true
      serverInfo.value.is_running = true

      const data = await resp.json()
      if (!data.success || !Array.isArray(data.events) || data.events.length === 0) return

      let hasItemChanges = false
      let hasStoreDataChanges = false

      for (const ev of data.events) {
        if (ev.id > lastEventId) {
          lastEventId = ev.id
          try {
            localStorage.setItem(`revizor_vds_last_id_${revisionId}`, String(lastEventId))
          } catch (_) {}
        }

        if (processedEventIds.has(ev.id)) continue
        processedEventIds.add(ev.id)
        if (processedEventIds.size > 2000) {
          const first = processedEventIds.values().next().value
          if (first !== undefined) processedEventIds.delete(first)
        }

        const payload = ev.payload
        if (!payload) continue

        const userName = payload.user_name || payload.device_name || 'Телефон'
        const timeStr = ev.created_at ? ev.created_at.slice(11, 19) : undefined

        if (ev.event_type === 'item_scanned') {
          const qty = payload.add_qty || 1
          const boxPart = payload.box_number?.trim() ? `, № коробки: ${payload.box_number.trim()}` : ''
          const locPart = payload.location ? `"${payload.location}"` : 'без локации'
          const namePart = payload.name && payload.name !== 'Н/Д' ? ` · «${payload.name}»` : ''
          const desc = `ШК ${payload.barcode || payload.sku}${namePart} → ${locPart}${boxPart} (+${qty} шт.)`
          pushActivity(desc, 'scan', {
            userName,
            deviceName: payload.device_name,
            sku: payload.sku,
            qty,
            location: payload.location,
            boxNumber: payload.box_number,
            time: timeStr,
          }, revisionId)

          eventBus.emit('app:toast', {
            type: 'success',
            message: `📱 ${userName}: ${desc}`,
          })

          await store.applyMobileScan(
            {
              id: payload.item_id,
              sku: payload.sku,
              name: payload.name,
              barcode: payload.barcode,
              addQty: qty,
              location: payload.location,
              boxNumber: payload.box_number,
            },
            revisionId
          )
          hasItemChanges = true
        } else if (ev.event_type === 'item_updated') {
          const qty = payload.quantity
          const desc = `Изменено количество: ${qty} шт. (${payload.location || ''})`
          pushActivity(desc, 'update', {
            userName,
            deviceName: payload.device_name,
            qty,
            location: payload.location,
            time: timeStr,
          }, revisionId)
          eventBus.emit('app:toast', {
            type: 'info',
            message: `📱 ${userName}: ${desc}`,
          })
          if (payload.item_id || (payload.location && payload.sku)) {
            await store.applyMobileItemUpdate(
              payload.item_id || '',
              qty,
              revisionId,
              payload.location,
              payload.sku
            )
            hasItemChanges = true
          }
        } else if (ev.event_type === 'box_updated') {
          const box = payload.box_number || '—'
          const desc = `№ коробки: ${box} (${payload.location || ''})`
          pushActivity(desc, 'update', {
            userName,
            deviceName: payload.device_name,
            location: payload.location,
            boxNumber: payload.box_number,
            time: timeStr,
          }, revisionId)
          eventBus.emit('app:toast', {
            type: 'info',
            message: `📱 ${userName}: ${desc}`,
          })
          if (payload.item_id || (payload.location && payload.sku)) {
            await store.applyMobileBoxUpdate(
              payload.item_id || '',
              payload.box_number,
              revisionId,
              payload.location,
              payload.sku
            )
            hasItemChanges = true
          }
        } else if (ev.event_type === 'task_created') {
          const desc = `Создана локация: "${payload.task}"`
          pushActivity(desc, 'task', {
            userName,
            deviceName: payload.device_name,
            location: payload.task,
            time: timeStr,
          }, revisionId)
          eventBus.emit('app:toast', {
            type: 'info',
            message: `📱 ${userName}: ${desc}`,
          })
          hasItemChanges = true
        } else if (ev.event_type === 'task_completed') {
          const count = payload.items_count || 0
          const qty = payload.total_qty || 0
          const desc = `Завершена задача "${payload.task}": передано ${count} поз. (${qty} шт.)`
          pushActivity(desc, 'task', {
            userName,
            deviceName: payload.device_name,
            location: payload.task,
            qty,
            time: timeStr,
          }, revisionId)
          eventBus.emit('app:toast', {
            type: 'success',
            message: `📱 ${userName}: ${desc}`,
          })
          hasItemChanges = true
          hasStoreDataChanges = true
        } else if (ev.event_type === 'task_deleted') {
          const desc = `Удалена локация: "${payload.task}"`
          pushActivity(desc, 'task', {
            userName,
            deviceName: payload.device_name,
            location: payload.task,
            time: timeStr,
          }, revisionId)
          eventBus.emit('app:toast', {
            type: 'info',
            message: `📱 ${userName}: ${desc}`,
          })
          hasItemChanges = true
        }
      }

      if (hasItemChanges) {
        await store.loadItems()
      }
      if (hasStoreDataChanges) {
        await store.loadAllStoreData()
      }
    } catch (err) {
      console.warn('[useMobileSync] pollEvents error:', err)
    } finally {
      isPolling = false
    }
  }

  async function startServer(revisionId: string, storeNumber: string, _dirPath?: string, skipUpload = false): Promise<MobileServerInfo> {
    serverInfo.value.revision_id = revisionId
    serverInfo.value.store_number = storeNumber
    serverInfo.value.url = `${VDS_BASE_URL}/?store=${encodeURIComponent(storeNumber)}&rev=${encodeURIComponent(revisionId)}`

    if (activeSyncRevId !== revisionId) {
      activeSyncRevId = revisionId
      processedEventIds.clear()
      const saved = localStorage.getItem(`revizor_vds_last_id_${revisionId}`)
      if (saved) {
        lastEventId = parseInt(saved, 10) || 0
      } else {
        // Запрашиваем актуальный latest_id с VDS, чтобы не накатывать повторно прошлые события
        try {
          const resp = await fetch(
            `${VDS_BASE_URL}/api/sync/events?rev=${encodeURIComponent(revisionId)}&store=${encodeURIComponent(storeNumber)}&after=999999999`,
            { signal: AbortSignal.timeout(3000) }
          )
          if (resp.ok) {
            const data = await resp.json()
            if (data.success && typeof data.latest_id === 'number') {
              lastEventId = data.latest_id
              localStorage.setItem(`revizor_vds_last_id_${revisionId}`, String(lastEventId))
            }
          }
        } catch (_) {}
      }
      loadSavedActivities(revisionId)
    }

    fetchConnectedClients(revisionId, storeNumber).catch(() => {})

    if (!skipUpload) {
      // Первичная выгрузка данных на VDS при открытии QR-модалки
      uploadDataToVds(revisionId, storeNumber).catch(() => {})
    }

    // Запуск фонового поллинга сканов
    if (pollInterval) {
      clearInterval(pollInterval)
    }
    pollInterval = setInterval(() => {
      pollEvents(revisionId, storeNumber)
    }, 1500)

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
    if (activeSyncRevId) {
      try {
        localStorage.removeItem(`revizor_vds_activities_${activeSyncRevId}`)
      } catch (_) {}
    }
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

  async function archiveRevisionOnVds(revisionId: string, storeNumber: string) {
    try {
      const resp = await fetch(`${VDS_BASE_URL}/api/revision/archive`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ revision_id: revisionId, store_number: storeNumber }),
        signal: AbortSignal.timeout(8000),
      })
      if (resp.ok) {
        const data = await resp.json()
        eventBus.emit('app:toast', {
          type: 'info',
          message: `🗄️ Данные магазина №${storeNumber} на VDS отправлены в архив и очищены`,
        })
        pushActivity(`Магазин №${storeNumber} архивирован на VDS`, 'connect')
        return data
      }
    } catch (err) {
      console.warn('[useMobileSync] archiveRevisionOnVds error:', err)
    }
  }

  const onlineClientsCount = computed(() => {
    return connectedClients.value.filter((c) => c.status === 'online').length
  })

  return {
    serverInfo,
    isServerRunning,
    isVdsOnline,
    isSyncing,
    recentActivities,
    connectedClients,
    onlineClientsCount,
    fetchConnectedClients,
    startServer,
    checkServerStatus,
    uploadDataToVds,
    archiveRevisionOnVds,
    stopServer,
    clearActivities,
    copyActivitiesToClipboard,
  }
}

// Автоматическая архивация данных на VDS при перемещении ревизии в архив
let isArchiveListenerRegistered = false
if (!isArchiveListenerRegistered) {
  isArchiveListenerRegistered = true
  eventBus.on('revision:archived', async ({ id, storeNumber, isArchived }) => {
    if (isArchived) {
      const { archiveRevisionOnVds } = useMobileSync()
      await archiveRevisionOnVds(id, storeNumber)
    }
  })
}
