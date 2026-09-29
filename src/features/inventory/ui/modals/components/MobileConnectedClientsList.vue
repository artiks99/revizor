<script setup lang="ts">
import { ref, computed } from 'vue'
import type { ConnectedClient } from '../../../model/useMobileSync'

const props = defineProps<{
  clients: ConnectedClient[]
  isOnline: boolean
}>()

const emit = defineEmits<{
  (e: 'refresh'): void
}>()

const showOnlyOnline = ref(true)

const onlineCount = computed(() => props.clients.filter((c) => c.status === 'online').length)

const displayedClients = computed(() => {
  if (showOnlyOnline.value) {
    return props.clients.filter((c) => c.status === 'online')
  }
  return props.clients
})

function formatTimeAgo(seconds: number): string {
  if (seconds < 5) return 'только что'
  if (seconds < 60) return `${seconds} сек назад`
  const mins = Math.floor(seconds / 60)
  if (mins < 60) return `${mins} мин назад`
  const hours = Math.floor(mins / 60)
  return `${hours} ч назад`
}

function getDeviceIcon(device: string): string {
  const d = (device || '').toLowerCase()
  if (d.includes('iphone') || d.includes('ios') || d.includes('apple')) return '📱'
  if (d.includes('android') || d.includes('samsung') || d.includes('xiaomi') || d.includes('redmi')) return '📱'
  if (d.includes('mac') || d.includes('pc') || d.includes('windows')) return '💻'
  return '📱'
}
</script>

<template>
  <div class="space-y-3">
    <!-- Header with count, filter and refresh -->
    <div class="flex items-center justify-between">
      <div class="flex items-center gap-2">
        <span class="text-xs font-semibold text-gray-200">Подключенные ревизоры</span>
        <button
          @click="showOnlyOnline = !showOnlyOnline"
          type="button"
          class="rounded-full px-2 py-0.5 text-[10px] font-bold transition-all cursor-pointer"
          :class="showOnlyOnline ? 'bg-emerald-500/20 text-emerald-300 ring-1 ring-emerald-500/40' : 'bg-gray-800 text-gray-400 hover:text-gray-200'"
          title="Нажмите, чтобы переключить показ (только онлайн / все)"
        >
          {{ showOnlyOnline ? `В сети (${onlineCount})` : `Все (${clients.length})` }}
        </button>
      </div>

      <div class="flex items-center gap-1.5">
        <button
          @click="showOnlyOnline = !showOnlyOnline"
          type="button"
          class="text-[11px] text-gray-400 hover:text-indigo-300 transition-colors cursor-pointer px-1.5 py-0.5"
        >
          {{ showOnlyOnline ? 'Показать всех' : 'Только в сети' }}
        </button>

        <button
          @click="emit('refresh')"
          type="button"
          class="flex items-center gap-1 rounded-lg px-2 py-1 text-[11px] font-medium text-gray-400 hover:bg-gray-800 hover:text-white transition-colors cursor-pointer"
          title="Обновить список устройств"
        >
          <span>🔄</span>
          <span>Обновить</span>
        </button>
      </div>
    </div>

    <!-- Empty State -->
    <div
      v-if="displayedClients.length === 0"
      class="flex flex-col items-center justify-center rounded-xl border border-dashed border-gray-800 bg-gray-900/40 p-6 text-center"
    >
      <div class="text-3xl mb-2">👥</div>
      <p class="text-xs font-semibold text-gray-300">
        {{ showOnlyOnline ? 'Сейчас нет активных ревизоров в сети' : 'Список подключений пуст' }}
      </p>
      <p class="mt-1 text-[11px] text-gray-500 max-w-xs leading-relaxed">
        {{ showOnlyOnline ? 'Устройства, отключившиеся или закрывшие вкладку, скрыты фильтром.' : 'Отсканируйте QR-код на вкладке «Подключение» камерой смартфона.' }}
      </p>
      <button
        v-if="showOnlyOnline && clients.length > 0"
        @click="showOnlyOnline = false"
        type="button"
        class="mt-2 text-[11px] text-indigo-400 hover:underline cursor-pointer"
      >
        Показать недавние подключения ({{ clients.length }})
      </button>
    </div>

    <!-- Clients list -->
    <div v-else class="space-y-2 max-h-[300px] overflow-y-auto pr-1">
      <div
        v-for="client in displayedClients"
        :key="client.client_id"
        class="flex items-start justify-between rounded-xl border border-gray-800/80 bg-gray-900/70 p-3 transition-colors hover:border-gray-700/80"
      >
        <div class="flex items-start gap-2.5 min-w-0 flex-1">
          <!-- Device icon -->
          <div
            class="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-base"
            :class="client.status === 'online' ? 'bg-indigo-500/10 text-indigo-400 ring-1 ring-indigo-500/30' : 'bg-gray-800 text-gray-400'"
          >
            {{ getDeviceIcon(client.device_name) }}
          </div>

          <div class="min-w-0 flex-1 space-y-1">
            <div class="flex items-center gap-2">
              <span class="text-xs font-bold text-white truncate">
                {{ client.user_name || 'Ревизор' }}
              </span>
              <span
                v-if="client.device_name"
                class="rounded bg-gray-800 px-1.5 py-0.5 text-[10px] font-medium text-gray-400 truncate max-w-[120px]"
              >
                {{ client.device_name }}
              </span>
            </div>

            <!-- Last Action -->
            <p class="text-[11px] text-gray-300 truncate font-mono">
              <span class="text-gray-500">Действие:</span>
              <span class="ml-1 text-indigo-300 font-sans font-medium">{{ client.last_action || 'В сети' }}</span>
            </p>

            <!-- Meta info -->
            <div class="flex items-center gap-2 text-[10px] text-gray-500">
              <span v-if="client.ip && client.ip !== '127.0.0.1'">IP: {{ client.ip }}</span>
              <span>•</span>
              <span>Подключен в {{ client.connected_at ? client.connected_at.slice(11, 16) : '—' }}</span>
            </div>
          </div>
        </div>

        <!-- Status badge -->
        <div class="ml-2 flex flex-col items-end shrink-0 gap-1">
          <div
            v-if="client.status === 'online'"
            class="flex items-center gap-1 rounded-full bg-emerald-500/10 px-2 py-0.5 text-[10px] font-semibold text-emerald-400 ring-1 ring-emerald-500/20"
          >
            <span class="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
            <span>Онлайн</span>
          </div>
          <div
            v-else-if="client.status === 'idle'"
            class="flex items-center gap-1 rounded-full bg-amber-500/10 px-2 py-0.5 text-[10px] font-semibold text-amber-400 ring-1 ring-amber-500/20"
          >
            <span class="h-1.5 w-1.5 rounded-full bg-amber-400" />
            <span>Отошел</span>
          </div>
          <div
            v-else
            class="flex items-center gap-1 rounded-full bg-gray-800 px-2 py-0.5 text-[10px] font-semibold text-gray-400"
          >
            <span class="h-1.5 w-1.5 rounded-full bg-gray-500" />
            <span>Офлайн</span>
          </div>

          <span class="text-[10px] text-gray-500">
            {{ formatTimeAgo(client.seconds_ago) }}
          </span>
        </div>
      </div>
    </div>
  </div>
</template>
