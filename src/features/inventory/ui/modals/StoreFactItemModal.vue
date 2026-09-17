<script setup lang="ts">
export interface FactModalFormData {
  sku: string
  name: string
  quantity: number
  unit: string
  location: string
  boxNumber: string
}

export interface FactModalErrors {
  sku: string
  name: string
  quantity: string
}

interface Props {
  isOpen: boolean
  mode: 'add' | 'edit'
  form: FactModalFormData
  errors: FactModalErrors
}

const props = defineProps<Props>()

const emit = defineEmits<{
  (e: 'close'): void
  (e: 'save'): void
  (e: 'generateSku'): void
}>()
</script>

<template>
  <div
    v-if="isOpen"
    class="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4"
    @click.self="emit('close')"
  >
    <div
      class="w-full max-w-lg rounded-2xl border border-gray-800 bg-gray-950 p-6 shadow-2xl transition-all duration-300"
    >
      <!-- Modal Header -->
      <div class="flex items-center justify-between border-b border-gray-800 pb-4">
        <h3 class="text-lg font-semibold text-gray-100">
          {{ mode === 'add' ? 'Добавить позицию' : 'Редактировать позицию' }}
        </h3>
        <button
          type="button"
          @click="emit('close')"
          class="text-gray-500 hover:text-gray-300 transition-colors text-lg font-bold cursor-pointer"
        >
          &times;
        </button>
      </div>

      <!-- Modal Body (Form) -->
      <form @submit.prevent="emit('save')" class="mt-4 space-y-4">
        <!-- SKU -->
        <div>
          <label class="block text-xs font-medium text-gray-400">Артикул (ЛК) *</label>
          <div class="mt-1 flex gap-2">
            <input
              v-model="form.sku"
              type="text"
              inputmode="numeric"
              maxlength="7"
              @input="form.sku = form.sku.replace(/\D/g, '').slice(0, 7)"
              class="flex-1 rounded-lg bg-gray-900 px-3 py-2 text-sm text-gray-200 ring-1 ring-gray-800 focus:outline-none focus:ring-1 focus:ring-indigo-500/50 font-mono"
              placeholder="1000001"
            />
            <button
              type="button"
              @click="emit('generateSku')"
              class="rounded-lg bg-gray-800 px-3 py-2 text-xs font-medium text-gray-300 hover:bg-gray-700 transition-colors cursor-pointer"
            >
              🎲 Сгенерировать
            </button>
          </div>
          <p v-if="errors.sku" class="mt-1 text-xs text-red-400">{{ errors.sku }}</p>
        </div>

        <!-- Name -->
        <div>
          <label class="block text-xs font-medium text-gray-400">Наименование товара</label>
          <input
            v-model="form.name"
            type="text"
            class="mt-1 w-full rounded-lg bg-gray-900 px-3 py-2 text-sm text-gray-200 ring-1 ring-gray-800 focus:outline-none focus:ring-1 focus:ring-indigo-500/50"
            placeholder="Наименование подтянется из каталога автоматически"
          />
          <p v-if="errors.name" class="mt-1 text-xs text-red-400">{{ errors.name }}</p>
        </div>

        <!-- Quantity & Unit -->
        <div class="grid grid-cols-2 gap-4">
          <div>
            <label class="block text-xs font-medium text-gray-400">Количество *</label>
            <input
              v-model.number="form.quantity"
              type="number"
              min="0"
              step="any"
              class="mt-1 w-full rounded-lg bg-gray-900 px-3 py-2 text-sm text-gray-200 ring-1 ring-gray-800 focus:outline-none focus:ring-1 focus:ring-indigo-500/50"
            />
            <p v-if="errors.quantity" class="mt-1 text-xs text-red-400">{{ errors.quantity }}</p>
          </div>
          <div>
            <label class="block text-xs font-medium text-gray-400">Единица измерения</label>
            <input
              v-model="form.unit"
              type="text"
              class="mt-1 w-full rounded-lg bg-gray-900 px-3 py-2 text-sm text-gray-200 ring-1 ring-gray-800 focus:outline-none focus:ring-1 focus:ring-indigo-500/50"
              placeholder="шт."
            />
          </div>
        </div>

        <!-- Location -->
        <div>
          <label class="block text-xs font-medium text-gray-400">Локация / Зона хранения</label>
          <input
            v-model="form.location"
            type="text"
            class="mt-1 w-full rounded-lg bg-gray-900 px-3 py-2 text-sm text-gray-200 ring-1 ring-gray-800 focus:outline-none focus:ring-1 focus:ring-indigo-500/50"
            placeholder="Стеллаж 1-A"
          />
        </div>

        <!-- Box Number -->
        <div>
          <label class="block text-xs font-medium text-gray-400">Номер коробки</label>
          <input
            v-model="form.boxNumber"
            type="text"
            class="mt-1 w-full rounded-lg bg-gray-900 px-3 py-2 text-sm text-gray-200 ring-1 ring-gray-800 focus:outline-none focus:ring-1 focus:ring-indigo-500/50"
            placeholder="№ коробки"
          />
        </div>

        <!-- Modal Footer -->
        <div class="flex justify-end gap-3 border-t border-gray-800 pt-4">
          <button
            type="button"
            @click="emit('close')"
            class="rounded-lg bg-gray-800 px-4 py-2 text-sm font-medium text-gray-300 hover:bg-gray-700 transition-colors cursor-pointer"
          >
            Отмена
          </button>
          <button
            type="submit"
            class="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white shadow-lg shadow-indigo-600/25 hover:bg-indigo-500 transition-colors cursor-pointer"
          >
            {{ mode === 'add' ? 'Добавить' : 'Сохранить' }}
          </button>
        </div>
      </form>
    </div>
  </div>
</template>
