<script setup lang="ts">
import { computed } from 'vue'
import { usePercentCalcStore } from '../../model/usePercentCalcStore'

const store = usePercentCalcStore()

const decisionBgClass = computed(() => {
  switch (store.decision.color) {
    case 'emerald':
      return 'from-emerald-950/50 via-gray-900/90 to-emerald-950/20 ring-emerald-500/40 text-emerald-300'
    case 'indigo':
      return 'from-indigo-950/50 via-gray-900/90 to-indigo-950/20 ring-indigo-500/40 text-indigo-300'
    case 'amber':
      return 'from-amber-950/50 via-gray-900/90 to-amber-950/20 ring-amber-500/40 text-amber-300'
    case 'rose':
      return 'from-rose-950/50 via-gray-900/90 to-rose-950/20 ring-rose-500/40 text-rose-300'
    case 'red':
      return 'from-red-950/70 via-gray-900/90 to-red-950/30 ring-red-500/50 text-red-300'
    case 'cyan':
    default:
      return 'from-cyan-950/50 via-gray-900/90 to-cyan-950/20 ring-cyan-500/40 text-cyan-300'
  }
})

const decisionBadgeClass = computed(() => {
  switch (store.decision.color) {
    case 'emerald':
      return 'bg-emerald-500/20 text-emerald-300 ring-emerald-500/40'
    case 'indigo':
      return 'bg-indigo-500/20 text-indigo-300 ring-indigo-500/40'
    case 'amber':
      return 'bg-amber-500/20 text-amber-300 ring-amber-500/40'
    case 'rose':
      return 'bg-rose-500/20 text-rose-300 ring-rose-500/40'
    case 'red':
      return 'bg-red-500/30 text-red-200 ring-red-500/60'
    case 'cyan':
    default:
      return 'bg-cyan-500/20 text-cyan-300 ring-cyan-500/40'
  }
})

const decisionIcon = computed(() => {
  switch (store.decision.type) {
    case 'profit':
      return '💎'
    case 'bonus_300':
      return '🏆'
    case 'bonus_200':
      return '🥇'
    case 'standard':
      return '⚖️'
    case 'penalty':
      return '⚠️'
    case 'termination':
      return '🛑'
  }
})
</script>

<template>
  <div class="space-y-3.5">
    <!-- Decision Banner -->
    <div
      class="relative overflow-hidden rounded-xl bg-gradient-to-br p-5 ring-1 shadow-xl shadow-black/30 transition-all duration-300"
      :class="decisionBgClass"
    >
      <div class="relative z-10 flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div class="space-y-1">
          <div class="flex items-center gap-2">
            <span class="text-2xl select-none">{{ decisionIcon }}</span>
            <span
              class="rounded-md px-2.5 py-1 text-xs font-bold uppercase tracking-wider ring-1"
              :class="decisionBadgeClass"
            >
              Решение по премии / взысканию
            </span>
          </div>
          <h2 class="text-2xl font-black tracking-tight text-gray-100">
            {{ store.decision.title }}
          </h2>
          <p class="text-xs text-gray-300 max-w-xl">
            {{ store.decision.subtitle }}
          </p>
        </div>

        <!-- Big Percentage Display -->
        <div class="flex flex-col items-start md:items-end rounded-lg bg-gray-950/70 p-3.5 ring-1 ring-gray-800/80 shadow-inner">
          <span class="text-[11px] font-medium text-gray-400 uppercase tracking-wider">
            Итоговый процент потерь
          </span>
          <div class="flex items-baseline gap-1 mt-0.5">
            <span class="text-3xl font-black font-mono tracking-tight text-gray-100">
              {{ store.lossPercentage.toFixed(2) }}
            </span>
            <span class="text-lg font-bold text-gray-400">%</span>
          </div>
          <span class="text-[10px] text-gray-500 mt-0.5">
            от чистой выручки
          </span>
        </div>
      </div>
    </div>

    <!-- Calculated Metrics 4-Cards Grid -->
    <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5">
      <!-- Net Revenue -->
      <div class="rounded-xl bg-gray-900/80 p-4 ring-1 ring-gray-800/80 shadow-sm">
        <div class="flex items-center justify-between">
          <span class="text-xs text-gray-400">Чистая выручка (без НДС)</span>
          <span class="text-base select-none">💰</span>
        </div>
        <div class="mt-2 text-xl font-bold text-gray-100 font-mono">
          {{ store.netRevenue.toLocaleString('ru-RU', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) }} тг
        </div>
        <div class="mt-1 text-[11px] text-gray-500">
          Выручка за вычетом {{ store.vatRate }}% НДС
        </div>
      </div>

      <!-- Daily Revenue -->
      <div class="rounded-xl bg-gray-900/80 p-4 ring-1 ring-gray-800/80 shadow-sm">
        <div class="flex items-center justify-between">
          <span class="text-xs text-gray-400">Среднедневная выручка</span>
          <span class="text-base select-none">📅</span>
        </div>
        <div class="mt-2 text-xl font-bold text-gray-100 font-mono">
          {{ store.dailyRevenue.toLocaleString('ru-RU', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) }} тг
        </div>
        <div class="mt-1 text-[11px] text-gray-500">
          Деление на {{ store.daysCount }} дней периода
        </div>
      </div>

      <!-- Net Write-Off -->
      <div class="rounded-xl bg-gray-900/80 p-4 ring-1 ring-gray-800/80 shadow-sm">
        <div class="flex items-center justify-between">
          <span class="text-xs text-gray-400">Чистое списание</span>
          <span class="text-base select-none">📉</span>
        </div>
        <div
          class="mt-2 text-xl font-bold font-mono"
          :class="store.netWriteOff < 0 ? 'text-emerald-400' : 'text-gray-100'"
        >
          {{ store.netWriteOff.toLocaleString('ru-RU', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) }} тг
        </div>
        <div class="mt-1 text-[11px] text-gray-500">
          Списание минус излишки (+)
        </div>
      </div>

      <!-- Loss Percentage -->
      <div class="rounded-xl bg-gray-900/80 p-4 ring-1 ring-gray-800/80 shadow-sm">
        <div class="flex items-center justify-between">
          <span class="text-xs text-gray-400">Процент потерь</span>
          <span class="text-base select-none">🎯</span>
        </div>
        <div class="mt-2 text-xl font-bold text-indigo-400 font-mono">
          {{ store.lossPercentage.toFixed(2) }}%
        </div>
        <div class="mt-1 text-[11px] text-gray-500">
          Чистое списание / чистая выручка
        </div>
      </div>
    </div>
  </div>
</template>
