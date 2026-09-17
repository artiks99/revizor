<script setup lang="ts">
import VirtualTable from '@shared/ui/VirtualTable.vue'
import CsvImportModal from './CsvImportModal.vue'
import StoreStockToolbar from './components/StoreStockToolbar.vue'
import StoreStockFloatingBar from './components/StoreStockFloatingBar.vue'
import StoreStockTableHeader from './components/StoreStockTableHeader.vue'
import StoreStockInlineAdd from './components/StoreStockInlineAdd.vue'
import StoreStockTableRow from './components/StoreStockTableRow.vue'
import StoreStockConfirmModal from './modals/StoreStockConfirmModal.vue'
import StoreStockItemModal from './modals/StoreStockItemModal.vue'
import { useStoreStockTab } from '../model/useStoreStockTab'

const tab = useStoreStockTab()

const {
  store,
  isReadOnly,
  sortedItems,
  isImportModalOpen,
  confirmDialog,
  executeConfirmDialog,
  handleImportStock,
  editingItem,
  editForm,
  closeEditModal,
  handleSaveEdit,
} = tab
</script>

<template>
  <div class="flex flex-col h-full space-y-4 relative">
    <!-- Floating Bulk Selection & Toast Bar -->
    <StoreStockFloatingBar :tab="tab" />

    <!-- Header & Action Toolbar -->
    <StoreStockToolbar :tab="tab" />

    <!-- Virtualized Table -->
    <VirtualTable :items="sortedItems" :row-height="44" table-height="calc(70vh - 88px)">
      <template #header>
        <StoreStockTableHeader :tab="tab" />
      </template>

      <template #addRow>
        <StoreStockInlineAdd :tab="tab" />
      </template>

      <template #row="{ item, index }">
        <StoreStockTableRow :item="item" :index="index" :tab="tab" />
      </template>

      <template #empty>
        <tr>
          <td :colspan="isReadOnly ? 5 : 7" class="px-4 py-8 text-center text-xs text-gray-500">
            <div class="text-2xl mb-1">📭</div>
            <span>{{ store.stockItems.length === 0 ? 'Системные остатки еще не загружены.' : 'Ничего не найдено по запросу.' }}</span>
          </td>
        </tr>
      </template>
    </VirtualTable>

    <!-- Import Modal -->
    <CsvImportModal
      v-if="isImportModalOpen"
      type="stock"
      @close="isImportModalOpen = false"
      @import-stock="handleImportStock"
    />

    <!-- Confirmation Modal for Mass Actions -->
    <StoreStockConfirmModal
      :is-open="confirmDialog.isOpen"
      :title="confirmDialog.title"
      :description="confirmDialog.description"
      :confirm-text="confirmDialog.confirmText"
      :badge="confirmDialog.badge"
      :is-danger="confirmDialog.isDanger"
      @confirm="executeConfirmDialog"
      @close="confirmDialog.isOpen = false"
    />

    <!-- Item Edit Modal -->
    <StoreStockItemModal
      :editing-item="editingItem"
      :edit-form="editForm"
      @close="closeEditModal"
      @save="handleSaveEdit"
    />
  </div>
</template>
