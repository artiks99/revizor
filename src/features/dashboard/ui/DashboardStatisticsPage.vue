<script setup lang="ts">
import { onMounted, watch } from 'vue'
import { useDashboardStatsStore } from '../model/useDashboardStats'
import StatsCardsGrid from './components/StatsCardsGrid.vue'
import StatsMissingSkuTable from './components/StatsMissingSkuTable.vue'
import StatsLocationsTable from './components/StatsLocationsTable.vue'
import StatsAllRevisionsTable from './components/StatsAllRevisionsTable.vue'
import { formatDateRange } from '@shared/lib/formatDate'

const store = useDashboardStatsStore()

onMounted(async () => {
  await store.loadRevisions()
  if (store.selectedRevisionId === 'all') {
    await store.loadAllRevisionsStats()
  } else {
    await store.loadCurrentStats()
  }
})

watch(
  () => store.selectedRevisionId,
  async (newId) => {
    store.searchQuery = ''
    if (newId === 'all') {
      store.activeTab = 'all'
      await store.loadAllRevisionsStats()
    } else {
      if (store.activeTab === 'all') {
        store.activeTab = 'missing'
      }
      await store.loadCurrentStats()
    }
  }
)

function handleTabChange(tab: 'missing' | 'locations' | 'all') {
  store.activeTab = tab
  store.searchQuery = ''
  if (tab === 'all') {
    store.loadAllRevisionsStats()
  }
}
</script>

