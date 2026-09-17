<script setup lang="ts">
import { computed } from 'vue'
import { usePercentCalcStore } from '../../model/usePercentCalcStore'

const store = usePercentCalcStore()

const currentPercent = computed(() => store.lossPercentage)

function getTierBadgeClass(pct: number) {
  if (pct <= 0.89) return 'bg-emerald-500/15 text-emerald-400 ring-emerald-500/30'
  if (pct <= 1.4) return 'bg-indigo-500/15 text-indigo-400 ring-indigo-500/30'
  if (pct <= 2.59) return 'bg-amber-500/15 text-amber-400 ring-amber-500/30'
  if (pct < 3.0) return 'bg-rose-500/15 text-rose-400 ring-rose-500/30'
  return 'bg-red-500/20 text-red-300 ring-red-500/40'
}
</script>

<template>
  <div class="rounded-xl bg-gray-900/80 p-5 ring-1 ring-gray-800/80 shadow-lg shadow-black/20 space-y-4">
    <div class="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 pb-3 border-b border-gray-800/60">
      <div>
        <h3 class="text-sm font-bold text-gray-100 flex items-center gap-2">
          <span>📊</span>
          <span>Шкала порогов и финансовых ограничений</span>
        </h3>
        <p class="text-[11px] text-gray-400">
          Суммы потерь в тенге (тг), рассчитанные от текущей чистой выручки
        </p>
      </div>

      <div class="flex items-center gap-2 text-xs">
        <span class="text-gray-400">Текущий результат:</span>
        <span class="rounded-md bg-indigo-500/20 px-2 py-0.5 font-bold font-mono text-indigo-300 ring-1 ring-indigo-500/40">
          {{ currentPercent.toFixed(2) }}%
        </span>
      </div>
    </div>

    <!-- Visual Thresholds Scale Bar -->
    <div class="space-y-1.5 pt-1">
      <div class="flex justify-between text-[10px] font-semibold uppercase tracking-wider text-gray-400">
        <span class="text-emerald-400">Премия 300к (≤ 0.89%)</span>
        <span class="text-indigo-400">Премия 200к (≤ 1.40%)</span>
        <span class="text-amber-400">Норма (≤ 2.59%)</span>
        <span class="text-rose-400">Взыскание (2.60–2.99%)</span>
        <span class="text-red-400">Увольнение (≥ 3.00%)</span>
      </div>

      <!-- Segmented Bar -->
      <div class="flex h-3 w-full overflow-hidden rounded-full bg-gray-950 ring-1 ring-gray-800 p-0.5 gap-1">
        <div class="h-full rounded-full bg-emerald-500/80 transition-all" style="width: 20%" title="До 0.89% (Премия 300 000 тг)" />
        <div class="h-full rounded-full bg-indigo-500/80 transition-all" style="width: 20%" title="0.90% - 1.40% (Премия 200 000 тг)" />
        <div class="h-full rounded-full bg-amber-500/80 transition-all" style="width: 25%" title="1.41% - 2.59% (Без премий и взысканий)" />
        <div class="h-full rounded-full bg-rose-500/80 transition-all" style="width: 15%" title="2.60% - 2.99% (Взыскание)" />
        <div class="h-full rounded-full bg-red-600/80 transition-all" style="width: 20%" title="3.00%+ (Увольнение)" />
      </div>
    </div>

    <!-- Table -->
    <div class="overflow-x-auto rounded-lg ring-1 ring-gray-800/80">
      <table class="w-full text-left text-xs border-collapse">
        <thead class="bg-gray-950/80 text-[11px] uppercase tracking-wider text-gray-400 border-b border-gray-800">
          <tr>
            <th class="py-2.5 px-3">Порог</th>
            <th class="py-2.5 px-3">Сумма порога (тг)</th>
            <th class="py-2.5 px-3">Категория / Решение</th>
            <th class="py-2.5 px-3 text-right">Статус</th>
          </tr>
        </thead>
        <tbody class="divide-y divide-gray-800/60 bg-gray-900/40">
          <tr
            v-for="item in store.thresholds"
            :key="item.percent"
            class="transition-colors"
            :class="item.isCurrentTier ? 'bg-indigo-950/40 ring-1 ring-inset ring-indigo-500/40' : 'hover:bg-gray-800/30'"
          >
            <!-- Label -->
            <td class="py-2.5 px-3 font-semibold text-gray-200 whitespace-nowrap">
              <span class="inline-flex items-center gap-1.5">
                <span v-if="item.isCurrentTier" class="text-indigo-400">👉</span>
                <span>{{ item.label }}</span>
              </span>
            </td>

            <!-- Amount -->
            <td class="py-2.5 px-3 font-mono font-bold text-gray-100 whitespace-nowrap">
              {{ item.amount.toLocaleString('ru-RU', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) }} тг
            </td>

            <!-- Description -->
            <td class="py-2.5 px-3 text-gray-300">
              {{ item.description }}
            </td>

            <!-- Tier Status Badge -->
            <td class="py-2.5 px-3 text-right whitespace-nowrap">
              <span
                v-if="item.isCurrentTier"
                class="rounded-full bg-indigo-500 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-white shadow-sm shadow-indigo-500/50"
              >
                Ваш уровень
              </span>
              <span
                v-else
                class="rounded-full px-2 py-0.5 text-[10px] font-medium ring-1"
                :class="getTierBadgeClass(item.percent)"
              >
                {{ item.percent }}%
              </span>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>
</template>
