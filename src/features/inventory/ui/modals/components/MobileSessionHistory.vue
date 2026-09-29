<script setup lang="ts">
import { ref, computed } from 'vue'
import type { MobileSyncActivity } from '../../../model/useMobileSync'
import { eventBus } from '@shared/lib/eventBus'

const props = defineProps<{
  activities: MobileSyncActivity[]
  isServerRunning: boolean
}>()

const emit = defineEmits<{
  (e: 'clear'): void
}>()

const searchQuery = ref('')
const filterType = ref<'all' | 'scan' | 'update' | 'task'>('all')

const scanCount = computed(() => props.activities.filter((a) => a.type === 'scan').length)
const updateCount = computed(() => props.activities.filter((a) => a.type === 'update').length)
const taskCount = computed(() => props.activities.filter((a) => a.type === 'task').length)

const filteredActivities = computed(() => {
  let list = props.activities
  if (filterType.value === 'scan') {
    list = list.filter((a) => a.type === 'scan')
  } else if (filterType.value === 'update') {
    list = list.filter((a) => a.type === 'update')
  } else if (filterType.value === 'task') {
    list = list.filter((a) => a.type === 'task')
  }

  const q = searchQuery.value.trim().toLowerCase()
  if (q) {
    list = list.filter(
      (a) =>
        a.text.toLowerCase().includes(q) ||
        (a.userName && a.userName.toLowerCase().includes(q)) ||
        (a.deviceName && a.deviceName.toLowerCase().includes(q)) ||
        (a.sku && a.sku.toLowerCase().includes(q))
    )
  }

  return list
})

function copyAll() {
  if (props.activities.length === 0) return
  const text = props.activities
    .slice()
    .reverse()
    .map((a) => {
      const author = a.userName ? `[${a.userName}${a.deviceName ? ` @ ${a.deviceName}` : ''}] ` : ''
      return `[${a.time}] ${author}${a.text}`
    })
    .join('\n')

  navigator.clipboard.writeText(text)
  eventBus.emit('app:toast', {
    type: 'success',
    message: `Скопирована вся история сессии (${props.activities.length} записей)`,
  })
}

function handleClear() {
  if (props.activities.length === 0) return
  emit('clear')
  eventBus.emit('app:toast', {
    type: 'info',
    message: 'История операций очищена',
  })
}
</script>

