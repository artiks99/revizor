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
  <transition
    enter-active-class="transition duration-200 ease-out"
    enter-from-class="opacity-0"
    enter-to-class="opacity-100"
    leave-active-class="transition duration-150 ease-in"
    leave-from-class="opacity-100"
    leave-to-class="opacity-0"
  >
    <div
      v-if="isOpen"
      class="fixed inset-0 z-50 flex items-center justify-center bg-gray-950/80 backdrop-blur-xs p-4"
      @click.self="emit('close')"
    >
      <div class="w-full max-w-md rounded-2xl bg-gray-900 p-6 ring-1 ring-gray-800 shadow-2xl space-y-4">
        <div class="flex items-start justify-between gap-3">
          <div class="flex items-center gap-2.5">
            <div
              class="flex h-10 w-10 items-center justify-center rounded-xl text-lg font-bold"
              :class="isDanger ? 'bg-rose-500/15 text-rose-400' : 'bg-indigo-500/15 text-indigo-400'"
            >
              {{ isDanger ? '🗑️' : '⚡' }}
            </div>
            <div>
              <h4 class="text-sm font-semibold text-gray-100">{{ title }}</h4>
              <span
                v-if="badge"
                class="inline-block mt-0.5 rounded px-2 py-0.5 text-[10px] font-bold"
                :class="isDanger ? 'bg-rose-500/20 text-rose-300' : 'bg-indigo-500/20 text-indigo-300'"
              >
                {{ badge }}
              </span>
            </div>
          </div>
          <button
            type="button"
            @click="emit('close')"
            class="text-gray-500 hover:text-gray-300 transition-colors cursor-pointer"
          >
            ✕
          </button>
        </div>

        <p class="text-xs text-gray-300 leading-relaxed">
          {{ description }}
        </p>

        <div class="flex items-center justify-end gap-2.5 pt-2 border-t border-gray-800/80">
          <button
            type="button"
            @click="emit('close')"
            class="rounded-lg bg-gray-800 px-3.5 py-2 text-xs font-medium text-gray-300 hover:bg-gray-700 hover:text-white transition-colors cursor-pointer"
          >
            Отмена
          </button>
          <button
            type="button"
            @click="emit('confirm')"
            class="rounded-lg px-4 py-2 text-xs font-semibold text-white shadow-lg transition-colors cursor-pointer"
            :class="[
              isDanger
                ? 'bg-rose-600 hover:bg-rose-500 shadow-rose-600/30'
                : 'bg-indigo-600 hover:bg-indigo-500 shadow-indigo-600/30',
            ]"
          >
            {{ confirmText }}
          </button>
        </div>
      </div>
    </div>
  </transition>
</template>
