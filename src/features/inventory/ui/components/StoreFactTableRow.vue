<script setup lang="ts">
import type { InventoryItem } from '../../model/types'
import type { useStoreFactTab } from '../../model/useStoreFactTab'
import StoreMultiplicityBadge from '@shared/ui/StoreMultiplicityBadge.vue'
import { formatDateTime } from '@shared/lib/formatDate'

const props = defineProps<{
  item: InventoryItem
  index: number
  tab: ReturnType<typeof useStoreFactTab>
}>()

const vFocus = {
  mounted: (el: HTMLElement) => el.focus(),
}

const {
  store,
  isReadOnly,
  selectedIds,
  onCheckboxCellMouseDown,
  onCheckboxCellMouseEnter,
  onCellMouseDown,
  onCellMouseEnter,
  isCellSelected,
  isCellSelectionBottom,
  getCellSelectionClasses,
  inlineEditing,
  startInlineEdit,
  saveInlineEdit,
  cancelInlineEdit,
  handleCopySkuSingle,
  handleCopyName,
  handleCopyLocation,
  copiedSkuId,
  copiedNameId,
  copiedLocationId,
  getItemTooltip,
  getSkuMentions,
  getFactDiscrepancy,
  batchOps,
  openEditModal,
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
    <!-- Checkbox -->
    <td
      v-if="!isReadOnly"
      class="px-1 py-2 text-center w-8 cursor-pointer select-none transition-colors"
      :class="selectedIds.has(item.id) ? 'bg-indigo-500/20' : 'hover:bg-gray-800/40'"
      @mousedown.prevent="onCheckboxCellMouseDown(item.id, index, $event)"
      @mouseenter="onCheckboxCellMouseEnter(index)"
      title="Зажмите и тяните для быстрого выделения строк (или Shift+клик)"
    >
      <input
        type="checkbox"
        :checked="selectedIds.has(item.id)"
        class="h-3.5 w-3.5 rounded border-gray-700 bg-gray-900 text-indigo-600 focus:ring-indigo-500/50 cursor-pointer pointer-events-none"
        tabindex="-1"
      />
    </td>

    <!-- Index -->
    <td
      class="px-1 py-2 text-center text-xs text-gray-500 font-mono w-9 cursor-pointer select-none hover:text-indigo-300 transition-colors pointer-events-auto"
      @mousedown="onCellMouseDown(index, 'row', item.id, $event)"
      @mouseenter="onCellMouseEnter(index, 'row')"
      title="Зажмите и тяните для выделения строк"
    >
      {{ index + 1 }}
    </td>

    <!-- SKU (ЛК) -->
    <td
      class="px-1.5 py-2 font-mono text-xs w-28 transition-colors select-text"
      :class="getCellSelectionClasses(index, 'sku')"
      @mousedown="onCellMouseDown(index, 'sku', item.id, $event)"
      @mouseenter="onCellMouseEnter(index, 'sku')"
      @dblclick="startInlineEdit(item, 'sku')"
    >
      <div
        v-if="!isReadOnly && inlineEditing?.id === item.id && inlineEditing?.field === 'sku'"
        class="flex items-center gap-0.5"
      >
        <input
          v-focus
          v-model="inlineEditing.value"
          type="text"
          inputmode="numeric"
          maxlength="7"
          @input="inlineEditing.value = String(inlineEditing.value).replace(/\D/g, '').slice(0, 7)"
          @keydown.enter="saveInlineEdit(item)"
          @keydown.esc="cancelInlineEdit"
          @blur="saveInlineEdit(item)"
          class="w-full rounded bg-gray-950 px-1 py-0.5 text-xs font-mono font-bold text-indigo-300 ring-1 ring-indigo-500 focus:outline-none shadow-sm"
        />
      </div>
      <div
        v-else
        class="flex items-center justify-between group cursor-pointer"
        :title="isReadOnly ? '' : 'Двойной клик или ✏️ — редактировать; зажмите мышь и тяните — выделить ЛК'"
      >
        <span
          class="font-medium truncate"
          :class="isCellSelected(index, 'sku') ? 'text-indigo-200 font-bold' : 'text-indigo-400 group-hover:text-indigo-300 group-hover:underline'"
        >
          {{ item.sku }}
        </span>
        <div class="flex items-center gap-0.5">
          <button
            type="button"
            @click.stop="handleCopySkuSingle(item.sku, item.id)"
            class="p-0.5 rounded text-gray-400 hover:text-indigo-300 hover:bg-gray-800 transition-all cursor-pointer"
            :class="copiedSkuId === item.id ? 'text-emerald-400 opacity-100' : 'opacity-0 group-hover:opacity-100'"
            :title="copiedSkuId === item.id ? 'Скопировано!' : 'Скопировать ЛК'"
          >
            <span v-if="copiedSkuId === item.id" class="text-emerald-400 text-xs font-bold">✓</span>
            <span v-else class="text-[10px]">📋</span>
          </button>
          <button
            v-if="!isReadOnly"
            type="button"
            @click.stop="startInlineEdit(item, 'sku')"
            class="p-0.5 rounded text-gray-400 hover:text-indigo-300 transition-all cursor-pointer opacity-0 group-hover:opacity-70 hover:!opacity-100 text-[10px]"
            title="Редактировать артикул"
          >
            ✏️
          </button>
        </div>
      </div>
      <!-- Excel fill handle square on bottom-right of selection -->
      <div
        v-if="isCellSelectionBottom(index, 'sku')"
        class="absolute -bottom-1 -right-1 w-2 h-2 bg-indigo-400 border border-gray-900 rounded-[1px] pointer-events-none z-10"
      />
    </td>

    <!-- Наименование -->
    <td
      class="px-2 py-2 text-xs font-medium text-gray-200 cursor-default min-w-[120px] group/name"
      :title="store.getFactItemName(item.sku, item.name)"
    >
      <div class="flex items-center justify-between gap-1">
        <span class="truncate">{{ store.getFactItemName(item.sku, item.name) }}</span>
        <button
          type="button"
          @click.stop="handleCopyName(store.getFactItemName(item.sku, item.name), item.id)"
          class="p-0.5 rounded text-gray-400 hover:text-indigo-300 hover:bg-gray-800 transition-all cursor-pointer shrink-0"
          :class="copiedNameId === item.id ? 'text-emerald-400 opacity-100' : 'opacity-0 group-hover/name:opacity-100'"
          :title="copiedNameId === item.id ? 'Скопировано!' : 'Скопировать наименование'"
        >
          <span v-if="copiedNameId === item.id" class="text-emerald-400 text-xs font-bold">✓</span>
          <span v-else class="text-[10px]">📋</span>
        </button>
      </div>
    </td>

    <!-- Упоминаний -->
    <td
      class="px-1 py-2 text-center tabular-nums text-xs font-mono font-medium cursor-help w-16"
      :title="getItemTooltip(item)"
    >
      <span
        v-if="getSkuMentions(item.sku) > 1"
        class="inline-flex items-center justify-center min-w-[20px] rounded-full bg-rose-500/20 px-1.5 py-0.5 text-xs font-bold text-rose-300 ring-1 ring-rose-500/40"
      >
        {{ getSkuMentions(item.sku) }}
      </span>
      <span
        v-else
        class="text-gray-400"
      >
        {{ getSkuMentions(item.sku) || 1 }}
      </span>
    </td>

    <!-- Локация -->
    <td
      class="px-1.5 py-2 font-mono text-xs w-24 transition-colors"
      :class="getCellSelectionClasses(index, 'location')"
      @mousedown="onCellMouseDown(index, 'location', item.id, $event)"
      @mouseenter="onCellMouseEnter(index, 'location')"
      @dblclick="startInlineEdit(item, 'location')"
    >
      <div
        v-if="!isReadOnly && inlineEditing?.id === item.id && inlineEditing?.field === 'location'"
        class="flex items-center"
      >
        <input
          v-focus
          v-model="inlineEditing.value"
          type="text"
          placeholder="Локация…"
          @keydown.enter="saveInlineEdit(item)"
          @keydown.esc="cancelInlineEdit"
          @blur="saveInlineEdit(item)"
          class="w-full rounded bg-gray-950 px-1.5 py-0.5 text-xs text-indigo-200 ring-1 ring-indigo-500 focus:outline-none shadow-sm"
        />
      </div>
      <div
        v-else
        class="flex items-center justify-between group cursor-pointer text-gray-300 py-0.5"
        :title="isReadOnly ? '' : 'Двойной клик или ✏️ — редактировать; зажмите мышь и тяните — выделить ячейки'"
      >
        <span class="truncate" :class="item.location ? (isCellSelected(index, 'location') ? 'text-indigo-200 font-semibold' : 'text-gray-200') : 'text-gray-600 italic'">
          {{ item.location || '—' }}
        </span>
        <div class="flex items-center gap-0.5">
          <button
            v-if="item.location"
            type="button"
            @click.stop="handleCopyLocation(item.location, item.id)"
            class="p-0.5 rounded text-gray-400 hover:text-indigo-300 hover:bg-gray-800 transition-all cursor-pointer"
            :class="copiedLocationId === item.id ? 'text-emerald-400 opacity-100' : 'opacity-0 group-hover:opacity-100'"
            :title="copiedLocationId === item.id ? 'Скопировано!' : 'Скопировать локацию'"
          >
            <span v-if="copiedLocationId === item.id" class="text-emerald-400 text-xs font-bold">✓</span>
            <span v-else class="text-[10px]">📋</span>
          </button>
          <button
            v-if="!isReadOnly"
            type="button"
            @click.stop="startInlineEdit(item, 'location')"
            class="p-0.5 rounded text-gray-400 hover:text-indigo-300 transition-all cursor-pointer opacity-0 group-hover:opacity-70 hover:!opacity-100 text-[10px]"
            title="Редактировать локацию"
          >
            ✏️
          </button>
        </div>
      </div>
      <!-- Excel fill handle square on bottom-right of selection -->
      <div
        v-if="isCellSelectionBottom(index, 'location')"
        class="absolute -bottom-1 -right-1 w-2 h-2 bg-indigo-400 border border-gray-900 rounded-[1px] pointer-events-none z-10"
      />
    </td>

    <!-- Количество -->
    <td
      class="px-1.5 py-2 font-mono text-xs w-20 text-right transition-colors"
      :class="getCellSelectionClasses(index, 'quantity')"
      @mousedown="onCellMouseDown(index, 'quantity', item.id, $event)"
      @mouseenter="onCellMouseEnter(index, 'quantity')"
      @dblclick="startInlineEdit(item, 'quantity')"
    >
      <div
        v-if="!isReadOnly && inlineEditing?.id === item.id && inlineEditing?.field === 'quantity'"
        class="flex items-center justify-end"
      >
        <input
          v-focus
          v-model.number="inlineEditing.value"
          type="number"
          min="0"
          step="any"
          @keydown.enter="saveInlineEdit(item)"
          @keydown.esc="cancelInlineEdit"
          @blur="saveInlineEdit(item)"
          class="w-16 rounded bg-gray-950 px-1 py-0.5 text-right text-xs font-mono font-bold text-gray-100 ring-1 ring-indigo-500 focus:outline-none shadow-sm"
        />
      </div>
      <div
        v-else
        class="flex items-center justify-end gap-0.5 group cursor-pointer py-0.5 whitespace-nowrap"
        :title="isReadOnly ? '' : 'Двойной клик или ✏️ — редактировать; зажмите мышь и тяните — выделить ячейки'"
      >
        <span class="font-semibold tabular-nums whitespace-nowrap" :class="isCellSelected(index, 'quantity') ? 'text-indigo-200' : 'text-gray-100'">
          {{ item.quantity }} {{ item.unit }}
        </span>
        <button
          v-if="!isReadOnly"
          type="button"
          @click.stop="startInlineEdit(item, 'quantity')"
          class="p-0.5 rounded text-gray-400 hover:text-indigo-300 transition-all cursor-pointer opacity-0 group-hover:opacity-70 hover:!opacity-100 text-[10px]"
          title="Редактировать количество"
        >
          ✏️
        </button>
      </div>
      <!-- Excel fill handle square on bottom-right of selection -->
      <div
        v-if="isCellSelectionBottom(index, 'quantity')"
        class="absolute -bottom-1 -right-1 w-2 h-2 bg-indigo-400 border border-gray-900 rounded-[1px] pointer-events-none z-10"
      />
    </td>

    <!-- Box Number -->
    <td
      class="px-1.5 py-2 text-center font-mono text-xs w-20 transition-colors relative"
      :class="getCellSelectionClasses(index, 'boxNumber')"
      @mousedown="onCellMouseDown(index, 'boxNumber', item.id, $event)"
      @mouseenter="onCellMouseEnter(index, 'boxNumber')"
      @dblclick="startInlineEdit(item, 'boxNumber')"
    >
      <div
        v-if="!isReadOnly && inlineEditing?.id === item.id && inlineEditing?.field === 'boxNumber'"
        class="flex items-center"
      >
        <input
          v-focus
          v-model="inlineEditing.value"
          type="text"
          placeholder="№ кор.…"
          @keydown.enter="saveInlineEdit(item)"
          @keydown.esc="cancelInlineEdit"
          @blur="saveInlineEdit(item)"
          class="w-full rounded bg-gray-950 px-1 py-0.5 text-xs text-center font-mono font-bold text-indigo-300 ring-1 ring-indigo-500 focus:outline-none shadow-sm"
        />
      </div>
      <div
        v-else
        class="flex items-center justify-between group cursor-pointer text-gray-300 py-0.5"
        :title="isReadOnly ? '' : 'Двойной клик или ✏️ — редактировать; зажмите мышь и тяните — выделить ячейки'"
      >
        <span class="w-full text-center tabular-nums truncate" :class="item.boxNumber ? (isCellSelected(index, 'boxNumber') ? 'text-indigo-200 font-semibold' : 'text-gray-200') : 'text-gray-600 italic'">
          {{ item.boxNumber || '—' }}
        </span>
        <button
          v-if="!isReadOnly"
          type="button"
          @click.stop="startInlineEdit(item, 'boxNumber')"
          class="p-0.5 rounded text-gray-400 hover:text-indigo-300 transition-all cursor-pointer opacity-0 group-hover:opacity-70 hover:!opacity-100 shrink-0 text-[10px]"
          title="Редактировать номер коробки"
        >
          ✏️
        </button>
      </div>
      <!-- Excel fill handle square on bottom-right of selection -->
      <div
        v-if="isCellSelectionBottom(index, 'boxNumber')"
        class="absolute -bottom-1 -right-1 w-2 h-2 bg-indigo-400 border border-gray-900 rounded-[1px] pointer-events-none z-10"
      />
    </td>

    <!-- Multiplicity -->
    <td class="px-1 py-2 text-center font-mono text-xs w-16 whitespace-nowrap">
      <StoreMultiplicityBadge :value="store.getMultiplicityValue(item.sku)" />
    </td>

    <!-- Audit System Qty -->
    <td class="px-1.5 py-2 text-right tabular-nums font-mono text-xs w-20 whitespace-nowrap">
      <span
        v-if="store.getStockItemQuantity(item.sku) !== null"
        class="font-semibold text-indigo-300 bg-indigo-500/15 px-1.5 py-0.5 rounded text-[11px]"
        :title="`Системный остаток: ${store.getStockItemQuantity(item.sku)} шт.`"
      >
        {{ store.getStockItemQuantity(item.sku) }}
      </span>
      <span v-else class="text-gray-600 font-mono" title="Товар отсутствует во вкладке остатков (аудит)">
        —
      </span>
    </td>

    <!-- Discrepancy Result Badge -->
    <td class="px-1 py-2 text-center w-20">
      <span
        v-if="getFactDiscrepancy(item).type === 'ok'"
        class="inline-flex items-center rounded-md bg-emerald-500/15 px-1.5 py-0.5 text-[11px] font-bold text-emerald-400 ring-1 ring-emerald-500/30"
        :title="getSkuMentions(item.sku) > 1 ? `Итого по всем местам (${getSkuMentions(item.sku)}): количество совпадает` : 'Количество совпадает с остатком'"
      >
        ОК
      </span>
      <span
        v-else-if="getFactDiscrepancy(item).type === 'surplus'"
        class="inline-flex items-center rounded-md bg-amber-500/15 px-1.5 py-0.5 text-[11px] font-bold text-amber-400 ring-1 ring-amber-500/30 font-mono"
        :title="`Излишек: +${getFactDiscrepancy(item).text}`"
      >
        {{ getFactDiscrepancy(item).text }}
      </span>
      <span
        v-else
        class="inline-flex items-center rounded-md bg-rose-500/15 px-1.5 py-0.5 text-[11px] font-bold text-rose-400 ring-1 ring-rose-500/30 font-mono"
        :title="`Недостача: ${getFactDiscrepancy(item).text}`"
      >
        {{ getFactDiscrepancy(item).text }}
      </span>
    </td>

    <!-- Дата изм. -->
    <td class="px-1.5 py-2 text-center text-[11px] text-gray-500 font-mono whitespace-nowrap w-24" :title="formatDateTime(item.updatedAt)">
      {{ formatDateTime(item.updatedAt).slice(0, 16) }}
    </td>

    <!-- Actions -->
    <td v-if="!isReadOnly" class="px-1 py-2 text-center w-14">
      <div class="flex items-center justify-center gap-1">
        <button
          type="button"
          @click="openEditModal(item)"
          class="rounded p-0.5 text-gray-400 hover:bg-indigo-500/10 hover:text-indigo-300 transition-colors cursor-pointer text-xs"
          title="Редактировать позицию"
        >
          ✎
        </button>
        <button
          type="button"
          @click="batchOps.handleDeleteRow(item.id)"
          class="rounded p-0.5 text-gray-500 hover:bg-rose-500/10 hover:text-rose-400 transition-colors cursor-pointer text-xs"
          title="Удалить позицию"
        >
          🗑️
        </button>
      </div>
    </td>
  </tr>
</template>
