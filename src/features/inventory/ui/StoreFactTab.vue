<script setup lang="ts">
import VirtualTable from '@shared/ui/VirtualTable.vue'
import PasteLocationsModal from './modals/PasteLocationsModal.vue'
import PasteQuantitiesModal from './modals/PasteQuantitiesModal.vue'
import CsvImportModal from './CsvImportModal.vue'
import StoreFactConfirmModal from './modals/StoreFactConfirmModal.vue'
import StoreFactItemModal from './modals/StoreFactItemModal.vue'
import StoreFactToolbar from './components/StoreFactToolbar.vue'
import StoreFactFloatingBar from './components/StoreFactFloatingBar.vue'
import StoreFactTableHeader from './components/StoreFactTableHeader.vue'
import StoreFactInlineAdd from './components/StoreFactInlineAdd.vue'
import StoreFactTableRow from './components/StoreFactTableRow.vue'
import { useStoreFactTab } from '../model/useStoreFactTab'

const tab = useStoreFactTab()

const {
  store,
  isReadOnly,
  sortedItems,
  isMouseDownDragging,
  batchOps,
  isModalOpen,
  modalMode,
  modalForm,
  modalErrors,
  handleModalSave,
  setModalGeneratedSKU,
  isImportModalOpen,
  handleImportFact,
  isPasteQuantitiesModalOpen,
  isPasteLocationsModalOpen,
  modalTargetItems,
} = tab

const { confirmDialog, executeConfirmDialog } = batchOps
</script>

<template>
  <div class="flex flex-col h-full space-y-4">
    <!-- Floating Batch Actions & Toast Banners -->
    <StoreFactFloatingBar :tab="tab" />

    <!-- Top Header & Filter Toolbar -->
    <StoreFactToolbar :tab="tab" />

    <!-- Virtualized Table -->
    <VirtualTable
      :items="sortedItems"
      :row-height="44"
      table-height="calc(70vh - 88px)"
      :class="{ 'select-none': isMouseDownDragging }"
    >
      <!-- Column Titles Header Row -->
      <template #header>
        <StoreFactTableHeader :tab="tab" />
      </template>

      <!-- Excel-like inline row for adding new item (Pinned at top) -->
      <template #addRow>
        <StoreFactInlineAdd :tab="tab" />
      </template>

      <!-- Row Template -->
      <template #row="{ item, index }">
        <StoreFactTableRow :item="item" :index="index" :tab="tab" />
      </template>

      <!-- Empty State -->
      <template #empty>
        <tr>
          <td :colspan="isReadOnly ? 11 : 13" class="py-12 text-center">
            <div class="text-3xl mb-2">📭</div>
            <p class="text-sm font-medium text-gray-300">
              {{ store.items.length === 0 ? 'Фактическая ревизия еще не заполнена' : 'Ничего не найдено по текущему фильтру' }}
            </p>
            <p class="text-xs text-gray-500 mt-1 max-w-md mx-auto">
              {{
                store.items.length === 0
                  ? 'Вы можете добавить позиции вручную, вставить строки из буфера обмена (Ctrl+V) или загрузить CSV-файл с ревизией.'
                  : 'Попробуйте изменить поисковый запрос или сбросить фильтры колонок.'
              }}
            </p>
          </td>
        </tr>
      </template>
    </VirtualTable>

    <!-- Confirmation Modal Dialog -->
    <StoreFactConfirmModal
      :is-open="confirmDialog.isOpen"
      :title="confirmDialog.title"
      :description="confirmDialog.description"
      :confirm-text="confirmDialog.confirmText"
      :badge="confirmDialog.badge"
      :is-danger="confirmDialog.isDanger"
      @confirm="executeConfirmDialog"
      @close="confirmDialog.isOpen = false"
    />

    <!-- Add/Edit Modal (Glassmorphism overlay) -->
    <StoreFactItemModal
      :is-open="isModalOpen"
      :mode="modalMode"
      :form="modalForm"
      :errors="modalErrors"
      @save="handleModalSave"
      @generate-sku="setModalGeneratedSKU"
      @close="isModalOpen = false"
    />

    <!-- CSV Import Modal -->
    <CsvImportModal
      v-if="isImportModalOpen"
      type="fact"
      :catalog-map="store.catalogSkuMap"
      @close="isImportModalOpen = false"
      @import-fact="handleImportFact"
    />

    <!-- MODAL: Paste Quantities Batch -->
    <PasteQuantitiesModal
      :is-open="isPasteQuantitiesModalOpen"
      :target-items="modalTargetItems"
      @close="isPasteQuantitiesModalOpen = false"
      @apply="batchOps.applyQuantitiesBatch"
    />

    <!-- MODAL: Paste Locations Batch -->
    <PasteLocationsModal
      :is-open="isPasteLocationsModalOpen"
      :target-items="modalTargetItems"
      @close="isPasteLocationsModalOpen = false"
      @apply="batchOps.applyLocationsBatch"
    />
  </div>
</template>
