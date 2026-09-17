<script setup lang="ts">
import { useRouter } from 'vue-router'
import { usePercentCalcStore } from '../model/usePercentCalcStore'
import PercentInputsCard from './components/PercentInputsCard.vue'
import PercentResultsCard from './components/PercentResultsCard.vue'
import PercentThresholdsTable from './components/PercentThresholdsTable.vue'

const router = useRouter()
const percentStore = usePercentCalcStore()
</script>

<template>
  <div class="space-y-4">
    <!-- Top Header Banner -->
    <div
      class="relative overflow-hidden rounded-xl bg-gradient-to-br from-indigo-950/40 via-purple-950/25 to-gray-900/80 px-5 py-4 ring-1 ring-indigo-500/20 shadow-lg shadow-black/20"
    >
      <div class="relative z-10 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <div class="flex items-center gap-2">
            <span class="text-xl">🧮</span>
            <h2 class="text-lg font-bold tracking-wide text-gray-100">
              Расчёт процента инвентаризации
            </h2>
          </div>
          <p class="mt-0.5 text-xs text-gray-400">
            Расчёт чистой выручки, потерь, порогов и премий по методике inventory_calc.xlsx
          </p>
        </div>

        <div class="flex items-center gap-2">
          <!-- Back button -->
          <button
            type="button"
            @click="router.push('/dashboard')"
            class="flex items-center gap-1.5 rounded-lg bg-gray-800/80 px-3 py-1.5 text-xs font-medium text-gray-300 ring-1 ring-gray-700/60 hover:bg-gray-800 hover:text-gray-100 transition-colors cursor-pointer"
          >
            <span>←</span>
            <span>Дашборд</span>
          </button>

          <!-- Export Excel Button -->
          <button
            type="button"
            @click="percentStore.exportToXlsx"
            class="flex items-center gap-1.5 rounded-lg bg-emerald-600/25 px-3 py-1.5 text-xs font-semibold text-emerald-300 ring-1 ring-emerald-500/40 hover:bg-emerald-600/40 transition-colors cursor-pointer shadow-sm shadow-emerald-950/50"
            title="Выгрузить расчёт в формате Excel (.xlsx)"
          >
            <span>📊</span>
            <span>Экспорт в Excel</span>
          </button>
        </div>
      </div>

      <!-- Decorative blur blobs -->
      <div class="pointer-events-none absolute -right-6 -top-6 h-32 w-32 rounded-full bg-indigo-500/10 blur-2xl" />
    </div>

    <!-- Hero Results Card & Decision -->
    <PercentResultsCard />

    <!-- Inputs & Adjustments -->
    <PercentInputsCard />

    <!-- Thresholds Breakdown Table -->
    <PercentThresholdsTable />
  </div>
</template>
