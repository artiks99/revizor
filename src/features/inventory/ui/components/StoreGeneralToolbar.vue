<script setup lang="ts">
import { computed } from 'vue'
import type { useStoreGeneralTab } from '../../model/useStoreGeneralTab'
import StoreTabHeaderCard from '@shared/ui/StoreTabHeaderCard.vue'
import UndoRedoButtons from '@shared/ui/UndoRedoButtons.vue'

const props = defineProps<{
  tab: ReturnType<typeof useStoreGeneralTab>
}>()

const {
  store,
  isReadOnly,
  searchQuery,
  quickFilter,
  filterStats,
  sortedRows,
  undoRedo,
  columnFilters,
  sortKey,
  handleCopyAllVisible,
  resetAllFilters,
  exportToCsv,
} = props.tab

const isFilterActive = computed(() => {
  return !!(
    searchQuery.value.trim() ||
    quickFilter.value !== 'all' ||
    Object.keys(columnFilters.value).some((k) => (columnFilters.value[k as keyof typeof columnFilters.value]?.size ?? 0) > 0) ||
    sortKey.value !== 'sku'
  )
})

async function handleClearAll() {
  if (confirm('Вы уверены, что хотите полностью очистить список «Общее»?')) {
    await props.tab.store.clearGeneral()
    props.tab.clearSelection()
    props.tab.showNotification('Список «Общее» очищен')
  }
}
</script>

