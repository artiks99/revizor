<script setup lang="ts">
import type { useStoreStockTab } from '../../model/useStoreStockTab'
import ExcelColumnFilter from '@shared/ui/ExcelColumnFilter.vue'

const props = defineProps<{
  tab: ReturnType<typeof useStoreStockTab>
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
  <tr class="border-b border-gray-800/60 bg-gray-900/90 text-xs uppercase tracking-wider text-gray-500">
    <!-- Checkbox select column (Hidden when read-only) -->
    <th v-if="!isReadOnly" class="px-2 py-3 w-10 text-center select-none">
      <input
        type="checkbox"
        :checked="isAllSelected"
        :indeterminate.prop="isPartiallySelected"
        @change="toggleSelectAll"
        class="h-4 w-4 rounded border-gray-700 bg-gray-900 text-indigo-600 focus:ring-indigo-500/50 cursor-pointer"
        title="Выбрать все видимые позиции"
      />
    </th>
    <th class="px-2 py-3 font-medium w-14 text-center select-none">№</th>
    <th
      class="px-4 py-3 font-medium w-48 select-none transition-colors hover:bg-gray-800/40"
      :class="{ 'text-indigo-400 font-semibold bg-gray-800/20': sortKey === 'sku' }"
    >
      <div class="flex items-center justify-between gap-1.5">
        <div
          @click="toggleSort('sku')"
          class="flex items-center gap-1.5 cursor-pointer flex-1"
          title="Нажмите для сортировки по ЛК"
        >
          <span>ЛК (Артикул)</span>
          <span class="text-xs transition-opacity" :class="sortKey === 'sku' ? 'text-indigo-400 opacity-100 font-bold' : 'opacity-30 hover:opacity-80'">
            <template v-if="sortKey === 'sku'">
              {{ sortDirection === 'asc' ? '▲' : '▼' }}
            </template>
            <template v-else>↕</template>
          </span>
        </div>
        <ExcelColumnFilter
          title="ЛК (Артикул)"
          :distinct-values="() => getDistinctValues('sku')"
          :model-value="columnFilters['sku'] || null"
          @update:model-value="setColumnFilter('sku', $event)"
        />
      </div>
    </th>
    <th
      class="px-4 py-3 font-medium select-none transition-colors hover:bg-gray-800/40"
      :class="{ 'text-indigo-400 font-semibold bg-gray-800/20': sortKey === 'name' }"
    >
      <div class="flex items-center justify-between gap-1.5">
        <div
          @click="toggleSort('name')"
          class="flex items-center gap-1.5 cursor-pointer flex-1"
          title="Нажмите для сортировки по наименованию"
        >
          <span>Наименование товара</span>
          <span class="text-xs transition-opacity" :class="sortKey === 'name' ? 'text-indigo-400 opacity-100 font-bold' : 'opacity-30 hover:opacity-80'">
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
    <th
      class="px-4 py-3 font-medium text-right w-44 select-none transition-colors hover:bg-gray-800/40"
      :class="{ 'text-indigo-400 font-semibold bg-gray-800/20': sortKey === 'quantity' }"
    >
      <div class="flex items-center justify-end gap-1.5">
        <ExcelColumnFilter
          title="Количество"
          :distinct-values="() => getDistinctValues('quantity')"
          :model-value="columnFilters['quantity'] || null"
          align="right"
          @update:model-value="setColumnFilter('quantity', $event)"
        />
        <div
          @click="toggleSort('quantity')"
          class="flex items-center gap-1.5 cursor-pointer"
          title="Нажмите для сортировки по остатку"
        >
          <span>Кол-во (остаток)</span>
          <span class="text-xs transition-opacity" :class="sortKey === 'quantity' ? 'text-indigo-400 opacity-100 font-bold' : 'opacity-30 hover:opacity-80'">
            <template v-if="sortKey === 'quantity'">
              {{ sortDirection === 'asc' ? '▲' : '▼' }}
            </template>
            <template v-else>↕</template>
          </span>
        </div>
      </div>
    </th>
    <th class="px-3 py-3 font-medium w-36 select-none text-center">Дата изм.</th>
    <th v-if="!isReadOnly" class="px-2 py-3 font-medium text-center w-20 select-none">Действия</th>
  </tr>
</template>
