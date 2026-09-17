<script setup lang="ts">
import type { useStoreCatalogTab } from '../../model/useStoreCatalogTab'
import { ExcelColumnFilter } from '@shared'

const props = defineProps<{
  tab: ReturnType<typeof useStoreCatalogTab>
}>()

const {
  isReadOnly,
  isAllSelected,
  isPartiallySelected,
  sortKey,
  sortDirection,
  columnFilters,
  getDistinctValues,
  setColumnFilter,
  toggleSort,
  toggleSelectAll,
} = props.tab
</script>

<template>
  <tr class="border-b border-gray-800/60 bg-gray-900/90 text-xs uppercase tracking-wider text-gray-500">
    <th v-if="!isReadOnly" class="px-2 py-3 w-10 text-center select-none">
      <input
        type="checkbox"
        :checked="isAllSelected"
        :indeterminate.prop="isPartiallySelected"
        @change="toggleSelectAll"
        class="h-4 w-4 rounded border-gray-700 bg-gray-900 text-indigo-600 focus:ring-indigo-500/50 cursor-pointer"
        title="Выбрать все видимые товары"
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
      class="px-4 py-3 font-medium w-48 select-none transition-colors hover:bg-gray-800/40"
      :class="{ 'text-indigo-400 font-semibold bg-gray-800/20': sortKey === 'barcode' }"
    >
      <div class="flex items-center justify-between gap-1.5">
        <div
          @click="toggleSort('barcode')"
          class="flex items-center gap-1.5 cursor-pointer flex-1"
          title="Нажмите для сортировки по штрихкоду"
        >
          <span>Штрихкод</span>
          <span class="text-xs transition-opacity" :class="sortKey === 'barcode' ? 'text-indigo-400 opacity-100 font-bold' : 'opacity-30 hover:opacity-80'">
            <template v-if="sortKey === 'barcode'">
              {{ sortDirection === 'asc' ? '▲' : '▼' }}
            </template>
            <template v-else>↕</template>
          </span>
        </div>
        <ExcelColumnFilter
          title="Штрихкод"
          :distinct-values="() => getDistinctValues('barcode')"
          :model-value="columnFilters['barcode'] || null"
          @update:model-value="setColumnFilter('barcode', $event)"
        />
      </div>
    </th>
    <th class="px-3 py-3 font-medium w-36 select-none text-center">Дата изм.</th>
    <th v-if="!isReadOnly" class="px-2 py-3 font-medium text-center w-20 select-none">Действия</th>
  </tr>
</template>
