<script setup lang="ts">
import type { useStoreStockTab } from '../../model/useStoreStockTab'

const props = defineProps<{
  tab: ReturnType<typeof useStoreStockTab>
}>()

const {
  isReadOnly,
  isMassMenuOpen,
  duplicateStockCount,
  redundantDuplicateCount,
  nonStandardStockCount,
  ndCount,
  zeroCount,
  sortedItems,
  isFilterActive,
  handleMergeDuplicates,
  handleRemoveDuplicatesOnly,
  handleRemoveNonStandard,
  handleRemoveNotFound,
  handleRemoveZero,
  handleRemoveFiltered,
  handleCopyFilteredSkus,
  handleCopyNotFoundSkus,
} = props.tab
</script>

<template>
  <div id="mass-actions-menu-wrapper" class="relative">
    <button
      type="button"
      @click.stop="isMassMenuOpen = !isMassMenuOpen"
      class="flex items-center gap-1.5 rounded-lg bg-indigo-500/15 px-3 py-2 text-xs font-semibold text-indigo-300 ring-1 ring-indigo-500/30 hover:bg-indigo-500/25 hover:text-indigo-200 transition-all cursor-pointer shadow-sm"
      title="Массовые операции с однотипными позициями"
    >
      <span>⚡</span>
      <span>Массовые действия</span>
      <span class="text-[10px] opacity-70">▼</span>
    </button>

    <!-- Dropdown Menu -->
    <transition
      enter-active-class="transition duration-150 ease-out"
      enter-from-class="transform scale-95 opacity-0 -translate-y-1"
      enter-to-class="transform scale-100 opacity-100 translate-y-0"
      leave-active-class="transition duration-100 ease-in"
      leave-from-class="transform scale-100 opacity-100 translate-y-0"
      leave-to-class="transform scale-95 opacity-0 -translate-y-1"
    >
      <div
        v-if="isMassMenuOpen"
        class="absolute right-0 top-full mt-1.5 z-40 w-72 rounded-xl bg-gray-900/95 p-1.5 shadow-2xl ring-1 ring-gray-700/80 backdrop-blur-md divide-y divide-gray-800/60"
      >
        <div class="px-2.5 py-1.5 text-[11px] font-semibold uppercase tracking-wider text-gray-400">
          Групповые операции
        </div>

        <!-- Duplicate actions -->
        <div class="py-1">
          <button
            type="button"
            @click="handleMergeDuplicates"
            :disabled="duplicateStockCount === 0"
            class="flex w-full items-center justify-between gap-2 rounded-lg px-2.5 py-2 text-left text-xs text-gray-200 hover:bg-indigo-600/20 hover:text-indigo-300 disabled:opacity-40 disabled:cursor-not-allowed transition-all cursor-pointer"
          >
            <div class="flex items-center gap-2">
              <span>⚡</span>
              <div>
                <div class="font-medium">Объединить дубликаты</div>
                <div class="text-[10px] text-gray-400">Суммирует остатки повторяющихся ЛК</div>
              </div>
            </div>
            <span
              v-if="duplicateStockCount > 0"
              class="rounded-full bg-indigo-500/20 px-2 py-0.5 text-[10px] font-bold text-indigo-300"
            >
              {{ duplicateStockCount }}
            </span>
          </button>

          <button
            type="button"
            @click="handleRemoveDuplicatesOnly"
            :disabled="duplicateStockCount === 0"
            class="flex w-full items-center justify-between gap-2 rounded-lg px-2.5 py-2 text-left text-xs text-gray-200 hover:bg-indigo-600/20 hover:text-indigo-300 disabled:opacity-40 disabled:cursor-not-allowed transition-all cursor-pointer"
          >
            <div class="flex items-center gap-2">
              <span>🗑️</span>
              <div>
                <div class="font-medium">Оставить по 1 шт (удалить повторы)</div>
                <div class="text-[10px] text-gray-400">Удаляет только дублирующие строки</div>
              </div>
            </div>
            <span
              v-if="redundantDuplicateCount > 0"
              class="rounded-full bg-rose-500/20 px-2 py-0.5 text-[10px] font-bold text-rose-300"
            >
              {{ redundantDuplicateCount }}
            </span>
          </button>
        </div>

        <!-- Filtered Cleanups -->
        <div class="py-1">
          <button
            type="button"
            @click="handleRemoveNonStandard"
            :disabled="nonStandardStockCount === 0"
            class="flex w-full items-center justify-between gap-2 rounded-lg px-2.5 py-2 text-left text-xs text-gray-200 hover:bg-amber-500/15 hover:text-amber-300 disabled:opacity-40 disabled:cursor-not-allowed transition-all cursor-pointer"
          >
            <div class="flex items-center gap-2">
              <span>⚠️</span>
              <div>
                <div class="font-medium">Удалить нестандартные артикулы</div>
                <div class="text-[10px] text-gray-400">Артикулы не из 7 цифр</div>
              </div>
            </div>
            <span
              v-if="nonStandardStockCount > 0"
              class="rounded-full bg-amber-500/20 px-2 py-0.5 text-[10px] font-bold text-amber-300"
            >
              {{ nonStandardStockCount }}
            </span>
          </button>

          <button
            type="button"
            @click="handleRemoveNotFound"
            :disabled="ndCount === 0"
            class="flex w-full items-center justify-between gap-2 rounded-lg px-2.5 py-2 text-left text-xs text-gray-200 hover:bg-amber-500/15 hover:text-amber-300 disabled:opacity-40 disabled:cursor-not-allowed transition-all cursor-pointer"
          >
            <div class="flex items-center gap-2">
              <span>⚠️</span>
              <div>
                <div class="font-medium">Удалить все позиции Н/Д</div>
                <div class="text-[10px] text-gray-400">Товары, отсутствующие в каталоге</div>
              </div>
            </div>
            <span
              v-if="ndCount > 0"
              class="rounded-full bg-amber-500/20 px-2 py-0.5 text-[10px] font-bold text-amber-300"
            >
              {{ ndCount }}
            </span>
          </button>

          <button
            type="button"
            @click="handleRemoveZero"
            :disabled="zeroCount === 0"
            class="flex w-full items-center justify-between gap-2 rounded-lg px-2.5 py-2 text-left text-xs text-gray-200 hover:bg-gray-800 hover:text-gray-300 disabled:opacity-40 disabled:cursor-not-allowed transition-all cursor-pointer"
          >
            <div class="flex items-center gap-2">
              <span>⭕</span>
              <div>
                <div class="font-medium">Удалить с остатком = 0</div>
                <div class="text-[10px] text-gray-400">Нулевые и отрицательные остатки</div>
              </div>
            </div>
            <span
              v-if="zeroCount > 0"
              class="rounded-full bg-gray-800 px-2 py-0.5 text-[10px] text-gray-400"
            >
              {{ zeroCount }}
            </span>
          </button>
        </div>

        <!-- Filtered delete action -->
        <div v-if="isFilterActive" class="py-1">
          <button
            type="button"
            @click="handleRemoveFiltered"
            class="flex w-full items-center justify-between gap-2 rounded-lg px-2.5 py-2 text-left text-xs text-rose-300 hover:bg-rose-500/20 transition-all cursor-pointer"
          >
            <div class="flex items-center gap-2">
              <span>🔍</span>
              <div>
                <div class="font-medium">Удалить отфильтрованные</div>
                <div class="text-[10px] text-rose-400/80">Все текущие видимые строки</div>
              </div>
            </div>
            <span class="rounded-full bg-rose-500/20 px-2 py-0.5 text-[10px] font-bold text-rose-300">
              {{ sortedItems.length }}
            </span>
          </button>
        </div>

        <!-- Copying section -->
        <div class="py-1">
          <div class="px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wider text-indigo-400">
            Копирование артикулов
          </div>

          <button
            type="button"
            @click="handleCopyFilteredSkus"
            :disabled="sortedItems.length === 0"
            class="flex w-full items-center justify-between gap-2 rounded-lg px-2.5 py-2 text-left text-xs text-gray-200 hover:bg-indigo-600/20 hover:text-indigo-300 disabled:opacity-40 disabled:cursor-not-allowed transition-all cursor-pointer"
          >
            <div class="flex items-center gap-2">
              <span>📋</span>
              <div>
                <div class="font-medium">Скопировать текущие ЛК</div>
                <div class="text-[10px] text-gray-400">Все видимые по фильтру (столбиком)</div>
              </div>
            </div>
            <span
              v-if="sortedItems.length > 0"
              class="rounded-full bg-indigo-500/20 px-2 py-0.5 text-[10px] font-bold text-indigo-300"
            >
              {{ sortedItems.length }}
            </span>
          </button>

          <button
            v-if="ndCount > 0"
            type="button"
            @click="handleCopyNotFoundSkus"
            class="flex w-full items-center justify-between gap-2 rounded-lg px-2.5 py-2 text-left text-xs text-amber-300 hover:bg-amber-500/15 transition-all cursor-pointer"
          >
            <div class="flex items-center gap-2">
              <span>📋</span>
              <div>
                <div class="font-medium">Скопировать только ЛК со статусом Н/Д</div>
                <div class="text-[10px] text-amber-400/70">Отсутствующие в каталоге</div>
              </div>
            </div>
            <span
              v-if="ndCount > 0"
              class="rounded-full bg-amber-500/20 px-2 py-0.5 text-[10px] font-bold text-amber-300"
            >
              {{ ndCount }}
            </span>
          </button>
        </div>
      </div>
    </transition>
  </div>
</template>
