<script setup lang="ts">
import type { useStoreFactTab } from '../../model/useStoreFactTab'

const props = defineProps<{
  tab: ReturnType<typeof useStoreFactTab>
}>()

const {
  store,
  isReadOnly,
  selectedIds,
  pasteNotification,
  cellSelection,
  openPasteQuantitiesModal,
  openPasteLocationsModal,
  handleCopySelectedSkus,
  batchOps,
  clearSelection,
} = props.tab
</script>

<template>
  <div>
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
            Выбрано позиций: <strong class="font-bold text-white">{{ selectedIds.size }}</strong> из {{ store.totalCount }}
          </span>
        </div>

        <div class="flex items-center gap-2">
          <button
            type="button"
            @click="openPasteQuantitiesModal"
            class="flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white shadow-md hover:bg-emerald-500 transition-colors cursor-pointer"
            title="Вставить список количеств из буфера обмена для выбранных позиций"
          >
            <span>📥</span>
            <span>Вставить количества ({{ selectedIds.size }})</span>
          </button>

          <button
            type="button"
            @click="openPasteLocationsModal"
            class="flex items-center gap-1.5 rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-semibold text-white shadow-md hover:bg-indigo-500 transition-colors cursor-pointer"
            title="Вставить список локаций из буфера обмена для выбранных позиций"
          >
            <span>📍</span>
            <span>Вставить локации ({{ selectedIds.size }})</span>
          </button>

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
            @click="batchOps.handleDeleteSelected"
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

    <!-- Paste Notification Banner -->
    <transition
      enter-active-class="transition duration-150 ease-out"
      enter-from-class="opacity-0 -translate-y-2"
      enter-to-class="opacity-100 translate-y-0"
      leave-active-class="transition duration-100 ease-in"
      leave-from-class="opacity-100 translate-y-0"
      leave-to-class="opacity-0 -translate-y-2"
    >
      <div
        v-if="pasteNotification"
        class="fixed top-16 right-6 z-50 flex items-center gap-2 rounded-xl bg-indigo-900/90 border border-indigo-500/40 px-4 py-2.5 text-xs text-white shadow-xl backdrop-blur-md"
      >
        <span>ℹ️</span>
        <span>{{ pasteNotification }}</span>
      </div>
    </transition>

    <!-- Floating Excel Selection Info Badge -->
    <transition
      enter-active-class="transition duration-150 ease-out"
      enter-from-class="opacity-0 translate-y-2"
      enter-to-class="opacity-100 translate-y-0"
      leave-active-class="transition duration-100 ease-in"
      leave-from-class="opacity-100 translate-y-0"
      leave-to-class="opacity-0 translate-y-2"
    >
      <div
        v-if="cellSelection?.itemIds && cellSelection.itemIds.length > 1"
        class="fixed bottom-6 right-6 z-40 flex items-center gap-3 rounded-xl bg-gray-950/90 border border-indigo-500/40 px-4 py-2 text-xs text-gray-200 shadow-2xl backdrop-blur-md"
      >
        <span class="flex items-center gap-1.5 font-medium text-indigo-300">
          <span>📊 Выделено ячеек:</span>
          <strong class="text-white">{{ cellSelection.itemIds.length }}</strong>
        </span>
        <span class="text-gray-500">|</span>
        <span class="text-[11px] text-gray-400">
          Ctrl+C — копировать &bull; Ctrl+V — вставить &bull; Del — очистить
        </span>
      </div>
    </transition>
  </div>
</template>
