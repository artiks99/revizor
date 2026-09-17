<script setup lang="ts">
import type { MultiplicityConfirmDialogOptions } from '../../model/useStoreMultiplicityTab'

interface Props {
  dialog: MultiplicityConfirmDialogOptions | null
}

defineProps<Props>()

const emit = defineEmits<{
  (e: 'confirm'): void
  (e: 'close'): void
}>()
</script>

<template>
  <div
    v-if="dialog"
    class="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-xs p-4"
    @click.self="emit('close')"
  >
    <div class="w-full max-w-md rounded-2xl bg-gray-900 p-5 ring-1 ring-gray-800 shadow-2xl space-y-4">
      <div class="flex items-center justify-between">
        <div class="flex items-center gap-2.5">
          <div
            class="flex h-9 w-9 items-center justify-center rounded-lg text-lg"
            :class="dialog.isDanger ? 'bg-rose-500/15 text-rose-400 ring-1 ring-rose-500/30' : 'bg-indigo-500/15 text-indigo-400 ring-1 ring-indigo-500/30'"
          >
            {{ dialog.isDanger ? '🗑️' : '⚡' }}
          </div>
          <div>
            <h3 class="text-sm font-semibold text-gray-100">{{ dialog.title }}</h3>
            <span
              v-if="dialog.badge"
              class="inline-block mt-0.5 rounded px-1.5 py-0.2 text-[10px] font-bold"
              :class="dialog.isDanger ? 'bg-rose-500/20 text-rose-300' : 'bg-indigo-500/20 text-indigo-300'"
            >
              {{ dialog.badge }}
            </span>
          </div>
        </div>
        <button
          type="button"
          @click="emit('close')"
          class="text-gray-500 hover:text-gray-300 text-xl font-bold cursor-pointer transition-colors"
        >
          &times;
        </button>
      </div>
      <p class="text-xs text-gray-300 leading-relaxed">{{ dialog.description }}</p>
      <div class="flex items-center justify-end gap-2 pt-2 border-t border-gray-800">
        <button
          type="button"
          @click="emit('close')"
          class="rounded-lg bg-gray-800 px-3.5 py-1.5 text-xs text-gray-300 hover:bg-gray-700 cursor-pointer transition-colors"
        >
          Отмена
        </button>
        <button
          type="button"
          @click="emit('confirm')"
          class="rounded-lg px-4 py-1.5 text-xs font-semibold text-white cursor-pointer shadow transition-all"
          :class="dialog.isDanger ? 'bg-rose-600 hover:bg-rose-500' : 'bg-indigo-600 hover:bg-indigo-500'"
        >
          {{ dialog.confirmText }}
        </button>
      </div>
    </div>
  </div>
</template>
