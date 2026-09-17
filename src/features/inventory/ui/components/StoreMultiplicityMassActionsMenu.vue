<script setup lang="ts">
import type { useStoreMultiplicityTab } from '../../model/useStoreMultiplicityTab'

const props = defineProps<{
  tab: ReturnType<typeof useStoreMultiplicityTab>
}>()

const {
  store,
  isReadOnly,
  isMassMenuOpen,
  sortedItems,
  selectedIds,
  handleCopyAllSkus,
  handleCopyFilteredSkus,
  handleCopySelectedSkus,
  handleClearAll,
} = props.tab
</script>

<template>
  <div v-if="!isReadOnly" id="multiplicity-mass-menu-wrapper" class="relative">
    <button
      type="button"
      @click.stop="isMassMenuOpen = !isMassMenuOpen"
      class="flex items-center gap-1.5 rounded-lg bg-indigo-500/15 px-3 py-2 text-xs font-semibold text-indigo-300 ring-1 ring-indigo-500/30 hover:bg-indigo-500/25 hover:text-indigo-200 transition-all cursor-pointer shadow-sm"
      title="Массовые операции с позициями кратности"
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

        <!-- Clipboard copy actions -->
        <div class="py-1">
          <button
            type="button"
            @click="handleCopyAllSkus"
            :disabled="store.totalMultiplicityCount === 0"
            class="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-xs text-gray-200 hover:bg-indigo-600/20 hover:text-indigo-300 disabled:opacity-40 disabled:cursor-not-allowed transition-all cursor-pointer"
          >
            <span>📋</span>
            <span>Скопировать все ЛК</span>
          </button>

          <button
            v-if="sortedItems.length > 0 && sortedItems.length !== store.totalMultiplicityCount"
            type="button"
            @click="handleCopyFilteredSkus"
            class="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-xs text-gray-200 hover:bg-indigo-600/20 hover:text-indigo-300 transition-all cursor-pointer"
          >
            <span>🔍</span>
            <span>Скопировать отфильтрованные ЛК ({{ sortedItems.length }})</span>
          </button>

          <button
            v-if="selectedIds.size > 0"
            type="button"
            @click="handleCopySelectedSkus"
            class="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-xs text-indigo-300 hover:bg-indigo-600/20 transition-all cursor-pointer"
          >
            <span>📋</span>
            <span>Скопировать выбранные ЛК ({{ selectedIds.size }})</span>
          </button>
        </div>

        <!-- Danger Zone -->
        <div class="py-1">
          <button
            type="button"
            @click="handleClearAll"
            :disabled="store.totalMultiplicityCount === 0"
            class="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-xs text-rose-400 hover:bg-rose-500/20 hover:text-rose-300 disabled:opacity-40 disabled:cursor-not-allowed transition-all cursor-pointer"
          >
            <span>💥</span>
            <div>
              <div class="font-medium">Очистить весь список кратности</div>
              <div class="text-[10px] text-gray-500">Безвозвратно удаляет все записи кратности</div>
            </div>
          </button>
        </div>
      </div>
    </transition>
  </div>
</template>
