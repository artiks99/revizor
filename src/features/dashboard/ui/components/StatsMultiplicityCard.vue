<script setup lang="ts">
import { ref, computed, watch, onMounted } from 'vue'
import type { MultiplicityStatsItem } from '../../model/types'

const props = defineProps<{
  items: MultiplicityStatsItem[]
  revisionId?: string
}>()

const checkedMultiplicities = ref<Set<number>>(new Set())

const storageKey = computed(() => {
  return props.revisionId
    ? `revizor:checked_multiplicities:${props.revisionId}`
    : 'revizor:checked_multiplicities:default'
})

function loadChecked() {
  try {
    const raw = localStorage.getItem(storageKey.value)
    if (raw) {
      const parsed = JSON.parse(raw)
      if (Array.isArray(parsed)) {
        checkedMultiplicities.value = new Set(parsed)
        return
      }
    }
  } catch (err) {
    console.warn('[StatsMultiplicityCard] Failed to load checked multiplicities:', err)
  }
  checkedMultiplicities.value = new Set()
}

function saveChecked() {
  try {
    localStorage.setItem(storageKey.value, JSON.stringify(Array.from(checkedMultiplicities.value)))
  } catch (err) {
    console.warn('[StatsMultiplicityCard] Failed to save checked multiplicities:', err)
  }
}

function toggleMultiplicity(mult: number) {
  if (checkedMultiplicities.value.has(mult)) {
    checkedMultiplicities.value.delete(mult)
  } else {
    checkedMultiplicities.value.add(mult)
  }
  saveChecked()
}

watch(
  () => props.revisionId,
  () => {
    loadChecked()
  },
  { immediate: true }
)

onMounted(() => {
  loadChecked()
})

function formatK(qty: number): string {
  if (qty >= 10000) return `${(qty / 1000).toFixed(0)}k`
  if (qty >= 1000) return `${(qty / 1000).toFixed(1)}k`
  return String(qty)
}

const totalUnmatchedSkus = computed(() => {
  return props.items.reduce((sum, item) => sum + item.skuCount, 0)
})

const checkedCount = computed(() => {
  let count = 0
  for (const item of props.items) {
    if (checkedMultiplicities.value.has(item.multiplicity)) {
      count++
    }
  }
  return count
})
</script>

<template>
  <div
    class="group relative flex flex-col justify-between overflow-hidden rounded-xl bg-gray-900/80 p-3.5 ring-1 ring-gray-800/70 transition-all duration-200 hover:ring-pink-500/40 hover:shadow-lg hover:shadow-pink-500/5 h-full"
  >
    <!-- Header -->
    <div class="flex items-center justify-between gap-2">
      <div class="flex items-center gap-1.5 min-w-0">
        <div class="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-pink-500/10 text-sm text-pink-400 ring-1 ring-pink-500/20">
          📐
        </div>
        <div class="truncate">
          <span class="text-xs font-semibold text-gray-200">Кратности коробок на остатке</span>
        </div>
      </div>

      <div class="flex items-center gap-1.5 shrink-0">
        <!-- Checked Badge -->
        <span
          v-if="checkedCount > 0"
          class="rounded bg-emerald-500/20 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-300 ring-1 ring-emerald-500/40"
          title="Отмечено проверенными"
        >
          ✓ {{ checkedCount }} из {{ items.length }}
        </span>

        <!-- Total Count Badge -->
        <span
          v-if="items.length > 0"
          class="rounded bg-pink-500/10 px-1.5 py-0.5 text-[10px] font-semibold text-pink-400 ring-1 ring-pink-500/20"
          :title="`Всего ${items.length} кратностей, ${totalUnmatchedSkus.toLocaleString('ru-RU')} ЛК с расхождениями`"
        >
          {{ totalUnmatchedSkus.toLocaleString('ru-RU') }} ЛК
        </span>
      </div>
    </div>

    <!-- Chips / Pills Grid (All multiplicities without limit, sorted DESC) -->
    <div v-if="items.length > 0" class="mt-2.5 flex flex-wrap gap-1.5 max-h-[66px] overflow-y-auto pr-1">
      <button
        v-for="item in items"
        :key="item.multiplicity"
        @click="toggleMultiplicity(item.multiplicity)"
        type="button"
        class="inline-flex items-center gap-1.5 rounded-md px-2 py-0.5 text-[11px] transition-all duration-150 cursor-pointer select-none ring-1"
        :class="[
          checkedMultiplicities.has(item.multiplicity)
            ? 'bg-emerald-950/70 ring-emerald-500/50 text-emerald-200 hover:bg-emerald-900/60 shadow-sm shadow-emerald-500/10'
            : 'bg-gray-950/90 ring-gray-800/80 text-gray-200 hover:ring-pink-500/40 hover:bg-gray-800/40'
        ]"
        :title="checkedMultiplicities.has(item.multiplicity)
          ? `Кратность ×${item.multiplicity} — Проверено (${item.skuCount} поз.). Кликните для отмены.`
          : `Кратность ×${item.multiplicity}: ${item.skuCount} поз. (${item.totalStockQty.toLocaleString('ru-RU')} шт.). Кликните, чтобы пометить проверенным.`"
      >
        <!-- Multiplicity Badge -->
        <span
          class="rounded px-1 py-0.2 font-mono text-[10px] font-bold ring-1 transition-colors"
          :class="[
            checkedMultiplicities.has(item.multiplicity)
              ? 'bg-emerald-500/30 text-emerald-300 ring-emerald-500/40'
              : 'bg-pink-500/20 text-pink-300 ring-pink-500/30'
          ]"
        >
          <span v-if="checkedMultiplicities.has(item.multiplicity)" class="mr-0.5">✓</span>×{{ item.multiplicity }}
        </span>

        <!-- SKU count -->
        <span
          class="font-mono text-[11px] font-semibold transition-colors"
          :class="checkedMultiplicities.has(item.multiplicity) ? 'text-emerald-200' : 'text-gray-200'"
        >
          {{ item.skuCount }} поз.
        </span>

        <!-- Total stock quantity in k -->
        <span
          v-if="item.totalStockQty > 0"
          class="font-mono text-[10px] transition-colors"
          :class="checkedMultiplicities.has(item.multiplicity) ? 'text-emerald-400/80' : 'text-gray-500'"
        >
          ({{ formatK(item.totalStockQty) }} шт.)
        </span>
      </button>
    </div>

    <div v-else class="mt-2.5 text-xs text-gray-500">
      Все товары с кратностью &gt; 1 сошлись с фактом склада!
    </div>

    <div
      class="pointer-events-none absolute inset-0 rounded-xl opacity-0 transition-opacity duration-300 group-hover:opacity-100"
      style="background: radial-gradient(circle at 50% 0%, rgba(236,72,153,0.06), transparent 70%)"
    />
  </div>
</template>
