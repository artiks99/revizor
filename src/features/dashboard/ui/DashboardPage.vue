<script setup lang="ts">
import { onMounted, computed } from 'vue'
import { useRouter } from 'vue-router'
import { useDashboardStore } from '../model/useDashboardStore'
import { eventBus } from '@shared/lib/eventBus'
import { formatDateRange } from '@shared/lib/formatDate'

const router = useRouter()
const store = useDashboardStore()

const activeRevisions = computed(() => store.revisions.filter((r) => !r.isArchived))
const archivedRevisions = computed(() => store.revisions.filter((r) => r.isArchived))

onMounted(() => {
  store.loadWidgets()
})

function triggerNewRevision() {
  eventBus.emit('revision:create-requested')
}

function handleWidgetClick(widgetId: string) {
  if (widgetId === 'active-audits') {
    router.push('/inventory')
  } else {
    router.push('/dashboard/statistics')
  }
}
</script>

<template>
  <div class="space-y-6">
    <!-- Welcome banner -->
    <div
      class="relative overflow-hidden rounded-2xl bg-gradient-to-br from-indigo-600/20 via-purple-600/10 to-transparent p-6 ring-1 ring-indigo-500/20"
    >
      <div class="relative z-10 flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h2 class="text-xl font-semibold text-gray-100">Добро пожаловать в Ревизор</h2>
          <p class="mt-1 text-sm text-gray-400">
            Система инвентаризации и учёта материальных ценностей
          </p>
        </div>

        <!-- Controls: Revision selector & Refresh -->
        <div v-if="store.revisions.length > 0" class="flex flex-wrap items-center gap-2">
          <div class="flex items-center gap-2">
            <select
              v-model="store.selectedRevisionId"
              @change="store.loadWidgets(store.selectedRevisionId)"
              class="w-60 sm:w-68 rounded-lg bg-gray-950/90 py-1.5 pl-2.5 pr-7 text-xs font-semibold text-gray-100 ring-1 ring-indigo-500/40 focus:outline-none focus:ring-2 focus:ring-indigo-500 cursor-pointer shadow-md shadow-black/40"
            >
              <option value="all">📊 [Все активные ревизии]</option>

              <optgroup v-if="activeRevisions.length > 0" label="🟢 Активные ревизии">
                <option
                  v-for="rev in activeRevisions"
                  :key="rev.id"
                  :value="rev.id"
                >
                  Магазин №{{ rev.storeNumber }} ({{ formatDateRange(rev.startDate, rev.endDate) }})
                </option>
              </optgroup>

              <optgroup v-if="archivedRevisions.length > 0" label="📦 Архивные ревизии">
                <option
                  v-for="rev in archivedRevisions"
                  :key="rev.id"
                  :value="rev.id"
                >
                  [Архив] Магазин №{{ rev.storeNumber }} ({{ formatDateRange(rev.startDate, rev.endDate) }})
                </option>
              </optgroup>
            </select>
          </div>

          <button
            @click="store.loadWidgets(store.selectedRevisionId)"
            :disabled="store.isLoading"
            class="flex items-center gap-1.5 rounded-lg bg-gray-800/80 px-2.5 py-1.5 text-xs font-semibold text-gray-300 ring-1 ring-gray-700/60 hover:bg-gray-800 hover:text-gray-100 transition-colors cursor-pointer disabled:opacity-50"
            title="Обновить показатели"
          >
            <span :class="{ 'animate-spin': store.isLoading }">🔄</span>
            <span>Обновить</span>
          </button>
        </div>
      </div>
      <!-- Decorative gradient blobs -->
      <div
        class="absolute -right-10 -top-10 h-40 w-40 rounded-full bg-indigo-500/10 blur-3xl"
      />
      <div
        class="absolute -bottom-8 right-20 h-32 w-32 rounded-full bg-purple-500/10 blur-3xl"
      />
    </div>

    <!-- Loading state -->
    <div v-if="store.isLoading" class="flex items-center gap-2 text-gray-400">
      <svg class="h-5 w-5 animate-spin" viewBox="0 0 24 24" fill="none">
        <circle
          class="opacity-25"
          cx="12" cy="12" r="10"
          stroke="currentColor" stroke-width="4"
        />
        <path
          class="opacity-75"
          fill="currentColor"
          d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
        />
      </svg>
      <span class="text-sm">Загрузка актуальных данных…</span>
    </div>

    <!-- Error state -->
    <div
      v-else-if="store.error"
      class="rounded-xl bg-red-500/10 p-4 text-sm text-red-400 ring-1 ring-red-500/20"
    >
      {{ store.error }}
    </div>

    <!-- Widgets grid -->
    <div v-else class="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
      <div
        v-for="widget in store.widgets"
        :key="widget.id"
        @click="handleWidgetClick(widget.id)"
        class="group relative overflow-hidden rounded-xl bg-gray-900/70 p-5 ring-1 ring-gray-800/60 transition-all duration-200 hover:ring-indigo-500/50 hover:shadow-lg hover:shadow-indigo-500/10 cursor-pointer"
        :title="widget.id === 'active-audits' ? 'Перейти к списку ревизий' : 'Открыть подробную статистику'"
      >
        <!-- Icon -->
        <div class="mb-3 text-2xl">{{ widget.icon }}</div>

        <!-- Value -->
        <p class="text-2xl font-bold tracking-tight text-gray-100">
          {{ typeof widget.value === 'number' ? widget.value.toLocaleString('ru-RU') : widget.value }}
        </p>

        <!-- Title -->
        <p class="mt-1 text-sm text-gray-500">{{ widget.title }}</p>

        <!-- Trend badge -->
        <div
          v-if="widget.trendValue"
          class="absolute right-4 top-4 rounded-full px-2 py-0.5 text-xs font-medium"
          :class="{
            'bg-emerald-500/10 text-emerald-400': widget.trend === 'up',
            'bg-amber-500/10 text-amber-400': widget.trend === 'down',
            'bg-gray-500/10 text-gray-400': widget.trend === 'neutral',
          }"
        >
          {{ widget.trendValue }}
        </div>

        <!-- Hover glow -->
        <div
          class="pointer-events-none absolute inset-0 rounded-xl opacity-0 transition-opacity duration-300 group-hover:opacity-100"
          style="background: radial-gradient(circle at 50% 0%, rgba(99,102,241,0.06), transparent 70%)"
        />
      </div>
    </div>

    <!-- Quick actions -->
    <div class="rounded-xl bg-gray-900/50 p-6 ring-1 ring-gray-800/40">
      <h3 class="text-sm font-medium text-gray-300">Быстрые действия</h3>
      <div class="mt-4 flex flex-wrap gap-3">
        <button
          @click="triggerNewRevision"
          class="flex items-center gap-2 rounded-lg bg-gray-800/50 px-4 py-3 text-sm text-gray-300 ring-1 ring-gray-700/30 transition-colors hover:bg-gray-800 hover:text-gray-100 cursor-pointer"
        >
          <span>📋</span> Новая ревизия
        </button>

        <router-link
          to="/dashboard/statistics"
          class="flex items-center gap-2 rounded-lg bg-gray-800/50 px-4 py-3 text-sm text-gray-300 ring-1 ring-gray-700/30 transition-colors hover:bg-gray-800 hover:text-gray-100 cursor-pointer"
        >
          <span>📈</span> Детальная статистика
        </router-link>

        <router-link
          to="/dashboard/percent"
          class="flex items-center gap-2 rounded-lg bg-gray-800/50 px-4 py-3 text-sm text-gray-300 ring-1 ring-gray-700/30 transition-colors hover:bg-gray-800 hover:text-gray-100 cursor-pointer"
        >
          <span>🧮</span> Расчёт процента потерь
        </router-link>
      </div>
    </div>
  </div>
</template>
