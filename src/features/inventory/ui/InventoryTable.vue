<script setup lang="ts">
import { ref, watch, computed, nextTick } from 'vue'
import { useInventoryStore } from '../model/useInventoryStore'
import { parseFactClipboard } from '@shared/lib/clipboardParser'
import { useTableSort } from '@shared/lib/useTableSort'
import { copySkusToClipboard, ExcelColumnFilter, useExcelColumnFilter } from '@shared'
import type { InventoryItem, InventoryItemStatus } from '../model/types'

const store = useInventoryStore()

const props = defineProps<{
  items: InventoryItem[]
  isLoading: boolean
  isReadOnly?: boolean
}>()

type FactSortKey = 'sku' | 'name' | 'quantity' | 'location' | 'status'

const {
  columnFilters,
  getDistinctValues,
  setColumnFilter,
  clearAllColumnFilters,
  activeFilterCount: excelFilterCount,
  filteredItems: excelFilteredItems,
} = useExcelColumnFilter<InventoryItem>(
  () => props.items,
  {
    name: (item) => store.getFactItemName(item.sku, item.name),
    quantity: (item) => `${item.quantity} ${item.unit || 'шт.'}`,
    location: (item) => item.location || '',
    status: (item) => (store.isAccount299Item(item.sku) ? 'Счет 299' : (store.isNotFoundInCatalog(item.sku) ? 'Н/Д' : 'В каталоге')),
  }
)

const { sortKey, sortDirection, toggleSort, resetSort, sortedItems } = useTableSort<InventoryItem, FactSortKey>(
  excelFilteredItems,
  null,
  null,
  {
    name: (item) => store.getFactItemName(item.sku, item.name),
    status: (item) => (store.isAccount299Item(item.sku) ? 1 : 0),
  }
)

const emit = defineEmits<{
  edit: [item: InventoryItem]
  delete: [id: string]
  'delete-selected': [ids: string[]]
  add: [item: {
    sku: string
    name: string
    quantity: number
    unit: string
    location: string
    status?: InventoryItemStatus
  }]
}>()

const skuInputRef = ref<HTMLInputElement | null>(null)
const pasteNotification = ref<string | null>(null)
const isPasting = ref(false)
const pastingCount = ref(0)
let pasteNotifTimeout: any = null

function showPasteNotif(msg: string) {
  pasteNotification.value = msg
  if (pasteNotifTimeout) clearTimeout(pasteNotifTimeout)
  pasteNotifTimeout = setTimeout(() => {
    pasteNotification.value = null
  }, 3500)
}

function getCatalogMap() {
  return store.catalogSkuMap
}

async function handlePaste(e: ClipboardEvent, field: 'sku' | 'name' | 'quantity' | 'location') {
  if (props.isReadOnly || store.activeRevision?.isArchived) return
  const text = e.clipboardData?.getData('text')
  if (!text) return

  const catalogMap = getCatalogMap()
  const rows = parseFactClipboard(text, field, catalogMap)
  if (rows.length === 0) return

  if (rows.length === 1) {
    e.preventDefault()
    if (field === 'sku') {
      newRow.value.sku = rows[0].sku
      if (rows[0].name) newRow.value.name = rows[0].name
    } else if (field === 'name') {
      newRow.value.name = rows[0].name
    } else if (field === 'quantity') {
      newRow.value.quantity = rows[0].quantity
    } else if (field === 'location') {
      newRow.value.location = rows[0].location
    }
    if (rows[0].quantity && field !== 'quantity' && !newRow.value.quantity) newRow.value.quantity = rows[0].quantity
    if (rows[0].location && field !== 'location' && !newRow.value.location) newRow.value.location = rows[0].location
    showPasteNotif('Значение вставлено из буфера обмена')
  } else if (rows.length > 1) {
    const hasValidItems = rows.some((r) => r.sku || r.name)
    if (!hasValidItems && field === 'quantity') {
      e.preventDefault()
      newRow.value.quantity = rows[0].quantity
      showPasteNotif('Для пакетной вставки скопируйте 2 столбца: Артикул и Количество')
      return
    }
    e.preventDefault()
    store.error = null
    isPasting.value = true
    pastingCount.value = rows.length
    await nextTick()
    await new Promise((r) => setTimeout(r, 60))

    try {
      await store.addItemsBatch(rows.filter((r) => r.sku || r.name))
      await nextTick()
      await new Promise((r) => setTimeout(r, 200))
      showPasteNotif(`Успешно вставлено ${rows.length} позиций`)
    } catch (err) {
      console.error('Ошибка вставки из буфера:', err)
    } finally {
      isPasting.value = false
    }
  }
}

