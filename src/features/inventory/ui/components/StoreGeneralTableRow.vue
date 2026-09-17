<script setup lang="ts">
import CopyableSku from '@shared/ui/CopyableSku.vue'
import { formatDateTime } from '@shared/lib/formatDate'
import {
  StoreCountBadge,
  StoreMultiplicityBadge,
  StoreDiscrepancyBadge,
  StoreStatusBadge,
} from '@shared'
import type { GeneralRowView } from '../../model/useStoreGeneralTab'

defineProps<{
  item: GeneralRowView
  index: number
  isSelected: boolean
  isReadOnly: boolean
}>()

const emit = defineEmits<{
  (e: 'toggle-select'): void
  (e: 'delete'): void
}>()
</script>

<template>
  <tr
    class="transition-colors hover:bg-gray-800/30 select-none"
    :class="[
      isSelected ? 'bg-indigo-950/40 hover:bg-indigo-900/40' : '',
      item.discrepancy !== null && item.discrepancy !== 0 ? 'bg-amber-950/10' : '',
    ]"
  >
    <!-- Checkbox -->
    <td
      v-if="!isReadOnly"
      class="px-1 py-2 text-center w-8 cursor-pointer select-none transition-colors"
      :class="isSelected ? 'bg-indigo-500/20' : 'hover:bg-gray-800/40'"
      @click.stop="emit('toggle-select')"
    >
      <input
        type="checkbox"
        :checked="isSelected"
        class="h-3.5 w-3.5 rounded border-gray-700 bg-gray-900 text-indigo-600 focus:ring-indigo-500/50 cursor-pointer pointer-events-none"
        tabindex="-1"
      />
    </td>

    <!-- Row number -->
    <td class="px-1 py-2 text-center text-xs text-gray-500 font-mono w-9 select-none pointer-events-none">
      {{ index + 1 }}
    </td>

    <!-- SKU with copy -->
    <td class="px-1.5 py-2 font-mono text-xs w-28 select-text">
      <CopyableSku :sku="item.sku" text-class="text-indigo-400 font-medium" />
    </td>

    <!-- Name -->
    <td class="px-2 py-2 text-xs font-medium text-gray-200 truncate min-w-[120px] select-none" :title="item.name">
      <StoreStatusBadge v-if="item.isNotFoundInCatalog" status="nd" class="mr-1" />
      <span>{{ item.name }}</span>
    </td>

    <!-- Mentions count in fact -->
    <td
      class="px-1 py-2 text-center font-mono text-xs w-16 cursor-help select-none"
      :title="item.locationTooltip"
    >
      <StoreCountBadge :count="item.mentionsCount" />
    </td>

    <!-- Fact Quantity -->
    <td
      class="px-1.5 py-2 text-right font-mono text-xs w-20 font-semibold text-gray-200 cursor-help select-none whitespace-nowrap"
      :title="item.locationTooltip"
    >
      {{ item.factQuantity }}
    </td>

    <!-- Multiplicity -->
    <td class="px-1 py-2 text-center font-mono text-xs w-16 select-none whitespace-nowrap">
      <StoreMultiplicityBadge :value="item.multiplicity" />
    </td>

    <!-- System Stock -->
    <td class="px-1.5 py-2 text-right font-mono text-xs w-20 text-gray-300 select-none whitespace-nowrap">
      <span v-if="item.stockQuantity !== null">{{ item.stockQuantity }}</span>
      <span v-else class="text-gray-600">—</span>
    </td>

    <!-- Discrepancy -->
    <td class="px-1 py-2 text-right font-mono text-xs w-20 select-none whitespace-nowrap">
      <StoreDiscrepancyBadge :value="item.discrepancy" />
    </td>

    <!-- 299 Badge -->
    <td class="px-1 py-2 text-center w-16 select-none">
      <StoreStatusBadge v-if="item.is299" status="299" />
      <span v-else class="text-gray-600 text-xs">—</span>
    </td>

    <!-- Updated At (Дата изменения) -->
    <td class="px-1.5 py-2 text-center text-[11px] text-gray-500 font-mono whitespace-nowrap w-24 select-none" :title="formatDateTime(item.updatedAt)">
      {{ formatDateTime(item.updatedAt).slice(0, 16) }}
    </td>

    <!-- Actions -->
    <td v-if="!isReadOnly" class="px-1 py-2 text-center w-14 select-none">
      <div class="flex items-center justify-center gap-1">
        <button
          type="button"
          @click="emit('delete')"
          class="rounded p-0.5 text-gray-500 hover:bg-rose-500/10 hover:text-rose-400 transition-colors cursor-pointer text-xs"
          title="Удалить позицию"
        >
          🗑️
        </button>
      </div>
    </td>
  </tr>
</template>