<template>
  <div class="space-y-3.5">
    <!-- Header with Revision Selector -->
    <div
      class="relative overflow-hidden rounded-xl bg-gradient-to-br from-indigo-950/40 via-purple-950/25 to-gray-900/80 px-4 py-3 ring-1 ring-indigo-500/20 shadow-lg shadow-black/20"
    >
      <div class="relative z-10 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <div class="flex items-center gap-2">
            <span class="text-lg">📈</span>
            <h2 class="text-base font-bold tracking-wide text-gray-100">Статистика склада</h2>
          </div>
          <p class="mt-0.5 text-[11px] text-gray-400">
            Фактические показатели ревизий, локаций и сверка с общим списком артикулов
          </p>
        </div>

        <!-- Controls: Revision Picker + Refresh -->
        <div class="flex flex-wrap items-center gap-2">
          <div class="flex items-center gap-2">
            <label class="text-xs font-medium text-gray-400">Ревизия:</label>
            <div class="relative">
              <select
                v-model="store.selectedRevisionId"
                class="w-64 sm:w-72 rounded-lg bg-gray-950/90 py-1.5 pl-2.5 pr-7 text-xs font-semibold text-gray-100 ring-1 ring-indigo-500/40 focus:outline-none focus:ring-2 focus:ring-indigo-500 cursor-pointer shadow-md shadow-black/40"
              >
                <option value="all">📊 [Все ревизии — Сводная таблица]</option>

                <optgroup v-if="store.activeRevisions.length > 0" label="🟢 Активные ревизии">
                  <option
                    v-for="rev in store.activeRevisions"
                    :key="rev.id"
                    :value="rev.id"
                  >
                    Магазин №{{ rev.storeNumber }} ({{ formatDateRange(rev.startDate, rev.endDate) }})
                  </option>
                </optgroup>

                <optgroup v-if="store.archivedRevisions.length > 0" label="📦 Архивные ревизии">
                  <option
                    v-for="rev in store.archivedRevisions"
                    :key="rev.id"
                    :value="rev.id"
                  >
                    [Архив] Магазин №{{ rev.storeNumber }} ({{ formatDateRange(rev.startDate, rev.endDate) }})
                  </option>
                </optgroup>
              </select>
            </div>
          </div>

          <!-- Refresh Button -->
          <button
            @click="store.refresh()"
            :disabled="store.isLoading"
            class="flex items-center gap-1.5 rounded-lg bg-gray-800/80 px-2.5 py-1.5 text-xs font-semibold text-gray-300 ring-1 ring-gray-700/60 hover:bg-gray-800 hover:text-gray-100 transition-colors cursor-pointer disabled:opacity-50"
            title="Обновить статистику"
          >
            <span :class="{ 'animate-spin': store.isLoading }">🔄</span>
            <span>Обновить</span>
          </button>
        </div>
      </div>
    </div>

    <!-- Loading State with Skeleton Cards & Active Status -->
    <div v-if="store.isLoading" class="space-y-3.5">
      <!-- Loading Banner -->
      <div class="flex items-center gap-3.5 rounded-xl border border-indigo-500/20 bg-indigo-950/20 p-3 backdrop-blur-sm shadow-lg shadow-indigo-950/20">
        <div class="relative flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-indigo-500/10 text-base text-indigo-400 ring-1 ring-indigo-500/20">
          <svg class="h-4 w-4 animate-spin text-indigo-400" viewBox="0 0 24 24" fill="none">
            <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4" />
            <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
        </div>
        <div class="flex-1 min-w-0">
          <div class="flex items-center gap-2">
            <h4 class="text-xs font-semibold text-gray-200">Идёт расчёт показателей склада…</h4>
            <span class="inline-flex items-center gap-1 rounded-full bg-indigo-500/20 px-2 py-0.2 text-[10px] font-medium text-indigo-300">
              <span class="h-1.5 w-1.5 rounded-full bg-indigo-400 animate-ping"></span>
              Сверка базы данных
            </span>
          </div>
          <p class="text-[11px] text-gray-400">
            Подсчёт уникальных ЛК, суммы факта, локаций и сверка с общим списком артикулов
          </p>
        </div>
      </div>

      <!-- Skeleton KPI Cards with Pulse -->
      <div class="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div
          v-for="i in 4"
          :key="i"
          class="relative overflow-hidden rounded-xl bg-gray-900/60 p-4 ring-1 ring-gray-800/60 animate-pulse"
        >
          <div class="flex items-center justify-between">
            <div class="h-7 w-7 rounded-lg bg-gray-800/80"></div>
            <div class="h-4 w-12 rounded bg-gray-800/80"></div>
          </div>
          <div class="mt-3 space-y-1.5">
            <div class="h-6 w-24 rounded bg-gray-800/80"></div>
            <div class="h-2.5 w-32 rounded bg-gray-800/60"></div>
          </div>
        </div>
      </div>
    </div>

    <!-- Error State -->
    <div
      v-else-if="store.error"
      class="rounded-xl bg-red-500/10 p-3 text-xs text-red-400 ring-1 ring-red-500/20"
    >
      {{ store.error }}
    </div>

    <!-- Revision View (Single Revision) -->
    <div v-else-if="store.currentStats" class="space-y-3.5">
      <!-- Unified KPI Grid (Row 1: 4 cards, Row 2: Locations + 299 + Multiplicities) -->
      <StatsCardsGrid :stats="store.currentStats" />

      <!-- Sub-Tabs Navigation -->
      <div class="flex items-center justify-between border-b border-gray-800/80 pb-1.5">
        <div class="flex items-center gap-1.5">
          <button
            @click="handleTabChange('missing')"
            class="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition-all duration-150 cursor-pointer"
            :class="[
              store.activeTab === 'missing'
                ? 'bg-amber-500/20 text-amber-300 ring-1 ring-amber-500/40'
                : 'text-gray-400 hover:bg-gray-800/40 hover:text-gray-200'
            ]"
          >
            <span>⚠️</span>
            <span>Не забитые на склад ({{ store.currentStats.missingGeneralSkuCount }})</span>
          </button>

          <button
            @click="handleTabChange('locations')"
            class="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition-all duration-150 cursor-pointer"
            :class="[
              store.activeTab === 'locations'
                ? 'bg-purple-500/20 text-purple-300 ring-1 ring-purple-500/40'
                : 'text-gray-400 hover:bg-gray-800/40 hover:text-gray-200'
            ]"
          >
            <span>📍</span>
            <span>Локации склада ({{ store.currentStats.locations.length }})</span>
          </button>

          <button
            @click="handleTabChange('all')"
            class="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition-all duration-150 cursor-pointer"
            :class="[
              store.activeTab === 'all'
                ? 'bg-indigo-500/20 text-indigo-300 ring-1 ring-indigo-500/40'
                : 'text-gray-400 hover:bg-gray-800/40 hover:text-gray-200'
            ]"
          >
            <span>📊</span>
            <span>Сводка по всем ревизиям</span>
          </button>
        </div>
      </div>

      <!-- Tab Content -->
      <StatsMissingSkuTable
        v-if="store.activeTab === 'missing'"
        :items="store.filteredMissingSkus"
        :search-query="store.searchQuery"
        :revision-id="store.selectedRevisionId"
        @update:search-query="store.searchQuery = $event"
        @copy="store.copyMissingSkus()"
      />

      <StatsLocationsTable
        v-else-if="store.activeTab === 'locations'"
        :items="store.filteredLocations"
        :total-fact-qty="store.currentStats.factTotalQuantity"
        :search-query="store.searchQuery"
        @update:search-query="store.searchQuery = $event"
      />

      <StatsAllRevisionsTable
        v-else-if="store.activeTab === 'all'"
        :items="store.allStats"
        :is-loading="store.isAllStatsLoading"
        @select="store.selectedRevisionId = $event"
      />
    </div>

    <!-- All Revisions Summary View -->
    <div v-else-if="store.selectedRevisionId === 'all'" class="space-y-4">
      <StatsAllRevisionsTable
        :items="store.allStats"
        :is-loading="store.isAllStatsLoading"
        @select="store.selectedRevisionId = $event"
      />
    </div>
  </div>
</template>