const newRow = ref({
  sku: '',
  name: '',
  quantity: 0,
  unit: 'шт.',
  location: '',
  status: 'ok' as InventoryItemStatus,
})

// Auto-fill name when SKU matches catalog item
watch(
  () => newRow.value.sku,
  (val) => {
    const cleaned = val.replace(/\D/g, '').slice(0, 7)
    if (cleaned.length >= 3) {
      const name = store.catalogSkuMap.get(cleaned)
      if (name) {
        newRow.value.name = name
      }
    }
  }
)

function handleNameInput() {
  const trimmedName = newRow.value.name.trim().toLowerCase()
  if (trimmedName && !newRow.value.sku) {
    const sku = store.catalogNameMap.get(trimmedName)
    if (sku) {
      newRow.value.sku = sku
    }
  }
}

function generateRandomSku() {
  if (store.catalogItems.length > 0) {
    const randomItem = store.catalogItems[Math.floor(Math.random() * store.catalogItems.length)]
    newRow.value.sku = randomItem.sku
    newRow.value.name = randomItem.name
  } else {
    newRow.value.sku = String(Math.floor(1000000 + Math.random() * 9000000))
  }
}

async function handleAddRow() {
  if (props.isReadOnly || store.activeRevision?.isArchived) return
  if (!newRow.value.sku.trim()) {
    generateRandomSku()
  }
  if (!newRow.value.name.trim()) return

  const cleanedSku = newRow.value.sku.replace(/\D/g, '').slice(0, 7)
  if (cleanedSku.length !== 7) return

  emit('add', {
    sku: cleanedSku,
    name: newRow.value.name.trim(),
    quantity: Number(newRow.value.quantity) || 0,
    unit: newRow.value.unit.trim() || 'шт.',
    location: newRow.value.location.trim(),
    status: newRow.value.status || 'ok',
  })

  newRow.value = {
    sku: '',
    name: '',
    quantity: 0,
    unit: 'шт.',
    location: '',
    status: 'ok',
  }

  skuInputRef.value?.focus()
}

/* --- SELECTION STATE --- */
const selectedIds = ref<Set<string>>(new Set())

const isAllSelected = computed(() => {
  if (sortedItems.value.length === 0) return false
  return sortedItems.value.every((item) => selectedIds.value.has(item.id))
})

const isPartiallySelected = computed(() => {
  if (sortedItems.value.length === 0) return false
  const count = sortedItems.value.filter((item) => selectedIds.value.has(item.id)).length
  return count > 0 && count < sortedItems.value.length
})

function toggleSelectAll() {
  if (isAllSelected.value) {
    const newSet = new Set(selectedIds.value)
    for (const item of sortedItems.value) {
      newSet.delete(item.id)
    }
    selectedIds.value = newSet
  } else {
    const newSet = new Set(selectedIds.value)
    for (const item of sortedItems.value) {
      newSet.add(item.id)
    }
    selectedIds.value = newSet
  }
}

function toggleSelectItem(id: string) {
  const newSet = new Set(selectedIds.value)
  if (newSet.has(id)) {
    newSet.delete(id)
  } else {
    newSet.add(id)
  }
  selectedIds.value = newSet
}

function clearSelection() {
  selectedIds.value = new Set()
}

watch(
  () => props.items,
  (newItems) => {
    if (selectedIds.value.size === 0) return
    if (!newItems || newItems.length === 0) {
      selectedIds.value = new Set()
      return
    }
    const currentIdSet = new Set(newItems.map((i) => i.id))
    let changed = false
    const updated = new Set<string>()
    for (const id of selectedIds.value) {
      if (currentIdSet.has(id)) {
        updated.add(id)
      } else {
        changed = true
      }
    }
    if (changed) {
      selectedIds.value = updated
    }
  }
)

