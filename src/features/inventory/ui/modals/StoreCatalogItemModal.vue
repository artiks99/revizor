<script setup lang="ts">
import type { StoreCatalogItem } from '../../model/types'

interface EditForm {
  sku: string
  name: string
  barcode: string
}

interface Props {
  editingItem: StoreCatalogItem | null
  editForm: EditForm
}

defineProps<Props>()

const emit = defineEmits<{
  (e: 'close'): void
  (e: 'save'): void
}>()
</script>

<template>
  <div
    v-if="editingItem"
    class="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-xs p-4"
    @click.self="emit('close')"
  >
    <div class="w-full max-w-md rounded-2xl border border-gray-800 bg-gray-950 p-6 shadow-2xl space-y-4">
      <div class="flex items-center justify-between border-b border-gray-800 pb-3">
        <div class="flex items-center gap-2">
          <span class="text-indigo-400 text-lg">✎</span>
          <h3 class="text-base font-semibold text-gray-100">Редактирование товара</h3>
        </div>
        <button
          type="button"
          @click="emit('close')"
          class="text-gray-500 hover:text-gray-300 text-xl font-bold cursor-pointer"
        >
          &times;
        </button>
      </div>

      <div class="space-y-3 text-xs">
        <div>
          <label class="block text-gray-400 mb-1 font-medium">ЛК (Артикул) *</label>
          <input
            v-model="editForm.sku"
            type="text"
            class="w-full rounded-lg bg-gray-900 px-3 py-2 text-sm text-gray-200 ring-1 ring-gray-800 focus:outline-none focus:ring-1 focus:ring-indigo-500 font-mono"
            placeholder="7 цифр"
          />
        </div>
        <div>
          <label class="block text-gray-400 mb-1 font-medium">Наименование товара *</label>
          <input
            v-model="editForm.name"
            type="text"
            @keydown.enter="emit('save')"
            class="w-full rounded-lg bg-gray-900 px-3 py-2 text-sm text-gray-200 ring-1 ring-gray-800 focus:outline-none focus:ring-1 focus:ring-indigo-500"
            placeholder="Введите новое наименование…"
          />
        </div>
        <div>
          <label class="block text-gray-400 mb-1 font-medium">Штрихкод</label>
          <input
            v-model="editForm.barcode"
            type="text"
            @keydown.enter="emit('save')"
            class="w-full rounded-lg bg-gray-900 px-3 py-2 text-sm text-gray-200 ring-1 ring-gray-800 focus:outline-none focus:ring-1 focus:ring-indigo-500 font-mono"
            placeholder="EAN-13 / EAN-8…"
          />
        </div>
        <p class="text-[11px] text-gray-400 leading-relaxed bg-indigo-500/10 border border-indigo-500/20 rounded-lg p-2.5">
          💡 Изменение наименования в каталоге автоматически обновит название товара во всех разделах (Счет 299, Фактическая ревизия, Остатки).
        </p>
      </div>

      <div class="flex justify-end gap-2 border-t border-gray-800 pt-3">
        <button
          type="button"
          @click="emit('close')"
          class="rounded-lg bg-gray-800 px-3.5 py-1.5 text-xs text-gray-300 hover:bg-gray-700 cursor-pointer"
        >
          Отмена
        </button>
        <button
          type="button"
          @click="emit('save')"
          :disabled="!editForm.name.trim() || !editForm.sku.trim()"
          class="rounded-lg bg-indigo-600 px-4 py-1.5 text-xs font-semibold text-white hover:bg-indigo-500 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer shadow-lg shadow-indigo-600/30 transition-all"
        >
          Сохранить
        </button>
      </div>
    </div>
  </div>
</template>
