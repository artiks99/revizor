<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import { invoke } from '@tauri-apps/api/core'
import { useMobileSync, VDS_BASE_URL } from '../../model/useMobileSync'
import { eventBus } from '@shared/lib/eventBus'
import { useInventoryStore } from '../../model/useInventoryStore'
import MobileSessionHistory from './components/MobileSessionHistory.vue'
import MobileConnectedClientsList from './components/MobileConnectedClientsList.vue'

const props = defineProps<{
  isOpen: boolean
  revisionId: string
  storeNumber: string
  dirPath: string
}>()

const emit = defineEmits<{
  (e: 'close'): void
}>()

const inventoryStore = useInventoryStore()

const {
  isVdsOnline,
  isSyncing,
  recentActivities,
  connectedClients,
  onlineClientsCount,
  startServer,
  uploadDataToVds,
  clearActivities,
  fetchConnectedClients,
} = useMobileSync()

const activeTab = ref<'connect' | 'clients' | 'history'>('connect')
const isLoading = ref(false)
const copied = ref(false)
const qrSvg = ref('')

const effectiveRevisionId = computed(() => {
  return props.revisionId || (inventoryStore as any).currentPartitionId || (inventoryStore as any).activeRevisionId || 'default'
})

const effectiveStoreNumber = computed(() => {
  return props.storeNumber || inventoryStore.activeStoreNumber || ''
})

