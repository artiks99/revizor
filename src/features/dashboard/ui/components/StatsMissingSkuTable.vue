<script setup lang="ts">
import { ref, computed, watch, onMounted } from 'vue'
import type { MissingSkuItem } from '../../model/types'
import CopyableSku from '@shared/ui/CopyableSku.vue'
import StoreTableTh from '@shared/ui/StoreTableTh.vue'
import { useExcelColumnFilter } from '@shared/lib/useExcelColumnFilter'
import { useTableSort } from '@shared/lib/useTableSort'
import { eventBus } from '@shared/lib/eventBus'

interface EnrichedMissingSkuItem extends MissingSkuItem {
  status: string
}

const props = defineProps<{
  items: MissingSkuItem[]
  searchQuery: string
  revisionId?: string
}>()

const emit = defineEmits<{
  (e: 'update:searchQuery', val: string): void
  (e: 'copy'): void
}>()

const currentPage = ref(1)
const pageSize = 50
const statusFilter = ref<'all' | 'uncheck' | 'checked'>('all')

const checkedSkus = ref<Set<string>>(new Set())

const storageKey = computed(() => {
  return props.revisionId
    ? `revizor:checked_missing_skus:${props.revisionId}`
    : 'revizor:checked_missing_skus:default'
})

function loadChecked() {
  try {
    const raw = localStorage.getItem(storageKey.value)
    if (raw) {
      const parsed = JSON.parse(raw)
      if (Array.isArray(parsed)) {
        checkedSkus.value = new Set(parsed)
        return
      }
    }
  } catch (err) {
    console.warn('[StatsMissingSkuTable] Failed to load checked skus:', err)
  }
  checkedSkus.value = new Set()
}

function saveChecked() {
  try {
    localStorage.setItem(storageKey.value, JSON.stringify(Array.from(checkedSkus.value)))
  } catch (err) {
    console.warn('[StatsMissingSkuTable] Failed to save checked skus:', err)
  }
}

function toggleChecked(sku: string) {
  if (checkedSkus.value.has(sku)) {
    checkedSkus.value.delete(sku)
  } else {
    checkedSkus.value.add(sku)
  }
  saveChecked()
}

function isChecked(sku: string): boolean {
  return checkedSkus.value.has(sku)
}

function clearAllChecked() {
  if (checkedSkus.value.size === 0) return
  if (confirm(`Сбросить все отметки «Проверено» (${checkedSkus.value.size} шт.) для этой ревизии?`)) {
    checkedSkus.value.clear()
    saveChecked()
  }
}

function onRowClick(sku: string) {
  const selection = window.getSelection()
  if (selection && selection.toString().trim().length > 0) {
    return
  }
  toggleChecked(sku)
}

watch(
  () => props.revisionId,
  () => {
    loadChecked()
  },
  { immediate: true }
)

onMounted(() => {
  loadChecked()
})

const checkedCount = computed(() => {
  let count = 0
  for (const item of props.items) {
    if (checkedSkus.value.has(item.sku)) {
      count++
    }
  }
  return count
})

const enrichedItems = computed<EnrichedMissingSkuItem[]>(() => {
  return props.items.map((item) => ({
    ...item,
    status: checkedSkus.value.has(item.sku) ? 'Проверено' : 'Не учтён в факте',
  }))
})

// Базовая фильтрация (поиск и чипы статуса) перед Excel-фильтрами колонок
const preFilteredItems = computed<EnrichedMissingSkuItem[]>(() => {
  let list = enrichedItems.value

  if (statusFilter.value === 'checked') {
    list = list.filter((i) => checkedSkus.value.has(i.sku))
  } else if (statusFilter.value === 'uncheck') {
    list = list.filter((i) => !checkedSkus.value.has(i.sku))
  }

  const q = props.searchQuery?.trim().toLowerCase()
  if (q) {
    list = list.filter((i) => i.sku.toLowerCase().includes(q) || (i.name && i.name.toLowerCase().includes(q)))
  }

  return list
})

// Excel-фильтры колонок
const {
  columnFilters,
  getDistinctValues,
  setColumnFilter,
  clearAllColumnFilters,
  activeFilterCount,
  filteredItems,
} = useExcelColumnFilter<EnrichedMissingSkuItem>(
  () => preFilteredItems.value,
  {
    sku: (r) => r.sku,
    name: (r) => r.name || 'Товар без названия',
    stockQty: (r) => (r.stockQty != null && r.stockQty > 0 ? `${Number(r.stockQty).toLocaleString('ru-RU')} шт.` : '—'),
    status: (r) => r.status,
  }
)

