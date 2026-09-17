<script setup lang="ts">
import { computed, ref } from 'vue'
import { copyToClipboard } from '@shared/lib/clipboard'

const props = withDefaults(
  defineProps<{
    barcode?: string | null
    copyFormat?: 'comma' | 'newline'
  }>(),
  {
    copyFormat: 'comma',
  }
)

const isCopiedSingle = ref(false)
const isCopiedAll = ref(false)
let timerSingle: any = null
let timerAll: any = null

const barcodes = computed<string[]>(() => {
  if (!props.barcode) return []
  const parts = props.barcode
    .split(/[,;\n\r]+/)
    .map((s) => s.trim())
    .filter(Boolean)
  // Deduplicate while preserving order
  return Array.from(new Set(parts))
})

const primaryBarcode = computed(() => barcodes.value[0] || '')
const extraBarcodes = computed(() => barcodes.value.slice(1))
const extraCount = computed(() => extraBarcodes.value.length)

const allBarcodesTooltip = computed(() => {
  if (barcodes.value.length <= 1) return ''
  const list = barcodes.value.map((b, idx) => `${idx + 1}. ${b}${idx === 0 ? ' (основной)' : ''}`).join('\n')
  return `Штрихкоды товара (${barcodes.value.length}):\n${list}\n\nНажмите на +${extraCount.value}, чтобы скопировать все`
})

async function handleCopySingle(e?: MouseEvent) {
  if (e) {
    e.stopPropagation()
    e.preventDefault()
  }
  if (!primaryBarcode.value) return

  const ok = await copyToClipboard(primaryBarcode.value, {
    label: 'Штрихкод',
    showToast: true,
  })

  if (ok) {
    isCopiedSingle.value = true
    if (timerSingle) clearTimeout(timerSingle)
    timerSingle = setTimeout(() => {
      isCopiedSingle.value = false
    }, 1500)
  }
}

async function handleCopyAll(e?: MouseEvent) {
  if (e) {
    e.stopPropagation()
    e.preventDefault()
  }
  if (barcodes.value.length === 0) return

  const textToCopy = props.copyFormat === 'newline'
    ? barcodes.value.join('\n')
    : barcodes.value.join(', ')

  const ok = await copyToClipboard(textToCopy, {
    label: `Все штрихкоды (${barcodes.value.length})`,
    showToast: true,
  })

  if (ok) {
    isCopiedAll.value = true
    if (timerAll) clearTimeout(timerAll)
    timerAll = setTimeout(() => {
      isCopiedAll.value = false
    }, 1500)
  }
}
</script>

<template>
  <div v-if="barcodes.length === 0" class="text-gray-600 font-mono text-xs select-none">
    —
  </div>

  <div v-else class="inline-flex items-center gap-1.5 whitespace-nowrap max-w-full">
    <!-- Основной штрихкод -->
    <button
      type="button"
      @click.stop="handleCopySingle"
      class="group inline-flex items-center gap-1 font-mono text-xs text-gray-300 hover:text-indigo-300 hover:bg-indigo-500/10 px-1 -mx-1 py-0.5 rounded transition-all text-left select-all cursor-pointer focus:outline-none focus:ring-1 focus:ring-indigo-500/50"
      :class="{ 'text-emerald-400 font-semibold': isCopiedSingle }"
      :title="isCopiedSingle ? 'Скопировано в буфер!' : (barcodes.length > 1 ? `Основной штрихкод: ${primaryBarcode} (нажмите для копирования)` : `Штрихкод: ${primaryBarcode} (нажмите для копирования)`)"
    >
      <span :class="{ 'underline decoration-dotted decoration-gray-600 group-hover:decoration-indigo-300': !isCopiedSingle }">
        {{ primaryBarcode }}
      </span>
      <span
        v-if="isCopiedSingle"
        class="inline-flex items-center text-emerald-400 text-[10px] animate-pulse font-bold"
        title="Скопировано"
      >
        ✓
      </span>
    </button>

    <!-- Бейдж дополнительных штрихкодов (+N) -->
    <button
      v-if="extraCount > 0"
      type="button"
      @click.stop="handleCopyAll"
      class="inline-flex items-center gap-0.5 rounded-md bg-indigo-500/15 px-1.5 py-0.5 text-[10px] font-bold text-indigo-300 ring-1 ring-indigo-500/30 hover:bg-indigo-500/25 hover:text-indigo-200 transition-colors cursor-help select-none focus:outline-none focus:ring-1 focus:ring-indigo-500/50"
      :class="{ 'ring-emerald-500/50 bg-emerald-500/20 text-emerald-300': isCopiedAll }"
      :title="isCopiedAll ? 'Все штрихкоды скопированы!' : allBarcodesTooltip"
    >
      <span>+{{ extraCount }}</span>
      <span v-if="isCopiedAll" class="text-emerald-300 text-[10px] font-bold ml-0.5">✓</span>
    </button>
  </div>
</template>