async function handleCopySelected() {
  if (selectedIds.value.size === 0) return
  const idSet = selectedIds.value
  const skus = props.items.filter((i) => idSet.has(i.id)).map((i) => i.sku)
  await copySkusToClipboard(skus, { label: 'Ревизия: ЛК' })
  showPasteNotif(`Скопировано ${skus.length} ЛК в буфер обмена`)
}

function handleDeleteSelected() {
  if (selectedIds.value.size === 0) return
  emit('delete-selected', Array.from(selectedIds.value))
}

defineExpose({
  clearSelection,
})
</script>

<template>
  <div class="relative space-y-3">
    <!-- Floating Bulk Selection Bar -->
    <transition
      enter-active-class="transition duration-200 ease-out"
      enter-from-class="transform -translate-y-2 opacity-0 scale-95"
      enter-to-class="transform translate-y-0 opacity-100 scale-100"
      leave-active-class="transition duration-150 ease-in"
      leave-from-class="transform translate-y-0 opacity-100 scale-100"
      leave-to-class="transform -translate-y-2 opacity-0 scale-95"
    >
      <div
        v-if="!isReadOnly && selectedIds.size > 0"
        class="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-indigo-950/90 px-4 py-2.5 ring-1 ring-indigo-500/40 shadow-xl backdrop-blur-md"
      >
        <div class="flex items-center gap-2.5">
          <span class="flex h-6 w-6 items-center justify-center rounded-md bg-indigo-500/30 text-xs font-bold text-indigo-300">
            ✓
          </span>
          <span class="text-xs font-medium text-indigo-100">
            Выбрано позиций: <strong class="font-bold text-white">{{ selectedIds.size }}</strong> из {{ store.totalCount }}
          </span>
        </div>

        <div class="flex items-center gap-2">
          <button
            type="button"
            @click="handleCopySelected"
            class="flex items-center gap-1.5 rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-semibold text-white shadow-md hover:bg-indigo-500 transition-colors cursor-pointer"
            title="Скопировать артикулы выбранных позиций в буфер обмена"
          >
            <span>📋</span>
            <span>Скопировать ЛК ({{ selectedIds.size }})</span>
          </button>

          <button
            type="button"
            @click="handleDeleteSelected"
            class="flex items-center gap-1.5 rounded-lg bg-red-600 px-3 py-1.5 text-xs font-semibold text-white shadow-md hover:bg-red-500 transition-colors cursor-pointer"
          >
            <span>🗑️</span>
            <span>Удалить выбранные ({{ selectedIds.size }})</span>
          </button>

          <button
            type="button"
            @click="clearSelection"
            class="rounded-lg bg-gray-800/80 px-2.5 py-1.5 text-xs font-medium text-gray-300 hover:bg-gray-700 hover:text-white transition-colors cursor-pointer"
          >
            Снять выбор
          </button>
        </div>
      </div>
    </transition>

    <!-- Paste Notification Banner -->
    <transition
      enter-active-class="transition duration-200 ease-out"
      enter-from-class="transform -translate-y-2 opacity-0"
      enter-to-class="transform translate-y-0 opacity-100"
      leave-active-class="transition duration-150 ease-in"
      leave-from-class="transform translate-y-0 opacity-100"
      leave-to-class="transform -translate-y-2 opacity-0"
    >
      <div
        v-if="pasteNotification"
        class="mb-2 flex items-center gap-2 rounded-lg bg-emerald-500/90 px-3 py-1.5 text-xs font-semibold text-white shadow-xl backdrop-blur-xs"
      >
        <span>📋</span>
        <span>{{ pasteNotification }}</span>
      </div>
    </transition>

    <!-- Pasting Progress Overlay Animation -->
    <transition
      enter-active-class="transition duration-200 ease-out"
      enter-from-class="opacity-0 scale-95"
      enter-to-class="opacity-100 scale-100"
      leave-active-class="transition duration-200 ease-in"
      leave-from-class="opacity-100 scale-100"
      leave-to-class="opacity-0 scale-95"
    >
      <div
        v-if="isPasting"
        class="fixed inset-0 z-50 flex flex-col items-center justify-center bg-gray-950/80 backdrop-blur-xs"
      >
        <div class="flex flex-col items-center gap-3 p-6 rounded-2xl bg-gray-900 ring-1 ring-indigo-500/30 shadow-2xl shadow-indigo-500/20 max-w-xs text-center">
          <div class="relative flex h-14 w-14 items-center justify-center">
            <div class="absolute h-full w-full rounded-full border-2 border-indigo-500/20 border-t-indigo-500 animate-spin"></div>
            <span class="text-2xl animate-bounce">📥</span>
          </div>
          <div>
            <p class="text-sm font-semibold text-gray-100">Вставка из буфера обмена</p>
            <p class="text-xs text-indigo-400 font-mono mt-1">Обработка и загрузка {{ pastingCount }} поз.</p>
            <p class="text-[11px] text-gray-400 mt-1">Пожалуйста, подождите, данные сохраняются и отображаются в таблице...</p>
          </div>
          <div class="w-48 h-1.5 bg-gray-800 rounded-full overflow-hidden mt-1">
            <div class="h-full bg-gradient-to-r from-indigo-500 to-purple-500 rounded-full animate-pulse w-full"></div>
          </div>
        </div>
      </div>
    </transition>

    <!-- Virtualized Table -->
    <VirtualTable :items="sortedItems" :row-height="44" table-height="calc(70vh - 88px)">
      <template #header>
        <tr class="border-b border-gray-800/60 bg-gray-900/90 text-xs uppercase tracking-wider text-gray-500">
          <th v-if="!isReadOnly" class="px-3 py-3 w-10 text-center select-none">
            <input
              type="checkbox"
              :checked="isAllSelected"
              :indeterminate.prop="isPartiallySelected"
              @change="toggleSelectAll"
              class="h-4 w-4 rounded border-gray-700 bg-gray-900 text-indigo-600 focus:ring-indigo-500/50 cursor-pointer"
              title="Выбрать все видимые позиции"
            />
          </th>
          <th class="px-3 py-3 font-medium w-12 text-center select-none">№</th>
          <th
            class="px-4 py-3 font-medium w-48 select-none transition-colors hover:bg-gray-800/40"
            :class="{ 'text-indigo-400 font-semibold bg-gray-800/20': sortKey === 'sku' }"
          >
            <div class="flex items-center justify-between gap-1.5">
              <div
                @click="toggleSort('sku')"
                class="flex items-center gap-1.5 cursor-pointer flex-1"
                title="Нажмите для сортировки по артикулу"
              >
                <span>Артикул</span>
                <span class="text-xs transition-opacity" :class="sortKey === 'sku' ? 'text-indigo-400 opacity-100 font-bold' : 'opacity-30 hover:opacity-80'">
                  <template v-if="sortKey === 'sku'">
                    {{ sortDirection === 'asc' ? '▲' : '▼' }}
                  </template>
                  <template v-else>↕</template>
                </span>
              </div>
              <ExcelColumnFilter
                title="Артикул"
                :distinct-values="getDistinctValues('sku')"
                :model-value="columnFilters['sku'] || null"
                @update:model-value="setColumnFilter('sku', $event)"
              />
            </div>
          </th>
          <th
            class="px-4 py-3 font-medium select-none transition-colors hover:bg-gray-800/40"
            :class="{ 'text-indigo-400 font-semibold bg-gray-800/20': sortKey === 'name' }"
          >
            <div class="flex items-center justify-between gap-1.5">
              <div
                @click="toggleSort('name')"
                class="flex items-center gap-1.5 cursor-pointer flex-1"
                title="Нажмите для сортировки по наименованию"
              >
                <span>Наименование</span>
                <span class="text-xs transition-opacity" :class="sortKey === 'name' ? 'text-indigo-400 opacity-100 font-bold' : 'opacity-30 hover:opacity-80'">
                  <template v-if="sortKey === 'name'">
                    {{ sortDirection === 'asc' ? '▲' : '▼' }}
                  </template>
                  <template v-else>↕</template>
                </span>
              </div>
              <ExcelColumnFilter
                title="Наименование"
                :distinct-values="getDistinctValues('name')"
                :model-value="columnFilters['name'] || null"
                @update:model-value="setColumnFilter('name', $event)"
              />
            </div>
          </th>
          <th
            class="px-4 py-3 font-medium text-right w-40 select-none transition-colors hover:bg-gray-800/40"
            :class="{ 'text-indigo-400 font-semibold bg-gray-800/20': sortKey === 'quantity' }"
          >
            <div class="flex items-center justify-end gap-1.5">
              <ExcelColumnFilter
                title="Количество"
                :distinct-values="getDistinctValues('quantity')"
                :model-value="columnFilters['quantity'] || null"
                align="right"
                @update:model-value="setColumnFilter('quantity', $event)"
              />
              <div
                @click="toggleSort('quantity')"
                class="flex items-center gap-1.5 cursor-pointer"
                title="Нажмите для сортировки по количеству"
              >
                <span>Кол-во</span>
                <span class="text-xs transition-opacity" :class="sortKey === 'quantity' ? 'text-indigo-400 opacity-100 font-bold' : 'opacity-30 hover:opacity-80'">
                  <template v-if="sortKey === 'quantity'">
                    {{ sortDirection === 'asc' ? '▲' : '▼' }}
                  </template>
                  <template v-else>↕</template>
                </span>
              </div>
            </div>
          </th>
          <th
            class="px-4 py-3 font-medium w-48 select-none transition-colors hover:bg-gray-800/40"
            :class="{ 'text-indigo-400 font-semibold bg-gray-800/20': sortKey === 'location' }"
          >
            <div class="flex items-center justify-between gap-1.5">
              <div
                @click="toggleSort('location')"
                class="flex items-center gap-1.5 cursor-pointer flex-1"
                title="Нажмите для сортировки по локации"
              >
                <span>Локация</span>
                <span class="text-xs transition-opacity" :class="sortKey === 'location' ? 'text-indigo-400 opacity-100 font-bold' : 'opacity-30 hover:opacity-80'">
                  <template v-if="sortKey === 'location'">
                    {{ sortDirection === 'asc' ? '▲' : '▼' }}
                  </template>
                  <template v-else>↕</template>
                </span>
              </div>
              <ExcelColumnFilter
                title="Локация"
                :distinct-values="getDistinctValues('location')"
                :model-value="columnFilters['location'] || null"
                @update:model-value="setColumnFilter('location', $event)"
              />
            </div>
          </th>
          <th
            class="px-4 py-3 font-medium text-center w-36 select-none transition-colors hover:bg-gray-800/40"
            :class="{ 'text-indigo-400 font-semibold bg-gray-800/20': sortKey === 'status' }"
          >
            <div class="flex items-center justify-center gap-1.5">
              <div
                @click="toggleSort('status')"
                class="flex items-center gap-1.5 cursor-pointer"
                title="Нажмите для сортировки по статусу"
              >
                <span>Статус</span>
                <span class="text-xs transition-opacity" :class="sortKey === 'status' ? 'text-indigo-400 opacity-100 font-bold' : 'opacity-30 hover:opacity-80'">
                  <template v-if="sortKey === 'status'">
                    {{ sortDirection === 'asc' ? '▲' : '▼' }}
                  </template>
                  <template v-else>↕</template>
                </span>
              </div>
              <ExcelColumnFilter
                title="Статус"
                :distinct-values="getDistinctValues('status')"
                :model-value="columnFilters['status'] || null"
                @update:model-value="setColumnFilter('status', $event)"
              />
            </div>
          </th>
          <th v-if="!isReadOnly" class="px-4 py-3 font-medium text-center w-28 select-none">Действия</th>
        </tr>
      </template>

      <template #empty>
        <!-- Loading skeleton -->
        <template v-if="isLoading">
          <tr v-for="n in 5" :key="n" class="animate-pulse">
            <td v-for="c in (isReadOnly ? 6 : 8)" :key="c" class="px-4 py-3">
              <div class="h-4 w-3/4 rounded bg-gray-800/60" />
            </td>
          </tr>
        </template>
        <template v-else>
          <tr>
            <td :colspan="isReadOnly ? 6 : 8" class="px-4 py-8 text-center text-xs text-gray-500">
              <div class="text-2xl mb-1">📭</div>
              <span>{{ store.totalCount === 0 ? 'Фактическая ревизия еще не заполнена.' : 'Ничего не найдено по запросу.' }}</span>
            </td>
          </tr>
        </template>
      </template>

      <template #row="{ item, index }">
        <tr
          class="transition-colors"
          :class="[
            selectedIds.has(item.id)
              ? 'bg-indigo-950/40 hover:bg-indigo-900/40'
              : 'hover:bg-gray-800/30',
          ]"
        >
          <td v-if="!isReadOnly" class="px-3 py-3 text-center">
            <input
              type="checkbox"
              :checked="selectedIds.has(item.id)"
              @change="toggleSelectItem(item.id)"
              class="h-4 w-4 rounded border-gray-700 bg-gray-900 text-indigo-600 focus:ring-indigo-500/50 cursor-pointer"
            />
          </td>
          <td class="px-3 py-3 text-center text-xs text-gray-500 font-mono">{{ index + 1 }}</td>
          <td class="px-4 py-3 font-mono text-xs">
            <div class="flex items-center gap-2">
              <CopyableSku :sku="item.sku" text-class="text-indigo-400 font-medium" />
              <span
                v-if="store.duplicateFactSkuSet.has(item.sku.trim().toLowerCase())"
                class="inline-flex items-center rounded-md bg-rose-500/15 px-1.5 py-0.5 text-[10px] font-bold text-rose-400 ring-1 ring-rose-500/30"
                title="Позиция с повторяющимся артикулом"
              >
                Дубль
              </span>
              <span
                v-if="store.isNotFoundInCatalog(item.sku)"
                class="inline-flex items-center rounded-md bg-amber-500/15 px-1.5 py-0.5 text-[10px] font-bold text-amber-400 ring-1 ring-amber-500/30"
                title="Товар отсутствует в подфайле «Товары магазина»"
              >
                Н/Д
              </span>
            </div>
          </td>
          <td class="px-4 py-3 font-medium text-gray-200" :title="store.getFactItemName(item.sku, item.name)">
            {{ store.getFactItemName(item.sku, item.name) }}
          </td>
          <td class="px-4 py-3 text-right tabular-nums text-gray-300">
            {{ item.quantity }} {{ item.unit }}
          </td>
          <td class="px-4 py-3 text-gray-400">{{ item.location }}</td>
          <td class="px-4 py-3 text-center">
            <span
              v-if="store.isAccount299Item(item.sku)"
              class="inline-flex items-center gap-1 rounded-md bg-amber-500/15 px-2 py-0.5 text-xs font-bold text-amber-400 ring-1 ring-amber-500/30"
              title="Позиция присутствует в счете 299"
            >
              299
            </span>
            <span v-else class="text-xs text-gray-600 font-mono">—</span>
          </td>
          <td v-if="!isReadOnly" class="px-4 py-3 text-center">
            <div class="flex items-center justify-center gap-2">
              <button
                class="rounded-md px-2 py-1 text-xs text-indigo-400 transition-colors hover:bg-indigo-500/10 hover:text-indigo-300 cursor-pointer"
                @click="$emit('edit', { ...item, name: store.getFactItemName(item.sku, item.name) })"
              >
                Изменить
              </button>
              <button
                class="rounded-md px-2 py-1 text-xs text-gray-500 transition-colors hover:bg-red-500/10 hover:text-red-400 cursor-pointer"
                @click="$emit('delete', item.id)"
              >
                Удалить
              </button>
            </div>
          </td>
        </tr>
      </template>

      <template #addRow>
        <!-- Excel-like inline row for adding new item (Pinned at top) -->
        <tr v-if="!isReadOnly" class="bg-indigo-950/60 border-b-2 border-indigo-500/30 backdrop-blur-md transition-colors shadow-sm">
          <td class="px-3 py-2 text-center text-xs text-indigo-400 font-bold">＋</td>
          <td class="px-3 py-2 text-center text-xs text-indigo-400 font-mono font-medium">
            {{ items.length + 1 }}
          </td>
          <!-- SKU -->
          <td class="px-2 py-2">
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
          <!-- Location -->
          <td class="px-2 py-2">
            <input
              v-model="newRow.location"
              type="text"
              placeholder="Локация…"
              @paste="(e) => handlePaste(e, 'location')"
              @keydown.enter="handleAddRow"
              class="w-full rounded bg-gray-950/80 px-2.5 py-1 text-xs text-gray-200 ring-1 ring-gray-700/70 focus:outline-none focus:ring-1 focus:ring-indigo-500 placeholder:text-gray-600"
            />
          </td>
          <!-- Status placeholder -->
          <td class="px-2 py-2 text-center text-xs text-gray-500">
            —
          </td>
          <!-- Actions -->
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
    </VirtualTable>
  </div>
</template>
