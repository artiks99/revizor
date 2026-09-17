<script setup lang="ts">
import VirtualTable from '@shared/ui/VirtualTable.vue'
import CsvImportModal from './CsvImportModal.vue'
import StoreAccount299Toolbar from './components/StoreAccount299Toolbar.vue'
import StoreAccount299FloatingBar from './components/StoreAccount299FloatingBar.vue'
import StoreAccount299TableHeader from './components/StoreAccount299TableHeader.vue'
import StoreAccount299InlineAdd from './components/StoreAccount299InlineAdd.vue'
import StoreAccount299TableRow from './components/StoreAccount299TableRow.vue'
import StoreAccount299ConfirmModal from './modals/StoreAccount299ConfirmModal.vue'
import StoreAccount299ItemModal from './modals/StoreAccount299ItemModal.vue'
import { useStoreAccount299Tab } from '../model/useStoreAccount299Tab'

const tab = useStoreAccount299Tab()

const {
  store,
  isReadOnly,
  sortedItems,
  isImportModalOpen,
  confirmDialog,
  closeConfirmDialog,
  executeConfirmDialog,
  handleCsvImport,
  editingItem,
  editForm,
  closeEditModal,
  handleSaveEdit,
} = tab
</script>

<template>
  <div class="flex flex-col h-full space-y-4 relative">
    <!-- Floating Bulk Selection & Toast Bar -->
    <StoreAccount299FloatingBar :tab="tab" />

    <!-- Header & Action Toolbar -->
    <StoreAccount299Toolbar :tab="tab" />

    <!-- Virtual Table Component -->
    <VirtualTable
      :items="sortedItems"
      :row-height="44"
      :overscan="10"
      :is-loading="store.isAccount299Loading"
    >
      <template #header>
        <StoreAccount299TableHeader :tab="tab" />
      </template>

      <template #addRow>
        <StoreAccount299InlineAdd :tab="tab" />
      </template>

      <template #row="{ item, index }">
        <StoreAccount299TableRow :item="item" :index="index" :tab="tab" />
      </template>

      <template #empty>
        <tr>
          <td :colspan="isReadOnly ? 4 : 6" class="px-4 py-12 text-center text-gray-500 text-sm">
            <div class="text-2xl mb-1">📭</div>
            <span>{{ store.totalAccount299Count === 0 ? 'Список счета 299 еще не заполнен.' : 'Ничего не найдено по запросу.' }}</span>
            <p v-if="store.totalAccount299Count === 0 && !isReadOnly" class="text-xs text-gray-600 mt-1">
              Вы можете вставить список ЛК прямо из буфера обмена (Ctrl+V) или ввести вручную в нижней строке.
            </p>
          </td>
        </tr>
      </template>
    </VirtualTable>

    <!-- Confirm Dialog Modal -->
    <StoreAccount299ConfirmModal
      :dialog="confirmDialog"
      @confirm="executeConfirmDialog"
      @close="closeConfirmDialog"
    />

    <!-- CSV Import Modal -->
    <CsvImportModal
      v-if="isImportModalOpen"
      type="299"
      :catalog-map="store.catalogSkuMap"
      @close="isImportModalOpen = false"
      @import-account299="handleCsvImport"
    />

    <!-- Item Edit Modal -->
    <StoreAccount299ItemModal
      :editing-item="editingItem"
      :edit-form="editForm"
      @close="closeEditModal"
      @save="handleSaveEdit"
    />
  </div>
</template>
