<script setup lang="ts">
import { ref, computed, onMounted, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useInventoryStore } from '../model/useInventoryStore'
import { formatDateTime, formatDateOnly, formatDateRange } from '@shared/lib/formatDate'
import { withLoading, openRevisionFolder } from '@shared'
import { eventBus } from '@shared/lib/eventBus'
import StoreGeneralTab from './StoreGeneralTab.vue'
import StoreFactTab from './StoreFactTab.vue'
import StoreCatalogTab from './StoreCatalogTab.vue'
import StoreStockTab from './StoreStockTab.vue'
import StoreAccount299Tab from './StoreAccount299Tab.vue'
import StoreMultiplicityTab from './StoreMultiplicityTab.vue'
import QrConnectModal from './modals/QrConnectModal.vue'
import type { InventorySubTab } from '../model/types'
import { useMobileSync } from '../model/useMobileSync'

const route = useRoute()
const router = useRouter()
const store = useInventoryStore()
useMobileSync()

onMounted(async () => {
  await initInventoryPage()
})

const isDeleteRevisionModalOpen = ref(false)
const isQrConnectModalOpen = ref(false)

function openDeleteRevisionModal() {
  isDeleteRevisionModalOpen.value = true
}

async function handleConfirmDeleteRevision() {
  const currentId = store.activeRevision?.id || store.activeStoreNumber
  if (!currentId) return
  isDeleteRevisionModalOpen.value = false

  try {
    await withLoading(
      {
        title: 'Удаление ревизии',
        message: `Удаление базы и файлов магазина №${store.activeStoreNumber}...`,
        details: 'Пожалуйста, подождите, данные удаляются безвозвратно',
        icon: '🗑️',
      },
      async () => {
        await store.deleteRevision(currentId)
      }
    )
    if (store.activeRevisionId) {
      router.push(`/inventory/${store.activeRevisionId}`)
    } else {
      router.push('/inventory')
    }
  } catch (err) {
    console.error('Ошибка удаления ревизии:', err)
  }
}

async function handleToggleArchive(isArchived: boolean) {
  const currentId = store.activeRevision?.id || store.activeStoreNumber
  if (!currentId) return
  try {
    await withLoading(
      {
        title: isArchived ? 'Перемещение в архив' : 'Восстановление из архива',
        message: `Обновление статуса ревизии магазина №${store.activeStoreNumber}...`,
        icon: isArchived ? '🗄️' : '↩️',
      },
      async () => {
        await store.archiveRevision(currentId, isArchived)
      }
    )
  } catch (err) {
    console.error('Ошибка изменения статуса архива:', err)
  }
}

async function handleOpenCurrentFolder() {
  const dirPath = store.activeRevision?.dirPath
  if (dirPath) {
    try {
      await openRevisionFolder(dirPath)
    } catch (err) {
      console.error('Ошибка открытия папки ревизии:', err)
    }
  }
}

function openEditDatesModal() {
  if (!store.activeRevision || store.activeRevision.isArchived) return
  eventBus.emit('revision:edit-dates-requested', {
    id: store.activeRevision.id,
    storeNumber: store.activeRevision.storeNumber,
    startDate: store.activeRevision.startDate || '',
    endDate: store.activeRevision.endDate || '',
  })
}

function copyRevisionUuid(id: string) {
  if (navigator?.clipboard) {
    navigator.clipboard.writeText(id)
    eventBus.emit('app:toast', {
      type: 'success',
      message: `UUID скопирован: ${id}`,
    })
  }
}


watch(
  () => route.query.tab,
  (newTab) => {
    store.error = null
    if (newTab === 'general' || newTab === 'stock' || newTab === 'catalog' || newTab === '299' || newTab === 'multiplicity' || newTab === 'fact') {
      store.setActiveSubTab(newTab as InventorySubTab)
    } else {
      store.setActiveSubTab('fact')
    }
  },
  { immediate: true }
)

watch(
  () => route.params.storeNumber,
  async (newStoreNumber) => {
    if (store.revisions.length === 0) {
      await store.loadRevisions()
    }
    if (newStoreNumber) {
      store.setActiveStoreNumber(newStoreNumber as string)
      await loadStoreDataWithFeedback(newStoreNumber as string)
    } else {
      await initInventoryPage()
    }
  }
)

async function loadStoreDataWithFeedback(storeNum: string) {
  await withLoading(
    {
      title: `Магазин №${storeNum}`,
      message: 'Загрузка фактической ревизии, каталога и остатков...',
      details: 'Пожалуйста, подождите, данные загружаются из базы',
      icon: '🏪',
    },
    async () => {
      await store.loadAllStoreData()
    }
  )
}

