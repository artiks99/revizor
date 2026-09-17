<script setup lang="ts">
defineProps<{
  count: number
  isReadOnly?: boolean
  label?: string
}>()

const emit = defineEmits<{
  (e: 'copy'): void
  (e: 'delete'): void
  (e: 'clear'): void
}>()
</script>

<template>
  <transition
    enter-active-class="transition duration-150 ease-out"
    enter-from-class="transform translate-y-2 opacity-0 scale-95"
    enter-to-class="transform translate-y-0 opacity-100 scale-100"
    leave-active-class="transition duration-100 ease-in"
    leave-from-class="transform translate-y-0 opacity-100 scale-100"
    leave-to-class="transform translate-y-2 opacity-0 scale-95"
  >
    <div
      v-if="count > 0"
      class="fixed bottom-6 right-8 z-40 flex items-center gap-3 rounded-xl bg-gray-950/95 border border-indigo-500/50 px-4 py-2.5 shadow-2xl backdrop-blur-md text-xs"
    >
      <div class="flex items-center gap-2">
        <span class="flex h-5 w-5 items-center justify-center rounded bg-indigo-500/20 text-indigo-300 font-mono font-bold text-[11px]">
          ✓
        </span>
        <span class="text-gray-200">
          Выбрано позиций:
          <strong class="text-white font-bold">{{ count }}</strong>
        </span>
      </div>

      <div class="flex items-center gap-2 border-l border-gray-800 pl-3">
        <button
          type="button"
          @click="emit('copy')"
          class="flex items-center gap-1.5 rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-indigo-500 transition-colors cursor-pointer shadow-sm"
          title="Скопировать артикулы выбранных позиций в буфер обмена"
        >
          <span>📋</span>
          <span>Скопировать ЛК</span>
        </button>

        <button
          v-if="!isReadOnly"
          type="button"
          @click="emit('delete')"
          class="flex items-center gap-1.5 rounded-lg bg-rose-600/90 px-3 py-1.5 text-xs font-semibold text-white hover:bg-rose-500 transition-colors cursor-pointer shadow-sm"
          title="Удалить выбранные позиции"
        >
          <span>🗑️</span>
          <span>Удалить</span>
        </button>

        <button
          type="button"
          @click="emit('clear')"
          class="rounded-lg p-1.5 text-gray-400 hover:text-gray-200 hover:bg-gray-800 transition-colors cursor-pointer"
          title="Снять выделение (Esc)"
        >
          ✕
        </button>
      </div>
    </div>
  </transition>
</template>
