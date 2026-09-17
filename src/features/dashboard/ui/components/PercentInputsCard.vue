<script setup lang="ts">
import { ref } from 'vue'
import { usePercentCalcStore } from '../../model/usePercentCalcStore'

const store = usePercentCalcStore()
const fileInputRef = ref<HTMLInputElement | null>(null)
const isDragging = ref(false)
const importMessage = ref('')

function handleFileSelect(e: Event) {
  const target = e.target as HTMLInputElement
  if (target.files && target.files[0]) {
    processFile(target.files[0])
    target.value = ''
  }
}

function handleDrop(e: DragEvent) {
  isDragging.value = false
  if (e.dataTransfer?.files && e.dataTransfer.files[0]) {
    processFile(e.dataTransfer.files[0])
  }
}

async function processFile(file: File) {
  try {
    const success = await store.importFromXlsx(file)
    if (success) {
      importMessage.value = `Файл «${file.name}» успешно загружен`
    } else {
      importMessage.value = 'Не удалось найти лист расчёта в файле'
    }
  } catch (err) {
    importMessage.value = 'Ошибка чтения файла Excel'
  }
  setTimeout(() => {
    importMessage.value = ''
  }, 4000)
}

function triggerFileInput() {
  fileInputRef.value?.click()
}
</script>

