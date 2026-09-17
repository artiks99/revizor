<script setup lang="ts">
import type { useStoreFactTab } from '../../model/useStoreFactTab'
import StoreMultiplicityBadge from '@shared/ui/StoreMultiplicityBadge.vue'

const props = defineProps<{
  tab: ReturnType<typeof useStoreFactTab>
}>()

const {
  store,
  isReadOnly,
  newRow,
  skuInputRef,
  handlePaste,
  handleAddRow,
  generateRandomSku,
  getSkuMentions,
  getFactDiscrepancy,
  skuFactTotalQtyMap,
} = props.tab
</script>

<template>
  <!-- Excel-like inline row for adding new item (Pinned at top) -->
  <tr v-if="!isReadOnly" class="bg-indigo-950/60 border-b-2 border-indigo-500/30 backdrop-blur-md transition-colors shadow-sm">
    <td class="px-2 py-2 text-center text-xs text-indigo-400 font-bold w-10">＋</td>
    <td class="px-2 py-2 text-center text-xs text-indigo-400 font-mono font-medium w-14">
      {{ store.items.length + 1 }}
    </td>

    <!-- SKU -->
    <td class="px-2.5 py-2 w-36">
      <div class="flex items-center gap-1">
        <input
          ref="skuInputRef"
          v-model="newRow.sku"
          type="text"
          inputmode="numeric"
          maxlength="7"
          placeholder="7 цифр"
          @input="newRow.sku = newRow.sku.replace(/\D/g, '').slice(0, 7)"
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

    <!-- Name Auto Preview / Placeholder -->
    <td class="px-3 py-2 text-xs truncate min-w-[200px]">
      <span v-if="newRow.sku.trim()" class="text-gray-300 italic">
        {{ store.catalogSkuMap.get(newRow.sku.replace(/\D/g, '').slice(0, 7)) || newRow.name || 'Товар отсутствует в каталоге (Н/Д)' }}
      </span>
      <span v-else class="text-gray-600 text-xs italic">
        Наименование подтянется из каталога автоматически
      </span>
    </td>

    <!-- Mentions Auto Preview -->
    <td class="px-2 py-2 text-center text-xs font-mono w-28">
      <span v-if="newRow.sku.trim() && getSkuMentions(newRow.sku) > 0" class="text-indigo-300 font-semibold bg-indigo-500/15 px-2 py-0.5 rounded">
        {{ getSkuMentions(newRow.sku) }}
      </span>
      <span v-else-if="newRow.sku.trim()" class="text-gray-400">
        0
      </span>
      <span v-else class="text-gray-600 font-mono">—</span>
    </td>

    <!-- Location -->
    <td class="px-2.5 py-2 w-36">
      <input
        v-model="newRow.location"
        type="text"
        placeholder="Локация…"
        @paste="(e) => handlePaste(e, 'location')"
        @keydown.enter="handleAddRow"
        class="w-full rounded bg-gray-950/80 px-2.5 py-1 text-xs text-gray-200 ring-1 ring-gray-700/70 focus:outline-none focus:ring-1 focus:ring-indigo-500 placeholder:text-gray-600"
      />
    </td>

    <!-- Quantity -->
    <td class="px-2.5 py-2 text-right w-32 whitespace-nowrap">
      <input
        v-model.number="newRow.quantity"
        type="number"
        min="0"
        placeholder="1"
        @paste="(e) => handlePaste(e, 'quantity')"
        @keydown.enter="handleAddRow"
        class="w-full rounded bg-gray-950/80 px-2.5 py-1 text-right text-xs tabular-nums text-gray-200 ring-1 ring-gray-700/70 focus:outline-none focus:ring-1 focus:ring-indigo-500"
      />
    </td>

    <!-- Box Number -->
    <td class="px-2.5 py-2 w-28">
      <input
        v-model="newRow.boxNumber"
        type="text"
        placeholder="№ коробки…"
        @paste="(e) => handlePaste(e, 'boxNumber')"
        @keydown.enter="handleAddRow"
        class="w-full rounded bg-gray-950/80 px-2.5 py-1 text-xs text-center text-gray-200 ring-1 ring-gray-700/70 focus:outline-none focus:ring-1 focus:ring-indigo-500 placeholder:text-gray-600"
      />
    </td>

    <!-- Multiplicity Preview -->
    <td class="px-2.5 py-2 text-center font-mono text-xs w-24 whitespace-nowrap">
      <template v-if="newRow.sku.trim()">
        <StoreMultiplicityBadge :value="store.getMultiplicityValue(newRow.sku.replace(/\D/g, '').slice(0, 7))" />
      </template>
      <span v-else class="text-gray-600 font-mono">—</span>
    </td>

    <!-- Audit System Qty Auto Preview -->
    <td class="px-2.5 py-2 text-right text-xs font-mono w-28 whitespace-nowrap">
      <span v-if="newRow.sku.trim() && store.getStockItemQuantity(newRow.sku.replace(/\D/g, '').slice(0, 7)) !== null" class="text-indigo-300 font-semibold bg-indigo-500/15 px-2 py-0.5 rounded">
        {{ store.getStockItemQuantity(newRow.sku.replace(/\D/g, '').slice(0, 7)) }} шт.
      </span>
      <span v-else class="text-gray-600 font-mono">
        —
      </span>
    </td>

    <!-- Discrepancy Preview -->
    <td class="px-2.5 py-2 text-center text-xs font-mono w-28">
      <template v-if="newRow.sku.trim()">
        <span
          v-if="getFactDiscrepancy({ sku: newRow.sku.replace(/\D/g, '').slice(0, 7) }, (skuFactTotalQtyMap.get(newRow.sku.replace(/\D/g, '').slice(0, 7).toLowerCase()) || 0) + (Number(newRow.quantity) || 0)).type === 'ok'"
          class="inline-flex items-center rounded-md bg-emerald-500/15 px-2 py-0.5 text-xs font-bold text-emerald-400 ring-1 ring-emerald-500/30"
        >
          ОК
        </span>
        <span
          v-else-if="getFactDiscrepancy({ sku: newRow.sku.replace(/\D/g, '').slice(0, 7) }, (skuFactTotalQtyMap.get(newRow.sku.replace(/\D/g, '').slice(0, 7).toLowerCase()) || 0) + (Number(newRow.quantity) || 0)).type === 'surplus'"
          class="inline-flex items-center rounded-md bg-amber-500/15 px-2 py-0.5 text-xs font-bold text-amber-400 ring-1 ring-amber-500/30 font-mono"
        >
          {{ getFactDiscrepancy({ sku: newRow.sku.replace(/\D/g, '').slice(0, 7) }, (skuFactTotalQtyMap.get(newRow.sku.replace(/\D/g, '').slice(0, 7).toLowerCase()) || 0) + (Number(newRow.quantity) || 0)).text }}
        </span>
        <span
          v-else
          class="inline-flex items-center rounded-md bg-rose-500/15 px-2 py-0.5 text-xs font-bold text-rose-400 ring-1 ring-rose-500/30 font-mono"
        >
          {{ getFactDiscrepancy({ sku: newRow.sku.replace(/\D/g, '').slice(0, 7) }, (skuFactTotalQtyMap.get(newRow.sku.replace(/\D/g, '').slice(0, 7).toLowerCase()) || 0) + (Number(newRow.quantity) || 0)).text }}
        </span>
      </template>
      <span v-else class="text-gray-600 font-mono">—</span>
    </td>

    <!-- Дата изм. (пусто для новой строки) -->
    <td class="w-36"></td>

    <!-- Actions / Add Button -->
    <td class="px-2 py-2 text-center w-20">
      <button
        type="button"
        @click="handleAddRow"
        :disabled="!newRow.sku.trim()"
        class="w-full rounded bg-indigo-600 px-2 py-1 text-xs font-medium text-white hover:bg-indigo-500 disabled:opacity-30 disabled:hover:bg-indigo-600 transition-colors cursor-pointer disabled:cursor-not-allowed shadow-sm"
        title="Добавить позицию (Enter)"
      >
        ＋
      </button>
    </td>
  </tr>
</template>
