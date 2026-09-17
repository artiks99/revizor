<script setup lang="ts">
import type { useStoreStockTab } from '../../model/useStoreStockTab'
import UndoRedoButtons from '@shared/ui/UndoRedoButtons.vue'
import StoreStockMassActionsMenu from './StoreStockMassActionsMenu.vue'

const props = defineProps<{
  tab: ReturnType<typeof useStoreStockTab>
}>()

const {
  store,
  isReadOnly,
  undoRedo,
  searchQuery,
  filterStatus,
  isImportModalOpen,
  duplicateStockCount,
  redundantDuplicateCount,
  nonStandardStockCount,
  ndCount,
  in299Count,
  positiveCount,
  zeroCount,
  sortedItems,
  isFilterActive,
  handleResetFilters,
  handleClearStock,
  handleMergeDuplicates,
  handleRemoveDuplicatesOnly,
  handleRemoveNonStandard,
  handleRemoveNotFound,
  handleCopyFilteredSkus,
} = props.tab
</script>

<template>
  <div class="space-y-4 relative">
    <!-- Header / Actions Toolbar -->
    <div class="flex flex-wrap items-center justify-between gap-3 bg-gray-900/60 p-4 rounded-xl ring-1 ring-gray-800/60">
      <div class="flex items-center gap-3">
        <div class="flex h-10 w-10 items-center justify-center rounded-lg bg-emerald-500/10 text-xl text-emerald-400">
          📊
        </div>
        <div>
          <h3 class="text-sm font-semibold text-gray-200">Системные остатки (аудит)</h3>
          <p class="text-xs text-gray-400">
            Учетные остатки товаров в магазине после проведения продаж
          </p>
        </div>
      </div>

      <!-- Action Buttons (Hidden when read-only) -->
      <div v-if="!isReadOnly" class="flex items-center gap-2">
        <!-- Mass Actions Dropdown -->
        <StoreStockMassActionsMenu :tab="tab" />

        <!-- Undo / Redo buttons -->
        <UndoRedoButtons :manager="undoRedo" :is-read-only="isReadOnly" />

        <button
          @click="isImportModalOpen = true"
          class="flex items-center gap-1.5 rounded-lg bg-indigo-600 px-3 py-2 text-xs font-medium text-white shadow-lg shadow-indigo-600/20 hover:bg-indigo-500 transition-colors cursor-pointer"
        >
          <span>📥</span> Загрузить CSV
        </button>

        <button
          v-if="store.stockItems.length > 0"
          @click="handleClearStock"
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
            placeholder="Поиск по артикулу или названию…"
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
          <button
            type="button"
            @click="filterStatus = 'all'"
            class="rounded-md px-2.5 py-1 font-medium transition-all cursor-pointer"
            :class="[
              filterStatus === 'all'
                ? 'bg-indigo-600 text-white shadow-sm'
                : 'text-gray-400 hover:text-gray-200 hover:bg-gray-800/60',
            ]"
          >
            Все ({{ store.totalStockCount }})
          </button>

          <button
            v-if="in299Count > 0"
            type="button"
            @click="filterStatus = 'in_299'"
            class="flex items-center gap-1 rounded-md px-2.5 py-1 font-medium transition-all cursor-pointer"
            :class="[
              filterStatus === 'in_299'
                ? 'bg-amber-500 text-gray-950 font-bold shadow-sm'
                : 'text-amber-400 hover:bg-amber-500/10',
            ]"
            title="Товары, присутствующие в счете 299"
          >
            <span>🏷️</span>
            <span>Счет 299 ({{ in299Count }})</span>
          </button>

          <button
            v-if="duplicateStockCount > 0"
            type="button"
            @click="filterStatus = 'duplicates'"
            class="flex items-center gap-1 rounded-md px-2.5 py-1 font-medium transition-all cursor-pointer"
            :class="[
              filterStatus === 'duplicates'
                ? 'bg-rose-600 text-white font-bold shadow-sm'
                : 'text-rose-400 hover:bg-rose-500/10',
            ]"
            title="Показать только дублирующиеся позиции в остатках"
          >
            <span>⚠️</span>
            <span>Дубликаты ({{ duplicateStockCount }})</span>
          </button>

          <button
            v-if="nonStandardStockCount > 0"
            type="button"
            @click="filterStatus = 'non_standard'"
            class="flex items-center gap-1 rounded-md px-2.5 py-1 font-medium transition-all cursor-pointer"
            :class="[
              filterStatus === 'non_standard'
                ? 'bg-amber-500 text-gray-950 font-bold shadow-sm'
                : 'text-amber-400 hover:bg-amber-500/10',
            ]"
            title="Показать нестандартные артикулы (не 7 цифр)"
          >
            <span>⚠️</span>
            <span>Нестандартные ЛК/ДК ({{ nonStandardStockCount }})</span>
          </button>

          <button
            v-if="ndCount > 0"
            type="button"
            @click="filterStatus = 'nd'"
            class="flex items-center gap-1 rounded-md px-2.5 py-1 font-medium transition-all cursor-pointer"
            :class="[
              filterStatus === 'nd'
                ? 'bg-amber-500 text-gray-950 font-bold shadow-sm'
                : 'text-amber-400 hover:bg-amber-500/10',
            ]"
            title="Показать позиции, которых нет в каталоге"
          >
            <span>⚠️</span>
            <span>Н/Д ({{ ndCount }})</span>
          </button>

          <button
            type="button"
            @click="filterStatus = 'positive'"
            class="rounded-md px-2.5 py-1 font-medium transition-all cursor-pointer"
            :class="[
              filterStatus === 'positive'
                ? 'bg-indigo-600 text-white shadow-sm'
                : 'text-gray-400 hover:text-gray-200 hover:bg-gray-800/60',
            ]"
          >
            Остаток &gt; 0 ({{ positiveCount }})
          </button>

          <button
            v-if="zeroCount > 0"
            type="button"
            @click="filterStatus = 'zero'"
            class="rounded-md px-2.5 py-1 font-medium transition-all cursor-pointer"
            :class="[
              filterStatus === 'zero'
                ? 'bg-gray-700 text-gray-200 font-bold shadow-sm'
                : 'text-gray-400 hover:text-gray-200 hover:bg-gray-800/60',
            ]"
          >
            Остаток = 0 ({{ zeroCount }})
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

        <!-- Direct Quick Action Buttons for Duplicates -->
        <button
          v-if="!isReadOnly && duplicateStockCount > 0"
          type="button"
          @click="handleRemoveDuplicatesOnly"
          class="inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-semibold text-white ring-1 ring-indigo-400/40 hover:bg-indigo-500 transition-all cursor-pointer shadow-sm"
          title="Сохранить по 1 первой записи на каждый товар и удалить лишние повторки от штрихкодов"
        >
          <span>🗑️</span>
          <span>Оставить по 1 шт (удалить повторы: {{ redundantDuplicateCount }})</span>
        </button>

        <button
          v-if="!isReadOnly && filterStatus === 'duplicates' && duplicateStockCount > 0"
          type="button"
          @click="handleMergeDuplicates"
          class="inline-flex items-center gap-1.5 rounded-lg bg-gray-800/80 px-2.5 py-1.5 text-xs font-medium text-gray-300 ring-1 ring-gray-700/60 hover:bg-gray-700/80 transition-all cursor-pointer shadow-sm"
          title="Сложить (суммировать) количества дубликатов"
        >
          <span>⚡</span>
          <span>Объединить (сложить остатки)</span>
        </button>

        <button
          v-else-if="!isReadOnly && filterStatus === 'non_standard' && nonStandardStockCount > 0"
          type="button"
          @click="handleRemoveNonStandard"
          class="inline-flex items-center gap-1.5 rounded-lg bg-amber-500/20 px-3 py-1.5 text-xs font-semibold text-amber-300 ring-1 ring-amber-500/40 hover:bg-amber-500/30 transition-all cursor-pointer shadow-sm"
        >
          <span>🗑️</span>
          <span>Удалить {{ nonStandardStockCount }} нестандартных</span>
        </button>

        <button
          v-else-if="!isReadOnly && filterStatus === 'nd' && ndCount > 0"
          type="button"
          @click="handleRemoveNotFound"
          class="inline-flex items-center gap-1.5 rounded-lg bg-amber-500/20 px-3 py-1.5 text-xs font-semibold text-amber-300 ring-1 ring-amber-500/40 hover:bg-amber-500/30 transition-all cursor-pointer shadow-sm"
        >
          <span>🗑️</span>
          <span>Удалить {{ ndCount }} позиций Н/Д</span>
        </button>

        <div class="text-xs font-mono text-gray-400">
          Показано: <strong class="text-indigo-400 font-semibold">{{ sortedItems.length }}</strong> из {{ store.totalStockCount }}
        </div>
      </div>
    </div>
  </div>
</template>
