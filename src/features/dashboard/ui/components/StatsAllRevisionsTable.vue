<script setup lang="ts">
import { computed } from 'vue'
import type { RevisionStats } from '../../model/types'
import { formatDateRange } from '@shared/lib/formatDate'
import StoreTableTh from '@shared/ui/StoreTableTh.vue'
import { useExcelColumnFilter } from '@shared/lib/useExcelColumnFilter'
import { useTableSort } from '@shared/lib/useTableSort'

const props = defineProps<{
  items: RevisionStats[]
  isLoading?: boolean
}>()

const emit = defineEmits<{
  (e: 'select', revisionId: string): void
}>()

// Excel-фильтрация по колонкам
const {
  columnFilters,
  getDistinctValues,
  setColumnFilter,
  clearAllColumnFilters,
  activeFilterCount,
  filteredItems,
} = useExcelColumnFilter<RevisionStats>(
  () => props.items,
  {
    storeNumber: (r) => `Магазин №${r.storeNumber}`,
    period: (r) => formatDateRange(r.startDate, r.endDate),
    status: (r) => (r.isArchived ? 'Архив' : 'Активна'),
    factSkuCount: (r) => `${r.factSkuCount}`,
    factTotalQuantity: (r) => `${r.factTotalQuantity} шт.`,
    enteredSumPercent: (r) => `${r.enteredSumPercent}%`,
    fact299SkuCount: (r) => `${r.fact299SkuCount}`,
    hall299Percent: (r) => `${r.hall299Percent}%`,
    factLocationsCount: (r) => `${r.factLocationsCount}`,
    missingGeneralSkuCount: (r) => `${r.missingGeneralSkuCount}`,
  }
)

// Сортировка таблицы
const { sortKey, sortDirection, toggleSort, sortedItems } = useTableSort<RevisionStats>(
  () => filteredItems.value,
  'storeNumber',
  'asc',
  {
    storeNumber: (r) => {
      const num = Number(r.storeNumber)
      return isNaN(num) ? r.storeNumber : num
    },
    period: (r) => r.startDate || '',
    status: (r) => (r.isArchived ? 1 : 0),
    factSkuCount: (r) => Number(r.factSkuCount) || 0,
    factTotalQuantity: (r) => Number(r.factTotalQuantity) || 0,
    enteredSumPercent: (r) => Number(r.enteredSumPercent) || 0,
    fact299SkuCount: (r) => Number(r.fact299SkuCount) || 0,
    hall299Percent: (r) => Number(r.hall299Percent) || 0,
    factLocationsCount: (r) => Number(r.factLocationsCount) || 0,
    missingGeneralSkuCount: (r) => Number(r.missingGeneralSkuCount) || 0,
  }
)
</script>

