<script setup lang="ts">
import type { useStoreStockTab } from '../../model/useStoreStockTab'

const props = defineProps<{
  tab: ReturnType<typeof useStoreStockTab>
}>()

const {
  store,
  isReadOnly,
  newRow,
  skuInputRef,
  generateRandomSku,
  handleNameInput,
  handleAddRow,
  handlePaste,
} = props.tab
</script>

<template>
  <!-- Excel-like inline row for manual add (Pinned at top) -->
  <tr v-if="!isReadOnly" class="bg-indigo-950/60 border-b-2 border-indigo-500/30 backdrop-blur-md transition-colors shadow-sm select-none">
    <td class="px-3 py-2 text-center text-xs text-indigo-400 font-bold">＋</td>
    <td class="px-3 py-2 text-center text-xs text-indigo-400 font-mono font-medium">
      {{ store.stockItems.length + 1 }}
    </td>
    <!-- SKU -->
    <td class="px-2 py-2">
      <div class="flex items-center gap-1">
        <input
          ref="skuInputRef"
          v-model="newRow.sku"
          type="text"
          placeholder="ЛК / Артикул"
          @paste="(e) => handlePaste(e, 'sku')"
          @keydown.enter="handleAddRow"
          class="w-full rounded bg-gray-950/80 px-2 py-1 text-xs font-mono text-gray-200 ring-1 ring-gray-700/70 focus:outline-none focus:ring-1 focus:ring-indigo-500 placeholder:text-gray-600"
        />
        <button
          type="button"
          @click="generateRandomSku"
          class="rounded bg-gray-800/80 p-1 text-[10px] text-gray-400 hover:bg-gray-700 hover:text-gray-200 transition-colors cursor-pointer shrink-0"
          title="Сгенерировать артикул / выбрать из каталога"
        >
          🎲
        </button>
      </div>
    </td>
    <!-- Name -->
    <td class="px-2 py-2">
      <input
        v-model="newRow.name"
        type="text"
        placeholder="Наименование товара…"
        @input="handleNameInput"
        @paste="(e) => handlePaste(e, 'name')"
        @keydown.enter="handleAddRow"
        class="w-full rounded bg-gray-950/80 px-2.5 py-1 text-xs text-gray-200 ring-1 ring-gray-700/70 focus:outline-none focus:ring-1 focus:ring-indigo-500 placeholder:text-gray-600"
      />
    </td>
    <!-- Quantity -->
    <td class="px-2 py-2 text-right">
      <input
        v-model.number="newRow.quantity"
        type="number"
        min="0"
        placeholder="0"
        @paste="(e) => handlePaste(e, 'quantity')"
        @keydown.enter="handleAddRow"
        class="w-20 rounded bg-gray-950/80 px-2 py-1 text-right text-xs tabular-nums text-gray-200 ring-1 ring-gray-700/70 focus:outline-none focus:ring-1 focus:ring-indigo-500"
      />
    </td>
    <!-- Дата изм. (пусто для новой строки) -->
    <td></td>
    <!-- Action -->
    <td class="px-2 py-2 text-center">
      <button
        type="button"
        @click="handleAddRow"
        :disabled="!newRow.name.trim()"
        class="inline-flex items-center gap-1 rounded bg-indigo-600 px-2.5 py-1 text-xs font-medium text-white shadow hover:bg-indigo-500 disabled:opacity-40 disabled:cursor-not-allowed transition-all cursor-pointer"
      >
        <span>＋</span> Добавить
      </button>
    </td>
  </tr>
</template>
