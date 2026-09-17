<script setup lang="ts">
import { ref, computed, watch, onMounted } from 'vue'
import { invoke } from '@tauri-apps/api/core'
import { useMobileSync } from '../../model/useMobileSync'
import { eventBus } from '@shared/lib/eventBus'
import MobileSessionHistory from './components/MobileSessionHistory.vue'

interface NetworkIp {
  ip: string
  label: string
}

const props = defineProps<{
  isOpen: boolean
  revisionId: string
  storeNumber: string
  dirPath: string
}>()

const emit = defineEmits<{
  (e: 'close'): void
}>()

const { serverInfo, isServerRunning, recentActivities, startServer, clearActivities } = useMobileSync()

const isLoading = ref(false)
const copied = ref(false)
const qrSvg = ref('')
const availableIps = ref<NetworkIp[]>([])
const selectedIp = ref('')
const customPort = ref(4820)

const activeIp = computed(() => {
  if (selectedIp.value) return selectedIp.value
  if (serverInfo.value?.local_ip) return serverInfo.value.local_ip
  return '127.0.0.1'
})

const connectUrl = computed(() => {
  const ip = activeIp.value
  const port = customPort.value
  const rev = encodeURIComponent(props.revisionId)
  if (serverInfo.value?.url) {
    const isHttps = serverInfo.value.url.startsWith('https:')
    const protocol = isHttps ? 'https:' : 'http:'
    return `${protocol}//${ip}:${port}/?rev=${rev}`
  }
  return `https://${ip}:${port}/?rev=${rev}`
})

async function updateQrCode() {
  if (!connectUrl.value) return
  try {
    const svg = await invoke<string>('generate_qr_svg', { text: connectUrl.value })
    qrSvg.value = svg
  } catch (err) {
    console.error('Failed to generate QR code via Tauri:', err)
  }
}

async function loadNetworkIps() {
  try {
    const list = await invoke<NetworkIp[]>('get_available_network_ips')
    availableIps.value = list
    if (list.length > 0 && !selectedIp.value) {
      selectedIp.value = list[0].ip
    }
  } catch (err) {
    console.warn('Failed to load network IPs:', err)
  }
}

async function initServer() {
  if (!props.isOpen || !props.revisionId || !props.dirPath) return
  isLoading.value = true
  try {
    await loadNetworkIps()
    await startServer(props.revisionId, props.storeNumber, props.dirPath, customPort.value)
    await updateQrCode()
  } catch (err) {
    console.error('Failed to start mobile server:', err)
  } finally {
    isLoading.value = false
  }
}

watch(
  () => props.isOpen,
  (open) => {
    if (open) {
      initServer()
    }
  }
)

watch(
  () => connectUrl.value,
  () => {
    updateQrCode()
  }
)

function copyUrl() {
  if (!connectUrl.value) return
  navigator.clipboard.writeText(connectUrl.value)
  copied.value = true
  eventBus.emit('app:toast', {
    type: 'success',
    message: 'Ссылка для подключения скопирована в буфер обмена',
  })
  setTimeout(() => {
    copied.value = false
  }, 2000)
}
</script>

