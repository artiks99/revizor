<script setup lang="ts">
import type { useStoreMultiplicityTab } from '../../model/useStoreMultiplicityTab'

const props = defineProps<{
  tab: ReturnType<typeof useStoreMultiplicityTab>
}>()

const {
  store,
  isReadOnly,
  selectedIds,
  pasteNotification,
  handleCopySelectedSkus,
  handleDeleteSelected,
  clearSelection,
} = props.tab
</script>

<template>
  <div v-if="(!isReadOnly && selectedIds.size > 0) || pasteNotification" class="space-y-2">
    <!-- Floating Bulk Selection Bar -->
    <transition
      enter-active-class="transition duration-200 ease-out"
      enter-from-class="transform -translate-y-2 opacity-0 scale-95"
      enter-to-class="transform translate-y-0 opacity-100 scale-100"
      leave-active-class="transition duration-150 ease-in"
      leave-from-class="transform translate-y-0 opacity-100 scale-100"
      leave-to-class="transform -translate-y-2 opacity-0 scale-95"
    >
      <div
        v-if="!isReadOnly && selectedIds.size > 0"
        class="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-indigo-950/90 px-4 py-2.5 ring-1 ring-indigo-500/40 shadow-xl backdrop-blur-md"
      >
        <div class="flex items-center gap-2.5">
          <span class="flex h-6 w-6 items-center justify-center rounded-md bg-indigo-500/30 text-xs font-bold text-indigo-300">
            ✓
          </span>
          <span class="text-xs font-medium text-indigo-100">
            Выбрано позиций: <strong class="font-bold text-white">{{ selectedIds.size }}</strong> из {{ store.totalMultiplicityCount }}
          </span>
        </div>

        <div class="flex items-center gap-2">
          <button
            type="button"
            @click="handleCopySelectedSkus"
            class="flex items-center gap-1.5 rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-semibold text-white shadow-md hover:bg-indigo-500 transition-colors cursor-pointer"
            title="Скопировать артикулы выбранных позиций в буфер обмена"
          >
            <span>📋</span>
            <span>Скопировать ЛК ({{ selectedIds.size }})</span>
          </button>

          <button
            type="button"
            @click="handleDeleteSelected"
            class="flex items-center gap-1.5 rounded-lg bg-red-600 px-3 py-1.5 text-xs font-semibold text-white shadow-md hover:bg-red-500 transition-colors cursor-pointer"
          >
            <span>🗑️</span>
            <span>Удалить выбранные ({{ selectedIds.size }})</span>
          </button>

          <button
            type="button"
            @click="clearSelection"
            class="rounded-lg bg-gray-800/80 px-2.5 py-1.5 text-xs font-medium text-gray-300 hover:bg-gray-700 hover:text-white transition-colors cursor-pointer"
          >
            Снять выбор
          </button>
        </div>
      </div>
    </transition>

    <!-- Paste Notification Toast -->
    <transition
      enter-active-class="transition duration-200 ease-out"
      enter-from-class="transform -translate-y-2 opacity-0"
      enter-to-class="transform translate-y-0 opacity-100"
      leave-active-class="transition duration-150 ease-in"
      leave-from-class="transform translate-y-0 opacity-100"
      leave-to-class="transform -translate-y-2 opacity-0"
    >
      <div
        v-if="pasteNotification"
        class="flex items-center gap-2 rounded-xl bg-indigo-500/20 border border-indigo-500/40 px-4 py-2.5 text-xs font-medium text-indigo-200 shadow-xl backdrop-blur-md"
      >
        <span>📋</span>
        <span>{{ pasteNotification }}</span>
      </div>
    </transition>
  </div>
</template>
