<script setup lang="ts">
import { ref, computed } from 'vue'
import { readCsvFileAsText, parseCatalogCsv, parseStockCsv, parseAccount299Csv, parseFactCsv } from '@shared/lib/csvParser'
import CopyableSku from '@shared/ui/CopyableSku.vue'
import CopyableBarcode from '@shared/ui/CopyableBarcode.vue'

const props = defineProps<{
  type: 'fact' | 'catalog' | 'stock' | '299'
  catalogMap?: Map<string, string>
}>()

const emit = defineEmits<{
  close: []
  importFact: [items: { sku: string; name: string; quantity: number; unit?: string; location?: string }[], replaceAll: boolean]
  importCatalog: [items: { sku: string; name: string; barcode?: string }[], replaceAll: boolean]
  importStock: [items: { sku: string; name: string; quantity: number }[], replaceAll: boolean]
  importAccount299: [items: { sku: string; name: string }[], replaceAll: boolean]
}>()

const TYPE_CONFIG = {
  fact: {
    icon: '📋',
    title: 'Импорт фактической ревизии (CSV)',
    desc: 'Формат CSV: ЛК (Артикул) [; Название] [; Количество] [; Локация]',
  },
  catalog: {
    icon: '📦',
    title: 'Импорт товаров магазина (CSV)',
    desc: 'Формат CSV: ЛК (ячейка A) ; Название (ячейка B) [; Штрихкод (ячейка C)]',
  },
  stock: {
    icon: '📊',
    title: 'Импорт системных остатков (CSV)',
    desc: 'Формат CSV: ЛК (Артикул) ; Название ; Количество',
  },
  '299': {
    icon: '🏷️',
    title: 'Импорт позиций счета 299 (CSV)',
    desc: 'Формат CSV: ЛК (Артикул) [; Название]',
  },
} as const

const isDragging = ref(false)
const selectedFileName = ref('')
const rawFileText = ref('')
const replaceAll = ref(true)
const parseError = ref('')
const deduplicateStockBySku = ref(true)

const parsedFact = computed(() => {
  if (props.type !== 'fact' || !rawFileText.value) return []
  return parseFactCsv(rawFileText.value, props.catalogMap)
})

const parsedCatalog = computed(() => {
  if (props.type !== 'catalog' || !rawFileText.value) return []
  return parseCatalogCsv(rawFileText.value, props.catalogMap)
})

const parsedStock = computed(() => {
  if (props.type !== 'stock' || !rawFileText.value) return []
  return parseStockCsv(rawFileText.value, props.catalogMap)
})

const stockDuplicateCount = computed(() => {
  if (props.type !== 'stock') return 0
  const seen = new Set<string>()
  let duplicates = 0
  for (const item of parsedStock.value) {
    const sku = item.sku.trim().toLowerCase()
    if (seen.has(sku)) duplicates++
    else seen.add(sku)
  }
  return duplicates
})

const finalParsedStock = computed(() => {
  if (props.type !== 'stock') return []
  if (!deduplicateStockBySku.value || stockDuplicateCount.value === 0) {
    return parsedStock.value
  }
  const seen = new Set<string>()
  const result: typeof parsedStock.value = []
  for (const item of parsedStock.value) {
    const sku = item.sku.trim().toLowerCase()
    if (!seen.has(sku)) {
      seen.add(sku)
      result.push(item)
    }
  }
  return result
})

const parsedAccount299 = computed(() => {
  if (props.type !== '299' || !rawFileText.value) return []
  return parseAccount299Csv(rawFileText.value, props.catalogMap)
})

const totalParsed = computed(() => {
  if (props.type === 'fact') return parsedFact.value.length
  if (props.type === 'catalog') return parsedCatalog.value.length
  if (props.type === 'stock') return finalParsedStock.value.length
  return parsedAccount299.value.length
})

async function processFile(file: File) {
  parseError.value = ''
  if (!file.name.toLowerCase().endsWith('.csv') && !file.name.toLowerCase().endsWith('.txt')) {
    parseError.value = 'Пожалуйста, выберите файл в формате CSV (.csv или .txt)'
    return
  }

  selectedFileName.value = file.name
  try {
    rawFileText.value = await readCsvFileAsText(file)
    if (totalParsed.value === 0) {
      parseError.value = 'Не удалось распознать строки. Проверьте формат файла.'
    }
  } catch (err) {
    parseError.value = 'Ошибка чтения файла: ' + (err instanceof Error ? err.message : String(err))
  }
}

function handleDrop(e: DragEvent) {
  isDragging.value = false
  const files = e.dataTransfer?.files
  if (files && files.length > 0) {
    processFile(files[0])
  }
}

