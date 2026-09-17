<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue'
import { eventBus } from '@shared/lib/eventBus'

interface ToastItem {
  id: number
  message: string
  type: 'info' | 'success' | 'warning' | 'error'
}

const toasts = ref<ToastItem[]>([])
let counter = 0

function addToast(event: { message: string; type?: 'info' | 'success' | 'warning' | 'error'; duration?: number }) {
  const id = ++counter
  const item: ToastItem = {
    id,
    message: event.message,
    type: event.type || 'info',
  }
  toasts.value.push(item)

  const duration = event.duration ?? 2500
  if (duration > 0) {
    setTimeout(() => {
      removeToast(id)
    }, duration)
  }
}

function removeToast(id: number) {
  const idx = toasts.value.findIndex((t) => t.id === id)
  if (idx !== -1) {
    toasts.value.splice(idx, 1)
  }
}

onMounted(() => {
  eventBus.on('app:toast', addToast)
})

onUnmounted(() => {
  eventBus.off('app:toast', addToast)
})
</script>

<template>
  <div
    class="fixed bottom-6 right-6 z-50 flex flex-col gap-2 pointer-events-none max-w-sm w-full"
    aria-live="polite"
  >
    <transition-group
      enter-active-class="transform ease-out duration-200 transition"
      enter-from-class="translate-y-2 opacity-0 scale-95"
      enter-to-class="translate-y-0 opacity-100 scale-100"
      leave-active-class="transition ease-in duration-150"
      leave-from-class="opacity-100 scale-100"
      leave-to-class="opacity-0 scale-95"
    >
      <div
        v-for="toast in toasts"
        :key="toast.id"
        class="pointer-events-auto flex items-center justify-between gap-3 rounded-xl border px-3.5 py-2.5 shadow-2xl backdrop-blur-md transition-all"
        :class="[
          toast.type === 'success' && 'border-emerald-500/30 bg-gray-900/95 text-emerald-300 ring-1 ring-emerald-500/20 shadow-emerald-950/40',
          toast.type === 'error' && 'border-rose-500/30 bg-gray-900/95 text-rose-300 ring-1 ring-rose-500/20 shadow-rose-950/40',
          toast.type === 'warning' && 'border-amber-500/30 bg-gray-900/95 text-amber-300 ring-1 ring-amber-500/20 shadow-amber-950/40',
          toast.type === 'info' && 'border-indigo-500/30 bg-gray-900/95 text-indigo-300 ring-1 ring-indigo-500/20 shadow-indigo-950/40',
        ]"
      >
        <div class="flex items-center gap-2 min-w-0">
          <!-- Icon -->
          <span v-if="toast.type === 'success'" class="shrink-0 flex items-center justify-center h-5 w-5 rounded-full bg-emerald-500/20 text-emerald-400 text-xs">
            ✓
          </span>
          <span v-else-if="toast.type === 'error'" class="shrink-0 flex items-center justify-center h-5 w-5 rounded-full bg-rose-500/20 text-rose-400 text-xs">
            ✕
          </span>
          <span v-else-if="toast.type === 'warning'" class="shrink-0 flex items-center justify-center h-5 w-5 rounded-full bg-amber-500/20 text-amber-400 text-xs">
            !
          </span>
          <span v-else class="shrink-0 flex items-center justify-center h-5 w-5 rounded-full bg-indigo-500/20 text-indigo-400 text-xs">
            ℹ
          </span>

          <!-- Message -->
          <span class="text-xs font-medium text-gray-200 truncate">
            {{ toast.message }}
          </span>
        </div>

        <!-- Close Button -->
        <button
          type="button"
          @click="removeToast(toast.id)"
          class="shrink-0 rounded-lg p-1 text-gray-400 hover:text-gray-200 hover:bg-gray-800/60 transition-colors cursor-pointer text-xs"
        >
          ✕
        </button>
      </div>
    </transition-group>
  </div>
</template>
