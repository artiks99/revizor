<script setup lang="ts">
import type { useStoreGeneralTab } from '../../model/useStoreGeneralTab'

const props = defineProps<{
  tab: ReturnType<typeof useStoreGeneralTab>
  isReadOnly: boolean
}>()

const {
  store,
  newSku,
  handlePasteSku,
  handleAddSingleSku,
} = props.tab
</script>

<template>
  <tr v-if="!isReadOnly" class="border-b border-indigo-500/30 bg-indigo-950/20 select-none">
    <td class="w-8 text-center"></td>
    <td class="w-9 text-center text-indigo-400 font-bold text-xs">＋</td>

    <!-- SKU input -->
    <td class="px-1.5 py-1.5 w-28">
      <input
        v-model="newSku"
        type="text"
        placeholder="Вставить / ввести ЛК…"
        @paste="handlePasteSku"
        @keydown.enter="handleAddSingleSku"
        class="w-full rounded bg-gray-950 px-1.5 py-0.5 text-xs font-mono font-bold text-indigo-300 ring-1 ring-indigo-500/50 focus:ring-indigo-400 placeholder:text-gray-600 focus:outline-none shadow-sm"
        title="Введите ЛК или вставьте столбец артикулов из Excel (Ctrl+V)"
      />
    </td>

    <!-- Name auto preview -->
    <td class="px-2 py-1.5 min-w-[120px] text-xs text-gray-400 truncate">
      <span v-if="newSku.trim() && store.catalogSkuMap.get(newSku.replace(/\D/g, '').slice(0, 7))" class="text-indigo-300 font-medium truncate block">
        {{ store.catalogSkuMap.get(newSku.replace(/\D/g, '').slice(0, 7)) }}
      </span>
      <span v-else-if="newSku.trim() && store.isNotFoundInCatalog(newSku.replace(/\D/g, '').slice(0, 7))" class="text-amber-400 font-medium truncate block">
        Н/Д
      </span>
      <span v-else class="text-gray-600 text-[11px] italic truncate block">Из каталога</span>
    </td>

    <!-- Mentions count preview -->
    <td class="px-1 py-1.5 text-center text-xs font-mono w-16">
      <span v-if="newSku.trim()" class="text-indigo-300 font-semibold">
        {{ store.getFactSkuCount(newSku.replace(/\D/g, '').slice(0, 7)) }}
      </span>
      <span v-else class="text-gray-600">—</span>
    </td>

    <!-- Fact Qty preview -->
    <td class="px-1.5 py-1.5 text-right text-xs font-mono w-20">
      <span v-if="newSku.trim()" class="text-indigo-300 font-semibold">
        {{ store.getFactSkuQuantity(newSku.replace(/\D/g, '').slice(0, 7)) }}
      </span>
      <span v-else class="text-gray-600">—</span>
    </td>

    <!-- Multiplicity preview -->
    <td class="px-1 py-1.5 text-center text-xs font-mono w-16">
      <span v-if="newSku.trim()" class="text-indigo-300 font-semibold">
        ×{{ store.getMultiplicityValue(newSku.replace(/\D/g, '').slice(0, 7)) }}
      </span>
      <span v-else class="text-gray-600">—</span>
    </td>

    <!-- System stock preview -->
    <td class="px-1.5 py-1.5 text-right text-xs font-mono w-20">
      <span v-if="newSku.trim() && store.getStockItemQuantity(newSku.replace(/\D/g, '').slice(0, 7)) !== null" class="text-indigo-300 font-semibold">
        {{ store.getStockItemQuantity(newSku.replace(/\D/g, '').slice(0, 7)) }}
      </span>
      <span v-else class="text-gray-600">—</span>
    </td>

    <!-- Discrepancy preview -->
    <td class="px-1 py-1.5 text-right text-xs font-mono w-20">
      <template v-if="newSku.trim() && store.getStockItemQuantity(newSku.replace(/\D/g, '').slice(0, 7)) !== null">
        <span
          class="font-bold px-1.5 py-0.5 rounded text-[11px]"
          :class="[
            (store.getFactSkuQuantity(newSku.replace(/\D/g, '').slice(0, 7)) - store.getStockItemQuantity(newSku.replace(/\D/g, '').slice(0, 7))!) === 0
              ? 'text-gray-400'
              : ((store.getFactSkuQuantity(newSku.replace(/\D/g, '').slice(0, 7)) - store.getStockItemQuantity(newSku.replace(/\D/g, '').slice(0, 7))!) > 0
                  ? 'text-emerald-400 bg-emerald-500/10 ring-1 ring-emerald-500/30'
                  : 'text-rose-400 bg-rose-500/10 ring-1 ring-rose-500/30')
          ]"
        >
          {{ (store.getFactSkuQuantity(newSku.replace(/\D/g, '').slice(0, 7)) - store.getStockItemQuantity(newSku.replace(/\D/g, '').slice(0, 7))!) > 0 ? '+' : '' }}{{ (store.getFactSkuQuantity(newSku.replace(/\D/g, '').slice(0, 7)) - store.getStockItemQuantity(newSku.replace(/\D/g, '').slice(0, 7))!) }}
        </span>
      </template>
      <span v-else class="text-gray-600">—</span>
    </td>

    <!-- 299 preview -->
    <td class="px-1 py-1.5 text-center text-xs w-16">
      <span
        v-if="newSku.trim() && store.isAccount299Item(newSku.replace(/\D/g, '').slice(0, 7))"
        class="rounded bg-purple-500/20 text-purple-300 px-1 py-0.5 text-[10px] font-bold ring-1 ring-purple-500/40"
      >
        299
      </span>
      <span v-else class="text-gray-600">—</span>
    </td>

    <!-- Date preview -->
    <td class="px-1.5 py-1.5 text-center text-xs font-mono w-24 text-gray-600">—</td>

    <!-- Add Button -->
    <td class="px-1 py-1.5 text-center w-14">
      <button
        type="button"
        @click="handleAddSingleSku"
        :disabled="!newSku.trim()"
        class="w-full rounded bg-indigo-600 px-1.5 py-1 text-xs font-medium text-white hover:bg-indigo-500 disabled:opacity-30 transition-colors cursor-pointer shadow-sm"
        title="Добавить позицию (Enter)"
      >
        ＋
      </button>
    </td>
  </tr>
</template>