const connectUrl = computed(() => {
  const rev = encodeURIComponent(effectiveRevisionId.value)
  const store = encodeURIComponent(effectiveStoreNumber.value)
  return `${VDS_BASE_URL}/?store=${store}&rev=${rev}`
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

async function initSync() {
  if (!props.isOpen) return
  isLoading.value = true
  try {
    await updateQrCode()
    await startServer(effectiveRevisionId.value, effectiveStoreNumber.value, props.dirPath)
  } catch (err) {
    console.error('Failed to start VDS sync:', err)
  } finally {
    isLoading.value = false
  }
}

async function handleManualSync() {
  if (isSyncing.value) return
  await uploadDataToVds(effectiveRevisionId.value, effectiveStoreNumber.value)
  eventBus.emit('app:toast', {
    type: 'success',
    message: 'Каталог, локации и факт синхронизированы с VDS',
  })
}

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

watch(
  () => props.isOpen,
  (open) => {
    if (open) {
      initSync()
    }
  }
)
</script>

<template>
  <div
    v-if="isOpen"
    class="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4 backdrop-blur-sm"
    @click.self="emit('close')"
  >
    <div
      class="relative w-full max-w-xl overflow-hidden rounded-2xl border border-gray-800 bg-gray-950 p-6 shadow-2xl ring-1 ring-white/10"
    >
      <!-- Header -->
      <div class="flex items-center justify-between border-b border-gray-800/80 pb-4">
        <div class="flex items-center gap-2.5">
          <span class="flex h-9 w-9 items-center justify-center rounded-xl bg-indigo-500/10 text-lg text-indigo-400 ring-1 ring-indigo-500/20">
            🌐
          </span>
          <div>
            <h3 class="text-base font-semibold text-white">Мобильный сканер (VDS)</h3>
            <p class="text-xs text-gray-400">Магазин №{{ effectiveStoreNumber || '—' }}</p>
          </div>
        </div>
        <button
          @click="emit('close')"
          class="flex h-8 w-8 items-center justify-center rounded-lg text-gray-400 hover:bg-gray-800 hover:text-white transition-colors cursor-pointer"
        >
          ✕
        </button>
      </div>

      <!-- Top Tabs -->
      <div class="mt-4 flex items-center gap-1 rounded-xl bg-gray-900/90 p-1 border border-gray-800/80">
        <button
          @click="activeTab = 'connect'"
          type="button"
          :class="activeTab === 'connect' ? 'bg-indigo-600 text-white font-semibold shadow-sm' : 'text-gray-400 hover:text-gray-200'"
          class="flex-1 rounded-lg py-1.5 text-xs transition-all flex items-center justify-center gap-1.5 cursor-pointer"
        >
          <span>📱 Подключение</span>
        </button>
        <button
          @click="activeTab = 'clients'"
          type="button"
          :class="activeTab === 'clients' ? 'bg-indigo-600 text-white font-semibold shadow-sm' : 'text-gray-400 hover:text-gray-200'"
          class="flex-1 rounded-lg py-1.5 text-xs transition-all flex items-center justify-center gap-1.5 cursor-pointer"
        >
          <span>👥 Кто в сети</span>
          <span
            v-if="onlineClientsCount > 0"
            class="rounded-full bg-emerald-500/20 px-1.5 py-0.2 text-[10px] font-bold text-emerald-300 ring-1 ring-emerald-500/40"
          >
            {{ onlineClientsCount }}
          </span>
        </button>
        <button
          @click="activeTab = 'history'"
          type="button"
          :class="activeTab === 'history' ? 'bg-indigo-600 text-white font-semibold shadow-sm' : 'text-gray-400 hover:text-gray-200'"
          class="flex-1 rounded-lg py-1.5 text-xs transition-all flex items-center justify-center gap-1.5 cursor-pointer"
        >
          <span>📜 История</span>
          <span
            v-if="recentActivities.length > 0"
            class="rounded-full bg-indigo-500/20 px-1.5 py-0.2 text-[10px] font-bold text-indigo-300 ring-1 ring-indigo-500/40"
          >
            {{ recentActivities.length }}
          </span>
        </button>
      </div>

      <!-- Content Area -->
      <div class="mt-4">
        <!-- Tab 1: Connect & QR -->
        <div v-show="activeTab === 'connect'" class="space-y-4">
          <!-- VDS Cloud status banner -->
          <div class="flex items-center justify-between rounded-xl border border-gray-800 bg-gray-900/80 px-3 py-2 text-xs">
            <div class="flex items-center gap-2">
              <span
                class="h-2.5 w-2.5 rounded-full"
                :class="isVdsOnline ? 'bg-emerald-400 shadow-sm shadow-emerald-400/50 animate-pulse' : 'bg-rose-500'"
              />
              <span class="font-medium text-gray-200">
                {{ isVdsOnline ? 'VDS Сервер онлайн' : 'Проверка связи с сервером...' }}
              </span>
            </div>
            <button
              @click="handleManualSync"
              :disabled="isSyncing"
              class="flex items-center gap-1 rounded-lg px-2.5 py-1 text-[11px] font-medium text-indigo-400 hover:bg-indigo-950/50 transition-colors cursor-pointer disabled:opacity-50"
              title="Обновить каталог товаров и задач на VDS"
            >
              <span>{{ isSyncing ? '⏳ Синхронизация...' : '🔄 Обновить каталог' }}</span>
            </button>
          </div>

          <!-- QR Code Container -->
          <div class="flex flex-col items-center justify-center">
            <div
              v-if="isLoading || !qrSvg"
              class="flex h-[210px] w-[210px] items-center justify-center rounded-2xl border border-gray-800 bg-gray-900/60"
            >
              <span class="text-xs text-gray-400">Генерация QR-кода...</span>
            </div>
            <div
              v-else
              class="overflow-hidden rounded-2xl border-4 border-white bg-white p-2 shadow-xl shadow-indigo-950/40"
              v-html="qrSvg"
            />

            <p class="mt-2 text-center text-xs text-gray-300 font-medium">
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

          <!-- Cloud Explanation hint -->
          <div class="rounded-xl border border-emerald-500/20 bg-emerald-950/20 p-2.5 text-[11px] text-gray-300 space-y-1">
            <div class="flex items-center gap-1.5 font-medium text-emerald-400">
              <span>🚀</span>
              <span>Работает из любой точки города:</span>
            </div>
            <p class="leading-relaxed text-[11px] text-gray-400">
              Сканируйте штрихкоды с телефона через мобильный интернет <strong>4G/LTE</strong> или любой <strong>Wi-Fi</strong>. Потоковый сканер камеры открывается сразу без предупреждений сертификата.
            </p>
          </div>
        </div>

        <!-- Tab 2: Connected Clients -->
        <div v-show="activeTab === 'clients'">
          <MobileConnectedClientsList
            :clients="connectedClients"
            :is-online="isVdsOnline"
            @refresh="() => fetchConnectedClients(effectiveRevisionId, effectiveStoreNumber)"
          />
        </div>

        <!-- Tab 3: History Journal -->
        <div v-show="activeTab === 'history'">
          <MobileSessionHistory
            :activities="recentActivities"
            :is-server-running="isVdsOnline"
            @clear="clearActivities"
          />
        </div>
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