async function initInventoryPage() {
  await store.loadRevisions()

  const routeParam = route.params.storeNumber as string
  if (routeParam) {
    store.setActiveStoreNumber(routeParam)
  } else if (store.activeRevisionId) {
    router.replace(`/inventory/${store.activeRevisionId}`)
    return
  } else if (store.revisions.length > 0) {
    const firstRev = store.revisions[0]
    store.setActiveRevisionId(firstRev.id)
    router.replace(`/inventory/${firstRev.id}`)
    return
  }

  if (store.activeRevisionId || store.activeStoreNumber) {
    await loadStoreDataWithFeedback(store.activeStoreNumber || '')
  }
}
</script>

<template>
  <div class="space-y-4">
    <!-- Revision Not Found State -->
    <div
      v-if="!store.activeRevision && !store.isLoading"
      class="flex flex-col items-center justify-center rounded-2xl border border-gray-800/80 bg-gray-900/30 p-12 text-center"
    >
      <div class="text-4xl mb-3">🏪</div>
      <h3 class="text-base font-medium text-gray-200">Ревизия не найдена</h3>
      <p class="mt-1 text-xs text-gray-500 max-w-sm">
        Выберите существующую ревизию в боковом меню или создайте новую инвентаризацию для магазина.
      </p>
      <router-link
        to="/inventory"
        class="mt-4 inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 px-4 py-2 text-xs font-medium text-white shadow-lg shadow-indigo-600/25 hover:bg-indigo-500 transition-all cursor-pointer"
      >
        <span>←</span>
        <span>К списку ревизий</span>
      </router-link>
    </div>

    <template v-else>
      <!-- Top Store Info Bar with Dates & Actions -->
      <div class="flex flex-wrap items-center justify-between gap-3 border-b border-gray-800/80 pb-4">
        <div class="flex flex-wrap items-center gap-3">
          <h2 class="text-xl font-bold tracking-tight text-white flex items-center gap-2">
            <span>Магазин №{{ store.activeStoreNumber }}</span>
          </h2>
          <span
            class="flex items-center gap-1.5 rounded-md px-2.5 py-0.5 text-xs font-medium"
            :class="
              store.activeRevision?.isArchived
                ? 'bg-amber-500/10 text-amber-400 ring-1 ring-amber-500/20'
                : 'bg-emerald-500/10 text-emerald-400 ring-1 ring-emerald-500/20'
            "
          >
            <span class="h-1.5 w-1.5 rounded-full" :class="store.activeRevision?.isArchived ? 'bg-amber-400' : 'bg-emerald-400'" />
            <span>{{ store.activeRevision?.isArchived ? 'Архивная ревизия' : 'Активная ревизия' }}</span>
          </span>
          <!-- Read-only Date for Archived Revision -->
          <span
            v-if="store.activeRevision?.isArchived && store.activeRevision?.startDate && store.activeRevision?.endDate"
            class="flex items-center gap-1.5 rounded-md bg-amber-500/10 px-2.5 py-0.5 text-xs text-amber-400 ring-1 ring-amber-500/20"
            title="Период проведения ревизии"
          >
            <span>📅</span>
            <span>Период: с {{ formatDateOnly(store.activeRevision.startDate) }} по {{ formatDateOnly(store.activeRevision.endDate) }}</span>
          </span>

          <!-- Clickable Date for Active Revision -->
          <button
            v-else-if="store.activeRevision?.startDate && store.activeRevision?.endDate"
            type="button"
            @click="openEditDatesModal"
            class="flex items-center gap-1.5 rounded-md bg-indigo-500/10 px-2.5 py-0.5 text-xs text-indigo-300 ring-1 ring-indigo-500/20 hover:bg-indigo-500/20 hover:text-indigo-200 transition-colors cursor-pointer group/date"
            title="Нажмите, чтобы изменить даты проведения ревизии"
          >
            <span>📅</span>
            <span>Период: с {{ formatDateOnly(store.activeRevision.startDate) }} по {{ formatDateOnly(store.activeRevision.endDate) }}</span>
            <span class="text-[10px] text-indigo-400 opacity-60 group-hover/date:opacity-100 transition-opacity">✏️</span>
          </button>
          <span
            v-if="store.activeRevision?.createdAt"
            class="flex items-center gap-1.5 rounded-md bg-gray-900/80 px-2.5 py-0.5 text-xs text-gray-400 ring-1 ring-gray-800"
            title="Дата и время создания ревизии"
          >
            <span class="text-gray-500">🕒</span>
            <span>Создана: {{ formatDateTime(store.activeRevision.createdAt) }}</span>
          </span>

          <!-- Revision UUID Badge with copy -->
          <button
            v-if="store.activeRevision?.id"
            type="button"
            @click="copyRevisionUuid(store.activeRevision.id)"
            class="flex items-center gap-1.5 rounded-md bg-gray-900/80 px-2.5 py-0.5 text-xs text-gray-400 ring-1 ring-gray-800 font-mono hover:text-indigo-300 hover:ring-indigo-500/40 transition-colors cursor-pointer group"
            title="Нажмите, чтобы скопировать UUID ревизии"
          >
            <span class="text-gray-500 group-hover:text-indigo-400 transition-colors text-[10px]">🔑</span>
            <span>UUID: {{ store.activeRevision.id }}</span>
            <span class="text-[10px] opacity-0 group-hover:opacity-100 text-indigo-400 transition-opacity ml-0.5">📋</span>
          </button>
        </div>

        <div class="flex items-center gap-2">
          <!-- Mobile Phone Scanner Button -->
          <button
            v-if="!store.activeRevision?.isArchived && store.activeRevision?.dirPath"
            type="button"
            @click="isQrConnectModalOpen = true"
            class="flex items-center gap-1.5 rounded-lg bg-indigo-600/20 px-3 py-1.5 text-xs font-semibold text-indigo-300 ring-1 ring-indigo-500/40 transition-all duration-150 hover:bg-indigo-600 hover:text-white hover:ring-indigo-400 cursor-pointer shadow-sm shadow-indigo-950/30"
            title="Подключить телефон по QR-коду для сканирования штрихкодов"
          >
            <span>📱</span>
            <span>Сканер с телефона</span>
          </button>

          <!-- Open Folder Button -->
          <button
            v-if="store.activeRevision?.dirPath"
            @click="handleOpenCurrentFolder"
            class="flex items-center gap-1.5 rounded-lg bg-gray-800/80 px-3 py-1.5 text-xs font-medium text-gray-300 ring-1 ring-gray-700/60 transition-all duration-150 hover:bg-gray-800 hover:text-gray-100 hover:ring-gray-600 cursor-pointer"
            title="Открыть рабочую папку ревизии в Проводнике Windows"
          >
            <span>📁</span>
            <span>Папка ревизии</span>
          </button>

          <!-- Toggle Archive Button -->
          <button
            v-if="store.activeRevision?.isArchived"
            @click="handleToggleArchive(false)"
            class="flex items-center gap-1.5 rounded-lg bg-indigo-500/10 px-3 py-1.5 text-xs font-medium text-indigo-300 ring-1 ring-indigo-500/20 transition-all duration-150 hover:bg-indigo-500/20 hover:text-indigo-200 hover:ring-indigo-500/40 cursor-pointer"
            title="Вернуть ревизию из архива в активные"
          >
            <span>↩️</span>
            <span>Вернуть из архива</span>
          </button>
          <button
            v-else
            @click="handleToggleArchive(true)"
            class="flex items-center gap-1.5 rounded-lg bg-amber-500/10 px-3 py-1.5 text-xs font-medium text-amber-300 ring-1 ring-amber-500/20 transition-all duration-150 hover:bg-amber-500/20 hover:text-amber-200 hover:ring-amber-500/40 cursor-pointer"
            title="Переместить ревизию в архив"
          >
            <span>🗄️</span>
            <span>В архив</span>
          </button>

          <!-- Delete Button (Only for active non-archived revisions) -->
          <button
            v-if="!store.activeRevision?.isArchived"
            @click="openDeleteRevisionModal"
            class="flex items-center gap-1.5 rounded-lg bg-red-500/10 px-3 py-1.5 text-xs font-medium text-red-400 ring-1 ring-red-500/20 transition-all duration-150 hover:bg-red-500/20 hover:text-red-300 hover:ring-red-500/40 cursor-pointer"
            title="Удалить открытую ревизию"
          >
            <svg class="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <polyline points="3 6 5 6 21 6" />
              <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
              <line x1="10" y1="11" x2="10" y2="17" />
              <line x1="14" y1="11" x2="14" y2="17" />
            </svg>
            <span>Удалить ревизию</span>
          </button>
        </div>
      </div>

      <!-- Frozen Archive Banner -->
      <div
        v-if="store.activeRevision?.isArchived"
        class="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-amber-500/10 border border-amber-500/30 px-4 py-3 text-sm text-amber-200"
      >
        <div class="flex items-center gap-3">
          <span class="text-xl">🔒</span>
          <div>
            <p class="font-medium text-amber-300">Ревизия заморожена в архиве (режим только для чтения)</p>
            <p class="text-xs text-amber-400/80 mt-0.5">В архивной ревизии нельзя добавлять, изменять или удалять позиции и списки. Чтобы внести изменения или удалить ревизию, верните её из архива.</p>
          </div>
        </div>
        <button
          @click="handleToggleArchive(false)"
          class="shrink-0 flex items-center gap-1.5 rounded-lg bg-amber-500/20 hover:bg-amber-500/30 text-amber-200 px-3.5 py-1.5 text-xs font-semibold border border-amber-500/40 transition-colors cursor-pointer"
        >
          <span>↩️</span>
          <span>Вернуть из архива</span>
        </button>
      </div>

      <!-- Global Error Banner -->
      <div
        v-if="store.error"
        class="flex items-center justify-between gap-3 rounded-xl bg-red-500/10 p-4 text-sm text-red-400 ring-1 ring-red-500/20"
      >
        <div class="flex items-center gap-2">
          <span>⚠️</span>
          <span>{{ store.error }}</span>
        </div>
        <button
          @click="store.error = null"
          class="text-red-400 hover:text-red-300 transition-colors text-base font-bold cursor-pointer px-1"
          title="Закрыть уведомление"
        >
          &times;
        </button>
      </div>


      <!-- Tab Views with KeepAlive for instantaneous switching -->
      <KeepAlive>
        <StoreGeneralTab v-if="store.activeSubTab === 'general'" key="general" />
        <StoreFactTab v-else-if="store.activeSubTab === 'fact'" key="fact" />
        <StoreStockTab v-else-if="store.activeSubTab === 'stock'" key="stock" />
        <StoreCatalogTab v-else-if="store.activeSubTab === 'catalog'" key="catalog" />
        <StoreAccount299Tab v-else-if="store.activeSubTab === '299'" key="299" />
        <StoreMultiplicityTab v-else-if="store.activeSubTab === 'multiplicity'" key="multiplicity" />
      </KeepAlive>

      <!-- Delete Revision Confirmation Modal -->
      <div
        v-if="isDeleteRevisionModalOpen"
        class="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4"
        @click.self="isDeleteRevisionModalOpen = false"
      >
        <div
          class="w-full max-w-md rounded-2xl border border-gray-800 bg-gray-950 p-6 shadow-2xl transition-all duration-300"
        >
          <!-- Modal Header -->
          <div class="flex items-center gap-3 border-b border-gray-800 pb-4">
            <div class="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-red-500/10 text-red-400 ring-1 ring-red-500/20">
              <svg class="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
                <line x1="12" y1="9" x2="12" y2="13" />
                <line x1="12" y1="17" x2="12.01" y2="17" />
              </svg>
            </div>
            <div>
              <h3 class="text-base font-semibold text-gray-100">
                Удаление ревизии
              </h3>
              <p class="text-xs text-gray-400">
                Подтверждение удаления
              </p>
            </div>
          </div>

          <!-- Modal Body -->
          <div class="mt-4">
            <p class="text-sm text-gray-300">
              Вы действительно хотите удалить ревизию магазина
              <span class="font-semibold text-white">№{{ store.activeStoreNumber }}</span>
              <span v-if="store.activeRevision?.startDate && store.activeRevision?.endDate" class="text-gray-400">
                (период: {{ formatDateRange(store.activeRevision.startDate, store.activeRevision.endDate) }})
              </span>?
            </p>
            <p class="mt-2 text-xs text-red-400/90">
              Внимание: все товары ({{ store.items.length }} поз.) и данные этой ревизии будут удалены без возможности восстановления.
            </p>
          </div>

          <!-- Modal Footer -->
          <div class="mt-6 flex justify-end gap-3 border-t border-gray-800 pt-4">
            <button
              type="button"
              @click="isDeleteRevisionModalOpen = false"
              class="rounded-lg bg-gray-800 px-4 py-2 text-xs font-medium text-gray-300 hover:bg-gray-700 transition-colors cursor-pointer"
            >
              Отмена
            </button>
            <button
              type="button"
              @click="handleConfirmDeleteRevision"
              class="flex items-center gap-1.5 rounded-lg bg-red-600 px-4 py-2 text-xs font-medium text-white shadow-lg shadow-red-600/20 hover:bg-red-500 transition-colors cursor-pointer"
            >
              <svg class="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <polyline points="3 6 5 6 21 6" />
                <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
              </svg>
              <span>Удалить ревизию</span>
            </button>
          </div>
        </div>
      </div>

      <!-- QR Connect Mobile Modal -->
      <QrConnectModal
        :is-open="isQrConnectModalOpen"
        :revision-id="store.activeRevision?.id || ''"
        :store-number="store.activeStoreNumber || ''"
        :dir-path="store.activeRevision?.dirPath || ''"
        @close="isQrConnectModalOpen = false"
      />
    </template>
  </div>
</template>
