<script setup lang="ts">
import { ref, onMounted, onUnmounted, watch } from 'vue'
import { useRouter } from 'vue-router'
import AppSidebar from './AppSidebar.vue'
import AppHeader from './AppHeader.vue'
import ToastContainer from './ToastContainer.vue'
import GlobalLoadingOverlay from './GlobalLoadingOverlay.vue'
import { withLoading } from '@shared/lib/loadingService'
import { eventBus } from '@shared/lib/eventBus'
import { useInventoryStore } from '../../features/inventory/model/useInventoryStore'
import { getTodayIsoDate } from '@shared/lib/formatDate'

const router = useRouter()
const inventoryStore = useInventoryStore()

const isModalOpen = ref(false)
const storeNumberInput = ref('')
const startDateInput = ref('')
const endDateInput = ref('')
const errorText = ref('')

function openModal() {
  const today = getTodayIsoDate()
  storeNumberInput.value = ''
  startDateInput.value = today
  
  // Ревизии проходят в ночь: по умолчанию ставим 1 ночь (с сегодня по завтра)
  const [y, m, d] = today.split('-').map(Number)
  const tomorrow = new Date(y, m - 1, d + 1)
  const nextY = tomorrow.getFullYear()
  const nextM = String(tomorrow.getMonth() + 1).padStart(2, '0')
  const nextD = String(tomorrow.getDate()).padStart(2, '0')
  endDateInput.value = `${nextY}-${nextM}-${nextD}`

  errorText.value = ''
  isModalOpen.value = true
}

function closeModal() {
  isModalOpen.value = false
}

// Автоматическая корректировка даты окончания, если дата начала позже
watch(startDateInput, (newStart) => {
  if (newStart && endDateInput.value && endDateInput.value < newStart) {
    endDateInput.value = newStart
  }
})

function setQuickNights(nights: number) {
  if (!startDateInput.value) {
    startDateInput.value = getTodayIsoDate()
  }
  const [y, m, d] = startDateInput.value.split('-').map(Number)
  const target = new Date(y, m - 1, d + nights)
  const targetY = target.getFullYear()
  const targetM = String(target.getMonth() + 1).padStart(2, '0')
  const targetD = String(target.getDate()).padStart(2, '0')
  endDateInput.value = `${targetY}-${targetM}-${targetD}`
}


async function handleCreateRevision() {
  const storeNum = storeNumberInput.value.trim()
  const start = startDateInput.value.trim()
  const end = endDateInput.value.trim()
  
  if (!storeNum) {
    errorText.value = 'Введите номер или название магазина'
    return
  }

  if (!start || !end) {
    errorText.value = 'Укажите даты начала и окончания ревизии'
    return
  }

  if (start > end) {
    errorText.value = 'Дата окончания не может быть раньше даты начала'
    return
  }

  try {
    const newRevId = await withLoading(
      {
        title: 'Создание ревизии',
        message: `Создание файловой базы для магазина №${storeNum}...`,
        details: 'Пожалуйста, подождите, настраивается структура данных ревизии',
        icon: '📋',
      },
      async () => {
        return await inventoryStore.createRevision({
          storeNumber: storeNum,
          startDate: start,
          endDate: end,
        })
      }
    )
    closeModal()
    
    // Переходим на страницу созданной ревизии
    if (newRevId) {
      inventoryStore.setActiveRevisionId(newRevId)
      router.push(`/inventory/${newRevId}`)
    }
  } catch (err) {
    errorText.value = err instanceof Error ? err.message : 'Ошибка при создании'
  }
}

// Edit Revision Dates Modal State
const isEditDatesModalOpen = ref(false)
const editDatesRevisionId = ref('')
const editDatesStoreNumber = ref('')
const editStartDateInput = ref('')
const editEndDateInput = ref('')
const editDatesError = ref('')

function openEditDatesModal(payload: { id: string; storeNumber: string; startDate: string; endDate: string }) {
  editDatesRevisionId.value = payload.id
  editDatesStoreNumber.value = payload.storeNumber
  editStartDateInput.value = payload.startDate || getTodayIsoDate()
  editEndDateInput.value = payload.endDate || payload.startDate || getTodayIsoDate()
  editDatesError.value = ''
  isEditDatesModalOpen.value = true
}

function closeEditDatesModal() {
  isEditDatesModalOpen.value = false
}

function setEditQuickNights(nights: number) {
  if (!editStartDateInput.value) {
    editStartDateInput.value = getTodayIsoDate()
  }
  const [y, m, d] = editStartDateInput.value.split('-').map(Number)
  const target = new Date(y, m - 1, d + nights)
  const targetY = target.getFullYear()
  const targetM = String(target.getMonth() + 1).padStart(2, '0')
  const targetD = String(target.getDate()).padStart(2, '0')
  editEndDateInput.value = `${targetY}-${targetM}-${targetD}`
}