// Сортировка таблицы
const { sortKey, sortDirection, toggleSort, sortedItems } = useTableSort<EnrichedMissingSkuItem>(
  () => filteredItems.value,
  'sku',
  'asc',
  {
    sku: (r) => {
      const num = Number(r.sku)
      return isNaN(num) ? r.sku : num
    },
    name: (r) => r.name || '',
    stockQty: (r) => Number(r.stockQty) || 0,
    status: (r) => r.status,
  }
)

// Сброс страницы при смене фильтров или поиска
watch([columnFilters, () => props.searchQuery, statusFilter], () => {
  currentPage.value = 1
})

const paginatedItems = computed(() => {
  const start = (currentPage.value - 1) * pageSize
  return sortedItems.value.slice(start, start + pageSize)
})

const totalPages = computed(() => Math.max(1, Math.ceil(sortedItems.value.length / pageSize)))

async function handleCopySkus() {
  const list = sortedItems.value.map((i) => i.sku).filter(Boolean)
  if (list.length === 0) return
  const text = list.join('\n')
  try {
    if (navigator?.clipboard) {
      await navigator.clipboard.writeText(text)
      eventBus.emit('app:toast', {
        type: 'success',
        message: `Скопировано ${list.length} ЛК в буфер обмена`,
      })
    }
  } catch (err) {
    console.error('[StatsMissingSkuTable] Copy error:', err)
  }
}

/**
 * При копировании выделенного фрагмента таблицы гарантируем,
 * что в буфер попадают только чистые ЛК (без номеров строк, названий и остатков)
 */
function onCopyTable(e: ClipboardEvent) {
  const selection = window.getSelection()
  if (!selection || selection.isCollapsed) return

  const selectedText = selection.toString().trim()
  if (!selectedText) return

  const skuSet = new Set(props.items.map((i) => i.sku))
  const lines = selectedText.split(/\r?\n/)
  const extractedSkus: string[] = []

  for (const line of lines) {
    const trimmed = line.trim()
    if (!trimmed) continue
    if (skuSet.has(trimmed)) {
      extractedSkus.push(trimmed)
    } else {
      const match = trimmed.match(/\b\d{5,9}\b/)
      if (match && skuSet.has(match[0])) {
        extractedSkus.push(match[0])
      }
    }
  }

  if (extractedSkus.length > 0) {
    e.preventDefault()
    e.clipboardData?.setData('text/plain', extractedSkus.join('\n'))
  }
}
</script>

