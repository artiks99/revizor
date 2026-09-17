<script setup lang="ts">
import type { useStoreFactTab } from '../../model/useStoreFactTab'
import ExcelColumnFilter from '@shared/ui/ExcelColumnFilter.vue'

const props = defineProps<{
  tab: ReturnType<typeof useStoreFactTab>
}>()

const {
  isReadOnly,
  isAllSelected,
  isPartiallySelected,
  toggleSelectAll,
  sortKey,
  sortDirection,
  toggleSort,
  columnFilters,
  getDistinctValues,
  setColumnFilter,
} = props.tab
</script>

<template>
  <tr class="border-b border-gray-800/60 bg-gray-900/90 text-[11px] uppercase tracking-wider text-gray-500">
    <!-- Checkbox Select All -->
    <th v-if="!isReadOnly" class="px-1 py-2.5 w-8 text-center select-none">
      <input
        type="checkbox"
        :checked="isAllSelected"
        :indeterminate.prop="isPartiallySelected"
        @change="toggleSelectAll"
        class="h-3.5 w-3.5 rounded border-gray-700 bg-gray-900 text-indigo-600 focus:ring-indigo-500/50 cursor-pointer"
        title="Выбрать все видимые позиции"
      />
    </th>

    <!-- Index -->
    <th class="px-1 py-2.5 font-medium w-9 text-center select-none">№</th>

    <!-- Артикул (ЛК) -->
    <th
      class="px-1.5 py-2.5 font-medium w-28 select-none transition-colors hover:bg-gray-800/40"
      :class="{ 'text-indigo-400 font-semibold bg-gray-800/20': sortKey === 'sku' }"
    >
      <div class="flex items-center justify-between gap-0.5">
        <div
          @click="toggleSort('sku')"
          class="flex items-center gap-1 cursor-pointer flex-1"
          title="Нажмите для сортировки по артикулу"
        >
          <span>ЛК</span>
          <span class="text-[10px] transition-opacity" :class="sortKey === 'sku' ? 'text-indigo-400 opacity-100 font-bold' : 'opacity-30 hover:opacity-80'">
            <template v-if="sortKey === 'sku'">
              {{ sortDirection === 'asc' ? '▲' : '▼' }}
            </template>
            <template v-else>↕</template>
          </span>
        </div>
        <ExcelColumnFilter
          title="Артикул"
          :distinct-values="() => getDistinctValues('sku')"
          :model-value="columnFilters['sku'] || null"
          @update:model-value="setColumnFilter('sku', $event)"
        />
      </div>
    </th>

    <!-- Наименование -->
    <th
      class="px-2 py-2.5 font-medium select-none transition-colors hover:bg-gray-800/40 min-w-[120px]"
      :class="{ 'text-indigo-400 font-semibold bg-gray-800/20': sortKey === 'name' }"
    >
      <div class="flex items-center justify-between gap-1">
        <div
          @click="toggleSort('name')"
          class="flex items-center gap-1 cursor-pointer flex-1"
          title="Нажмите для сортировки по наименованию"
        >
          <span>Наименование</span>
          <span class="text-[10px] transition-opacity" :class="sortKey === 'name' ? 'text-indigo-400 opacity-100 font-bold' : 'opacity-30 hover:opacity-80'">
            <template v-if="sortKey === 'name'">
              {{ sortDirection === 'asc' ? '▲' : '▼' }}
            </template>
            <template v-else>↕</template>
          </span>
        </div>
        <ExcelColumnFilter
          title="Наименование"
          :distinct-values="() => getDistinctValues('name')"
          :model-value="columnFilters['name'] || null"
          @update:model-value="setColumnFilter('name', $event)"
        />
      </div>
    </th>

    <!-- Упоминаний -->
    <th
      class="px-1 py-2.5 font-medium w-16 text-center select-none transition-colors hover:bg-gray-800/40"
      :class="{ 'text-indigo-400 font-semibold bg-gray-800/20': sortKey === 'mentions' }"
    >
      <div class="flex items-center justify-center gap-0.5">
        <div
          @click="toggleSort('mentions')"
          class="flex items-center gap-0.5 cursor-pointer"
          title="Упоминания: количество повторений ЛК в ревизии"
        >
          <span>Упом.</span>
          <span class="text-[10px] transition-opacity" :class="sortKey === 'mentions' ? 'text-indigo-400 opacity-100 font-bold' : 'opacity-30 hover:opacity-80'">
            <template v-if="sortKey === 'mentions'">
              {{ sortDirection === 'asc' ? '▲' : '▼' }}
            </template>
            <template v-else>↕</template>
          </span>
        </div>
        <ExcelColumnFilter
          title="Упоминание"
          :distinct-values="() => getDistinctValues('mentions')"
          :model-value="columnFilters['mentions'] || null"
          @update:model-value="setColumnFilter('mentions', $event)"
        />
      </div>
    </th>

    <!-- Локация -->
    <th
      class="px-1.5 py-2.5 font-medium w-24 select-none transition-colors hover:bg-gray-800/40"
      :class="{ 'text-indigo-400 font-semibold bg-gray-800/20': sortKey === 'location' }"
    >
      <div class="flex items-center justify-between gap-0.5">
        <div
          @click="toggleSort('location')"
          class="flex items-center gap-0.5 cursor-pointer flex-1"
          title="Нажмите для сортировки по локации"
        >
          <span>Локация</span>
          <span class="text-[10px] transition-opacity" :class="sortKey === 'location' ? 'text-indigo-400 opacity-100 font-bold' : 'opacity-30 hover:opacity-80'">
            <template v-if="sortKey === 'location'">
              {{ sortDirection === 'asc' ? '▲' : '▼' }}
            </template>
            <template v-else>↕</template>
          </span>
        </div>
        <ExcelColumnFilter
          title="Локация"
          :distinct-values="() => getDistinctValues('location')"
          :model-value="columnFilters['location'] || null"
          @update:model-value="setColumnFilter('location', $event)"
        />
      </div>
    </th>

    <!-- Количество -->
    <th
      class="px-1.5 py-2.5 font-medium text-right w-20 select-none transition-colors hover:bg-gray-800/40 whitespace-nowrap"
      :class="{ 'text-indigo-400 font-semibold bg-gray-800/20': sortKey === 'quantity' }"
    >
      <div class="flex items-center justify-end gap-0.5 whitespace-nowrap">
        <ExcelColumnFilter
          title="Количество"
          :distinct-values="() => getDistinctValues('quantity')"
          :model-value="columnFilters['quantity'] || null"
          align="right"
          @update:model-value="setColumnFilter('quantity', $event)"
        />
        <div
          @click="toggleSort('quantity')"
          class="flex items-center gap-0.5 cursor-pointer whitespace-nowrap"
          title="Нажмите для сортировки по количеству"
        >
          <span>Кол-во</span>
          <span class="text-[10px] transition-opacity" :class="sortKey === 'quantity' ? 'text-indigo-400 opacity-100 font-bold' : 'opacity-30 hover:opacity-80'">
            <template v-if="sortKey === 'quantity'">
              {{ sortDirection === 'asc' ? '▲' : '▼' }}
            </template>
            <template v-else>↕</template>
          </span>
        </div>
      </div>
    </th>

    <!-- Номер коробки -->
    <th
      class="px-1.5 py-2.5 font-medium text-center w-20 select-none transition-colors hover:bg-gray-800/40"
      :class="{ 'text-indigo-400 font-semibold bg-gray-800/20': sortKey === 'boxNumber' }"
    >
      <div class="flex items-center justify-center gap-0.5">
        <div
          @click="toggleSort('boxNumber')"
          class="flex items-center gap-0.5 cursor-pointer"
          title="Нажмите для сортировки по номеру коробки"
        >
          <span>№ кор.</span>
          <span class="text-[10px] transition-opacity" :class="sortKey === 'boxNumber' ? 'text-indigo-400 opacity-100 font-bold' : 'opacity-30 hover:opacity-80'">
            <template v-if="sortKey === 'boxNumber'">
              {{ sortDirection === 'asc' ? '▲' : '▼' }}
            </template>
            <template v-else>↕</template>
          </span>
        </div>
        <ExcelColumnFilter
          title="№ коробки"
          :distinct-values="() => getDistinctValues('boxNumber')"
          :model-value="columnFilters['boxNumber'] || null"
          @update:model-value="setColumnFilter('boxNumber', $event)"
        />
      </div>
    </th>

    <!-- Кратность -->
    <th
      class="px-1 py-2.5 font-medium text-center w-16 select-none transition-colors hover:bg-gray-800/40 whitespace-nowrap"
      :class="{ 'text-indigo-400 font-semibold bg-gray-800/20': sortKey === 'multiplicity' }"
    >
      <div class="flex items-center justify-center gap-0.5 whitespace-nowrap">
        <div
          @click="toggleSort('multiplicity')"
          class="flex items-center gap-0.5 cursor-pointer whitespace-nowrap"
          title="Нажмите для сортировки по кратности"
        >
          <span>Кратн.</span>
          <span class="text-[10px] transition-opacity" :class="sortKey === 'multiplicity' ? 'text-indigo-400 opacity-100 font-bold' : 'opacity-30 hover:opacity-80'">
            <template v-if="sortKey === 'multiplicity'">
              {{ sortDirection === 'asc' ? '▲' : '▼' }}
            </template>
            <template v-else>↕</template>
          </span>
        </div>
        <ExcelColumnFilter
          title="Кратность"
          :distinct-values="() => getDistinctValues('multiplicity')"
          :model-value="columnFilters['multiplicity'] || null"
          @update:model-value="setColumnFilter('multiplicity', $event)"
        />
      </div>
    </th>

    <!-- Системный остаток (Аудит) -->
    <th
      class="px-1.5 py-2.5 font-medium text-right w-20 select-none transition-colors hover:bg-gray-800/40 whitespace-nowrap"
      :class="{ 'text-indigo-400 font-semibold bg-gray-800/20': sortKey === 'audit' }"
    >
      <div class="flex items-center justify-end gap-0.5 whitespace-nowrap">
        <ExcelColumnFilter
          title="Аудит"
          :distinct-values="() => getDistinctValues('audit')"
          :model-value="columnFilters['audit'] || null"
          align="right"
          @update:model-value="setColumnFilter('audit', $event)"
        />
        <div
          @click="toggleSort('audit')"
          class="flex items-center gap-0.5 cursor-pointer whitespace-nowrap"
          title="Системный остаток (аудит)"
        >
          <span>Аудит</span>
          <span class="text-[10px] transition-opacity" :class="sortKey === 'audit' ? 'text-indigo-400 opacity-100 font-bold' : 'opacity-30 hover:opacity-80'">
            <template v-if="sortKey === 'audit'">
              {{ sortDirection === 'asc' ? '▲' : '▼' }}
            </template>
            <template v-else>↕</template>
          </span>
        </div>
      </div>
    </th>

    <!-- Расхождения -->
    <th
      class="px-1 py-2.5 font-medium text-center w-20 select-none transition-colors hover:bg-gray-800/40"
      :class="{ 'text-indigo-400 font-semibold bg-gray-800/20': sortKey === 'discrepancy' }"
    >
      <div class="flex items-center justify-center gap-0.5">
        <div
          @click="toggleSort('discrepancy')"
          class="flex items-center gap-0.5 cursor-pointer"
          title="Расхождение (факт минус остаток)"
        >
          <span>Расхожд.</span>
          <span class="text-[10px] transition-opacity" :class="sortKey === 'discrepancy' ? 'text-indigo-400 opacity-100 font-bold' : 'opacity-30 hover:opacity-80'">
            <template v-if="sortKey === 'discrepancy'">
              {{ sortDirection === 'asc' ? '▲' : '▼' }}
            </template>
            <template v-else>↕</template>
          </span>
        </div>
        <ExcelColumnFilter
          title="Расхождения"
          :distinct-values="() => getDistinctValues('discrepancy')"
          :model-value="columnFilters['discrepancy'] || null"
          @update:model-value="setColumnFilter('discrepancy', $event)"
        />
      </div>
    </th>

    <!-- Дата изм. -->
    <th
      class="px-1.5 py-2.5 font-medium text-center w-24 select-none transition-colors hover:bg-gray-800/40"
      :class="{ 'text-indigo-400 font-semibold bg-gray-800/20': sortKey === 'updatedAt' }"
    >
      <div class="flex items-center justify-center gap-0.5">
        <div
          @click="toggleSort('updatedAt')"
          class="flex items-center gap-0.5 cursor-pointer"
          title="Дата изменения"
        >
          <span>Дата</span>
          <span class="text-[10px] transition-opacity" :class="sortKey === 'updatedAt' ? 'text-indigo-400 opacity-100 font-bold' : 'opacity-30 hover:opacity-80'">
            <template v-if="sortKey === 'updatedAt'">
              {{ sortDirection === 'asc' ? '▲' : '▼' }}
            </template>
            <template v-else>↕</template>
          </span>
        </div>
        <ExcelColumnFilter
          title="Дата изменения"
          :distinct-values="() => getDistinctValues('updatedAt')"
          :model-value="columnFilters['updatedAt'] || null"
          @update:model-value="setColumnFilter('updatedAt', $event)"
        />
      </div>
    </th>

    <!-- Actions -->
    <th v-if="!isReadOnly" class="px-1 py-2.5 font-medium text-center w-14 select-none">Действия</th>
  </tr>
</template>
