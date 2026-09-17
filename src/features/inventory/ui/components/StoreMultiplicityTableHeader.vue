<script setup lang="ts">
import type { useStoreMultiplicityTab } from '../../model/useStoreMultiplicityTab'
import { ExcelColumnFilter } from '@shared'

const props = defineProps<{
  tab: ReturnType<typeof useStoreMultiplicityTab>
}>()

const {
  isReadOnly,
  isAllSelected,
  isSomeSelected,
  sortKey,
  sortDirection,
  columnFilters,
  sortedItems,
  getDistinctValues,
  setColumnFilter,
  toggleSort,
  toggleSelectAll,
} = props.tab
</script>

<template>
  <tr class="border-b border-gray-800/60 bg-gray-900/90 text-xs uppercase tracking-wider text-gray-500">
    <!-- Checkbox Column -->
    <th v-if="!isReadOnly" class="px-2 py-3 w-10 text-center select-none">
      <input
        type="checkbox"
        :checked="isAllSelected"
        :indeterminate.prop="isSomeSelected"
        @change="toggleSelectAll"
        :disabled="isReadOnly || sortedItems.length === 0"
        class="h-4 w-4 rounded border-gray-700 bg-gray-900 text-indigo-600 focus:ring-indigo-500/50 cursor-pointer disabled:cursor-not-allowed"
        title="Выбрать все видимые позиции"
      />
    </th>

    <!-- Index Column -->
    <th class="px-2 py-3 font-medium w-14 text-center select-none">№</th>

    <!-- SKU Column -->
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
          <span
            class="text-xs transition-opacity"
            :class="sortKey === 'sku' ? 'text-indigo-400 opacity-100 font-bold' : 'opacity-30 hover:opacity-80'"
          >
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

    <!-- Product Name Column -->
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
          <span
            class="text-xs transition-opacity"
            :class="sortKey === 'name' ? 'text-indigo-400 opacity-100 font-bold' : 'opacity-30 hover:opacity-80'"
          >
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

    <!-- Multiplicity Column -->
    <th
      class="px-4 py-3 font-medium text-right w-44 select-none transition-colors hover:bg-gray-800/40"
      :class="{ 'text-indigo-400 font-semibold bg-gray-800/20': sortKey === 'multiplicity' }"
    >
      <div class="flex items-center justify-end gap-1.5">
        <ExcelColumnFilter
          title="Кратность"
          :distinct-values="() => getDistinctValues('multiplicity')"
          :model-value="columnFilters['multiplicity'] || null"
          align="right"
          @update:model-value="setColumnFilter('multiplicity', $event)"
        />
        <div
          @click="toggleSort('multiplicity')"
          class="flex items-center gap-1.5 cursor-pointer"
          title="Нажмите для сортировки по кратности"
        >
          <span>Кратность</span>
          <span
            class="text-xs transition-opacity"
            :class="sortKey === 'multiplicity' ? 'text-indigo-400 opacity-100 font-bold' : 'opacity-30 hover:opacity-80'"
          >
            <template v-if="sortKey === 'multiplicity'">
              {{ sortDirection === 'asc' ? '▲' : '▼' }}
            </template>
            <template v-else>↕</template>
          </span>
        </div>
      </div>
    </th>

    <!-- Updated At Column -->
    <th class="px-3 py-3 font-medium w-36 select-none text-center">Дата изм.</th>

    <!-- Actions Column -->
    <th v-if="!isReadOnly" class="px-4 py-3 font-medium text-center w-28 select-none">Действия</th>
  </tr>
</template>
