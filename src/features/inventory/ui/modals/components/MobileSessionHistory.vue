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

const isExpanded = ref(false)
const searchQuery = ref('')
const filterType = ref<'all' | 'scan' | 'task'>('all')

const scanCount = computed(() => props.activities.filter((a) => a.type === 'scan').length)
const taskCount = computed(() => props.activities.filter((a) => a.type === 'task').length)

const filteredActivities = computed(() => {
  let list = props.activities
  if (filterType.value === 'scan') {
    list = list.filter((a) => a.type === 'scan')
  } else if (filterType.value === 'task') {
    list = list.filter((a) => a.type === 'task')
  }

  const q = searchQuery.value.trim().toLowerCase()
  if (q) {
    list = list.filter((a) => a.text.toLowerCase().includes(q))
  }

  return list
})

function copyAll() {
  if (props.activities.length === 0) return
  const text = props.activities
    .slice()
    .reverse()
    .map((a) => `[${a.time}] ${a.text}`)
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
    message: 'История сессии очищена',
  })
}
</script>

<template>
  <div v-if="activities.length > 0" class="space-y-2.5 border-t border-gray-800/80 pt-3">
    <!-- Header -->
    <div class="flex items-center justify-between text-xs text-gray-400">
      <div class="flex items-center gap-2">
        <span class="font-medium text-gray-200">Сканирования с телефона</span>
        <span class="rounded-full bg-indigo-500/20 px-2 py-0.5 text-[10px] font-semibold text-indigo-300 ring-1 ring-indigo-500/30">
          {{ activities.length }}
        </span>
      </div>

      <div class="flex items-center gap-2">
        <button
          @click="copyAll"
          type="button"
          class="flex items-center gap-1 text-[11px] text-gray-400 hover:text-indigo-300 transition-colors cursor-pointer"
          title="Скопировать всю историю сессии в буфер обмена"
        >
          <span>📋</span>
          <span class="hidden sm:inline">Скопировать</span>
        </button>

        <button
          @click="isExpanded = !isExpanded"
          type="button"
          class="flex items-center gap-1 text-[11px] font-medium transition-colors cursor-pointer"
          :class="isExpanded ? 'text-amber-400 hover:text-amber-300' : 'text-indigo-400 hover:text-indigo-300'"
          :title="isExpanded ? 'Свернуть историю' : 'Развернуть полную историю сессии'"
        >
          <span>{{ isExpanded ? 'Свернуть ▾' : 'Вся история ↗' }}</span>
        </button>

        <span class="flex items-center gap-1 text-emerald-400">
          <span class="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-ping" />
          <span>В сети</span>
        </span>
      </div>
    </div>

    <!-- Search & Filters when expanded -->
    <div v-if="isExpanded" class="space-y-2 pt-1 animate-fadeIn">
      <div class="relative">
        <input
          v-model="searchQuery"
          type="text"
          placeholder="Поиск по истории (ШК, локация)..."
          class="w-full rounded-lg bg-gray-900/90 py-1.5 pl-8 pr-7 text-xs text-gray-200 ring-1 ring-gray-800 placeholder:text-gray-500 focus:outline-none focus:ring-1 focus:ring-indigo-500/60 transition-all"
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

      <div class="flex items-center justify-between text-[11px]">
        <div class="flex items-center gap-1.5">
          <button
            @click="filterType = 'all'"
            type="button"
            :class="filterType === 'all' ? 'bg-indigo-600 text-white font-semibold' : 'bg-gray-900 text-gray-400 hover:text-gray-200'"
            class="rounded-md px-2 py-0.5 transition-colors cursor-pointer"
          >
            Все ({{ activities.length }})
          </button>
          <button
            @click="filterType = 'scan'"
            type="button"
            :class="filterType === 'scan' ? 'bg-indigo-600 text-white font-semibold' : 'bg-gray-900 text-gray-400 hover:text-gray-200'"
            class="rounded-md px-2 py-0.5 transition-colors cursor-pointer"
          >
            Сканы ({{ scanCount }})
          </button>
          <button
            @click="filterType = 'task'"
            type="button"
            :class="filterType === 'task' ? 'bg-indigo-600 text-white font-semibold' : 'bg-gray-900 text-gray-400 hover:text-gray-200'"
            class="rounded-md px-2 py-0.5 transition-colors cursor-pointer"
          >
            Локации ({{ taskCount }})
          </button>
        </div>

        <button
          @click="handleClear"
          type="button"
          class="text-[10px] text-rose-400/80 hover:text-rose-300 transition-colors cursor-pointer"
          title="Очистить историю сессии"
        >
          Очистить
        </button>
      </div>
    </div>

    <!-- Items List -->
    <div
      :class="isExpanded ? 'max-h-72' : 'max-h-36'"
      class="space-y-1 overflow-y-auto pr-1 transition-all duration-200"
    >
      <div
        v-for="act in filteredActivities"
        :key="act.id"
        class="flex items-center justify-between rounded-lg bg-gray-900/50 hover:bg-gray-900/90 px-2.5 py-1.5 text-xs text-gray-300 transition-colors group"
      >
        <div class="flex items-center gap-2 min-w-0 flex-1">
          <span class="text-[11px] opacity-75 shrink-0">
            {{ act.type === 'scan' ? '🎯' : act.type === 'task' ? '📁' : '📱' }}
          </span>
          <span class="truncate" :title="act.text">{{ act.text }}</span>
        </div>
        <span class="text-[10px] text-gray-500 font-mono shrink-0 ml-2 group-hover:text-gray-400 transition-colors">
          {{ act.time }}
        </span>
      </div>

      <div v-if="filteredActivities.length === 0" class="py-4 text-center text-xs text-gray-500">
        {{ searchQuery ? 'Ничего не найдено по фильтру' : 'Список пуст' }}
      </div>
    </div>
  </div>
</template>
