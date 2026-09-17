<script setup lang="ts">
import type { Account299ConfirmDialogOptions } from '../../model/useStoreAccount299Tab'

interface Props {
  dialog: Account299ConfirmDialogOptions | null
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
    <div class="w-full max-w-md rounded-2xl border border-gray-800 bg-gray-950 p-6 shadow-2xl space-y-4">
      <div class="flex items-center justify-between border-b border-gray-800 pb-3">
        <h3 class="text-base font-semibold text-gray-100">{{ dialog.title }}</h3>
        <button
          type="button"
          @click="emit('close')"
          class="text-gray-500 hover:text-gray-300 text-xl font-bold cursor-pointer"
        >
          &times;
        </button>
      </div>
      <p class="text-xs text-gray-300 leading-relaxed">{{ dialog.description }}</p>
      <div class="flex justify-end gap-2 border-t border-gray-800 pt-3">
        <button
          type="button"
          @click="emit('close')"
          class="rounded-lg bg-gray-800 px-3.5 py-1.5 text-xs text-gray-300 hover:bg-gray-700 cursor-pointer"
        >
          Отмена
        </button>
        <button
          type="button"
          @click="emit('confirm')"
          class="rounded-lg px-4 py-1.5 text-xs font-semibold text-white cursor-pointer shadow"
          :class="dialog.isDanger ? 'bg-rose-600 hover:bg-rose-500' : 'bg-indigo-600 hover:bg-indigo-500'"
        >
          {{ dialog.confirmText }}
        </button>
      </div>
    </div>
  </div>
</template>
