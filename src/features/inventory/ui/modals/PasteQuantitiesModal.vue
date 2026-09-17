<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import type { InventoryItem } from '../../model/types'
import { parseQuantityListFromClipboard } from '@shared/lib/clipboardParser'

const props = defineProps<{
  isOpen: boolean
  targetItems: InventoryItem[]
  selectedCount?: number
  catalogMap?: Map<string, string>
}>()

const emit = defineEmits<{
  (e: 'close'): void
  (e: 'apply', quantities: number[]): void
}>()

const pasteText = ref('')

const parsedQuantities = computed(() => {
  return parseQuantityListFromClipboard(pasteText.value)
})

const previewRows = computed(() => {
  const list = parsedQuantities.value
  const targets = props.targetItems
  const maxDisplay = Math.min(targets.length, 50)
  return targets.slice(0, maxDisplay).map((item, idx) => ({
    index: idx + 1,
    item,
    currentQty: item.quantity,
    newQty: idx < list.length ? list[idx] : null,
  }))
})

const countToApply = computed(() => {
  return Math.min(parsedQuantities.value.length, props.targetItems.length)
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
        const parsed = parseQuantityListFromClipboard(clip)
        if (parsed.length > 0) {
          pasteText.value = clip
        }
      }
    }
  } catch (err) {
    console.warn('Clipboard read error in PasteQuantitiesModal:', err)
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
  if (parsedQuantities.value.length === 0 || props.targetItems.length === 0) return
  emit('apply', parsedQuantities.value)
  emit('close')
}
</script>

<template>
  <div
    v-if="isOpen"
    class="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-xs"
    @click.self="emit('close')"
  >
    <div
      class="w-full max-w-2xl rounded-2xl border border-gray-800 bg-gray-950 p-6 shadow-2xl transition-all"
      @keydown.esc="emit('close')"
    >
      <!-- Modal Header -->
      <div class="flex items-center justify-between border-b border-gray-800 pb-4">
        <div>
          <h3 class="text-lg font-semibold text-gray-100 flex items-center gap-2">
            <span>📥</span>
            <span>Вставить количество посчитанного</span>
          </h3>
          <p class="text-xs text-gray-400 mt-0.5">
            Вставьте скопированный столбик чисел из Excel/1C для построчного обновления количеств
          </p>
        </div>
        <button
          type="button"
          @click="emit('close')"
          class="text-gray-500 hover:text-gray-300 transition-colors text-xl font-bold cursor-pointer"
        >
          &times;
        </button>
      </div>

      <!-- Target Info -->
      <div class="mt-4 flex flex-wrap items-center justify-between gap-2 rounded-lg bg-gray-900/80 p-3 ring-1 ring-gray-800 text-xs">
        <div class="flex items-center gap-2 text-gray-300">
          <span class="text-indigo-400 font-bold">🎯 Целевые позиции:</span>
          <span>
            {{
              selectedCount && selectedCount > 0
                ? `Выбрано ${selectedCount} позиций (порядок согласно таблице)`
                : `Все видимые позиции (${targetItems.length} поз.) по текущему порядку`
            }}
          </span>
        </div>
        <span class="rounded-md bg-indigo-500/20 px-2 py-0.5 font-mono text-[11px] font-semibold text-indigo-300">
          Распознано чисел: {{ parsedQuantities.length }}
        </span>
      </div>

      <!-- Textarea Input -->
      <div class="mt-4 space-y-1.5">
        <div class="flex items-center justify-between text-xs text-gray-400">
          <label class="font-medium text-gray-300">Вставьте столбец с количеством:</label>
          <button
            type="button"
            @click="readFromClipboard"
            class="text-indigo-400 hover:text-indigo-300 text-[11px] cursor-pointer"
          >
            Вставить из буфера обмена (Ctrl+V)
          </button>
        </div>
        <textarea
          v-model="pasteText"
          rows="5"
          placeholder="12&#10;5&#10;0&#10;3.5&#10;24"
          class="w-full rounded-xl bg-gray-900/90 p-3 text-xs font-mono text-gray-200 ring-1 ring-gray-800 placeholder:text-gray-600 focus:outline-none focus:ring-1 focus:ring-emerald-500/50"
        />
      </div>

      <!-- Mapping Preview -->
      <div v-if="parsedQuantities.length > 0" class="mt-4 space-y-2">
        <div class="flex items-center justify-between text-xs text-gray-400">
          <span>Предпросмотр сопоставления (первые {{ Math.min(previewRows.length, 10) }} поз.):</span>
          <span class="text-emerald-400 font-medium">
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
                <th class="py-1 px-2 text-right w-24">Было</th>
                <th class="py-1 px-2 text-right w-28 text-emerald-400">➔ Станет</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-gray-800/40">
              <tr v-for="row in previewRows" :key="row.item.id" class="text-gray-300">
                <td class="py-1 px-2 text-gray-500">{{ row.index }}</td>
                <td class="py-1 px-2 text-indigo-400">{{ row.item.sku }}</td>
                <td class="py-1 px-2 truncate max-w-[200px] text-gray-200">{{ getItemName(row.item) }}</td>
                <td class="py-1 px-2 text-right text-gray-500">{{ row.currentQty }}</td>
                <td class="py-1 px-2 text-right font-bold">
                  <span v-if="row.newQty !== null" class="text-emerald-400 bg-emerald-500/10 px-1.5 py-0.5 rounded">
                    {{ row.newQty }}
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
          class="rounded-lg bg-emerald-600 px-4 py-2 text-xs font-semibold text-white hover:bg-emerald-500 disabled:opacity-40 disabled:cursor-not-allowed shadow-lg shadow-emerald-600/20 transition-all cursor-pointer"
        >
          Применить ({{ countToApply }} поз.)
        </button>
      </div>
    </div>
  </div>
</template>
