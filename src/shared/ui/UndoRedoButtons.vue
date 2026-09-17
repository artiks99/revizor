<script setup lang="ts">
import type { UndoRedoManager } from '../lib/useUndoRedo'

interface Props {
  manager: UndoRedoManager
  isReadOnly?: boolean
}

const props = withDefaults(defineProps<Props>(), {
  isReadOnly: false,
})
</script>

<template>
  <div class="flex items-center gap-1">
    <button
      type="button"
      @click="props.manager.undo"
      :disabled="props.isReadOnly || !props.manager.canUndo.value"
      class="flex items-center gap-1 rounded-md px-2.5 py-1.5 text-xs font-medium text-gray-200 hover:bg-gray-700 hover:text-white disabled:opacity-30 disabled:hover:bg-transparent disabled:hover:text-gray-200 transition-all cursor-pointer disabled:cursor-not-allowed"
      :title="props.manager.canUndo.value ? `Отменить: ${props.manager.lastUndoDescription.value} (Ctrl+Z)` : 'Отменить последнее действие (Ctrl+Z)'"
    >
      <span>↩️</span>
      <span class="hidden sm:inline">Отменить</span>
      <kbd class="hidden md:inline px-1 py-0.2 text-[9px] bg-gray-900/80 rounded border border-gray-600/40 text-gray-400">Ctrl+Z</kbd>
    </button>
    <button
      type="button"
      @click="props.manager.redo"
      :disabled="props.isReadOnly || !props.manager.canRedo.value"
      class="flex items-center gap-1 rounded-md px-2.5 py-1.5 text-xs font-medium text-gray-200 hover:bg-gray-700 hover:text-white disabled:opacity-30 disabled:hover:bg-transparent disabled:hover:text-gray-200 transition-all cursor-pointer disabled:cursor-not-allowed"
      :title="props.manager.canRedo.value ? `Повторить: ${props.manager.lastRedoDescription.value} (Ctrl+Y)` : 'Повторить отменённое действие (Ctrl+Y)'"
    >
      <span>↪️</span>
      <span class="hidden sm:inline">Повторить</span>
      <kbd class="hidden md:inline px-1 py-0.2 text-[9px] bg-gray-900/80 rounded border border-gray-600/40 text-gray-400">Ctrl+Y</kbd>
    </button>
  </div>
</template>
