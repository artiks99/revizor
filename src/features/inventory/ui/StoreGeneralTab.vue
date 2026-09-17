<script setup lang="ts">
import VirtualTable from '@shared/ui/VirtualTable.vue'
import StoreTableTh from '@shared/ui/StoreTableTh.vue'
import StoreTabEmptyState from '@shared/ui/StoreTabEmptyState.vue'
import StoreTabFloatingBar from '@shared/ui/StoreTabFloatingBar.vue'
import StoreGeneralToolbar from './components/StoreGeneralToolbar.vue'
import StoreGeneralInlineAdd from './components/StoreGeneralInlineAdd.vue'
import StoreGeneralTableRow from './components/StoreGeneralTableRow.vue'
import { useStoreGeneralTab } from '../model/useStoreGeneralTab'

const tab = useStoreGeneralTab()
const {
  store,
  isReadOnly,
  notificationMsg,
  sortedRows,
  sortKey,
  sortDirection,
  toggleSort,
  selectedIds,
  isAllSelected,
  isSomeSelected,
  toggleSelectAll,
  toggleSelectRow,
  clearSelection,
  columnFilters,
  setColumnFilter,
  getDistinctValues,
  handleDeleteSelected,
  handleCopySelected,
  handleDeleteRow,
} = tab
</script>