function onDragLeave(e: DragEvent) {
  const currentTarget = e.currentTarget as HTMLElement | null
  const relatedTarget = e.relatedTarget as Node | null
  if (!currentTarget || !relatedTarget || !currentTarget.contains(relatedTarget)) {
    isDragging.value = false
  }
}

function handleFileInput(e: Event) {
  const target = e.target as HTMLInputElement
  if (target.files && target.files.length > 0) {
    processFile(target.files[0])
  }
}

function handleConfirmImport() {
  if (totalParsed.value === 0) return

  if (props.type === 'fact') {
    emit('importFact', parsedFact.value, replaceAll.value)
  } else if (props.type === 'catalog') {
    emit('importCatalog', parsedCatalog.value, replaceAll.value)
  } else if (props.type === 'stock') {
    emit('importStock', finalParsedStock.value, replaceAll.value)
  } else if (props.type === '299') {
    emit('importAccount299', parsedAccount299.value, replaceAll.value)
  }
  emit('close')
}
</script>

<template>
  <div
    class="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-xs p-4"
    @dragover.prevent
    @drop.prevent
    @click.self="$emit('close')"
  >
    <div
      class="w-full max-w-xl rounded-2xl border border-gray-800 bg-gray-950 p-6 shadow-2xl transition-all"
    >
      <!-- Header -->
      <div class="flex items-center justify-between border-b border-gray-800 pb-4">
        <div>
          <h3 class="text-lg font-semibold text-gray-100 flex items-center gap-2">
            <span>{{ TYPE_CONFIG[type].icon }}</span>
            <span>{{ TYPE_CONFIG[type].title }}</span>
          </h3>
          <p class="text-xs text-gray-400 mt-0.5">
            {{ TYPE_CONFIG[type].desc }}
          </p>
        </div>
        <button
          @click="$emit('close')"
          class="text-gray-500 hover:text-gray-300 transition-colors text-xl font-bold cursor-pointer"
        >
          &times;
        </button>
      </div>

      <!-- Dropzone -->
      <div class="mt-4">
        <div
          @dragenter.prevent="isDragging = true"
          @dragover.prevent="isDragging = true"
          @dragleave.prevent="onDragLeave"
          @drop.prevent="handleDrop"
          class="relative flex flex-col items-center justify-center rounded-xl border-2 border-dashed p-6 text-center transition-all"
          :class="[
            isDragging
              ? 'border-indigo-500 bg-indigo-500/15 scale-[1.01]'
              : 'border-gray-800 bg-gray-900/40 hover:border-gray-700 hover:bg-gray-900/60',
          ]"
        >
          <div class="text-3xl mb-2 pointer-events-none">📄</div>
          <p class="text-sm font-medium text-gray-200 pointer-events-none">
            {{ isDragging ? 'Отпустите файл для загрузки' : 'Перетащите сюда CSV-файл или' }}
          </p>
          <label class="mt-2 inline-flex cursor-pointer items-center rounded-lg bg-indigo-600 px-3.5 py-1.5 text-xs font-medium text-white shadow hover:bg-indigo-500 transition-colors">
            <span>Выберите файл</span>
            <input type="file" accept=".csv,.txt" class="hidden" @change="handleFileInput" />
          </label>

          <p v-if="selectedFileName" class="mt-3 text-xs font-mono text-indigo-400 bg-indigo-500/10 px-2 py-1 rounded pointer-events-none">
            Выбран: {{ selectedFileName }} (распознано позиций: {{ totalParsed }})
          </p>
        </div>

        <!-- Error -->
        <p v-if="parseError" class="mt-2 text-xs text-red-400">
          {{ parseError }}
        </p>

        <!-- Preview table -->
        <div v-if="totalParsed > 0" class="mt-4 space-y-2">
          <div class="flex items-center justify-between text-xs text-gray-400">
            <span>Предпросмотр первых позиций (всего {{ totalParsed }}):</span>
          </div>

          <div class="max-h-40 overflow-y-auto rounded-lg border border-gray-800 bg-gray-900/60 p-2 text-xs">
            <table class="w-full text-left font-mono">
              <thead>
                <tr class="text-gray-500 border-b border-gray-800 pb-1">
                  <th class="py-1 px-2 w-24">ЛК</th>
                  <th class="py-1 px-2">Наименование</th>
                  <th v-if="type === 'catalog'" class="py-1 px-2 w-28">Штрихкод</th>
                  <th v-if="type === 'fact' || type === 'stock'" class="py-1 px-2 text-right w-20">Кол-во</th>
                  <th v-if="type === 'fact'" class="py-1 px-2 text-right w-24">Локация</th>
                </tr>
              </thead>
              <tbody class="divide-y divide-gray-800/40">
                <template v-if="type === 'fact'">
                  <tr v-for="(item, idx) in parsedFact.slice(0, 5)" :key="idx" class="text-gray-300">
                    <td class="py-1 px-2"><CopyableSku :sku="item.sku" text-class="text-indigo-400" /></td>
                    <td class="py-1 px-2 truncate max-w-[180px]">{{ item.name }}</td>
                    <td class="py-1 px-2 text-right font-medium text-indigo-300">{{ item.quantity }}</td>
                    <td class="py-1 px-2 text-right text-gray-400 truncate max-w-[100px]">{{ item.location || '—' }}</td>
                  </tr>
                </template>
                <template v-else-if="type === 'catalog'">
                  <tr v-for="(item, idx) in parsedCatalog.slice(0, 5)" :key="idx" class="text-gray-300">
                    <td class="py-1 px-2"><CopyableSku :sku="item.sku" text-class="text-indigo-400" /></td>
                    <td class="py-1 px-2 truncate max-w-[200px]">{{ item.name }}</td>
                    <td class="py-1 px-2 font-mono text-gray-400 text-xs whitespace-nowrap"><CopyableBarcode :barcode="item.barcode" /></td>
                  </tr>
                </template>
                <template v-else-if="type === 'stock'">
                  <tr v-for="(item, idx) in parsedStock.slice(0, 5)" :key="idx" class="text-gray-300">
                    <td class="py-1 px-2"><CopyableSku :sku="item.sku" text-class="text-indigo-400" /></td>
                    <td class="py-1 px-2 truncate max-w-[200px]">{{ item.name }}</td>
                    <td class="py-1 px-2 text-right font-medium text-emerald-400">{{ item.quantity }}</td>
                  </tr>
                </template>
                <template v-else-if="type === '299'">
                  <tr v-for="(item, idx) in parsedAccount299.slice(0, 5)" :key="idx" class="text-gray-300">
                    <td class="py-1 px-2"><CopyableSku :sku="item.sku" text-class="text-indigo-400" /></td>
                    <td class="py-1 px-2 truncate max-w-[240px]">{{ item.name }}</td>
                  </tr>
                </template>
              </tbody>
            </table>
          </div>
        </div>

        <!-- Deduplication option for stock -->
        <div v-if="type === 'stock' && stockDuplicateCount > 0" class="mt-3 p-3 rounded-xl bg-amber-500/10 border border-amber-500/20 text-xs">
          <label class="flex items-start gap-2.5 cursor-pointer select-none">
            <input
              type="checkbox"
              v-model="deduplicateStockBySku"
              class="mt-0.5 h-4 w-4 rounded border-gray-700 bg-gray-900 text-indigo-600 focus:ring-indigo-500 cursor-pointer"
            />
            <div>
              <span class="font-semibold text-amber-300">Оставлять по 1 записи на каждый ЛК (рекомендуется)</span>
              <p class="text-gray-400 mt-0.5">
                Обнаружено {{ stockDuplicateCount }} повторок ЛК (штрихкоды одного товара с одинаковым остатком).
                Включение защищает от задвоения: будет сохранено {{ finalParsedStock.length }} уникальных товаров.
              </p>
            </div>
          </label>
        </div>

        <!-- Mode options -->
        <div class="mt-4 flex items-center gap-4 text-xs text-gray-300">
          <label class="flex items-center gap-2 cursor-pointer">
            <input type="radio" :value="true" v-model="replaceAll" class="text-indigo-600 focus:ring-indigo-500" />
            <span>Заменить существующие данные</span>
          </label>
          <label class="flex items-center gap-2 cursor-pointer">
            <input type="radio" :value="false" v-model="replaceAll" class="text-indigo-600 focus:ring-indigo-500" />
            <span>Дополнить текущий список</span>
          </label>
        </div>
      </div>

      <!-- Footer -->
      <div class="mt-6 flex justify-end gap-3 border-t border-gray-800 pt-4">
        <button
          type="button"
          @click="$emit('close')"
          class="rounded-lg bg-gray-800 px-4 py-2 text-sm font-medium text-gray-300 hover:bg-gray-700 transition-colors cursor-pointer"
        >
          Отмена
        </button>
        <button
          type="button"
          :disabled="totalParsed === 0"
          @click="handleConfirmImport"
          class="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-500 disabled:opacity-40 disabled:cursor-not-allowed shadow-lg shadow-indigo-600/20 transition-all cursor-pointer"
        >
          Загрузить ({{ totalParsed }})
        </button>
      </div>
    </div>
  </div>
</template>
