<script setup lang="ts">
import { CopyableSku } from '@shared'
import { formatDateTime } from '@shared/lib/formatDate'
import type { StoreMultiplicityItem } from '../../model/types'
import type { useStoreMultiplicityTab } from '../../model/useStoreMultiplicityTab'

const vFocus = {
  mounted: (el: HTMLElement) => el.focus(),
}

const props = defineProps<{
  item: StoreMultiplicityItem
  index: number
  tab: ReturnType<typeof useStoreMultiplicityTab>
}>()

const {
  store,
  isReadOnly,
  selectedIds,
  duplicateSkuSet,
  inlineEditing,
  getDisplayName,
  toggleSelectItem,
  startInlineEdit,
  cancelInlineEdit,
  saveInlineEdit,
  handleDeleteSingle,
} = props.tab
</script>

<template>
  <tr
    class="transition-colors border-b border-gray-800/30 select-none"
    :class="[
      selectedIds.has(item.id)
        ? 'bg-indigo-950/40 hover:bg-indigo-900/40'
        : 'hover:bg-gray-800/30',
    ]"
  >
    <!-- Checkbox -->
    <td v-if="!isReadOnly" class="px-2 py-2.5 text-center w-10 select-none">
      <input
        type="checkbox"
        :checked="selectedIds.has(item.id)"
        @change="toggleSelectItem(item.id)"
        :disabled="isReadOnly"
        class="h-4 w-4 rounded border-gray-700 bg-gray-900 text-indigo-600 focus:ring-indigo-500/50 cursor-pointer disabled:cursor-not-allowed pointer-events-none"
        tabindex="-1"
      />
    </td>

    <!-- Index -->
    <td class="px-2 py-2.5 text-center text-xs text-gray-500 font-mono w-14 select-none pointer-events-none">
      {{ index + 1 }}
    </td>

    <!-- SKU -->
    <td class="px-2.5 py-2.5 font-mono text-xs w-36 select-text">
      <div class="flex items-center gap-2">
        <CopyableSku :sku="item.sku" text-class="text-indigo-400 font-medium" />
        <span
          v-if="duplicateSkuSet.has(item.sku.trim().toLowerCase())"
          class="inline-flex items-center rounded bg-rose-500/15 px-1.5 py-0.5 text-[10px] font-bold text-rose-400 ring-1 ring-rose-500/30 select-none"
          title="Дублирующийся артикул"
        >
          Дубль
        </span>
        <span
          v-if="store.isNotFoundInCatalog(item.sku)"
          class="inline-flex items-center rounded bg-amber-500/15 px-1.5 py-0.5 text-[10px] font-bold text-amber-400 ring-1 ring-amber-500/30 select-none"
          title="Товар отсутствует в справочнике «Товары магазина»"
        >
          Н/Д
        </span>
      </div>
    </td>

    <!-- Product Name -->
    <td class="px-3 py-2.5 text-xs font-medium text-gray-200 truncate max-w-md select-none" :title="getDisplayName(item)">
      <span :class="store.isNotFoundInCatalog(item.sku) ? 'text-gray-500 italic' : 'text-gray-200'">
        {{ getDisplayName(item) }}
      </span>
    </td>

    <!-- Multiplicity (with inline edit on double click) -->
    <td class="px-2.5 py-2.5 text-right select-none">
      <div v-if="inlineEditing?.id === item.id" class="flex items-center justify-end">
        <input
          v-focus
          v-model.number="inlineEditing.multiplicity"
          type="number"
          min="1"
          step="1"
          @keydown.enter="saveInlineEdit(item)"
          @keydown.esc="cancelInlineEdit"
          @blur="saveInlineEdit(item)"
          class="w-20 rounded bg-gray-950 px-2 py-0.5 text-right text-xs font-mono font-bold text-indigo-300 ring-1 ring-indigo-500 focus:outline-none shadow-sm"
        />
      </div>
      <div
        v-else
        @dblclick="!isReadOnly && startInlineEdit(item)"
        class="inline-block text-right cursor-pointer hover:opacity-80 transition-opacity"
        title="Двойной клик для изменения кратности"
      >
        <span
          class="inline-flex items-center rounded px-2.5 py-0.5 text-xs font-mono font-bold"
          :class="item.multiplicity > 1 ? 'bg-indigo-500/20 text-indigo-300 ring-1 ring-indigo-500/30' : 'bg-gray-800/60 text-gray-300 ring-1 ring-gray-700/50'"
        >
          ×{{ item.multiplicity }}
        </span>
      </div>
    </td>

    <!-- Updated At -->
    <td class="px-2.5 py-2.5 text-center text-xs text-gray-500 font-mono whitespace-nowrap select-none">
      {{ formatDateTime(item.updatedAt) }}
    </td>

    <!-- Actions -->
    <td v-if="!isReadOnly" class="px-2 py-2.5 text-center w-20 select-none">
      <div class="flex items-center justify-center gap-1.5">
        <button
          type="button"
          @click="startInlineEdit(item)"
          class="rounded p-1 text-gray-400 hover:bg-indigo-500/10 hover:text-indigo-300 transition-colors cursor-pointer"
          title="Редактировать кратность"
        >
          ✎
        </button>
        <button
          type="button"
          @click="handleDeleteSingle(item)"
          class="rounded p-1 text-gray-500 hover:bg-rose-500/10 hover:text-rose-400 transition-colors cursor-pointer"
          title="Удалить позицию"
        >
          🗑️
        </button>
      </div>
    </td>
  </tr>
</template>
