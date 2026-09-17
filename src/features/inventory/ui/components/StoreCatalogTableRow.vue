<script setup lang="ts">
import { CopyableSku, CopyableBarcode } from '@shared'
import { formatDateTime } from '@shared/lib/formatDate'
import type { StoreCatalogItem } from '../../model/types'
import type { useStoreCatalogTab } from '../../model/useStoreCatalogTab'

const props = defineProps<{
  item: StoreCatalogItem
  index: number
  tab: ReturnType<typeof useStoreCatalogTab>
}>()

const {
  isReadOnly,
  selectedIds,
  duplicateSkuSet,
  toggleSelectItem,
  openEditModal,
  handleDeleteItem,
} = props.tab
</script>

<template>
  <tr
    class="transition-colors select-none"
    :class="[
      selectedIds.has(item.id)
        ? 'bg-indigo-950/40 hover:bg-indigo-900/40'
        : 'hover:bg-gray-800/30',
    ]"
  >
    <td v-if="!isReadOnly" class="px-2 py-2.5 text-center w-10 select-none">
      <input
        type="checkbox"
        :checked="selectedIds.has(item.id)"
        @change="toggleSelectItem(item.id)"
        class="h-4 w-4 rounded border-gray-700 bg-gray-900 text-indigo-600 focus:ring-indigo-500/50 cursor-pointer pointer-events-none"
        tabindex="-1"
      />
    </td>
    <td class="px-2 py-2.5 text-center text-xs text-gray-500 font-mono w-14 select-none pointer-events-none">{{ index + 1 }}</td>
    <td class="px-2.5 py-2.5 font-mono text-xs w-36 select-text">
      <div class="flex items-center gap-2">
        <CopyableSku :sku="item.sku" text-class="text-indigo-400 font-medium" />
        <span
          v-if="duplicateSkuSet.has(item.sku.trim().toLowerCase())"
          class="inline-flex items-center rounded-md bg-rose-500/15 px-1.5 py-0.5 text-[10px] font-bold text-rose-400 ring-1 ring-rose-500/30 select-none"
          title="Позиция с повторяющимся артикулом"
        >
          Дубль
        </span>
      </div>
    </td>
    <td class="px-3 py-2.5 text-xs font-medium text-gray-200 select-none">{{ item.name }}</td>
    <td class="px-2.5 py-2.5 text-xs font-mono text-gray-400 whitespace-nowrap select-none">
      <CopyableBarcode :barcode="item.barcode" />
    </td>
    <td class="px-2.5 py-2.5 text-center text-xs text-gray-500 font-mono whitespace-nowrap select-none">
      {{ formatDateTime(item.updatedAt) }}
    </td>
    <td v-if="!isReadOnly" class="px-2 py-2.5 text-center w-20 select-none">
      <div class="flex items-center justify-center gap-1.5">
        <button
          type="button"
          @click="openEditModal(item)"
          class="rounded p-1 text-gray-400 hover:bg-indigo-500/10 hover:text-indigo-300 transition-colors cursor-pointer"
          title="Редактировать товар (изменить наименование)"
        >
          ✎
        </button>
        <button
          type="button"
          @click="handleDeleteItem(item.id)"
          class="rounded p-1 text-gray-500 hover:bg-rose-500/10 hover:text-rose-400 transition-colors cursor-pointer"
          title="Удалить позицию"
        >
          🗑️
        </button>
      </div>
    </td>
  </tr>
</template>
