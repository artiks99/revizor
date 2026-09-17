<script setup lang="ts">
import { ref } from 'vue'
import { copyToClipboard } from '@shared/lib/clipboard'

const props = withDefaults(
  defineProps<{
    sku: string
    label?: string
    textClass?: string
    showIcon?: boolean
  }>(),
  {
    label: 'ЛК',
    textClass: 'text-indigo-400 font-medium',
    showIcon: false,
  }
)

const isCopied = ref(false)
let timer: any = null

async function handleCopy(e?: MouseEvent | KeyboardEvent) {
  if (e) {
    e.stopPropagation()
    e.preventDefault()
  }

  if (!props.sku) return

  const ok = await copyToClipboard(props.sku, {
    label: props.label,
    showToast: true,
  })

  if (ok) {
    isCopied.value = true
    if (timer) clearTimeout(timer)
    timer = setTimeout(() => {
      isCopied.value = false
    }, 1500)
  }
}
</script>

<template>
  <button
    type="button"
    @click.stop="handleCopy"
    @keydown.enter.stop="handleCopy"
    @keydown.space.stop.prevent="handleCopy"
    class="group inline-flex items-center gap-1.5 font-mono text-xs rounded px-1 -mx-1 py-0.5 transition-all text-left cursor-pointer focus:outline-none focus:ring-1 focus:ring-indigo-500/50 hover:bg-indigo-500/10 active:scale-95 select-all"
    :class="[
      isCopied ? 'text-emerald-400 font-semibold' : (textClass || 'text-indigo-400 hover:text-indigo-300'),
    ]"
    :title="isCopied ? 'Скопировано в буфер!' : `Нажмите, чтобы скопировать ${label}: ${sku}`"
  >
    <span :class="{ 'underline decoration-dotted decoration-indigo-400/40 group-hover:decoration-indigo-300': !isCopied }">
      {{ sku }}
    </span>

    <!-- Copied checkmark indicator -->
    <span
      v-if="isCopied"
      class="inline-flex items-center text-emerald-400 text-[11px] animate-pulse font-bold"
      title="Скопировано"
    >
      ✓
    </span>

    <!-- Subtle copy icon on hover / optional -->
    <span
      v-else-if="showIcon"
      class="opacity-0 group-hover:opacity-60 text-[10px] transition-opacity text-gray-400"
    >
      📋
    </span>
  </button>
</template>
