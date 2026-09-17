<script setup lang="ts">
import type { useStoreMultiplicityTab } from '../../model/useStoreMultiplicityTab'
import { UndoRedoButtons } from '@shared'
import StoreMultiplicityMassActionsMenu from './StoreMultiplicityMassActionsMenu.vue'

const props = defineProps<{
  tab: ReturnType<typeof useStoreMultiplicityTab>
}>()

const {
  store,
  isReadOnly,
  undoRedo,
  searchQuery,
  filterType,
  sortedItems,
  isFilterActive,
  duplicateCount,
  ndCount,
  inCatalogCount,
  multiplicityGtOneCount,
  resetFilters,
  handleExportCsv,
  handleCopyFilteredSkus,
} = props.tab
</script>

<template>
  <div class="space-y-4">
    <!-- Header / Actions Toolbar -->
    <div class="flex flex-wrap items-center justify-between gap-3 bg-gray-900/60 p-4 rounded-xl ring-1 ring-gray-800/60">
      <div class="flex items-center gap-3">
        <div class="flex h-10 w-10 items-center justify-center rounded-lg bg-indigo-500/10 text-xl text-indigo-400">
          📐
        </div>
        <div>
          <div class="flex items-center gap-2">
            <h3 class="text-sm font-semibold text-gray-200">Кратность товаров</h3>
            <span class="rounded-full bg-indigo-500/15 px-2 py-0.5 text-[11px] font-medium text-indigo-400 ring-1 ring-indigo-500/20 font-mono">
              {{ store.totalMultiplicityCount }}
            </span>
          </div>
          <p class="text-xs text-gray-400">
            Учет кратности упаковок/коробок для пересчета товаров
          </p>
        </div>
      </div>

      <!-- Action Buttons (Hidden when read-only) -->
      <div v-if="!isReadOnly" class="flex items-center gap-2">
        <!-- Mass Actions Dropdown -->
        <StoreMultiplicityMassActionsMenu :tab="tab" />

        <!-- Undo / Redo buttons -->
        <UndoRedoButtons :manager="undoRedo" :is-read-only="isReadOnly" />

        <!-- Export Button -->
        <button
          type="button"
          @click="handleExportCsv"
          :disabled="store.totalMultiplicityCount === 0"
          class="flex items-center gap-1.5 rounded-lg bg-gray-800 px-3 py-2 text-xs font-medium text-gray-300 hover:bg-gray-700 hover:text-white disabled:opacity-40 disabled:cursor-not-allowed transition-all cursor-pointer ring-1 ring-gray-700/50"
          title="Экспортировать позиции кратности в CSV"
        >
          <span>📤</span>
          <span>Экспорт CSV</span>
        </button>
      </div>
    </div>

    <!-- Search & Filter Bar -->
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
            placeholder="Поиск по ЛК или наименованию…"
            class="w-72 rounded-lg bg-gray-900/70 py-2 pl-9 pr-8 text-sm text-gray-200 ring-1 ring-gray-800/60 placeholder:text-gray-600 focus:outline-none focus:ring-indigo-500/40 transition-all duration-200"
          />
          <button
            v-if="searchQuery"
            type="button"
            @click="searchQuery = ''"
            class="absolute right-2.5 top-1/2 -translate-y-1/2 text-xs text-gray-500 hover:text-gray-300 transition-colors cursor-pointer"
            title="Очистить поиск"
          >
            ✕
          </button>
        </div>

        <!-- Filter Chips -->
        <div class="flex flex-wrap items-center gap-1 rounded-lg bg-gray-900/70 p-1 ring-1 ring-gray-800/60 text-xs">
          <button
            type="button"
            @click="filterType = 'all'"
            class="rounded-md px-2.5 py-1 font-medium transition-all cursor-pointer"
            :class="[
              filterType === 'all'
                ? 'bg-indigo-600 text-white shadow-sm font-semibold'
                : 'text-gray-400 hover:text-gray-200 hover:bg-gray-800/50',
            ]"
          >
            Все ({{ store.totalMultiplicityCount }})
          </button>

          <button
            v-if="store.hasCatalog"
            type="button"
            @click="filterType = 'in_catalog'"
            class="rounded-md px-2.5 py-1 font-medium transition-all cursor-pointer"
            :class="[
              filterType === 'in_catalog'
                ? 'bg-indigo-600 text-white shadow-sm font-semibold'
                : 'text-gray-400 hover:text-gray-200 hover:bg-gray-800/50',
            ]"
          >
            В каталоге ({{ inCatalogCount }})
          </button>

          <button
            v-if="store.hasCatalog && ndCount > 0"
            type="button"
            @click="filterType = 'nd'"
            class="flex items-center gap-1 rounded-md px-2.5 py-1 font-medium transition-all cursor-pointer"
            :class="[
              filterType === 'nd'
                ? 'bg-amber-500 text-gray-950 font-bold shadow-sm'
                : 'text-amber-400 hover:bg-amber-500/10',
            ]"
            title="Показать позиции, отсутствующие в справочнике товаров"
          >
            <span>⚠️</span>
            <span>Н/Д ({{ ndCount }})</span>
          </button>

          <button
            v-if="multiplicityGtOneCount > 0"
            type="button"
            @click="filterType = 'gt_one'"
            class="flex items-center gap-1 rounded-md px-2.5 py-1 font-medium transition-all cursor-pointer"
            :class="[
              filterType === 'gt_one'
                ? 'bg-indigo-600 text-white shadow-sm font-semibold'
                : 'text-gray-400 hover:text-gray-200 hover:bg-gray-800/50',
            ]"
            title="Показать только позиции с кратностью больше 1"
          >
            <span>Кратность > 1 ({{ multiplicityGtOneCount }})</span>
          </button>

          <button
            v-if="duplicateCount > 0"
            type="button"
            @click="filterType = 'duplicates'"
            class="flex items-center gap-1 rounded-md px-2.5 py-1 font-medium transition-all cursor-pointer"
            :class="[
              filterType === 'duplicates'
                ? 'bg-rose-500 text-white font-bold shadow-sm'
                : 'text-rose-400 hover:bg-rose-500/10',
            ]"
            title="Показать дублирующиеся позиции"
          >
            <span>⚠️</span>
            <span>Дубликаты ({{ duplicateCount }})</span>
          </button>
        </div>

        <!-- Reset Button -->
        <button
          v-if="isFilterActive"
          type="button"
          @click="resetFilters"
          class="flex items-center gap-1 rounded-lg bg-gray-800/70 px-2.5 py-1.5 text-xs text-gray-400 hover:text-red-300 hover:bg-red-500/10 ring-1 ring-gray-700/50 transition-all cursor-pointer"
          title="Сбросить все фильтры"
        >
          <span>✕</span>
          <span>Сбросить</span>
        </button>
      </div>

      <!-- Counter & Quick Copy -->
      <div class="flex items-center gap-2.5">
        <!-- Direct Quick Copy Button for visible items -->
        <button
          v-if="sortedItems.length > 0"
          type="button"
          @click="handleCopyFilteredSkus"
          class="flex items-center gap-1.5 rounded-lg bg-indigo-500/15 px-3 py-1.5 text-xs font-semibold text-indigo-300 ring-1 ring-indigo-500/30 hover:bg-indigo-500/25 hover:text-indigo-200 transition-all cursor-pointer shadow-sm"
          :title="isFilterActive ? `Скопировать ${sortedItems.length} отфильтрованных ЛК в буфер обмена` : `Скопировать все ${sortedItems.length} ЛК в буфер обмена`"
        >
          <span>📋</span>
          <span>Скопировать ЛК ({{ sortedItems.length }})</span>
        </button>

        <div class="text-xs text-gray-500 font-mono">
          Показано: <span class="text-indigo-400 font-semibold">{{ sortedItems.length }}</span> из {{ store.totalMultiplicityCount }}
        </div>
      </div>
    </div>

    <!-- Archived / Read-Only Banner -->
    <div
      v-if="isReadOnly"
      class="flex items-center gap-2 rounded-lg bg-amber-500/10 px-3 py-2 text-xs text-amber-400 ring-1 ring-amber-500/20"
    >
      <span>🔒</span>
      <span>Ревизия в архиве — изменения заблокированы</span>
    </div>
  </div>
</template>
