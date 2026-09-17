<script setup lang="ts">
import VirtualTable from '@shared/ui/VirtualTable.vue'
import CsvImportModal from './CsvImportModal.vue'
import StoreCatalogToolbar from './components/StoreCatalogToolbar.vue'
import StoreCatalogFloatingBar from './components/StoreCatalogFloatingBar.vue'
import StoreCatalogTableHeader from './components/StoreCatalogTableHeader.vue'
import StoreCatalogInlineAdd from './components/StoreCatalogInlineAdd.vue'
import StoreCatalogTableRow from './components/StoreCatalogTableRow.vue'
import StoreCatalogItemModal from './modals/StoreCatalogItemModal.vue'
import StoreCatalogConfirmModal from './modals/StoreCatalogConfirmModal.vue'
import { useStoreCatalogTab } from '../model/useStoreCatalogTab'

const tab = useStoreCatalogTab()

const {
  store,
  isReadOnly,
  sortedItems,
  isImportModalOpen,
  editingItem,
  editForm,
  closeEditModal,
  handleSaveEdit,
  confirmDialog,
  executeConfirmDialog,
  handleImportCatalog,
} = tab
</script>

<template>
  <div class="flex flex-col h-full space-y-4 relative">
    <!-- Floating Bulk Selection & Toast Bar -->
    <StoreCatalogFloatingBar :tab="tab" />

    <!-- Header & Action Toolbar -->
    <StoreCatalogToolbar :tab="tab" />

    <!-- Virtualized Table -->
    <VirtualTable :items="sortedItems" :row-height="44" table-height="calc(70vh - 88px)">
      <template #header>
        <StoreCatalogTableHeader :tab="tab" />
      </template>

      <template #addRow>
        <StoreCatalogInlineAdd :tab="tab" />
      </template>

      <template #row="{ item, index }">
        <StoreCatalogTableRow :item="item" :index="index" :tab="tab" />
      </template>

      <template #empty>
        <tr>
          <td :colspan="isReadOnly ? 5 : 7" class="px-4 py-8 text-center text-xs text-gray-500">
            <div class="text-2xl mb-1">📭</div>
            <span>{{ store.catalogItems.length === 0 ? 'Товары магазина еще не загружены.' : 'Ничего не найдено по запросу.' }}</span>
          </td>
        </tr>
      </template>
    </VirtualTable>

    <!-- Import Modal -->
    <CsvImportModal
      v-if="isImportModalOpen"
      type="catalog"
      @close="isImportModalOpen = false"
      @import-catalog="handleImportCatalog"
    />

    <!-- Edit Item Modal -->
    <StoreCatalogItemModal
      :editing-item="editingItem"
      :edit-form="editForm"
      @close="closeEditModal"
      @save="handleSaveEdit"
    />

    <!-- Confirmation Modal for Mass Actions -->
    <StoreCatalogConfirmModal
      :is-open="confirmDialog.isOpen"
      :title="confirmDialog.title"
      :description="confirmDialog.description"
      :confirm-text="confirmDialog.confirmText"
      :badge="confirmDialog.badge"
      :is-danger="confirmDialog.isDanger"
      @confirm="executeConfirmDialog"
      @close="confirmDialog.isOpen = false"
    />
  </div>
</template>
