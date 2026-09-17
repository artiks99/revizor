<script setup lang="ts">
import type { useStoreAccount299Tab } from '../../model/useStoreAccount299Tab'

const props = defineProps<{
  tab: ReturnType<typeof useStoreAccount299Tab>
}>()

const {
  store,
  isReadOnly,
  isMassMenuOpen,
  sortedItems,
  isFilterActive,
  duplicateCount,
  nonStandardCount,
  ndCount,
  selectedIds,
  handleRebindNames,
  handleDeduplicate,
  handleRemoveNonStandard,
  handleRemoveNotFound,
  handleRemoveFiltered,
  handleDeleteSelected,
  handleClearAll,
  handleCopyFilteredSkus,
  handleCopySelectedSkus,
  handleCopyNotFoundSkus,
  handleCopyAllSkus,
} = props.tab
</script>

<template>
  <div v-if="!isReadOnly" id="account299-mass-menu-wrapper" class="relative">
    <button
      type="button"
      @click.stop="isMassMenuOpen = !isMassMenuOpen"
      class="flex items-center gap-1.5 rounded-lg bg-indigo-500/15 px-3 py-2 text-xs font-semibold text-indigo-300 ring-1 ring-indigo-500/30 hover:bg-indigo-500/25 hover:text-indigo-200 transition-all cursor-pointer shadow-sm"
      title="Массовые операции с позициями 299"
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

        <!-- Rebind names from catalog -->
        <div class="py-1">
          <button
            type="button"
            @click="handleRebindNames"
            :disabled="store.totalAccount299Count === 0"
            class="flex w-full items-center justify-between gap-2 rounded-lg px-2.5 py-2 text-left text-xs text-gray-200 hover:bg-indigo-600/20 hover:text-indigo-300 disabled:opacity-40 disabled:cursor-not-allowed transition-all cursor-pointer"
            title="Автоматически найти названия для позиций по справочнику Товары магазина"
          >
            <div class="flex items-center gap-2">
              <span>🔄</span>
              <div>
                <div class="font-medium">Обновить наименования</div>
                <div class="text-[10px] text-gray-400">Подтянуть названия из каталога</div>
              </div>
            </div>
          </button>
        </div>

        <!-- Duplicate actions -->
        <div class="py-1">
          <button
            type="button"
            @click="handleDeduplicate"
            :disabled="duplicateCount === 0"
            class="flex w-full items-center justify-between gap-2 rounded-lg px-2.5 py-2 text-left text-xs text-gray-200 hover:bg-indigo-600/20 hover:text-indigo-300 disabled:opacity-40 disabled:cursor-not-allowed transition-all cursor-pointer"
          >
            <div class="flex items-center gap-2">
              <span>⚡</span>
              <div>
                <div class="font-medium">Оставить только уникальные</div>
                <div class="text-[10px] text-gray-400">Удаляет лишние повторы артикулов</div>
              </div>
            </div>
            <span
              v-if="duplicateCount > 0"
              class="rounded-full bg-rose-500/20 px-2 py-0.5 text-[10px] font-bold text-rose-300"
            >
              {{ duplicateCount }}
            </span>
          </button>
        </div>

        <!-- Filter-based Cleanup -->
        <div class="py-1">
          <button
            type="button"
            @click="handleRemoveNonStandard"
            :disabled="nonStandardCount === 0"
            class="flex w-full items-center justify-between gap-2 rounded-lg px-2.5 py-2 text-left text-xs text-gray-200 hover:bg-amber-500/15 hover:text-amber-300 disabled:opacity-40 disabled:cursor-not-allowed transition-all cursor-pointer"
          >
            <div class="flex items-center gap-2">
              <span>⚠️</span>
              <div>
                <div class="font-medium">Удалить нестандартные ЛК</div>
                <div class="text-[10px] text-gray-400">Артикулы не из 7 цифр</div>
              </div>
            </div>
            <span
              v-if="nonStandardCount > 0"
              class="rounded-full bg-amber-500/20 px-2 py-0.5 text-[10px] font-bold text-amber-300"
            >
              {{ nonStandardCount }}
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
                <div class="font-medium">Удалить позиции Н/Д</div>
                <div class="text-[10px] text-gray-400">Отсутствующие в каталоге</div>
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
            <span class="rounded-full bg-amber-500/20 px-2 py-0.5 text-[10px] font-bold text-amber-300">
              {{ ndCount }}
            </span>
          </button>

          <button
            v-if="selectedIds.size > 0"
            type="button"
            @click="handleCopySelectedSkus"
            class="flex w-full items-center justify-between gap-2 rounded-lg px-2.5 py-2 text-left text-xs text-indigo-300 hover:bg-indigo-600/20 transition-all cursor-pointer"
          >
            <div class="flex items-center gap-2">
              <span>📋</span>
              <div>
                <div class="font-medium">Скопировать выбранные ЛК</div>
                <div class="text-[10px] text-gray-400">Отмеченные галочками</div>
              </div>
            </div>
            <span class="rounded-full bg-indigo-500/20 px-2 py-0.5 text-[10px] font-bold text-indigo-300">
              {{ selectedIds.size }}
            </span>
          </button>

          <button
            type="button"
            @click="handleCopyAllSkus"
            :disabled="store.totalAccount299Count === 0"
            class="flex w-full items-center justify-between gap-2 rounded-lg px-2.5 py-2 text-left text-xs text-gray-300 hover:bg-gray-800 transition-all cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <div class="flex items-center gap-2">
              <span>📋</span>
              <div>
                <div class="font-medium">Скопировать все ЛК счёта 299</div>
                <div class="text-[10px] text-gray-500">Весь список без фильтрации</div>
              </div>
            </div>
            <span class="rounded-full bg-gray-800 px-2 py-0.5 text-[10px] font-mono text-gray-400">
              {{ store.totalAccount299Count }}
            </span>
          </button>
        </div>

        <!-- Batch & Filtered Deletes -->
        <div class="py-1">
          <button
            type="button"
            @click="handleDeleteSelected"
            :disabled="selectedIds.size === 0"
            class="flex w-full items-center justify-between gap-2 rounded-lg px-2.5 py-2 text-left text-xs text-rose-300 hover:bg-rose-500/20 disabled:opacity-40 disabled:cursor-not-allowed transition-all cursor-pointer"
          >
            <div class="flex items-center gap-2">
              <span>🗑️</span>
              <div>
                <div class="font-medium">Удалить выбранные</div>
                <div class="text-[10px] text-gray-400">Только отмеченные галочками</div>
              </div>
            </div>
            <span
              v-if="selectedIds.size > 0"
              class="rounded-full bg-rose-500/20 px-2 py-0.5 text-[10px] font-bold text-rose-300"
            >
              {{ selectedIds.size }}
            </span>
          </button>

          <button
            v-if="isFilterActive"
            type="button"
            @click="handleRemoveFiltered"
            class="flex w-full items-center justify-between gap-2 rounded-lg px-2.5 py-2 text-left text-xs text-rose-300 hover:bg-rose-500/20 transition-all cursor-pointer"
          >
            <div class="flex items-center gap-2">
              <span>🔍</span>
              <div>
                <div class="font-medium">Удалить отфильтрованные</div>
                <div class="text-[10px] text-gray-400">Все видимые по фильтру строки</div>
              </div>
            </div>
            <span class="rounded-full bg-rose-500/20 px-2 py-0.5 text-[10px] font-bold text-rose-300">
              {{ sortedItems.length }}
            </span>
          </button>
        </div>

        <!-- Danger Zone -->
        <div class="py-1">
          <button
            type="button"
            @click="handleClearAll"
            :disabled="store.totalAccount299Count === 0"
            class="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-xs text-rose-400 hover:bg-rose-500/20 hover:text-rose-300 disabled:opacity-40 disabled:cursor-not-allowed transition-all cursor-pointer"
          >
            <span>💥</span>
            <div>
              <div class="font-medium">Очистить весь список 299</div>
              <div class="text-[10px] text-gray-500">Безвозвратно удаляет все записи счета 299</div>
            </div>
          </button>
        </div>
      </div>
    </transition>
  </div>
</template>
