<script setup lang="ts">
import type { useStoreMultiplicityTab } from '../../model/useStoreMultiplicityTab'

const props = defineProps<{
  tab: ReturnType<typeof useStoreMultiplicityTab>
}>()

const {
  store,
  isReadOnly,
  newRow,
  skuInputRef,
  pickRandomCatalogSku,
  handlePasteSku,
  handleAddRow,
} = props.tab
</script>

<template>
  <tr v-if="!isReadOnly" class="bg-indigo-950/60 border-b-2 border-indigo-500/30 backdrop-blur-md transition-colors shadow-sm select-none">
    <td class="px-3 py-2 text-center text-xs text-indigo-400 font-bold">＋</td>
    <td class="px-3 py-2 text-center text-xs text-indigo-400 font-mono font-medium">Нов.</td>

    <!-- SKU Input + Random Picker -->
    <td class="px-2 py-2">
      <div class="flex items-center gap-1">
        <input
          ref="skuInputRef"
          v-model="newRow.sku"
          type="text"
          inputmode="numeric"
          maxlength="7"
          placeholder="7 цифр ЛК…"
          @keydown.enter="handleAddRow"
          @paste="handlePasteSku"
          class="w-full rounded bg-gray-950/80 px-2 py-1 text-xs font-mono text-gray-200 ring-1 ring-gray-700/70 focus:outline-none focus:ring-1 focus:ring-indigo-500 placeholder:text-gray-600 shadow-sm"
        />
        <button
          type="button"
          @click="pickRandomCatalogSku"
          class="rounded bg-gray-800/80 p-1 text-[10px] text-gray-400 hover:bg-gray-700 hover:text-amber-300 transition-colors cursor-pointer shrink-0"
          title="Выбрать случайный ЛК из каталога"
        >
          🎲
        </button>
      </div>
    </td>

    <!-- Name Auto Preview -->
    <td class="px-3 py-2 text-xs">
      <span v-if="newRow.sku.trim()" class="text-gray-300 italic truncate block max-w-md">
        {{ store.catalogSkuMap.get(newRow.sku.trim()) || 'Товар отсутствует в каталоге (Н/Д)' }}
      </span>
      <span v-else class="text-gray-600 text-xs italic">
        Наименование подтянется из каталога автоматически
      </span>
    </td>

    <!-- Multiplicity Input -->
    <td class="px-2 py-2 text-right">
      <input
        v-model.number="newRow.multiplicity"
        type="number"
        min="1"
        step="1"
        placeholder="1"
        @keydown.enter="handleAddRow"
        class="w-24 rounded bg-gray-950/80 px-2 py-1 text-right text-xs font-mono font-bold tabular-nums text-gray-200 ring-1 ring-gray-700/70 focus:outline-none focus:ring-1 focus:ring-indigo-500"
      />
    </td>

    <!-- Дата изм. (пусто для новой строки) -->
    <td></td>

    <!-- Add Button -->
    <td class="px-2 py-2 text-center">
      <button
        type="button"
        @click="handleAddRow"
        :disabled="!newRow.sku.trim() || newRow.multiplicity < 1"
        class="inline-flex items-center gap-1 rounded bg-indigo-600 px-2.5 py-1 text-xs font-medium text-white shadow hover:bg-indigo-500 disabled:opacity-40 disabled:cursor-not-allowed transition-all cursor-pointer"
      >
        <span>＋</span> Добавить
      </button>
    </td>
  </tr>
</template>
