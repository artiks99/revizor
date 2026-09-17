<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import type { InventoryItem } from '../../model/types'
import { parseLocationEntriesFromClipboard, type LocationClipboardEntry } from '@shared/lib/clipboardParser'

const props = defineProps<{
  isOpen: boolean
  targetItems: InventoryItem[]
  catalogMap?: Map<string, string>
}>()

const emit = defineEmits<{
  (e: 'close'): void
  (e: 'apply', entries: LocationClipboardEntry[]): void
}>()

const pasteText = ref('')

const parsedEntries = computed(() => {
  return parseLocationEntriesFromClipboard(pasteText.value)
})

const hasSkuBinding = computed(() => {
  return parsedEntries.value.some((e) => !!e.sku)
})

const previewRows = computed(() => {
  const entries = parsedEntries.value
  const targets = props.targetItems
  const maxDisplay = Math.min(targets.length, 50)

  if (hasSkuBinding.value) {
    const entryMap = new Map<string, string>()
    for (const e of entries) {
      if (e.sku) entryMap.set(e.sku, e.location)
    }
    return targets.slice(0, maxDisplay).map((item, idx) => ({
      index: idx + 1,
      item,
      currentLoc: item.location || '',
      newLoc: entryMap.has(item.sku) ? entryMap.get(item.sku)! : null,
    }))
  }

  return targets.slice(0, maxDisplay).map((item, idx) => ({
    index: idx + 1,
    item,
    currentLoc: item.location || '',
    newLoc: idx < entries.length ? entries[idx].location : null,
  }))
})

const countToApply = computed(() => {
  if (hasSkuBinding.value) {
    const skuSet = new Set(props.targetItems.map((i) => i.sku))
    return parsedEntries.value.filter((e) => e.sku && skuSet.has(e.sku)).length
  }
  return Math.min(parsedEntries.value.length, props.targetItems.length)
})

function getItemName(item: InventoryItem): string {
  if (props.catalogMap?.has(item.sku)) {
    return props.catalogMap.get(item.sku)!
  }
  return item.name || 'Н/Д'
}

async function readFromClipboard() {
  try {
    if (navigator.clipboard && navigator.clipboard.readText) {
      const clip = await navigator.clipboard.readText()
      if (clip && clip.trim()) {
        const parsed = parseLocationEntriesFromClipboard(clip)
        if (parsed.length > 0) {
          pasteText.value = clip
        }
      }
    }
  } catch (err) {
    console.warn('Clipboard read error in PasteLocationsModal:', err)
  }
}

watch(
  () => props.isOpen,
  (open) => {
    if (open) {
      pasteText.value = ''
      readFromClipboard()
    }
  }
)

function handleApply() {
  if (parsedEntries.value.length === 0 || props.targetItems.length === 0) return
  emit('apply', parsedEntries.value)
  emit('close')
}
</script>