<template>
  <div
    v-if="isOpen"
    class="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4 backdrop-blur-sm"
    @click.self="emit('close')"
  >
    <div
      class="relative w-full max-w-md overflow-hidden rounded-2xl border border-gray-800 bg-gray-950 p-6 shadow-2xl ring-1 ring-white/10"
    >
      <!-- Header -->
      <div class="flex items-center justify-between border-b border-gray-800/80 pb-4">
        <div class="flex items-center gap-2.5">
          <span class="flex h-9 w-9 items-center justify-center rounded-xl bg-indigo-500/10 text-lg text-indigo-400 ring-1 ring-indigo-500/20">
            📱
          </span>
          <div>
            <h3 class="text-base font-semibold text-white">Сканер с телефона</h3>
            <p class="text-xs text-gray-400">Магазин №{{ storeNumber }}</p>
          </div>
        </div>
        <button
          @click="emit('close')"
          class="flex h-8 w-8 items-center justify-center rounded-lg text-gray-400 hover:bg-gray-800 hover:text-white transition-colors cursor-pointer"
        >
          ✕
        </button>
      </div>

      <!-- Content -->
      <div class="mt-4 space-y-4">
        <!-- Wi-Fi info banner -->
        <div class="flex items-start gap-2.5 rounded-xl border border-indigo-500/20 bg-indigo-950/30 p-2.5 text-xs text-indigo-300">
          <span class="text-base">📶</span>
          <p>
            Убедитесь, что <strong>телефон и компьютер</strong> подключены к одной сети Wi-Fi.
          </p>
        </div>

        <!-- IP Address Selector (if multiple adapters) -->
        <div v-if="availableIps.length > 1" class="space-y-1">
          <label class="text-[11px] font-medium text-gray-400 uppercase tracking-wider">
            Сетевой адрес компьютера:
          </label>
          <select
            v-model="selectedIp"
            class="w-full rounded-lg border border-gray-800 bg-gray-900 px-2.5 py-1.5 text-xs text-white outline-none focus:border-indigo-500"
          >
            <option v-for="net in availableIps" :key="net.ip" :value="net.ip">
              {{ net.label }}
            </option>
          </select>
        </div>

        <!-- QR Code Container -->
        <div class="flex flex-col items-center justify-center">
          <div
            v-if="isLoading || !qrSvg"
            class="flex h-[230px] w-[230px] items-center justify-center rounded-2xl border border-gray-800 bg-gray-900/60"
          >
            <span class="text-xs text-gray-400">Генерация QR-кода...</span>
          </div>
          <div
            v-else
            class="overflow-hidden rounded-2xl border-4 border-white bg-white p-2 shadow-xl shadow-indigo-950/40"
            v-html="qrSvg"
          />

          <p class="mt-2.5 text-center text-xs text-gray-300 font-medium">
            Наведите камеру смартфона на QR-код
          </p>
        </div>

        <!-- URL Copy Section -->
        <div class="flex items-center gap-2 rounded-xl border border-gray-800 bg-gray-900/80 p-2 text-xs">
          <input
            type="text"
            readonly
            :value="connectUrl"
            class="flex-1 bg-transparent px-2 font-mono text-gray-300 outline-none select-all"
          />
          <button
            @click="copyUrl"
            type="button"
            class="flex items-center gap-1 rounded-lg px-3 py-1.5 font-medium transition-colors cursor-pointer"
            :class="copied ? 'bg-emerald-600 text-white' : 'bg-indigo-600 text-white hover:bg-indigo-500'"
          >
            <span>{{ copied ? 'Скопировано' : 'Копировать' }}</span>
          </button>
        </div>

        <!-- Camera info hint -->
        <div class="rounded-xl border border-indigo-500/30 bg-indigo-950/20 p-2.5 text-[11px] text-gray-300 space-y-1">
          <div class="flex items-center gap-1.5 font-medium text-indigo-300">
            <span>🔒</span>
            <span>Потоковый видео-сканер (без фото):</span>
          </div>
          <p class="leading-relaxed text-[11px] text-gray-400">
            Для работы камеры в качестве реального сканера используется защищенный <strong>HTTPS</strong>. При открытии на телефоне нажмите <strong>«Дополнительно» ➔ «Перейти на сайт»</strong>.
          </p>
        </div>

        <!-- Live Activity feed / Full Session History -->
        <MobileSessionHistory
          :activities="recentActivities"
          :is-server-running="isServerRunning"
          @clear="clearActivities"
        />
      </div>

      <!-- Footer -->
      <div class="mt-5 flex justify-end border-t border-gray-800/80 pt-3">
        <button
          @click="emit('close')"
          type="button"
          class="rounded-xl bg-gray-800 px-4 py-2 text-xs font-semibold text-gray-300 hover:bg-gray-700 hover:text-white transition-colors cursor-pointer"
        >
          Готово
        </button>
      </div>
    </div>
  </div>
</template>