<template>
  <div class="rounded-xl border border-gray-800/60 bg-gray-900/60 p-4 space-y-3">
    <!-- Header -->
    <div class="flex items-center justify-between gap-2 flex-wrap">
      <div class="flex items-center gap-3">
        <h3 class="text-sm font-semibold text-gray-200 flex items-center gap-2">
          <span>📊</span> Сводная таблица по всем ревизиям
        </h3>
        <span class="text-xs text-gray-400">
          Показано: <strong class="text-gray-200">{{ sortedItems.length }}</strong> из {{ items.length }}
        </span>
      </div>

      <div class="flex items-center gap-2">
        <!-- Reset Column Filters -->
        <button
          v-if="activeFilterCount > 0"
          type="button"
          @click="clearAllColumnFilters"
          class="flex items-center gap-1 rounded-md bg-indigo-500/20 px-2.5 py-1 text-[11px] font-semibold text-indigo-300 ring-1 ring-indigo-500/30 hover:bg-indigo-500/30 transition-colors cursor-pointer"
          title="Сбросить все фильтры колонок"
        >
          <span>✕ Сбросить фильтры ({{ activeFilterCount }})</span>
        </button>
      </div>
    </div>

    <!-- Loading State -->
    <div v-if="isLoading" class="flex items-center justify-center py-12 gap-2 text-xs text-gray-400">
      <svg class="h-4 w-4 animate-spin text-indigo-400" viewBox="0 0 24 24" fill="none">
        <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4" />
        <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
      </svg>
      <span>Расчет статистики по всем ревизиям…</span>
    </div>

    <!-- Empty State -->
    <div
      v-else-if="items.length === 0"
      class="flex flex-col items-center justify-center rounded-lg border border-dashed border-gray-800 py-12 text-center"
    >
      <span class="text-3xl">📋</span>
      <h4 class="mt-2 text-sm font-medium text-gray-200">Нет данных о ревизиях</h4>
      <p class="mt-1 text-xs text-gray-500">Создайте новую ревизию в системе для отображения статистики.</p>
    </div>

    <!-- Filter Empty State -->
    <div
      v-else-if="sortedItems.length === 0"
      class="flex flex-col items-center justify-center rounded-lg border border-dashed border-gray-800 py-12 text-center"
    >
      <span class="text-3xl">🔍</span>
      <h4 class="mt-2 text-sm font-medium text-gray-200">По выбранным фильтрам ревизии не найдены</h4>
      <p class="mt-1 text-xs text-gray-500">Попробуйте сбросить фильтры колонок для отображения всех ревизий.</p>
      <button
        type="button"
        @click="clearAllColumnFilters"
        class="mt-3 rounded-lg bg-indigo-500/20 px-3 py-1 text-xs font-semibold text-indigo-300 ring-1 ring-indigo-500/40 hover:bg-indigo-500/30 transition-colors cursor-pointer"
      >
        Сбросить фильтры
      </button>
    </div>

    <!-- Table -->
    <div v-else class="overflow-x-auto rounded-lg border border-gray-800/80">
      <table class="w-full text-left text-xs text-gray-300">
        <thead class="border-b border-gray-800/80 bg-gray-950/80 text-[10px] uppercase tracking-wider text-gray-400 font-semibold select-none whitespace-nowrap">
          <tr>
            <StoreTableTh
              compact
              title="Магазин / Ревизия"
              column-key="storeNumber"
              width="min-w-[150px]"
              :sort-key="sortKey"
              :sort-direction="sortDirection"
              :distinct-values="() => getDistinctValues('storeNumber')"
              :model-value="columnFilters['storeNumber'] || null"
              @sort="toggleSort"
              @update:model-value="setColumnFilter('storeNumber', $event)"
            />

            <StoreTableTh
              compact
              title="Период"
              column-key="period"
              width="w-32 min-w-[125px]"
              :sort-key="sortKey"
              :sort-direction="sortDirection"
              :distinct-values="() => getDistinctValues('period')"
              :model-value="columnFilters['period'] || null"
              @sort="toggleSort"
              @update:model-value="setColumnFilter('period', $event)"
            />

            <StoreTableTh
              compact
              title="Статус"
              column-key="status"
              align="center"
              width="w-20 min-w-[80px]"
              :sort-key="sortKey"
              :sort-direction="sortDirection"
              :distinct-values="() => getDistinctValues('status')"
              :model-value="columnFilters['status'] || null"
              @sort="toggleSort"
              @update:model-value="setColumnFilter('status', $event)"
            />

            <StoreTableTh
              compact
              title="ЛК факт"
              column-key="factSkuCount"
              align="right"
              width="w-20 min-w-[80px]"
              :sort-key="sortKey"
              :sort-direction="sortDirection"
              :distinct-values="() => getDistinctValues('factSkuCount')"
              :model-value="columnFilters['factSkuCount'] || null"
              @sort="toggleSort"
              @update:model-value="setColumnFilter('factSkuCount', $event)"
            />

            <StoreTableTh
              compact
              title="Факт (сумма)"
              column-key="factTotalQuantity"
              align="right"
              width="w-26 min-w-[95px]"
              :sort-key="sortKey"
              :sort-direction="sortDirection"
              :distinct-values="() => getDistinctValues('factTotalQuantity')"
              :model-value="columnFilters['factTotalQuantity'] || null"
              @sort="toggleSort"
              @update:model-value="setColumnFilter('factTotalQuantity', $event)"
            />

            <StoreTableTh
              compact
              title="% заноса"
              column-key="enteredSumPercent"
              align="right"
              width="w-20 min-w-[75px]"
              :sort-key="sortKey"
              :sort-direction="sortDirection"
              :distinct-values="() => getDistinctValues('enteredSumPercent')"
              :model-value="columnFilters['enteredSumPercent'] || null"
              @sort="toggleSort"
              @update:model-value="setColumnFilter('enteredSumPercent', $event)"
            />

            <StoreTableTh
              compact
              title="299 склад"
              column-key="fact299SkuCount"
              align="right"
              width="w-20 min-w-[80px]"
              :sort-key="sortKey"
              :sort-direction="sortDirection"
              :distinct-values="() => getDistinctValues('fact299SkuCount')"
              :model-value="columnFilters['fact299SkuCount'] || null"
              @sort="toggleSort"
              @update:model-value="setColumnFilter('fact299SkuCount', $event)"
            />

            <StoreTableTh
              compact
              title="299 зал (%)"
              column-key="hall299Percent"
              align="right"
              width="w-22 min-w-[85px]"
              :sort-key="sortKey"
              :sort-direction="sortDirection"
              :distinct-values="() => getDistinctValues('hall299Percent')"
              :model-value="columnFilters['hall299Percent'] || null"
              @sort="toggleSort"
              @update:model-value="setColumnFilter('hall299Percent', $event)"
            />

            <StoreTableTh
              compact
              title="Локаций"
              column-key="factLocationsCount"
              align="right"
              width="w-18 min-w-[70px]"
              :sort-key="sortKey"
              :sort-direction="sortDirection"
              :distinct-values="() => getDistinctValues('factLocationsCount')"
              :model-value="columnFilters['factLocationsCount'] || null"
              @sort="toggleSort"
              @update:model-value="setColumnFilter('factLocationsCount', $event)"
            />

            <StoreTableTh
              compact
              title="Не забито"
              column-key="missingGeneralSkuCount"
              align="right"
              width="w-20 min-w-[80px]"
              :sort-key="sortKey"
              :sort-direction="sortDirection"
              :distinct-values="() => getDistinctValues('missingGeneralSkuCount')"
              :model-value="columnFilters['missingGeneralSkuCount'] || null"
              @sort="toggleSort"
              @update:model-value="setColumnFilter('missingGeneralSkuCount', $event)"
            />

            <th class="px-2 py-1.5 select-none text-[10px] whitespace-nowrap">Кратности</th>
            <th class="w-16 px-2 py-1.5 text-center select-none text-[10px] whitespace-nowrap">Действие</th>
          </tr>
        </thead>
        <tbody class="divide-y divide-gray-800/50 bg-gray-900/40 text-xs">
          <tr
            v-for="stat in sortedItems"
            :key="stat.revisionId"
            class="hover:bg-gray-800/40 transition-colors"
          >
            <!-- Магазин -->
            <td class="px-2 py-1.5 font-semibold text-gray-100 whitespace-nowrap">
              <div class="flex items-center gap-1.5">
                <span class="text-xs">🏬</span>
                <span>Магазин №{{ stat.storeNumber }}</span>
              </div>
            </td>

            <!-- Период -->
            <td class="px-2 py-1.5 text-gray-400 font-mono text-[11px] whitespace-nowrap">
              {{ formatDateRange(stat.startDate, stat.endDate) }}
            </td>

            <!-- Статус -->
            <td class="px-2 py-1.5 text-center whitespace-nowrap">
              <span
                v-if="stat.isArchived"
                class="rounded-md bg-gray-800 px-1.5 py-0.5 text-[10px] font-medium text-gray-400 ring-1 ring-gray-700"
              >
                📦 Архив
              </span>
              <span
                v-else
                class="rounded-md bg-emerald-500/10 px-1.5 py-0.5 text-[10px] font-medium text-emerald-400 ring-1 ring-emerald-500/20"
              >
                🟢 Активна
              </span>
            </td>

            <!-- ЛК уник -->
            <td class="px-2 py-1.5 text-right font-mono font-semibold text-indigo-300 whitespace-nowrap">
              {{ stat.factSkuCount.toLocaleString('ru-RU') }}
            </td>

            <!-- Товар сумма -->
            <td class="px-2 py-1.5 text-right font-mono font-semibold text-cyan-300 whitespace-nowrap">
              {{ stat.factTotalQuantity.toLocaleString('ru-RU') }} <span class="text-[10px] font-normal text-gray-500">шт.</span>
            </td>

            <!-- % заноса -->
            <td class="px-2 py-1.5 text-right font-mono font-semibold text-emerald-400 whitespace-nowrap">
              {{ stat.enteredSumPercent }}%
            </td>

            <!-- 299 на складе -->
            <td class="px-2 py-1.5 text-right font-mono font-semibold text-rose-300 whitespace-nowrap" :title="`Из ${stat.stock299SkuCount} ЛК на остатке`">
              {{ stat.fact299SkuCount.toLocaleString('ru-RU') }}
            </td>

            <!-- 299 в зале (%) -->
            <td class="px-2 py-1.5 text-right font-mono font-semibold text-amber-300 whitespace-nowrap" :title="`В зале: ${stat.hall299SkuCount} из ${stat.stock299SkuCount} ЛК`">
              {{ stat.hall299Percent }}%
            </td>

            <!-- Локаций -->
            <td class="px-2 py-1.5 text-right font-mono text-purple-300 whitespace-nowrap">
              {{ stat.factLocationsCount.toLocaleString('ru-RU') }}
            </td>

            <!-- Не забито -->
            <td class="px-2 py-1.5 text-right font-mono font-semibold whitespace-nowrap">
              <span
                v-if="stat.missingGeneralSkuCount > 0"
                class="text-amber-400"
              >
                {{ stat.missingGeneralSkuCount.toLocaleString('ru-RU') }}
              </span>
              <span
                v-else
                class="text-emerald-400"
              >
                0
              </span>
            </td>

            <!-- Топ кратности -->
            <td class="px-2 py-1.5 whitespace-nowrap">
              <div v-if="stat.topMultiplicities && stat.topMultiplicities.length > 0" class="flex items-center gap-1">
                <span
                  v-for="m in stat.topMultiplicities.slice(0, 3)"
                  :key="m.multiplicity"
                  class="rounded bg-pink-500/15 px-1 py-0.5 text-[10px] font-mono text-pink-300 ring-1 ring-pink-500/20"
                  :title="`Кратность ×${m.multiplicity}: ${m.skuCount} поз.`"
                >
                  ×{{ m.multiplicity }}
                </span>
                <span v-if="stat.topMultiplicities.length > 3" class="text-[10px] text-gray-500">
                  +{{ stat.topMultiplicities.length - 3 }}
                </span>
              </div>
              <span v-else class="text-gray-600 text-[11px]">—</span>
            </td>

            <!-- Действие -->
            <td class="px-2 py-1.5 text-center whitespace-nowrap">
              <button
                @click="emit('select', stat.revisionId)"
                class="rounded-md bg-indigo-500/15 px-2 py-0.5 text-[11px] font-semibold text-indigo-300 ring-1 ring-indigo-500/30 hover:bg-indigo-500/25 transition-colors cursor-pointer"
              >
                Открыть
              </button>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>
</template>