<template>
  <div
    v-if="isOpen"
    class="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm"
    @click.self="emit('close')"
  >
    <div
      class="w-full max-w-2xl rounded-2xl bg-gray-950 p-6 ring-1 ring-gray-800 shadow-2xl transition-all"
      @keydown.esc="emit('close')"
    >
      <!-- Modal Header -->
      <div class="flex items-center justify-between border-b border-gray-800 pb-4">
        <div class="flex items-center gap-3">
          <div class="flex h-9 w-9 items-center justify-center rounded-lg bg-indigo-500/20 text-indigo-400 text-lg">
            📍
          </div>
          <div>
            <h3 class="text-base font-semibold text-white">Вставить локации из буфера обмена</h3>
            <p class="text-xs text-gray-400">
              Построчное обновление локаций с сохранением исходной очередности (1-в-1)
            </p>
          </div>
        </div>
        <span
          v-if="parsedEntries.length > 0"
          class="rounded-full bg-indigo-500/20 px-2.5 py-1 text-xs font-medium text-indigo-300 ring-1 ring-indigo-500/30"
        >
          Распознано строк: {{ parsedEntries.length }}
        </span>
      </div>

      <!-- Textarea Input -->
      <div class="mt-4 space-y-1.5">
        <div class="flex items-center justify-between text-xs text-gray-400">
          <label class="font-medium text-gray-300">Вставьте столбец с локациями:</label>
          <button
            type="button"
            @click="readFromClipboard"
            class="text-indigo-400 hover:text-indigo-300 text-[11px] cursor-pointer transition-colors"
          >
            Вставить из буфера обмена (Ctrl+V)
          </button>
        </div>
        <textarea
          v-model="pasteText"
          rows="5"
          placeholder="Ряд 1, Стеллаж 1&#10;Ряд 1, Стеллаж 2&#10;Зона А&#10;Склад 2"
          class="w-full rounded-xl bg-gray-900/90 p-3 text-xs font-mono text-gray-200 ring-1 ring-gray-800 placeholder:text-gray-600 focus:outline-none focus:ring-1 focus:ring-indigo-500/50"
        />
      </div>

      <!-- Mapping Preview -->
      <div v-if="parsedEntries.length > 0" class="mt-4 space-y-2">
        <div class="flex items-center justify-between text-xs text-gray-400">
          <span>
            Предпросмотр сопоставления
            <template v-if="hasSkuBinding">(по ЛК)</template>
            (первые {{ Math.min(previewRows.length, 50) }} поз.):
          </span>
          <span class="text-indigo-400 font-medium">
            Будет обновлено: {{ countToApply }} из {{ targetItems.length }}
          </span>
        </div>

        <div class="max-h-48 overflow-y-auto rounded-lg border border-gray-800 bg-gray-900/60 p-2 text-xs">
          <table class="w-full text-left font-mono">
            <thead>
              <tr class="text-gray-500 border-b border-gray-800 pb-1 text-[11px]">
                <th class="py-1 px-2 w-10">№</th>
                <th class="py-1 px-2 w-24">ЛК</th>
                <th class="py-1 px-2">Наименование</th>
                <th class="py-1 px-2 text-right w-28">Было</th>
                <th class="py-1 px-2 text-right w-36 text-indigo-400">➔ Станет</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-gray-800/40">
              <tr v-for="row in previewRows" :key="row.item.id" class="text-gray-300">
                <td class="py-1 px-2 text-gray-500">{{ row.index }}</td>
                <td class="py-1 px-2 text-indigo-400">{{ row.item.sku }}</td>
                <td class="py-1 px-2 truncate max-w-[200px] text-gray-200">{{ getItemName(row.item) }}</td>
                <td class="py-1 px-2 text-right text-gray-500 truncate max-w-[120px]">
                  {{ row.currentLoc || '—' }}
                </td>
                <td class="py-1 px-2 text-right font-medium">
                  <span
                    v-if="row.newLoc !== null"
                    class="text-indigo-300 bg-indigo-500/15 px-1.5 py-0.5 rounded truncate max-w-[140px] inline-block align-middle"
                    :title="row.newLoc"
                  >
                    {{ row.newLoc || '— (пусто)' }}
                  </span>
                  <span v-else class="text-gray-600 font-normal">
                    —
                  </span>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <!-- Modal Footer -->
      <div class="mt-6 flex justify-end gap-3 border-t border-gray-800 pt-4">
        <button
          type="button"
          @click="emit('close')"
          class="rounded-lg bg-gray-800 px-4 py-2 text-xs font-medium text-gray-300 hover:bg-gray-700 transition-colors cursor-pointer"
        >
          Отмена
        </button>
        <button
          type="button"
          :disabled="countToApply === 0"
          @click="handleApply"
          class="rounded-lg bg-indigo-600 px-4 py-2 text-xs font-semibold text-white hover:bg-indigo-500 disabled:opacity-40 disabled:cursor-not-allowed shadow-lg shadow-indigo-600/20 transition-all cursor-pointer"
        >
          Применить ({{ countToApply }} поз.)
        </button>
      </div>
    </div>
  </div>
</template>
