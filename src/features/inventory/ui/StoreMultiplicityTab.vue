<script setup lang="ts">
import VirtualTable from '@shared/ui/VirtualTable.vue'
import StoreMultiplicityToolbar from './components/StoreMultiplicityToolbar.vue'
import StoreMultiplicityFloatingBar from './components/StoreMultiplicityFloatingBar.vue'
import StoreMultiplicityTableHeader from './components/StoreMultiplicityTableHeader.vue'
import StoreMultiplicityInlineAdd from './components/StoreMultiplicityInlineAdd.vue'
import StoreMultiplicityTableRow from './components/StoreMultiplicityTableRow.vue'
import StoreMultiplicityConfirmModal from './modals/StoreMultiplicityConfirmModal.vue'
import { useStoreMultiplicityTab } from '../model/useStoreMultiplicityTab'

const tab = useStoreMultiplicityTab()

const {
  store,
  isReadOnly,
  sortedItems,
  confirmDialog,
  closeConfirmDialog,
  executeConfirmDialog,
} = tab
</script>

<template>
  <div class="flex flex-col h-full space-y-4 relative">
    <!-- Floating Bulk Selection & Toast Bar -->
    <StoreMultiplicityFloatingBar :tab="tab" />

    <!-- Header & Action Toolbar -->
    <StoreMultiplicityToolbar :tab="tab" />

    <!-- Virtualized Table -->
    <VirtualTable
      :items="sortedItems"
      :row-height="44"
      :overscan="10"
      table-height="calc(70vh - 88px)"
      :is-loading="store.isMultiplicityLoading"
    >
      <template #header>
        <StoreMultiplicityTableHeader :tab="tab" />
      </template>

      <template #addRow>
        <StoreMultiplicityInlineAdd :tab="tab" />
      </template>

      <template #row="{ item, index }">
        <StoreMultiplicityTableRow :item="item" :index="index" :tab="tab" />
      </template>

      <template #empty>
        <tr>
          <td :colspan="isReadOnly ? 5 : 7" class="px-4 py-12 text-center text-xs text-gray-500">
            <div class="text-3xl mb-2">📐</div>
            <div class="text-sm font-medium text-gray-300">
              {{ store.totalMultiplicityCount === 0 ? 'Список позиций кратности пуст.' : 'Ничего не найдено по текущему фильтру.' }}
            </div>
            <p v-if="store.totalMultiplicityCount === 0 && !isReadOnly" class="text-xs text-gray-500 mt-1 max-w-sm mx-auto">
              Введите ЛК (артикул) и кратность товара в закрепленной строке выше или скопируйте список из Excel/буфера обмена.
            </p>
          </td>
        </tr>
      </template>
    </VirtualTable>

    <!-- Confirm Dialog Modal -->
    <StoreMultiplicityConfirmModal
      :dialog="confirmDialog"
      @confirm="executeConfirmDialog"
      @close="closeConfirmDialog"
    />
  </div>
</template>