<template>
  <div class="space-y-3">
    <!-- Header with quick actions -->
    <div class="flex items-center justify-between text-xs text-gray-400">
      <div class="flex items-center gap-2">
        <span class="font-medium text-gray-200">Журнал изменений с телефонов</span>
        <span class="rounded-full bg-indigo-500/20 px-2 py-0.5 text-[10px] font-semibold text-indigo-300 ring-1 ring-indigo-500/30">
          {{ activities.length }}
        </span>
      </div>

      <div class="flex items-center gap-2">
        <button
          v-if="activities.length > 0"
          @click="copyAll"
          type="button"
          class="flex items-center gap-1 text-[11px] text-gray-400 hover:text-indigo-300 transition-colors cursor-pointer"
          title="Скопировать журнал изменений в буфер обмена"
        >
          <span>📋</span>
          <span class="hidden sm:inline">Скопировать</span>
        </button>

        <button
          v-if="activities.length > 0"
          @click="handleClear"
          type="button"
          class="text-[11px] text-rose-400/80 hover:text-rose-300 transition-colors cursor-pointer"
          title="Очистить историю"
        >
          Очистить
        </button>
      </div>
    </div>

    <!-- Search & Filters -->
    <div class="space-y-2">
      <div class="relative">
        <input
          v-model="searchQuery"
          type="text"
          placeholder="Поиск по истории (ЛК, имя ревизора, короб, локация)..."
          class="w-full rounded-xl bg-gray-900/90 py-1.5 pl-8 pr-7 text-xs text-gray-200 ring-1 ring-gray-800 placeholder:text-gray-500 focus:outline-none focus:ring-1 focus:ring-indigo-500/60 transition-all"
        />
        <span class="absolute left-2.5 top-1/2 -translate-y-1/2 text-xs text-gray-500">🔍</span>
        <button
          v-if="searchQuery"
          @click="searchQuery = ''"
          type="button"
          class="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-gray-500 hover:text-gray-300 cursor-pointer"
        >
          ✕
        </button>
      </div>

      <div class="flex flex-wrap items-center gap-1.5 text-[11px]">
        <button
          @click="filterType = 'all'"
          type="button"
          :class="filterType === 'all' ? 'bg-indigo-600 text-white font-semibold shadow-sm shadow-indigo-600/30' : 'bg-gray-900 text-gray-400 hover:text-gray-200 border border-gray-800/80'"
          class="rounded-lg px-2.5 py-1 transition-colors cursor-pointer"
        >
          Все ({{ activities.length }})
        </button>
        <button
          @click="filterType = 'scan'"
          type="button"
          :class="filterType === 'scan' ? 'bg-indigo-600 text-white font-semibold shadow-sm shadow-indigo-600/30' : 'bg-gray-900 text-gray-400 hover:text-gray-200 border border-gray-800/80'"
          class="rounded-lg px-2.5 py-1 transition-colors cursor-pointer"
        >
          Сканы ({{ scanCount }})
        </button>
        <button
          @click="filterType = 'update'"
          type="button"
          :class="filterType === 'update' ? 'bg-amber-600 text-white font-semibold shadow-sm shadow-amber-600/30' : 'bg-gray-900 text-gray-400 hover:text-gray-200 border border-gray-800/80'"
          class="rounded-lg px-2.5 py-1 transition-colors cursor-pointer"
        >
          Правки шт/короб ({{ updateCount }})
        </button>
        <button
          @click="filterType = 'task'"
          type="button"
          :class="filterType === 'task' ? 'bg-cyan-600 text-white font-semibold shadow-sm shadow-cyan-600/30' : 'bg-gray-900 text-gray-400 hover:text-gray-200 border border-gray-800/80'"
          class="rounded-lg px-2.5 py-1 transition-colors cursor-pointer"
        >
          Локации ({{ taskCount }})
        </button>
      </div>
    </div>

    <!-- Items List -->
    <div class="max-h-80 space-y-1.5 overflow-y-auto pr-1">
      <div
        v-for="act in filteredActivities"
        :key="act.id"
        class="flex flex-col gap-1 rounded-xl border border-gray-800/70 bg-gray-900/60 hover:bg-gray-900/90 p-2.5 text-xs text-gray-300 transition-colors group"
      >
        <div class="flex items-center justify-between gap-2">
          <!-- User / Device Badge -->
          <div class="flex items-center gap-1.5 min-w-0">
            <span
              class="flex h-5 items-center gap-1 rounded-md px-1.5 text-[10px] font-medium"
              :class="
                act.type === 'scan'
                  ? 'bg-indigo-500/15 text-indigo-300 ring-1 ring-indigo-500/30'
                  : act.type === 'update'
                  ? 'bg-amber-500/15 text-amber-300 ring-1 ring-amber-500/30'
                  : 'bg-cyan-500/15 text-cyan-300 ring-1 ring-cyan-500/30'
              "
            >
              <span>{{ act.type === 'scan' ? '🎯 Скан' : act.type === 'update' ? '✏️ Изменение' : '📁 Локация' }}</span>
            </span>

            <span v-if="act.userName" class="font-medium text-gray-200 truncate">
              👤 {{ act.userName }}
            </span>
            <span v-if="act.deviceName" class="text-[10px] text-gray-500 truncate">
              ({{ act.deviceName }})
            </span>
          </div>

          <!-- Timestamp -->
          <span class="text-[10px] font-mono text-gray-500 group-hover:text-gray-400 shrink-0">
            {{ act.time }}
          </span>
        </div>

        <!-- Action description and details -->
        <div class="flex items-center justify-between gap-2 pl-1">
          <span class="text-gray-300 break-words leading-relaxed">{{ act.text }}</span>
          
          <div v-if="act.qty !== undefined || act.boxNumber !== undefined" class="flex items-center gap-1.5 shrink-0 text-[10px]">
            <span v-if="act.qty !== undefined" class="rounded bg-indigo-900/40 px-1.5 py-0.5 font-semibold text-indigo-300 ring-1 ring-indigo-700/50">
              {{ act.qty }} шт
            </span>
            <span v-if="act.boxNumber !== undefined" class="rounded bg-amber-900/40 px-1.5 py-0.5 font-semibold text-amber-300 ring-1 ring-amber-700/50">
              📦 №{{ act.boxNumber }}
            </span>
          </div>
        </div>
      </div>

      <!-- Empty State -->
      <div v-if="filteredActivities.length === 0" class="flex flex-col items-center justify-center py-8 text-center text-gray-500">
        <span class="text-2xl mb-1">📜</span>
        <p class="text-xs font-medium text-gray-400">
          {{ searchQuery ? 'Ничего не найдено по вашему запросу' : 'Журнал изменений пока пуст' }}
        </p>
        <p class="text-[11px] text-gray-600 mt-0.5">
          Все сканы, правки количества, смена коробов и завершение локаций со смартфонов отобразятся здесь.
        </p>
      </div>
    </div>
  </div>
</template>