async function handleSaveRevisionDates() {
  const start = editStartDateInput.value.trim()
  const end = editEndDateInput.value.trim()

  if (!start || !end) {
    editDatesError.value = 'Укажите даты начала и окончания ревизии'
    return
  }

  if (start > end) {
    editDatesError.value = 'Дата окончания не может быть раньше даты начала'
    return
  }

  try {
    await withLoading(
      {
        title: 'Обновление дат',
        message: `Сохранение нового периода проведения ревизии...`,
        icon: '📅',
      },
      async () => {
        await inventoryStore.updateRevisionDates(editDatesRevisionId.value, start, end)
      }
    )
    closeEditDatesModal()
  } catch (err: any) {
    console.error('[MainLayout] Ошибка сохранения дат:', err)
    editDatesError.value = typeof err === 'string' ? err : (err?.message || 'Ошибка при сохранении дат')
  }
}

onMounted(() => {
  eventBus.on('revision:create-requested', openModal)
  eventBus.on('revision:edit-dates-requested', openEditDatesModal)
})

onUnmounted(() => {
  eventBus.off('revision:create-requested', openModal)
  eventBus.off('revision:edit-dates-requested', openEditDatesModal)
})
</script>

<template>
  <div class="flex h-screen w-screen overflow-hidden">
    <!-- Sidebar -->
    <AppSidebar />

    <!-- Main content area -->
    <div class="flex flex-1 flex-col overflow-hidden">
      <AppHeader />

      <main class="flex-1 overflow-y-auto p-3 sm:p-4 lg:p-5" :style="{ backgroundColor: 'var(--rev-surface-main)' }">
        <router-view v-slot="{ Component, route }">
          <transition name="page-fade" mode="out-in">
            <component :is="Component" :key="route.path" />
          </transition>
        </router-view>
      </main>
    </div>

    <!-- Global New Revision Modal -->
    <div
      v-if="isModalOpen"
      class="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4"
      @click.self="closeModal"
    >
      <div
        class="w-full max-w-md rounded-2xl border border-gray-800 bg-gray-950 p-6 shadow-2xl transition-all duration-300"
      >
        <!-- Header -->
        <div class="flex items-center justify-between border-b border-gray-800 pb-4">
          <h3 class="text-base font-semibold text-gray-100 flex items-center gap-2">
            <span>📋</span> Новая ревизия
          </h3>
          <button
            @click="closeModal"
            class="text-gray-500 hover:text-gray-300 transition-colors text-lg font-bold cursor-pointer"
          >
            &times;
          </button>
        </div>

        <!-- Body -->
        <form @submit.prevent="handleCreateRevision" class="mt-4 space-y-4">
          <div>
            <label class="block text-xs font-medium text-gray-300">Номер или название магазина *</label>
            <input
              v-model="storeNumberInput"
              type="text"
              class="mt-1.5 w-full rounded-lg bg-gray-900 px-3 py-2 text-sm text-gray-200 ring-1 ring-gray-800 focus:outline-none focus:ring-1 focus:ring-indigo-500/50 placeholder:text-gray-600"
              placeholder="Например, 105, 201-A, Центральный"
              autofocus
            />
          </div>

          <!-- Date Range Inputs -->
          <div class="space-y-2 pt-1">
            <label class="block text-xs font-medium text-gray-300">
              Период проведения ревизии *
            </label>
            <div class="grid grid-cols-2 gap-3">
              <div>
                <span class="block text-[11px] text-gray-400 mb-1">С (дата начала)</span>
                <input
                  v-model="startDateInput"
                  type="date"
                  class="w-full rounded-lg bg-gray-900 px-3 py-2 text-xs text-gray-200 ring-1 ring-gray-800 focus:outline-none focus:ring-1 focus:ring-indigo-500/50"
                />
              </div>
              <div>
                <span class="block text-[11px] text-gray-400 mb-1">По (дата окончания)</span>
                <input
                  v-model="endDateInput"
                  type="date"
                  class="w-full rounded-lg bg-gray-900 px-3 py-2 text-xs text-gray-200 ring-1 ring-gray-800 focus:outline-none focus:ring-1 focus:ring-indigo-500/50"
                />
              </div>
            </div>

            <!-- Quick duration presets (Night revisions) -->
            <div class="flex items-center gap-2 pt-1">
              <span class="text-[10px] text-gray-400 font-medium">Быстрый выбор:</span>
              <button
                type="button"
                @click="setQuickNights(1)"
                class="rounded-md bg-indigo-500/15 px-2.5 py-1 text-[11px] font-semibold text-indigo-300 ring-1 ring-indigo-500/30 hover:bg-indigo-500/25 transition-colors cursor-pointer flex items-center gap-1.5"
                title="1 ночь: с установленной даты начала на следующий день (+1 день)"
              >
                <span>🌙</span> 1 ночь
              </button>
            </div>


          </div>

          <!-- Error message -->
          <div v-if="errorText" class="rounded-lg bg-red-500/10 p-2.5 text-xs text-red-400 ring-1 ring-red-500/20">
            {{ errorText }}
          </div>

          <!-- Footer -->
          <div class="flex justify-end gap-3 border-t border-gray-800 pt-4 mt-6">
            <button
              type="button"
              @click="closeModal"
              class="rounded-lg bg-gray-800 px-4 py-2 text-xs font-medium text-gray-300 hover:bg-gray-700 transition-colors cursor-pointer"
            >
              Отмена
            </button>
            <button
              type="submit"
              class="rounded-lg bg-indigo-600 px-4 py-2 text-xs font-medium text-white hover:bg-indigo-500 transition-colors shadow-lg shadow-indigo-600/10 cursor-pointer"
            >
              Создать ревизию
            </button>
          </div>
        </form>
      </div>
    </div>

    <!-- Global Edit Revision Dates Modal -->
    <div
      v-if="isEditDatesModalOpen"
      class="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4"
      @click.self="closeEditDatesModal"
    >
      <div
        class="w-full max-w-md rounded-2xl border border-gray-800 bg-gray-950 p-6 shadow-2xl transition-all duration-300"
      >
        <!-- Header -->
        <div class="flex items-center justify-between border-b border-gray-800 pb-4">
          <h3 class="text-base font-semibold text-gray-100 flex items-center gap-2">
            <span>📅</span> Изменение периода ревизии
          </h3>
          <button
            @click="closeEditDatesModal"
            class="text-gray-500 hover:text-gray-300 transition-colors text-lg font-bold cursor-pointer"
          >
            &times;
          </button>
        </div>

        <!-- Body -->
        <form @submit.prevent="handleSaveRevisionDates" class="mt-4 space-y-4">
          <div>
            <label class="block text-xs font-medium text-gray-400">Магазин</label>
            <div class="mt-1.5 w-full rounded-lg bg-gray-900/60 px-3 py-2 text-sm font-semibold text-gray-200 ring-1 ring-gray-800">
              Магазин №{{ editDatesStoreNumber }}
            </div>
          </div>

          <!-- Date Range Inputs -->
          <div class="space-y-2 pt-1">
            <label class="block text-xs font-medium text-gray-300">
              Новый период проведения ревизии *
            </label>
            <div class="grid grid-cols-2 gap-3">
              <div>
                <span class="block text-[11px] text-gray-400 mb-1">С (дата начала)</span>
                <input
                  v-model="editStartDateInput"
                  type="date"
                  class="w-full rounded-lg bg-gray-900 px-3 py-2 text-xs text-gray-200 ring-1 ring-gray-800 focus:outline-none focus:ring-1 focus:ring-indigo-500/50"
                  required
                />
              </div>
              <div>
                <span class="block text-[11px] text-gray-400 mb-1">По (дата окончания)</span>
                <input
                  v-model="editEndDateInput"
                  type="date"
                  class="w-full rounded-lg bg-gray-900 px-3 py-2 text-xs text-gray-200 ring-1 ring-gray-800 focus:outline-none focus:ring-1 focus:ring-indigo-500/50"
                  required
                />
              </div>
            </div>

            <!-- Quick duration presets (Night revisions) -->
            <div class="flex items-center gap-2 pt-1">
              <span class="text-[10px] text-gray-400 font-medium">Быстрый выбор:</span>
              <button
                type="button"
                @click="setEditQuickNights(1)"
                class="rounded-md bg-indigo-500/15 px-2.5 py-1 text-[11px] font-semibold text-indigo-300 ring-1 ring-indigo-500/30 hover:bg-indigo-500/25 transition-colors cursor-pointer flex items-center gap-1.5"
                title="1 ночь: с установленной даты начала на следующий день (+1 день)"
              >
                <span>🌙</span> 1 ночь
              </button>
            </div>
          </div>

          <!-- Error message -->
          <div v-if="editDatesError" class="rounded-lg bg-red-500/10 p-2.5 text-xs text-red-400 ring-1 ring-red-500/20">
            {{ editDatesError }}
          </div>

          <!-- Footer -->
          <div class="flex justify-end gap-3 border-t border-gray-800 pt-4 mt-6">
            <button
              type="button"
              @click="closeEditDatesModal"
              class="rounded-lg bg-gray-800 px-4 py-2 text-xs font-medium text-gray-300 hover:bg-gray-700 transition-colors cursor-pointer"
            >
              Отмена
            </button>
            <button
              type="submit"
              class="rounded-lg bg-indigo-600 px-4 py-2 text-xs font-medium text-white hover:bg-indigo-500 transition-colors shadow-lg shadow-indigo-600/10 cursor-pointer"
            >
              Сохранить даты
            </button>
          </div>
        </form>
      </div>
    </div>

    <!-- Global Toast Container -->
    <ToastContainer />

    <!-- Unified Global Loading Overlay -->
    <GlobalLoadingOverlay />
  </div>
</template>

<style scoped>
.page-fade-enter-active,
.page-fade-leave-active {
  transition: opacity 0.15s ease, transform 0.15s ease;
}

.page-fade-enter-from {
  opacity: 0;
  transform: translateY(6px);
}

.page-fade-leave-to {
  opacity: 0;
  transform: translateY(-4px);
}
</style>
