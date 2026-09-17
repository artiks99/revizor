<script setup lang="ts">
import type { RevisionStats } from '../../model/types'
import StatsMultiplicityCard from './StatsMultiplicityCard.vue'

defineProps<{
  stats: RevisionStats
  isLoading?: boolean
}>()
</script>

<template>
  <div class="space-y-3">
    <!-- Row 1: Fact & General overview (4 cards) -->
    <div class="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
      <!-- Card 1: Кол-во ЛК на складе -->
      <div
        class="group relative flex flex-col justify-between overflow-hidden rounded-xl bg-gray-900/80 p-3.5 ring-1 ring-gray-800/70 transition-all duration-200 hover:ring-indigo-500/50 hover:shadow-lg hover:shadow-indigo-500/5"
      >
        <div class="flex items-center justify-between">
          <div class="flex h-7 w-7 items-center justify-center rounded-lg bg-indigo-500/10 text-sm text-indigo-400 ring-1 ring-indigo-500/20">
            📦
          </div>
          <span class="rounded bg-indigo-500/10 px-1.5 py-0.5 text-[10px] font-semibold text-indigo-400 ring-1 ring-indigo-500/20">
            Факт
          </span>
        </div>

        <div class="mt-2.5">
          <div class="flex items-baseline gap-1.5 text-2xl font-extrabold tracking-tight text-gray-100 flex-wrap">
            <span>{{ stats.factSkuCount.toLocaleString('ru-RU') }}</span>
            <span v-if="stats.stockSkuCount > 0" class="text-base font-semibold text-gray-500" :title="`Остаток магазина: ${stats.stockSkuCount.toLocaleString('ru-RU')} ЛК`">
              / {{ stats.stockSkuCount.toLocaleString('ru-RU') }}
            </span>
          </div>
          <div class="text-xs font-semibold text-gray-300">Кол-во ЛК на складе</div>
          <div class="text-[11px] text-gray-400">
            {{ stats.stockSkuCount > 0 ? 'Факт / остаток магазина' : 'Уникальные ЛК (повторки за 1)' }}
          </div>
        </div>

        <div
          class="pointer-events-none absolute inset-0 rounded-xl opacity-0 transition-opacity duration-300 group-hover:opacity-100"
          style="background: radial-gradient(circle at 50% 0%, rgba(99,102,241,0.06), transparent 70%)"
        />
      </div>

      <!-- Card 2: Кол-во товара на складе (сумма) -->
      <div
        class="group relative flex flex-col justify-between overflow-hidden rounded-xl bg-gray-900/80 p-3.5 ring-1 ring-gray-800/70 transition-all duration-200 hover:ring-cyan-500/50 hover:shadow-lg hover:shadow-cyan-500/5"
      >
        <div class="flex items-center justify-between">
          <div class="flex h-7 w-7 items-center justify-center rounded-lg bg-cyan-500/10 text-sm text-cyan-400 ring-1 ring-cyan-500/20">
            📊
          </div>
          <span class="rounded bg-cyan-500/10 px-1.5 py-0.5 text-[10px] font-semibold text-cyan-400 ring-1 ring-cyan-500/20">
            Сумма
          </span>
        </div>

        <div class="mt-2.5">
          <div class="flex items-baseline gap-1 text-2xl font-extrabold tracking-tight text-gray-100 flex-wrap">
            <span>{{ stats.factTotalQuantity.toLocaleString('ru-RU') }}</span>
            <span v-if="stats.stockTotalQuantity > 0" class="text-base font-semibold text-gray-500" :title="`Остаток магазина: ${stats.stockTotalQuantity.toLocaleString('ru-RU')} шт.`">
              / {{ stats.stockTotalQuantity.toLocaleString('ru-RU') }}
            </span>
            <span class="text-xs font-normal text-gray-400 ml-0.5">шт.</span>
          </div>
          <div class="text-xs font-semibold text-gray-300">Товар на складе</div>
          <div class="text-[11px] text-gray-400">
            {{ stats.stockTotalQuantity > 0 ? 'Факт / остаток магазина' : 'Общая сумма посчитанного факта' }}
          </div>
        </div>

        <div
          class="pointer-events-none absolute inset-0 rounded-xl opacity-0 transition-opacity duration-300 group-hover:opacity-100"
          style="background: radial-gradient(circle at 50% 0%, rgba(6,182,212,0.06), transparent 70%)"
        />
      </div>

      <!-- Card 3: Процент занесенной суммы товара на склад -->
      <div
        class="group relative flex flex-col justify-between overflow-hidden rounded-xl bg-gray-900/80 p-3.5 ring-1 ring-gray-800/70 transition-all duration-200 hover:ring-emerald-500/50 hover:shadow-lg hover:shadow-emerald-500/5"
      >
        <div class="flex items-center justify-between">
          <div class="flex h-7 w-7 items-center justify-center rounded-lg bg-emerald-500/10 text-sm text-emerald-400 ring-1 ring-emerald-500/20">
            📈
          </div>
          <span class="rounded bg-emerald-500/10 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-400 ring-1 ring-emerald-500/20">
            Доля заноса
          </span>
        </div>

        <div class="mt-2.5">
          <div class="flex items-baseline justify-between">
            <div class="text-2xl font-extrabold tracking-tight text-emerald-400">
              {{ stats.enteredSumPercent }}%
            </div>
            <div class="text-[11px] font-mono text-gray-400">
              {{ stats.factTotalQuantity.toLocaleString('ru-RU') }} / {{ stats.generalTotalQuantity.toLocaleString('ru-RU') }}
            </div>
          </div>
          <div class="text-xs font-semibold text-gray-300">% суммы на склад</div>

          <!-- Progress Bar -->
          <div class="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-gray-800">
            <div
              class="h-full rounded-full bg-emerald-500 transition-all duration-500"
              :style="{ width: `${Math.min(100, stats.enteredSumPercent)}%` }"
            />
          </div>
        </div>

        <div
          class="pointer-events-none absolute inset-0 rounded-xl opacity-0 transition-opacity duration-300 group-hover:opacity-100"
          style="background: radial-gradient(circle at 50% 0%, rgba(16,185,129,0.06), transparent 70%)"
        />
      </div>

      <!-- Card 4: Кол-во ЛК не забитые на склад -->
      <div
        class="group relative flex flex-col justify-between overflow-hidden rounded-xl bg-gray-900/80 p-3.5 ring-1 transition-all duration-200 hover:shadow-lg"
        :class="[
          stats.missingGeneralSkuCount > 0
            ? 'ring-amber-500/40 hover:ring-amber-500/70 hover:shadow-amber-500/5'
            : 'ring-emerald-500/40 hover:ring-emerald-500/70 hover:shadow-emerald-500/5'
        ]"
      >
        <div class="flex items-center justify-between">
          <div
            class="flex h-7 w-7 items-center justify-center rounded-lg text-sm ring-1"
            :class="[
              stats.missingGeneralSkuCount > 0
                ? 'bg-amber-500/10 text-amber-400 ring-amber-500/20'
                : 'bg-emerald-500/10 text-emerald-400 ring-emerald-500/20'
            ]"
          >
            {{ stats.missingGeneralSkuCount > 0 ? '⚠️' : '✅' }}
          </div>
          <span
            class="rounded px-1.5 py-0.5 text-[10px] font-semibold ring-1"
            :class="[
              stats.missingGeneralSkuCount > 0
                ? 'bg-amber-500/10 text-amber-400 ring-amber-500/20'
                : 'bg-emerald-500/10 text-emerald-400 ring-emerald-500/20'
            ]"
          >
            {{ stats.missingGeneralSkuCount > 0 ? 'Не забито' : 'Все забиты' }}
          </span>
        </div>

        <div class="mt-2.5">
          <div
            class="text-2xl font-extrabold tracking-tight"
            :class="stats.missingGeneralSkuCount > 0 ? 'text-amber-400' : 'text-emerald-400'"
          >
            {{ stats.missingGeneralSkuCount.toLocaleString('ru-RU') }}
          </div>
          <div class="text-xs font-semibold text-gray-300">Не забито на склад</div>
          <div class="text-[11px] text-gray-400">ЛК с остатком &gt; 0 без факта</div>
        </div>

        <div
          class="pointer-events-none absolute inset-0 rounded-xl opacity-0 transition-opacity duration-300 group-hover:opacity-100"
          :style="`background: radial-gradient(circle at 50% 0%, ${stats.missingGeneralSkuCount > 0 ? 'rgba(245,158,11,0.06)' : 'rgba(16,185,129,0.06)'}, transparent 70%)`"
        />
      </div>
    </div>

    <!-- Row 2: Locations (3 cols) + Account 299 (4 cols) + Multiplicities (5 cols) = 12 cols -->
    <div class="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-12">
      <!-- Block 1: Локации склада (3 cols) -->
      <div
        class="group relative flex flex-col justify-between overflow-hidden rounded-xl bg-gray-900/80 p-3.5 ring-1 ring-gray-800/70 transition-all duration-200 hover:ring-purple-500/50 hover:shadow-lg hover:shadow-purple-500/5 lg:col-span-3"
      >
        <div class="flex items-center justify-between">
          <div class="flex h-7 w-7 items-center justify-center rounded-lg bg-purple-500/10 text-sm text-purple-400 ring-1 ring-purple-500/20">
            📍
          </div>
          <span class="rounded bg-purple-500/10 px-1.5 py-0.5 text-[10px] font-semibold text-purple-400 ring-1 ring-purple-500/20">
            Локации
          </span>
        </div>

        <div class="mt-2.5">
          <div class="text-2xl font-extrabold tracking-tight text-gray-100">
            {{ stats.factLocationsCount.toLocaleString('ru-RU') }}
          </div>
          <div class="text-xs font-semibold text-gray-300">Локаций склада</div>
          <div class="text-[11px] text-gray-400">Уникальные локации факта</div>
        </div>

        <div
          class="pointer-events-none absolute inset-0 rounded-xl opacity-0 transition-opacity duration-300 group-hover:opacity-100"
          style="background: radial-gradient(circle at 50% 0%, rgba(168,85,247,0.06), transparent 70%)"
        />
      </div>

      <!-- Block 2: Счет 299 (Склад и Торговый зал) (4 cols) -->
      <div
        class="group relative flex flex-col justify-between overflow-hidden rounded-xl bg-gray-900/80 p-3.5 ring-1 ring-gray-800/70 transition-all duration-200 hover:ring-rose-500/40 hover:shadow-lg hover:shadow-rose-500/5 lg:col-span-4"
      >
        <div class="flex items-center justify-between">
          <div class="flex items-center gap-1.5">
            <div class="flex h-7 w-7 items-center justify-center rounded-lg bg-rose-500/10 text-sm text-rose-400 ring-1 ring-rose-500/20">
              🏷️
            </div>
            <span class="text-xs font-semibold text-gray-200">Счет 299</span>
          </div>
          <span class="rounded bg-gray-800 px-1.5 py-0.5 text-[10px] font-mono text-gray-400 ring-1 ring-gray-700">
            Всего: {{ stats.stock299SkuCount }} ЛК
          </span>
        </div>

        <div class="mt-2">
          <!-- Dual Column: Склад / Зал -->
          <div class="flex items-center justify-between gap-2">
            <div>
              <div class="text-xl font-extrabold tracking-tight text-rose-300">
                {{ stats.fact299SkuCount }} <span class="text-[10px] font-normal text-gray-400">ЛК</span>
              </div>
              <div class="text-[11px] text-gray-400">На складе</div>
            </div>

            <div class="h-7 w-px bg-gray-800/80" />

            <div class="text-right">
              <div class="text-xl font-extrabold tracking-tight text-amber-300">
                {{ stats.hall299Percent }}%
              </div>
              <div class="text-[11px] text-gray-400">
                В зале: <strong class="text-gray-200 font-normal">{{ stats.hall299SkuCount }}</strong> ЛК
              </div>
            </div>
          </div>

          <!-- Dual Segment Progress Bar -->
          <div class="mt-2 flex h-1.5 w-full overflow-hidden rounded-full bg-gray-800">
            <div
              class="bg-rose-500 transition-all duration-500"
              :style="{ width: `${stats.stock299SkuCount > 0 ? (stats.fact299SkuCount / stats.stock299SkuCount) * 100 : 0}%` }"
              :title="`Склад: ${stats.fact299SkuCount} ЛК`"
            />
            <div
              class="bg-amber-500 transition-all duration-500"
              :style="{ width: `${stats.hall299Percent}%` }"
              :title="`Зал: ${stats.hall299SkuCount} ЛК (${stats.hall299Percent}%)`"
            />
          </div>
        </div>

        <div
          class="pointer-events-none absolute inset-0 rounded-xl opacity-0 transition-opacity duration-300 group-hover:opacity-100"
          style="background: radial-gradient(circle at 50% 0%, rgba(244,63,94,0.06), transparent 70%)"
        />
      </div>

      <!-- Block 3: Основные кратности коробок (5 cols) -->
      <div class="lg:col-span-5">
        <StatsMultiplicityCard
          :items="stats.topMultiplicities"
          :revision-id="stats.revisionId"
        />
      </div>
    </div>
  </div>
</template>
