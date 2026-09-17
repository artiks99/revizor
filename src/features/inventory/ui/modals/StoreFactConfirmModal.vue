<script setup lang="ts">
interface Props {
  isOpen: boolean
  title: string
  description: string
  confirmText?: string
  badge?: string
  isDanger?: boolean
}

const props = withDefaults(defineProps<Props>(), {
  confirmText: 'Подтвердить',
  badge: '',
  isDanger: false,
})

const emit = defineEmits<{
  (e: 'confirm'): void
  (e: 'close'): void
}>()
</script>

<template>
  <div
    v-if="isOpen"
    class="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-xs p-4"
    @click.self="emit('close')"
  >
    <div
      class="w-full max-w-md rounded-2xl border border-gray-800 bg-gray-950 p-6 shadow-2xl transition-all"
    >
      <div class="flex items-start gap-4">
        <div
          class="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl"
          :class="isDanger ? 'bg-red-500/10 text-red-400' : 'bg-indigo-500/10 text-indigo-400'"
        >
          <span class="text-xl">{{ isDanger ? '⚠️' : '⚡' }}</span>
        </div>
        <div class="flex-1">
          <div class="flex items-center gap-2">
            <h3 class="text-base font-semibold text-gray-100">
              {{ title }}
            </h3>
            <span
              v-if="badge"
              class="rounded-full px-2 py-0.5 text-[10px] font-bold"
              :class="isDanger ? 'bg-red-500/20 text-red-300' : 'bg-indigo-500/20 text-indigo-300'"
            >
              {{ badge }}
            </span>
          </div>
          <p class="mt-2 text-xs text-gray-400 leading-relaxed">
            {{ description }}
          </p>
        </div>
      </div>

      <div class="mt-6 flex justify-end gap-3 border-t border-gray-800 pt-4">
        <button
          type="button"
          @click="emit('close')"
          class="rounded-lg bg-gray-800 px-4 py-2 text-xs font-medium text-gray-300 hover:bg-gray-700 transition-colors cursor-pointer"
        >
          Отмена
        </button>
        <button
          type="button"
          @click="emit('confirm')"
          class="rounded-lg px-4 py-2 text-xs font-semibold text-white shadow-lg transition-all cursor-pointer"
          :class="
            isDanger
              ? 'bg-red-600 hover:bg-red-500 shadow-red-600/20'
              : 'bg-indigo-600 hover:bg-indigo-500 shadow-indigo-600/20'
          "
        >
          {{ confirmText }}
        </button>
      </div>
    </div>
  </div>
</template>