<template>
  <div class="rounded-xl border border-gray-800/60 bg-gray-900/60 p-4 space-y-3">
    <!-- Toolbar -->
    <div class="flex flex-wrap items-center justify-between gap-3">
      <div class="flex flex-wrap items-center gap-2.5">
        <!-- Search Input -->
        <div class="relative w-56 sm:w-64">
          <input
            :value="searchQuery"
            @input="emit('update:searchQuery', ($event.target as HTMLInputElement).value); currentPage = 1"
            type="text"
            class="w-full rounded-lg bg-gray-950/80 py-1.5 pl-8 pr-7 text-xs text-gray-200 placeholder-gray-500 ring-1 ring-gray-800 focus:outline-none focus:ring-1 focus:ring-amber-500/50"
            placeholder="Поиск по ЛК или названию…"
          />
          <span class="absolute left-2.5 top-1/2 -translate-y-1/2 text-xs text-gray-500">🔍</span>
          <button
            v-if="searchQuery"
            @click="emit('update:searchQuery', ''); currentPage = 1"
            class="absolute right-2.5 top-1/2 -translate-y-1/2 text-xs text-gray-500 hover:text-gray-300 cursor-pointer"
          >
            ✕
          </button>
        </div>

        <!-- Filter Chips: All, Uncheck, Checked -->
        <div class="flex items-center rounded-lg bg-gray-950/80 p-0.5 ring-1 ring-gray-800 text-xs">
          <button
            type="button"
            @click="statusFilter = 'all'; currentPage = 1"
            class="rounded-md px-2 py-1 transition-colors cursor-pointer"
            :class="[
              statusFilter === 'all'
                ? 'bg-gray-800 text-gray-200 font-medium'
                : 'text-gray-400 hover:text-gray-300'
            ]"
          >
            Все ({{ items.length }})
          </button>

          <button
            type="button"
            @click="statusFilter = 'uncheck'; currentPage = 1"
            class="rounded-md px-2 py-1 transition-colors cursor-pointer"
            :class="[
              statusFilter === 'uncheck'
                ? 'bg-amber-500/20 text-amber-300 font-medium ring-1 ring-amber-500/30'
                : 'text-gray-400 hover:text-gray-300'
            ]"
          >
            Не проверено ({{ items.length - checkedCount }})
          </button>

          <button
            type="button"
            @click="statusFilter = 'checked'; currentPage = 1"
            class="rounded-md px-2 py-1 transition-colors cursor-pointer"
            :class="[
              statusFilter === 'checked'
                ? 'bg-emerald-500/20 text-emerald-300 font-medium ring-1 ring-emerald-500/30'
                : 'text-gray-400 hover:text-gray-300'
            ]"
          >
            ✓ Проверено ({{ checkedCount }})
          </button>
        </div>

        <!-- Column filter reset button -->
        <button
          v-if="activeFilterCount > 0"
          type="button"
          @click="clearAllColumnFilters"
          class="flex items-center gap-1 rounded-md bg-indigo-500/20 px-2 py-1 text-[11px] font-semibold text-indigo-300 ring-1 ring-indigo-500/30 hover:bg-indigo-500/30 transition-colors cursor-pointer"
          title="Сбросить все фильтры колонок"
        >
          <span>✕ Фильтры колонок: {{ activeFilterCount }}</span>
        </button>

        <!-- Reset Button if any checked -->
        <button
          v-if="checkedCount > 0"
          type="button"
          @click="clearAllChecked"
          class="text-[11px] text-gray-500 hover:text-rose-400 transition-colors cursor-pointer px-1 py-0.5"
          title="Сбросить все отметки «Проверено» для этой ревизии"
        >
          ✕ Сброс отметок
        </button>
      </div>

      <!-- Copy button -->
      <button
        v-if="sortedItems.length > 0"
        @click="handleCopySkus"
        class="flex items-center gap-1.5 rounded-lg bg-amber-500/15 px-3 py-1.5 text-xs font-semibold text-amber-300 ring-1 ring-amber-500/30 transition-colors hover:bg-amber-500/25 cursor-pointer"
        :title="statusFilter === 'uncheck' ? 'Скопировать непроверенные ЛК' : 'Скопировать ЛК списка в буфер обмена'"
      >
        <span>📋</span> Скопировать ЛК ({{ sortedItems.length }})
      </button>
    </div>

    <!-- Empty State -->
    <div
      v-if="sortedItems.length === 0"
      class="flex flex-col items-center justify-center rounded-lg border border-dashed border-gray-800 py-12 text-center"
    >
      <span class="text-3xl">
        {{ statusFilter === 'checked' ? '🔍' : statusFilter === 'uncheck' ? '🎉' : '🎉' }}
      </span>
      <h4 class="mt-2 text-sm font-medium text-gray-200">
        <template v-if="statusFilter === 'checked'">
          Нет отмеченных проверенными ЛК
        </template>
        <template v-else-if="statusFilter === 'uncheck'">
          Все найденные позиции уже проверены!
        </template>
        <template v-else-if="searchQuery || activeFilterCount > 0">
          По вашему фильтру ничего не найдено
        </template>
        <template v-else>
          Все ЛК с остатком &gt; 0 учтены на складе!
        </template>
      </h4>
      <p class="mt-1 text-xs text-gray-500">
        <template v-if="statusFilter === 'checked'">
          Кликните по строке или статусу в списке, чтобы пометить позицию проверенной
        </template>
        <template v-else-if="searchQuery || activeFilterCount > 0">
          Попробуйте изменить параметры поиска или фильтры колонок
        </template>
        <template v-else>
          В фактической ревизии учтены все позиции из системных остатков.
        </template>
      </p>
    </div>

    <!-- Table with Excel Column Filters, Sorting, and non-selectable columns -->
    <div
      v-else
      class="overflow-x-auto rounded-lg border border-gray-800/80"
      @copy="onCopyTable"
    >
      <table class="w-full text-left text-xs text-gray-300">
        <thead class="border-b border-gray-800/80 bg-gray-950/80 text-xs uppercase tracking-wider text-gray-400 font-semibold select-none">
          <tr>
            <th class="w-12 px-3 py-3 text-center text-gray-500 font-medium select-none">№</th>

            <!-- ЛК (Артикул) with StoreTableTh -->
            <StoreTableTh
              title="ЛК (Артикул)"
              column-key="sku"
              width="w-40"
              :sort-key="sortKey"
              :sort-direction="sortDirection"
              :distinct-values="() => getDistinctValues('sku')"
              :model-value="columnFilters['sku'] || null"
              @sort="toggleSort"
              @update:model-value="setColumnFilter('sku', $event)"
            />

            <!-- Наименование with StoreTableTh -->
            <StoreTableTh
              title="Наименование товара"
              column-key="name"
              width="min-w-[220px]"
              :sort-key="sortKey"
              :sort-direction="sortDirection"
              :distinct-values="() => getDistinctValues('name')"
              :model-value="columnFilters['name'] || null"
              @sort="toggleSort"
              @update:model-value="setColumnFilter('name', $event)"
            />

            <!-- Остаток with StoreTableTh -->
            <StoreTableTh
              title="Остаток"
              column-key="stockQty"
              align="right"
              width="w-32"
              :sort-key="sortKey"
              :sort-direction="sortDirection"
              :distinct-values="() => getDistinctValues('stockQty')"
              :model-value="columnFilters['stockQty'] || null"
              @sort="toggleSort"
              @update:model-value="setColumnFilter('stockQty', $event)"
            />

            <!-- Статус with StoreTableTh -->
            <StoreTableTh
              title="Статус"
              column-key="status"
              align="center"
              width="w-36"
              :sort-key="sortKey"
              :sort-direction="sortDirection"
              :distinct-values="() => getDistinctValues('status')"
              :model-value="columnFilters['status'] || null"
              @sort="toggleSort"
              @update:model-value="setColumnFilter('status', $event)"
            />
          </tr>
        </thead>
        <tbody class="divide-y divide-gray-800/50 bg-gray-900/40">
          <tr
            v-for="(item, idx) in paginatedItems"
            :key="item.sku"
            @click="onRowClick(item.sku)"
            class="transition-colors cursor-pointer select-none"
            :class="[
              isChecked(item.sku)
                ? 'bg-emerald-950/25 hover:bg-emerald-900/35 border-l-2 border-l-emerald-500/80'
                : 'hover:bg-gray-800/40'
            ]"
          >
            <!-- Row number: select-none -->
            <td class="px-3 py-2 text-center font-mono text-[11px] select-none pointer-events-none"
                :class="isChecked(item.sku) ? 'text-emerald-400/80' : 'text-gray-500'">
              <span v-if="isChecked(item.sku)" class="mr-0.5 text-emerald-400">✓</span>
              {{ (currentPage - 1) * pageSize + idx + 1 }}
            </td>

            <!-- SKU: select-text & CopyableSku -->
            <td class="px-3 py-2 font-mono font-semibold select-text"
                :class="isChecked(item.sku) ? 'text-emerald-300' : 'text-amber-300'">
              <CopyableSku
                :sku="item.sku"
                :text-class="isChecked(item.sku) ? 'text-emerald-300 hover:text-emerald-200 font-bold' : 'text-amber-300 hover:text-amber-200 font-bold'"
              />
            </td>

            <!-- Product name: select-none so dragging mouse skips it -->
            <td class="px-3 py-2 select-none"
                :class="isChecked(item.sku) ? 'text-emerald-100/90' : 'text-gray-200'">
              {{ item.name || '—' }}
            </td>

            <!-- Stock quantity: select-none -->
            <td class="px-3 py-2 text-right font-mono text-xs select-none"
                :class="isChecked(item.sku) ? 'text-emerald-300/90' : 'text-amber-300/90'">
              <span v-if="item.stockQty != null && item.stockQty > 0">
                {{ Number(item.stockQty).toLocaleString('ru-RU') }} шт.
              </span>
              <span v-else class="text-gray-500">—</span>
            </td>

            <!-- Status: toggle button -->
            <td class="px-3 py-2 text-center select-none">
              <button
                type="button"
                @click.stop="toggleChecked(item.sku)"
                class="inline-flex items-center gap-1 rounded-md px-2.5 py-0.5 text-[10px] font-semibold transition-all duration-150 cursor-pointer select-none ring-1"
                :class="[
                  isChecked(item.sku)
                    ? 'bg-emerald-500/20 text-emerald-300 ring-emerald-500/40 hover:bg-emerald-500/30 shadow-sm shadow-emerald-500/10'
                    : 'bg-amber-500/10 text-amber-400 ring-amber-500/20 hover:bg-amber-500/20 hover:ring-amber-500/40'
                ]"
                :title="isChecked(item.sku) ? 'Проверено. Нажмите, чтобы снять отметку' : 'Нажмите, чтобы отметить проверенным'"
              >
                <span v-if="isChecked(item.sku)">✓</span>
                <span>{{ isChecked(item.sku) ? 'Проверено' : 'Не учтён в факте' }}</span>
              </button>
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <!-- Pagination if needed -->
    <div v-if="totalPages > 1" class="flex items-center justify-between pt-1 text-xs text-gray-400">
      <div>
        Страница {{ currentPage }} из {{ totalPages }} ({{ sortedItems.length }} поз.)
      </div>
      <div class="flex items-center gap-1">
        <button
          :disabled="currentPage <= 1"
          @click="currentPage--"
          class="rounded px-2.5 py-1 text-xs bg-gray-800 hover:bg-gray-700 disabled:opacity-40 disabled:pointer-events-none text-gray-300 cursor-pointer"
        >
          Назад
        </button>
        <button
          :disabled="currentPage >= totalPages"
          @click="currentPage++"
          class="rounded px-2.5 py-1 text-xs bg-gray-800 hover:bg-gray-700 disabled:opacity-40 disabled:pointer-events-none text-gray-300 cursor-pointer"
        >
          Вперед
        </button>
      </div>
    </div>
  </div>
</template>