<template>
  <div
    class="rounded-xl bg-gray-900/80 p-5 ring-1 ring-gray-800/80 shadow-lg shadow-black/20 relative"
    :class="{ 'ring-2 ring-indigo-500/80 bg-indigo-950/20': isDragging }"
    @dragover.prevent="isDragging = true"
    @dragleave.prevent="isDragging = false"
    @drop.prevent="handleDrop"
  >
    <!-- Card Header -->
    <div class="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 pb-4 border-b border-gray-800/60">
      <div class="flex items-center gap-2">
        <span class="text-xl">📥</span>
        <div>
          <h3 class="text-sm font-bold text-gray-100">Входные параметры периода</h3>
          <p class="text-[11px] text-gray-400">Данные по выручке, срокам и списаниям для расчёта</p>
        </div>
      </div>

      <!-- Actions -->
      <div class="flex flex-wrap items-center gap-2">
        <input
          ref="fileInputRef"
          type="file"
          accept=".xlsx,.xls"
          class="hidden"
          @change="handleFileSelect"
        />
        <button
          type="button"
          @click="triggerFileInput"
          class="flex items-center gap-1.5 rounded-lg bg-indigo-600/20 px-2.5 py-1.5 text-xs font-semibold text-indigo-300 ring-1 ring-indigo-500/30 hover:bg-indigo-600/30 transition-colors cursor-pointer"
          title="Загрузить готовый файл Excel (например inventory_calc.xlsx)"
        >
          <span>📂</span>
          <span>Загрузить Excel</span>
        </button>

        <button
          type="button"
          @click="store.resetToDefaults"
          class="rounded-lg bg-gray-800/80 px-2.5 py-1.5 text-xs font-medium text-gray-300 ring-1 ring-gray-700/50 hover:bg-gray-800 hover:text-gray-100 transition-colors cursor-pointer"
          title="Восстановить исходные значения из шаблона"
        >
          Пример
        </button>

        <button
          type="button"
          @click="store.clearAll"
          class="rounded-lg bg-gray-800/80 px-2.5 py-1.5 text-xs font-medium text-gray-400 ring-1 ring-gray-700/50 hover:bg-rose-950/40 hover:text-rose-300 hover:ring-rose-500/30 transition-colors cursor-pointer"
          title="Очистить все поля"
        >
          Очистить
        </button>
      </div>
    </div>

    <!-- Notification message -->
    <div
      v-if="importMessage"
      class="mt-3 rounded-lg bg-indigo-500/15 px-3 py-1.5 text-xs font-medium text-indigo-300 ring-1 ring-indigo-500/30 flex items-center justify-between"
    >
      <span>{{ importMessage }}</span>
      <button @click="importMessage = ''" class="text-indigo-400 hover:text-indigo-200 ml-2">&times;</button>
    </div>


    <!-- Inputs Grid -->
    <div class="mt-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3.5">
      <!-- Gross Revenue -->
      <div class="space-y-1">
        <label class="text-xs font-medium text-gray-300 flex items-center justify-between">
          <span>Общая выручка (с НДС)</span>
          <span class="text-[10px] text-gray-500">тг</span>
        </label>
        <div class="relative">
          <input
            type="number"
            step="any"
            v-model.number="store.grossRevenue"
            class="w-full rounded-lg bg-gray-950/90 py-2 pl-3 pr-3 text-sm font-semibold text-gray-100 ring-1 ring-gray-800 focus:outline-none focus:ring-2 focus:ring-indigo-500/70"
            placeholder="0"
          />
        </div>
        <div class="text-[11px] text-indigo-400/80 font-mono">
          {{ (store.grossRevenue || 0).toLocaleString('ru-RU') }} тг
        </div>
      </div>

      <!-- VAT Rate -->
      <div class="space-y-1">
        <label class="text-xs font-medium text-gray-300 flex items-center justify-between">
          <span>Ставка НДС</span>
          <span class="text-[10px] text-gray-500">%</span>
        </label>
        <div class="relative">
          <input
            type="number"
            step="1"
            min="0"
            max="100"
            v-model.number="store.vatRate"
            class="w-full rounded-lg bg-gray-950/90 py-2 pl-3 pr-8 text-sm font-semibold text-gray-100 ring-1 ring-gray-800 focus:outline-none focus:ring-2 focus:ring-indigo-500/70"
            placeholder="16"
          />
          <span class="absolute right-3 top-2 text-xs font-bold text-gray-500">%</span>
        </div>
        <div class="text-[11px] text-gray-500">
          По умолчанию 16% (как в шаблоне)
        </div>
      </div>

      <!-- Days in Period -->
      <div class="space-y-1">
        <label class="text-xs font-medium text-gray-300 flex items-center justify-between">
          <span>Дней в периоде</span>
          <span class="text-[10px] text-gray-500">дней</span>
        </label>
        <div class="relative">
          <input
            type="number"
            step="1"
            min="1"
            v-model.number="store.daysCount"
            class="w-full rounded-lg bg-gray-950/90 py-2 pl-3 pr-3 text-sm font-semibold text-gray-100 ring-1 ring-gray-800 focus:outline-none focus:ring-2 focus:ring-indigo-500/70"
            placeholder="106"
          />
        </div>
        <div class="text-[11px] text-gray-500">
          Включительно (начало и конец)
        </div>
      </div>

      <!-- Write Off Amount -->
      <div class="space-y-1">
        <label class="text-xs font-medium text-rose-300/90 flex items-center justify-between">
          <span>Сумма списания (расходы)</span>
          <span class="text-[10px] text-rose-400/60">недостача</span>
        </label>
        <div class="relative">
          <input
            type="number"
            step="any"
            v-model.number="store.writeOffAmount"
            class="w-full rounded-lg bg-gray-950/90 py-2 pl-3 pr-3 text-sm font-semibold text-rose-200 ring-1 ring-rose-900/40 focus:outline-none focus:ring-2 focus:ring-rose-500/70"
            placeholder="0"
          />
        </div>
        <div class="text-[11px] text-rose-400/80 font-mono">
          -{{ (store.writeOffAmount || 0).toLocaleString('ru-RU') }} тг
        </div>
      </div>

      <!-- Surplus Amount -->
      <div class="space-y-1">
        <label class="text-xs font-medium text-emerald-300/90 flex items-center justify-between">
          <span>Сумма плюсов (излишки, +)</span>
          <span class="text-[10px] text-emerald-400/60">плюсы</span>
        </label>
        <div class="relative">
          <input
            type="number"
            step="any"
            v-model.number="store.surplusAmount"
            class="w-full rounded-lg bg-gray-950/90 py-2 pl-3 pr-3 text-sm font-semibold text-emerald-200 ring-1 ring-emerald-900/40 focus:outline-none focus:ring-2 focus:ring-emerald-500/70"
            placeholder="0"
          />
        </div>
        <div class="text-[11px] text-emerald-400/80 font-mono">
          +{{ (store.surplusAmount || 0).toLocaleString('ru-RU') }} тг
        </div>
      </div>

      <!-- Net Write-Off Preview -->
      <div class="space-y-1 rounded-lg bg-gray-950/60 p-3 ring-1 ring-gray-800/60 flex flex-col justify-between">
        <div class="flex items-center justify-between text-xs text-gray-400">
          <span>Чистое списание:</span>
          <span class="font-mono text-xs font-bold text-gray-200">
            {{ store.netWriteOff.toLocaleString('ru-RU', { minimumFractionDigits: 0, maximumFractionDigits: 2 }) }} тг
          </span>
        </div>
        <p class="text-[11px] text-gray-500 leading-tight">
          Списание минус плюсы (учитывается при подсчёте итогового процента)
        </p>
      </div>
    </div>
  </div>
</template>
