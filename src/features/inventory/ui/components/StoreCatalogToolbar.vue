<script setup lang="ts">
import type { useStoreCatalogTab } from '../../model/useStoreCatalogTab'
import { UndoRedoButtons } from '@shared'
import StoreCatalogMassActionsMenu from './StoreCatalogMassActionsMenu.vue'

const props = defineProps<{
  tab: ReturnType<typeof useStoreCatalogTab>
}>()

const {
  store,
  isReadOnly,
  undoRedo,
  searchQuery,
  filterType,
  isImportModalOpen,
  isMassMenuOpen,
  sortedItems,
  isFilterActive,
  duplicateCatalogCount,
  nonStandardCatalogCount,
  selectedIds,
  handleClearCatalog,
  handleResetFilters,
  handleDeduplicate,
  handleRemoveNonStandard,
  handleRemoveFiltered,
  handleCopyFilteredSkus,
  handleCopySelectedSkus,
} = props.tab
</script>

<template>
  <div class="space-y-4">
    <!-- Header / Actions Toolbar -->
    <div class="flex flex-wrap items-center justify-between gap-3 bg-gray-900/60 p-4 rounded-xl ring-1 ring-gray-800/60">
      <div class="flex items-center gap-3">
        <div class="flex h-10 w-10 items-center justify-center rounded-lg bg-indigo-500/10 text-xl text-indigo-400">
          📦
        </div>
        <div>
          <h3 class="text-sm font-semibold text-gray-200">Товары магазина (Ассортимент)</h3>
          <p class="text-xs text-gray-400">
            Системный перечень товаров, которые поступали на магазин и продаются в нем
          </p>
        </div>
      </div>

      <!-- Action Buttons (Hidden when read-only) -->
      <div v-if="!isReadOnly" class="flex items-center gap-2">
        <!-- Mass Actions Dropdown -->
        <StoreCatalogMassActionsMenu
          :is-open="isMassMenuOpen"
          :is-read-only="isReadOnly"
          :duplicate-count="duplicateCatalogCount"
          :non-standard-count="nonStandardCatalogCount"
          :is-filter-active="isFilterActive"
          :filtered-count="sortedItems.length"
          :selected-count="selectedIds.size"
          @toggle="isMassMenuOpen = !isMassMenuOpen"
          @deduplicate="handleDeduplicate"
          @remove-non-standard="handleRemoveNonStandard"
          @remove-filtered="handleRemoveFiltered"
          @copy-filtered="handleCopyFilteredSkus"
          @copy-selected="handleCopySelectedSkus"
        />

        <!-- Undo / Redo buttons -->
        <UndoRedoButtons :manager="undoRedo" :is-read-only="isReadOnly" />

        <button
          type="button"
          @click="isImportModalOpen = true"
          class="flex items-center gap-1.5 rounded-lg bg-indigo-600 px-3.5 py-2 text-xs font-medium text-white shadow-lg shadow-indigo-600/20 hover:bg-indigo-500 transition-colors cursor-pointer"
        >
          <span>📥</span> Загрузить CSV
        </button>
        <button
          v-if="store.catalogItems.length > 0"
          type="button"
          @click="handleClearCatalog"
          class="flex items-center gap-1.5 rounded-lg bg-red-500/10 px-3 py-2 text-xs font-medium text-red-400 ring-1 ring-red-500/20 hover:bg-red-500/20 hover:text-red-300 transition-colors cursor-pointer"
        >
          <span>🗑️</span> Очистить
        </button>
      </div>
    </div>

    <!-- Search & Filter Toolbar -->
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
            placeholder="Поиск по ЛК, наименованию…"
            class="w-64 rounded-lg bg-gray-900/70 py-2 pl-9 pr-8 text-sm text-gray-200 ring-1 ring-gray-800/60 placeholder:text-gray-600 focus:outline-none focus:ring-indigo-500/40 transition-all"
          />
          <button
            v-if="searchQuery"
            type="button"
            @click="searchQuery = ''"
            class="absolute right-2.5 top-1/2 -translate-y-1/2 text-xs text-gray-500 hover:text-gray-300 transition-colors cursor-pointer"
            title="Очистить поиск"
          >
            ✖
          </button>
        </div>

        <!-- Filter Chips: Catalog filters -->
        <div class="flex flex-wrap items-center gap-1 rounded-lg bg-gray-900/70 p-1 ring-1 ring-gray-800/60 text-xs">
          <button
            type="button"
            @click="filterType = 'all'"
            class="rounded-md px-2.5 py-1 font-medium transition-all cursor-pointer"
            :class="[
              filterType === 'all'
                ? 'bg-indigo-600 text-white shadow-sm'
                : 'text-gray-400 hover:text-gray-200 hover:bg-gray-800/60',
            ]"
          >
            Все ({{ store.totalCatalogCount }})
          </button>

          <button
            v-if="duplicateCatalogCount > 0"
            type="button"
            @click="filterType = 'duplicates'"
            class="flex items-center gap-1 rounded-md px-2.5 py-1 font-medium transition-all cursor-pointer"
            :class="[
              filterType === 'duplicates'
                ? 'bg-rose-600 text-white font-bold shadow-sm'
                : 'text-rose-400 hover:bg-rose-500/10',
            ]"
            title="Показать только дублирующиеся товары"
          >
            <span>⚠️</span>
            <span>Дубликаты ({{ duplicateCatalogCount }})</span>
          </button>

          <button
            v-if="nonStandardCatalogCount > 0"
            type="button"
            @click="filterType = 'non_standard'"
            class="flex items-center gap-1 rounded-md px-2.5 py-1 font-medium transition-all cursor-pointer"
            :class="[
              filterType === 'non_standard'
                ? 'bg-amber-500 text-gray-950 font-bold shadow-sm'
                : 'text-amber-400 hover:bg-amber-500/10',
            ]"
            title="Показать нестандартные артикулы (не 7 цифр)"
          >
            <span>⚠️</span>
            <span>Нестандартные ЛК ({{ nonStandardCatalogCount }})</span>
          </button>
        </div>

        <!-- Reset Button -->
        <button
          v-if="isFilterActive"
          type="button"
          @click="handleResetFilters"
          class="flex items-center gap-1 rounded-lg bg-gray-800/70 px-2.5 py-1.5 text-xs text-gray-400 hover:text-red-300 hover:bg-red-500/10 ring-1 ring-gray-700/50 transition-all cursor-pointer"
          title="Сбросить все фильтры и сортировку"
        >
          <span>✕</span>
          <span>Сбросить</span>
        </button>
      </div>

      <!-- Stats & Quick Actions -->
      <div class="flex items-center gap-2.5">
        <!-- Direct Quick Fix Button -->
        <button
          v-if="!isReadOnly && filterType === 'duplicates' && duplicateCatalogCount > 0"
          type="button"
          @click="handleDeduplicate"
          class="inline-flex items-center gap-1.5 rounded-lg bg-rose-500/20 px-3 py-1.5 text-xs font-semibold text-rose-300 ring-1 ring-rose-500/40 hover:bg-rose-500/30 transition-all cursor-pointer shadow-sm animate-pulse"
        >
          <span>⚡</span>
          <span>Удалить дубликаты ({{ duplicateCatalogCount }})</span>
        </button>

        <button
          v-else-if="!isReadOnly && filterType === 'non_standard' && nonStandardCatalogCount > 0"
          type="button"
          @click="handleRemoveNonStandard"
          class="inline-flex items-center gap-1.5 rounded-lg bg-amber-500/20 px-3 py-1.5 text-xs font-semibold text-amber-300 ring-1 ring-amber-500/40 hover:bg-amber-500/30 transition-all cursor-pointer shadow-sm"
        >
          <span>🗑️</span>
          <span>Удалить {{ nonStandardCatalogCount }} нестандартных</span>
        </button>

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

        <div class="text-xs font-mono text-gray-400">
          Показано: <strong class="text-indigo-400 font-semibold">{{ sortedItems.length }}</strong> из {{ store.totalCatalogCount }}
        </div>
      </div>
    </div>
  </div>
</template>