<template>
  <div class="space-y-4 relative">
    <!-- Notification Toast Banner -->
    <transition
      enter-active-class="transition duration-150 ease-out"
      enter-from-class="opacity-0 -translate-y-2"
      enter-to-class="opacity-100 translate-y-0"
      leave-active-class="transition duration-100 ease-in"
      leave-from-class="opacity-100 translate-y-0"
      leave-to-class="opacity-0 -translate-y-2"
    >
      <div
        v-if="notificationMsg"
        class="fixed top-16 right-6 z-50 flex items-center gap-2 rounded-xl bg-indigo-900/90 border border-indigo-500/40 px-4 py-2.5 text-xs text-white shadow-xl backdrop-blur-md"
      >
        <span>ℹ️</span>
        <span>{{ notificationMsg }}</span>
      </div>
    </transition>

    <!-- Standard Header Card + Toolbar -->
    <StoreGeneralToolbar :tab="tab" />

    <!-- Floating Batch Actions Bar -->
    <StoreTabFloatingBar
      :count="selectedIds.size"
      :is-read-only="isReadOnly"
      @copy="handleCopySelected"
      @delete="handleDeleteSelected"
      @clear="clearSelection"
    />

    <!-- Virtualized Table (Matching StoreFactTab standard) -->
    <VirtualTable
      :items="sortedRows"
      :row-height="44"
      table-height="calc(70vh - 88px)"
      :is-loading="store.isGeneralLoading"
    >
      <template #header>
        <!-- Column Titles Header Row -->
        <tr class="border-b border-gray-800/60 bg-gray-900/90 text-xs uppercase tracking-wider text-gray-500">
          <!-- Checkbox -->
          <th v-if="!isReadOnly" class="px-2 py-3 w-10 text-center select-none">
            <input
              type="checkbox"
              :checked="isAllSelected"
              :indeterminate.prop="isSomeSelected"
              @change="toggleSelectAll"
              :disabled="sortedRows.length === 0"
              class="h-4 w-4 rounded border-gray-700 bg-gray-900 text-indigo-600 focus:ring-indigo-500/50 cursor-pointer"
              title="Выбрать все видимые позиции"
            />
          </th>

          <!-- Index -->
          <th class="px-2 py-3 font-medium w-14 text-center select-none">№</th>

          <!-- ЛК (Артикул) -->
          <StoreTableTh
            title="Артикул"
            column-key="sku"
            width="w-36"
            :sort-key="sortKey"
            :sort-direction="sortDirection"
            :distinct-values="() => getDistinctValues('sku')"
            :model-value="columnFilters['sku'] || null"
            @sort="toggleSort"
            @update:model-value="setColumnFilter('sku', $event)"
          />

          <!-- Наименование -->
          <StoreTableTh
            title="Наименование"
            column-key="name"
            width="min-w-[200px]"
            :sort-key="sortKey"
            :sort-direction="sortDirection"
            :distinct-values="() => getDistinctValues('name')"
            :model-value="columnFilters['name'] || null"
            @sort="toggleSort"
            @update:model-value="setColumnFilter('name', $event)"
          />

          <!-- Упоминаний -->
          <StoreTableTh
            title="Упоминаний"
            column-key="mentionsCount"
            align="center"
            width="w-28"
            :sort-key="sortKey"
            :sort-direction="sortDirection"
            :distinct-values="() => getDistinctValues('mentionsCount')"
            :model-value="columnFilters['mentionsCount'] || null"
            @sort="toggleSort"
            @update:model-value="setColumnFilter('mentionsCount', $event)"
          />

          <!-- Факт (склад) -->
          <StoreTableTh
            title="Факт (склад)"
            column-key="factQuantity"
            align="right"
            width="w-32"
            :sort-key="sortKey"
            :sort-direction="sortDirection"
            :distinct-values="() => getDistinctValues('factQuantity')"
            :model-value="columnFilters['factQuantity'] || null"
            @sort="toggleSort"
            @update:model-value="setColumnFilter('factQuantity', $event)"
          />

          <!-- Кратность -->
          <StoreTableTh
            title="Кратность"
            column-key="multiplicity"
            align="center"
            width="w-24"
            :sort-key="sortKey"
            :sort-direction="sortDirection"
            :distinct-values="() => getDistinctValues('multiplicity')"
            :model-value="columnFilters['multiplicity'] || null"
            @sort="toggleSort"
            @update:model-value="setColumnFilter('multiplicity', $event)"
          />

          <!-- Системный ост. -->
          <StoreTableTh
            title="Системный ост."
            column-key="stockQuantity"
            align="right"
            width="w-32"
            :sort-key="sortKey"
            :sort-direction="sortDirection"
            :distinct-values="() => getDistinctValues('stockQuantity')"
            :model-value="columnFilters['stockQuantity'] || null"
            @sort="toggleSort"
            @update:model-value="setColumnFilter('stockQuantity', $event)"
          />

          <!-- Расхождение -->
          <StoreTableTh
            title="Расхождение"
            column-key="discrepancy"
            align="right"
            width="w-32"
            :sort-key="sortKey"
            :sort-direction="sortDirection"
            :distinct-values="() => getDistinctValues('discrepancy')"
            :model-value="columnFilters['discrepancy'] || null"
            @sort="toggleSort"
            @update:model-value="setColumnFilter('discrepancy', $event)"
          />

          <!-- 299 -->
          <StoreTableTh
            title="299"
            column-key="is299"
            align="center"
            width="w-20"
            :sort-key="sortKey"
            :sort-direction="sortDirection"
            :distinct-values="() => getDistinctValues('is299')"
            :model-value="columnFilters['is299'] || null"
            @sort="toggleSort"
            @update:model-value="setColumnFilter('is299', $event)"
          />

          <!-- Дата изм. -->
          <StoreTableTh
            title="Дата изм."
            column-key="updatedAt"
            align="center"
            width="w-36"
            :sort-key="sortKey"
            :sort-direction="sortDirection"
            :distinct-values="() => getDistinctValues('updatedAt')"
            :model-value="columnFilters['updatedAt'] || null"
            @sort="toggleSort"
            @update:model-value="setColumnFilter('updatedAt', $event)"
          />

          <!-- Actions -->
          <th v-if="!isReadOnly" class="px-2 py-3 font-medium text-center w-20 select-none">Действия</th>
        </tr>

        <!-- Inline Add / Paste Row in Table Header -->
        <StoreGeneralInlineAdd :tab="tab" :is-read-only="isReadOnly" />
      </template>

      <!-- Row Template -->
      <template #row="{ item, index }">
        <StoreGeneralTableRow
          :item="item"
          :index="index"
          :is-selected="selectedIds.has(item.id)"
          :is-read-only="isReadOnly"
          @toggle-select="toggleSelectRow(item.id)"
          @delete="handleDeleteRow(item)"
        />
      </template>

      <!-- Standard Empty State (Full Table Width) -->
      <template #empty>
        <StoreTabEmptyState
          :colspan="isReadOnly ? 11 : 12"
          icon="📑"
          :title="store.generalItems.length === 0 ? 'Список «Общее» еще не заполнен' : 'Ничего не найдено по текущему фильтру'"
          :description="
            store.generalItems.length === 0
              ? 'Вы можете ввести артикул вручную в строке шапки таблицы или вставить список ЛК из буфера обмена (Ctrl+V).'
              : 'Попробуйте изменить поисковый запрос или сбросить фильтры колонок.'
          "
        />
      </template>
    </VirtualTable>
  </div>
</template>