<template>
  <div class="space-y-4">
    <!-- Standard Header Card (Identical to StoreFactTab standard) -->
    <StoreTabHeaderCard
      icon="📑"
      title="Сводная таблица (Общее)"
      description="Сводный перечень позиций: автопривязка наименований, факта пересчета, остатков, кратности, 299 и расхождений"
    >
      <template #actions>
        <!-- Undo / Redo -->
        <UndoRedoButtons :manager="undoRedo" :is-read-only="isReadOnly" />

        <!-- Export CSV Button -->
        <button
          type="button"
          @click="exportToCsv"
          :disabled="store.generalItems.length === 0"
          class="flex items-center gap-1.5 rounded-lg bg-gray-800/90 px-3.5 py-2 text-xs font-medium text-gray-200 ring-1 ring-gray-700/70 hover:bg-gray-700/80 hover:text-white transition-all cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed shadow-sm"
          title="Экспорт сводной таблицы в файл CSV"
        >
          <span>📄</span>
          <span>Экспорт CSV</span>
        </button>

        <!-- Clear Table Button -->
        <button
          v-if="!isReadOnly && store.generalItems.length > 0"
          type="button"
          @click="handleClearAll"
          class="flex items-center gap-1.5 rounded-lg bg-rose-500/10 px-3 py-2 text-xs font-medium text-rose-400 ring-1 ring-rose-500/20 hover:bg-rose-500/20 hover:text-rose-300 transition-colors cursor-pointer"
          title="Очистить все позиции вкладки «Общее»"
        >
          <span>🗑️</span>
          <span>Очистить</span>
        </button>
      </template>
    </StoreTabHeaderCard>

    <!-- Search & Filter Toolbar (Identical to StoreFactTab standard) -->
    <div class="flex flex-wrap items-center justify-between gap-3">
      <div class="flex flex-wrap items-center gap-2.5">
        <!-- Search Input -->
        <div class="relative">
          <span class="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-gray-500">
            🔍
          </span>
          <input
            v-model="searchQuery"
            type="text"
            placeholder="Поиск по артикулу, названию…"
            class="w-72 rounded-lg bg-gray-900/70 py-2 pl-9 pr-8 text-sm text-gray-200 ring-1 ring-gray-800/60 placeholder:text-gray-600 focus:outline-none focus:ring-1 focus:ring-indigo-500/40 transition-all duration-200"
          />
          <button
            v-if="searchQuery"
            @click="searchQuery = ''"
            class="absolute right-2.5 top-1/2 -translate-y-1/2 text-xs text-gray-500 hover:text-gray-300 transition-colors cursor-pointer"
            title="Очистить поиск"
          >
            ✕
          </button>
        </div>

        <!-- Filter Chips -->
        <div class="flex flex-wrap items-center gap-1 rounded-lg bg-gray-900/70 p-1 ring-1 ring-gray-800/60 text-xs">
          <!-- All -->
          <button
            type="button"
            @click="quickFilter = 'all'"
            class="rounded-md px-2.5 py-1 font-medium transition-all cursor-pointer"
            :class="[
              quickFilter === 'all'
                ? 'bg-indigo-600 text-white shadow-sm'
                : 'text-gray-400 hover:text-gray-200 hover:bg-gray-800/60',
            ]"
          >
            Все ({{ filterStats.total }})
          </button>

          <!-- Discrepancies -->
          <button
            v-if="filterStats.discrepancies > 0"
            type="button"
            @click="quickFilter = 'discrepancies'"
            class="flex items-center gap-1 rounded-md px-2.5 py-1 font-medium transition-all cursor-pointer"
            :class="[
              quickFilter === 'discrepancies'
                ? 'bg-amber-500 text-gray-950 font-bold shadow-sm'
                : 'text-amber-400 hover:bg-amber-500/10',
            ]"
            title="Позиции с расхождением между фактом и системным остатком"
          >
            <span>⚠️</span>
            <span>С расхождением ({{ filterStats.discrepancies }})</span>
          </button>

          <!-- Not Counted in Fact -->
          <button
            v-if="filterStats.noFact > 0"
            type="button"
            @click="quickFilter = 'no_fact'"
            class="flex items-center gap-1 rounded-md px-2.5 py-1 font-medium transition-all cursor-pointer"
            :class="[
              quickFilter === 'no_fact'
                ? 'bg-rose-600 text-white font-bold shadow-sm'
                : 'text-rose-400 hover:bg-rose-500/10',
            ]"
            title="Позиции, которых нет в фактической ревизии"
          >
            <span>❌</span>
            <span>Не посчитаны ({{ filterStats.noFact }})</span>
          </button>

          <!-- Account 299 -->
          <button
            v-if="filterStats.is299Count > 0"
            type="button"
            @click="quickFilter = 'is_299'"
            class="flex items-center gap-1 rounded-md px-2.5 py-1 font-medium transition-all cursor-pointer"
            :class="[
              quickFilter === 'is_299'
                ? 'bg-purple-600 text-white font-bold shadow-sm'
                : 'text-purple-400 hover:bg-purple-500/10',
            ]"
            title="Позиции, присутствующие в счете 299"
          >
            <span>🏷️</span>
            <span>Счет 299 ({{ filterStats.is299Count }})</span>
          </button>

          <!-- Multiplicity > 1 -->
          <button
            v-if="filterStats.multGt1 > 0"
            type="button"
            @click="quickFilter = 'mult_gt_1'"
            class="flex items-center gap-1 rounded-md px-2.5 py-1 font-medium transition-all cursor-pointer"
            :class="[
              quickFilter === 'mult_gt_1'
                ? 'bg-cyan-600 text-white font-bold shadow-sm'
                : 'text-cyan-400 hover:bg-cyan-500/10',
            ]"
            title="Позиции с кратностью упаковки больше 1"
          >
            <span>📐</span>
            <span>Кратность &gt; 1 ({{ filterStats.multGt1 }})</span>
          </button>

          <!-- Not Found in Catalog (Н/Д) -->
          <button
            v-if="filterStats.ndCount > 0"
            type="button"
            @click="quickFilter = 'nd'"
            class="flex items-center gap-1 rounded-md px-2.5 py-1 font-medium transition-all cursor-pointer"
            :class="[
              quickFilter === 'nd'
                ? 'bg-amber-500 text-gray-950 font-bold shadow-sm'
                : 'text-amber-400 hover:bg-amber-500/10',
            ]"
            title="Артикулы, отсутствующие в каталоге магазина"
          >
            <span>⚠️</span>
            <span>Только Н/Д ({{ filterStats.ndCount }})</span>
          </button>
        </div>

        <!-- Reset Button -->
        <button
          v-if="isFilterActive"
          type="button"
          @click="resetAllFilters"
          class="flex items-center gap-1 rounded-lg bg-gray-800/70 px-2.5 py-1.5 text-xs text-gray-400 hover:text-red-300 hover:bg-red-500/10 ring-1 ring-gray-700/50 transition-all cursor-pointer"
          title="Сбросить все фильтры и сортировку"
        >
          <span>✕</span>
          <span>Сбросить</span>
        </button>
      </div>

      <!-- Stats & Quick Actions on Right -->
      <div class="flex items-center gap-2.5">
        <!-- Direct Quick Copy Button for visible items -->
        <button
          v-if="sortedRows.length > 0"
          type="button"
          @click="handleCopyAllVisible"
          class="flex items-center gap-1.5 rounded-lg bg-indigo-500/15 px-3 py-1.5 text-xs font-semibold text-indigo-300 ring-1 ring-indigo-500/30 hover:bg-indigo-500/25 hover:text-indigo-200 transition-all cursor-pointer shadow-sm"
          :title="isFilterActive ? `Скопировать ${sortedRows.length} отфильтрованных ЛК в буфер обмена` : `Скопировать все ${sortedRows.length} ЛК в буфер обмена`"
        >
          <span>📋</span>
          <span>Скопировать ЛК ({{ sortedRows.length }})</span>
        </button>

        <div class="text-xs font-mono text-gray-400">
          Показано: <strong class="text-indigo-400 font-semibold">{{ sortedRows.length }}</strong> из {{ filterStats.total }}
        </div>
      </div>
    </div>
  </div>
</template>
