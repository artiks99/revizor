<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { features } from '@features/registry'
import { useInventoryStore } from '../../features/inventory/model/useInventoryStore'
import { eventBus } from '@shared/lib/eventBus'
import { formatDateRange, formatDateShort } from '@shared/lib/formatDate'
import { openRevisionFolder } from '@shared/lib/revisionStorageService'
import { useAppUpdater } from '@shared/lib/useAppUpdater'
import AppUpdateModal from './AppUpdateModal.vue'
import { version as appVersion } from '../../../package.json'

const route = useRoute()
const router = useRouter()
const inventoryStore = useInventoryStore()
const updater = useAppUpdater()

const isInventoryExpanded = ref(true)
const isArchiveExpanded = ref(false)

// Автоматически раскрываем архив, если открыта архивная ревизия
watch(
  () => inventoryStore.activeRevision,
  (rev) => {
    if (rev?.isArchived) {
      isArchiveExpanded.value = true
    }
  },
  { immediate: true }
)

const currentFeature = computed(() =>
  features.find((f) => route.path.startsWith(f.route.path as string))
)

function isRevisionActive(rev: { id: string; storeNumber: string }) {
  if (!route.path.startsWith('/inventory')) return false
  const param = route.params.storeNumber as string
  if (param) {
    return param === rev.id || param === rev.storeNumber
  }
  return inventoryStore.activeRevisionId === rev.id
}

function isRevisionExpanded(rev: { id: string; storeNumber: string }) {
  const param = route.params.storeNumber as string
  if (param) {
    return param === rev.id || param === rev.storeNumber
  }
  return inventoryStore.activeRevisionId === rev.id
}

function isTabActive(rev: { id: string; storeNumber: string }, tabName: string) {
  if (!isRevisionActive(rev)) return false
  if (tabName === 'fact') {
    return !route.query.tab || route.query.tab === 'fact'
  }
  return route.query.tab === tabName
}


async function handleDeleteRevision(revisionId: string, storeNumber: string) {
  if (confirm(`Вы действительно хотите удалить ревизию магазина №${storeNumber} и все её данные?`)) {
    try {
      await inventoryStore.deleteRevision(revisionId)
      if (inventoryStore.activeRevisionId) {
        router.push(`/inventory/${inventoryStore.activeRevisionId}`)
      } else {
        router.push('/inventory')
      }
    } catch (err) {
      console.error('Ошибка удаления ревизии:', err)
    }
  }
}

async function handleToggleArchive(revisionId: string, storeNumber: string, isArchived: boolean) {
  try {
    await inventoryStore.archiveRevision(revisionId, isArchived)
  } catch (err) {
    console.error('Ошибка изменения статуса архива:', err)
  }
}

function openNewRevisionModal() {
  eventBus.emit('revision:create-requested')
}

async function handleOpenFolder(dirPath?: string) {
  if (!dirPath) return
  try {
    await openRevisionFolder(dirPath)
  } catch (err) {
    console.error('Ошибка открытия папки ревизии:', err)
  }
}

function openEditDatesModal(rev: { id: string; storeNumber: string; startDate?: string; endDate?: string; isArchived?: boolean }) {
  if (rev.isArchived) return
  eventBus.emit('revision:edit-dates-requested', {
    id: rev.id,
    storeNumber: rev.storeNumber,
    startDate: rev.startDate || '',
    endDate: rev.endDate || '',
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
</script>

<template>
  <aside
    class="flex w-72 shrink-0 flex-col border-r backdrop-blur-sm"
    :style="{
      backgroundColor: 'var(--rev-surface-sidebar)',
      borderColor: 'var(--rev-border)',
    }"
  >
    <!-- Logo -->
    <div class="flex items-center gap-3 border-b px-5 py-4" :style="{ borderColor: 'var(--rev-border)' }">
      <div
        class="flex h-9 w-9 items-center justify-center rounded-lg text-lg font-bold text-white shadow-lg"
        style="background: linear-gradient(135deg, #5348CA, #DF4232); box-shadow: 0 4px 14px rgba(83, 72, 202, 0.3)"
      >
        Р
      </div>
      <div>
        <h1 class="text-sm font-semibold tracking-wide text-gray-100">Ревизор</h1>
        <p class="text-[11px] text-gray-500">Инвентаризация</p>
      </div>
    </div>

    <!-- Navigation -->
    <nav class="flex-1 space-y-1 px-3 py-4 overflow-y-auto">
      <template v-for="feature in features" :key="feature.id">
        <!-- Custom layout for Inventory feature -->
        <div v-if="feature.id === 'inventory'" class="space-y-1">
          <!-- Dropdown Header -->
          <div
            @click="isInventoryExpanded = !isInventoryExpanded"
            class="group flex cursor-pointer items-center justify-between rounded-lg px-3 py-2.5 text-sm font-medium text-gray-400 transition-all duration-150 hover:bg-gray-800/50 hover:text-gray-200"
            :class="{ 'text-indigo-400 bg-indigo-500/5': currentFeature?.id === 'inventory' }"
          >
            <div class="flex items-center gap-3">
              <span class="text-lg">📦</span>
              <span>{{ feature.label }}</span>
            </div>
            <!-- Arrow -->
            <span
              class="text-[9px] text-gray-500 transition-transform duration-200 group-hover:text-gray-300"
              :class="{ 'rotate-180': isInventoryExpanded }"
            >
              ▼
            </span>
          </div>

          <!-- Revisions Dropdown List -->
          <div v-show="isInventoryExpanded" class="pl-3 space-y-1">
            <div v-if="inventoryStore.activeRevisions.length === 0" class="px-3 py-1.5 text-xs text-gray-600">
              Нет активных ревизий
            </div>
            
            <div
              v-for="rev in inventoryStore.activeRevisions"
              :key="rev.id"
              class="space-y-1"
            >
              <router-link
                :to="`/inventory/${rev.id}`"
                class="group flex items-center justify-between rounded-lg px-3 py-2 text-xs font-medium transition-all duration-150"
                :class="[
                  isRevisionActive(rev)
                    ? 'bg-indigo-500/15 text-indigo-300 font-semibold ring-1 ring-indigo-500/30'
                    : 'text-gray-400 hover:bg-gray-800/30 hover:text-gray-200',
                ]"
              >
                <div class="flex flex-col min-w-0 pr-1">
                  <span class="truncate text-gray-200">Магазин №{{ rev.storeNumber }}</span>
                  <button
                    v-if="rev.startDate && rev.endDate"
                    type="button"
                    @click.stop.prevent="openEditDatesModal(rev)"
                    class="text-[10px] text-indigo-400/90 hover:text-indigo-200 font-normal leading-tight mt-0.5 inline-flex items-center gap-1 cursor-pointer group/date text-left whitespace-nowrap"
                    title="Нажмите, чтобы изменить даты проведения ревизии"
                  >
                    <span class="shrink-0">📅</span>
                    <span class="underline decoration-indigo-500/30 underline-offset-2 whitespace-nowrap">{{ formatDateRange(rev.startDate, rev.endDate) }}</span>
                    <span class="opacity-0 group-hover/date:opacity-100 text-[9px] transition-opacity shrink-0">✏️</span>
                  </button>
                  <span v-else-if="rev.createdAt" class="text-[10px] text-gray-500 font-normal leading-tight mt-0.5 whitespace-nowrap">
                    {{ formatDateShort(rev.createdAt) }}
                  </span>
                  <!-- Revision UUID -->
                  <div
                    @click.stop.prevent="copyRevisionUuid(rev.id)"
                    class="text-[9px] font-mono text-gray-500 hover:text-indigo-300 transition-colors mt-0.5 inline-flex items-center gap-1 cursor-pointer truncate group/uuid"
                    :title="`UUID: ${rev.id} (кликните, чтобы скопировать)`"
                  >
                    <span class="text-[8px] opacity-60">🔑</span>
                    <span class="truncate">{{ rev.id }}</span>
                    <span class="opacity-0 group-hover/uuid:opacity-100 text-[8px] text-indigo-400 shrink-0">📋</span>
                  </div>
                </div>
                <!-- Action Buttons -->
                <div class="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity duration-150 shrink-0 ml-1">
                  <!-- Open Folder Button -->
                  <button
                    v-if="rev.dirPath"
                    @click.stop.prevent="handleOpenFolder(rev.dirPath)"
                    class="text-gray-400 hover:text-indigo-300 text-xs font-medium transition-colors cursor-pointer p-0.5"
                    title="Открыть папку ревизии"
                  >
                    📁
                  </button>
                  <!-- Archive Button -->
                  <button
                    @click.stop.prevent="handleToggleArchive(rev.id, rev.storeNumber, true)"
                    class="text-gray-500 hover:text-amber-400 text-xs font-medium transition-colors cursor-pointer p-0.5"
                    title="Переместить в архив"
                  >
                    🗄️
                  </button>
                  <!-- Delete Button -->
                  <button
                    @click.stop.prevent="handleDeleteRevision(rev.id, rev.storeNumber)"
                    class="text-gray-500 hover:text-red-400 text-sm font-semibold transition-colors cursor-pointer p-0.5"
                    title="Удалить ревизию"
                  >
                    &times;
                  </button>
                </div>
              </router-link>

              <!-- Sub-items under active revision -->
              <div
                v-if="isRevisionExpanded(rev)"
                class="ml-3 border-l border-indigo-500/20 pl-2 space-y-0.5 py-1"
              >
                <router-link
                  :to="`/inventory/${rev.id}?tab=general`"
                  class="flex items-center gap-2 rounded-md px-2.5 py-1.5 text-xs transition-colors"
                  :class="[
                    isTabActive(rev, 'general')
                      ? 'bg-indigo-500/20 text-indigo-300 font-medium'
                      : 'text-gray-400 hover:bg-gray-800/40 hover:text-gray-200'
                  ]"
                >
                  <span class="w-4 text-center text-xs shrink-0 select-none">📑</span>
                  <span class="truncate">Общее</span>
                </router-link>

                <router-link
                  :to="`/inventory/${rev.id}`"
                  class="flex items-center gap-2 rounded-md px-2.5 py-1.5 text-xs transition-colors"
                  :class="[
                    isTabActive(rev, 'fact')
                      ? 'bg-indigo-500/20 text-indigo-300 font-medium'
                      : 'text-gray-400 hover:bg-gray-800/40 hover:text-gray-200'
                  ]"
                >
                  <span class="w-4 text-center text-xs shrink-0 select-none">📋</span>
                  <span class="truncate">Ревизия (Факт)</span>
                </router-link>

                <router-link
                  :to="`/inventory/${rev.id}?tab=stock`"
                  class="flex items-center gap-2 rounded-md px-2.5 py-1.5 text-xs transition-colors"
                  :class="[
                    isTabActive(rev, 'stock')
                      ? 'bg-indigo-500/20 text-indigo-300 font-medium'
                      : 'text-gray-400 hover:bg-gray-800/40 hover:text-gray-200'
                  ]"
                >
                  <span class="w-4 text-center text-xs shrink-0 select-none">📊</span>
                  <span class="truncate">Системные остатки (аудит)</span>
                </router-link>

                <router-link
                  :to="`/inventory/${rev.id}?tab=catalog`"
                  class="flex items-center gap-2 rounded-md px-2.5 py-1.5 text-xs transition-colors"
                  :class="[
                    isTabActive(rev, 'catalog')
                      ? 'bg-indigo-500/20 text-indigo-300 font-medium'
                      : 'text-gray-400 hover:bg-gray-800/40 hover:text-gray-200'
                  ]"
                >
                  <span class="w-4 text-center text-xs shrink-0 select-none">📦</span>
                  <span class="truncate">Товары магазина</span>
                </router-link>

                <router-link
                  :to="`/inventory/${rev.id}?tab=299`"
                  class="flex items-center gap-2 rounded-md px-2.5 py-1.5 text-xs transition-colors"
                  :class="[
                    isTabActive(rev, '299')
                      ? 'bg-indigo-500/20 text-indigo-300 font-medium'
                      : 'text-gray-400 hover:bg-gray-800/40 hover:text-gray-200'
                  ]"
                >
                  <span class="w-4 text-center text-xs shrink-0 select-none">🏷️</span>
                  <span class="truncate">299</span>
                </router-link>

                <router-link
                  :to="`/inventory/${rev.id}?tab=multiplicity`"
                  class="flex items-center gap-2 rounded-md px-2.5 py-1.5 text-xs transition-colors"
                  :class="[
                    isTabActive(rev, 'multiplicity')
                      ? 'bg-indigo-500/20 text-indigo-300 font-medium'
                      : 'text-gray-400 hover:bg-gray-800/40 hover:text-gray-200'
                  ]"
                >
                  <span class="w-4 text-center text-xs shrink-0 select-none">📐</span>
                  <span class="truncate">Кратность</span>
                </router-link>
              </div>
            </div>

            <!-- New Revision Shortcut -->
            <button
              @click="openNewRevisionModal"
              class="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-xs font-medium text-indigo-400/80 hover:text-indigo-400 hover:bg-gray-800/20 transition-all duration-150 cursor-pointer mt-1"
            >
              <span class="text-sm font-bold">＋</span> Новая ревизия
            </button>

            <!-- Archive Collapsible Folder Section -->
            <div class="mt-3 pt-2 border-t border-gray-800/60 space-y-1">
              <!-- Archive Folder Header -->
              <div
                @click="isArchiveExpanded = !isArchiveExpanded"
                class="group flex cursor-pointer items-center justify-between rounded-lg px-3 py-2.5 text-sm font-medium text-gray-400 transition-all duration-150 hover:bg-gray-800/50 hover:text-gray-200"
                :class="{ 'text-amber-400 bg-amber-500/5': inventoryStore.activeRevision?.isArchived }"
              >
                <div class="flex items-center gap-3">
                  <span class="text-lg">🗄️</span>
                  <span>Архив</span>
                  <span
                    v-if="inventoryStore.archivedRevisions.length > 0"
                    class="rounded-full bg-gray-800 px-2 py-0.5 text-[11px] text-gray-400 ring-1 ring-gray-700/50 font-normal"
                  >
                    {{ inventoryStore.archivedRevisions.length }}
                  </span>
                </div>
                <!-- Arrow -->
                <span
                  class="text-[9px] text-gray-500 transition-transform duration-200 group-hover:text-gray-300"
                  :class="{ 'rotate-180': isArchiveExpanded }"
                >
                  ▼
                </span>
              </div>

              <!-- Archived Revisions List -->
              <div v-show="isArchiveExpanded" class="pl-3 space-y-1">
                <div v-if="inventoryStore.archivedRevisions.length === 0" class="px-3 py-2 text-xs text-gray-600">
                  Архив пуст
                </div>

                <div
                  v-for="rev in inventoryStore.archivedRevisions"
                  :key="rev.id"
                  class="space-y-1"
                >
                  <router-link
                    :to="`/inventory/${rev.id}`"
                    class="group flex items-center justify-between rounded-lg px-3 py-2 text-xs font-medium transition-all duration-150"
                    :class="[
                      isRevisionActive(rev)
                        ? 'bg-amber-500/15 text-amber-300 font-semibold ring-1 ring-amber-500/30'
                        : 'text-gray-400 hover:bg-gray-800/30 hover:text-gray-200',
                    ]"
                  >
                    <div class="flex flex-col min-w-0 pr-1">
                      <span class="truncate text-gray-200">Магазин №{{ rev.storeNumber }}</span>
                      <span v-if="rev.startDate && rev.endDate" class="text-[10px] text-amber-400/90 font-normal leading-tight mt-0.5 inline-flex items-center gap-1 whitespace-nowrap">
                        <span class="shrink-0">📅</span>
                        <span class="whitespace-nowrap">{{ formatDateRange(rev.startDate, rev.endDate) }}</span>
                      </span>
                      <span v-else-if="rev.createdAt" class="text-[10px] text-gray-500 font-normal leading-tight mt-0.5 whitespace-nowrap">
                        {{ formatDateShort(rev.createdAt) }}
                      </span>
                      <!-- Revision UUID -->
                      <div
                        @click.stop.prevent="copyRevisionUuid(rev.id)"
                        class="text-[9px] font-mono text-gray-500 hover:text-amber-300 transition-colors mt-0.5 inline-flex items-center gap-1 cursor-pointer truncate group/uuid"
                        :title="`UUID: ${rev.id} (кликните, чтобы скопировать)`"
                      >
                        <span class="text-[8px] opacity-60">🔑</span>
                        <span class="truncate">{{ rev.id }}</span>
                        <span class="opacity-0 group-hover/uuid:opacity-100 text-[8px] text-amber-400 shrink-0">📋</span>
                      </div>
                    </div>

                    <!-- Action Buttons -->
                    <div class="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity duration-150 shrink-0 ml-1">
                      <!-- Open Folder Button -->
                      <button
                        v-if="rev.dirPath"
                        @click.stop.prevent="handleOpenFolder(rev.dirPath)"
                        class="text-gray-400 hover:text-amber-300 text-xs font-medium transition-colors cursor-pointer p-0.5"
                        title="Открыть папку ревизии"
                      >
                        📁
                      </button>
                      <!-- Restore / Unarchive Button -->
                      <button
                        @click.stop.prevent="handleToggleArchive(rev.id, rev.storeNumber, false)"
                        class="text-gray-400 hover:text-indigo-300 text-xs font-medium transition-colors cursor-pointer p-0.5"
                        title="Вернуть из архива (для редактирования или удаления)"
                      >
                        ↩️
                      </button>
                    </div>
                  </router-link>

                  <!-- Sub-items under active archived revision -->
                  <div
                    v-if="isRevisionExpanded(rev)"
                    class="ml-3 border-l border-amber-500/20 pl-2 space-y-0.5 py-1"
                  >
                    <router-link
                      :to="`/inventory/${rev.id}?tab=general`"
                      class="flex items-center gap-2 rounded-md px-2.5 py-1.5 text-xs transition-colors"
                      :class="[
                        isTabActive(rev, 'general')
                          ? 'bg-amber-500/20 text-amber-300 font-medium'
                          : 'text-gray-400 hover:bg-gray-800/40 hover:text-gray-200'
                      ]"
                    >
                      <span class="w-4 text-center text-xs shrink-0 select-none">📑</span>
                      <span class="truncate">Общее</span>
                    </router-link>

                    <router-link
                      :to="`/inventory/${rev.id}`"
                      class="flex items-center gap-2 rounded-md px-2.5 py-1.5 text-xs transition-colors"
                      :class="[
                        isTabActive(rev, 'fact')
                          ? 'bg-amber-500/20 text-amber-300 font-medium'
                          : 'text-gray-400 hover:bg-gray-800/40 hover:text-gray-200'
                      ]"
                    >
                      <span class="w-4 text-center text-xs shrink-0 select-none">📋</span>
                      <span class="truncate">Ревизия (Факт)</span>
                    </router-link>

                    <router-link
                      :to="`/inventory/${rev.id}?tab=stock`"
                      class="flex items-center gap-2 rounded-md px-2.5 py-1.5 text-xs transition-colors"
                      :class="[
                        isTabActive(rev, 'stock')
                          ? 'bg-amber-500/20 text-amber-300 font-medium'
                          : 'text-gray-400 hover:bg-gray-800/40 hover:text-gray-200'
                      ]"
                    >
                      <span class="w-4 text-center text-xs shrink-0 select-none">📊</span>
                      <span class="truncate">Системные остатки (аудит)</span>
                    </router-link>

                    <router-link
                      :to="`/inventory/${rev.id}?tab=catalog`"
                      class="flex items-center gap-2 rounded-md px-2.5 py-1.5 text-xs transition-colors"
                      :class="[
                        isTabActive(rev, 'catalog')
                          ? 'bg-amber-500/20 text-amber-300 font-medium'
                          : 'text-gray-400 hover:bg-gray-800/40 hover:text-gray-200'
                      ]"
                    >
                      <span class="w-4 text-center text-xs shrink-0 select-none">📦</span>
                      <span class="truncate">Товары магазина</span>
                    </router-link>

                    <router-link
                      :to="`/inventory/${rev.id}?tab=299`"
                      class="flex items-center gap-2 rounded-md px-2.5 py-1.5 text-xs transition-colors"
                      :class="[
                        isTabActive(rev, '299')
                          ? 'bg-amber-500/20 text-amber-300 font-medium'
                          : 'text-gray-400 hover:bg-gray-800/40 hover:text-gray-200'
                      ]"
                    >
                      <span class="w-4 text-center text-xs shrink-0 select-none">🏷️</span>
                      <span class="truncate">299</span>
                    </router-link>

                    <router-link
                      :to="`/inventory/${rev.id}?tab=multiplicity`"
                      class="flex items-center gap-2 rounded-md px-2.5 py-1.5 text-xs transition-colors"
                      :class="[
                        isTabActive(rev, 'multiplicity')
                          ? 'bg-amber-500/20 text-amber-300 font-medium'
                          : 'text-gray-400 hover:bg-gray-800/40 hover:text-gray-200'
                      ]"
                    >
                      <span class="w-4 text-center text-xs shrink-0 select-none">📐</span>
                      <span class="truncate">Кратность</span>
                    </router-link>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- Custom layout for Dashboard feature -->
        <div v-else-if="feature.id === 'dashboard'" class="space-y-0.5">
          <router-link
            to="/dashboard"
            class="group flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-all duration-150"
            :class="[
              route.path === '/dashboard'
                ? 'bg-indigo-500/10 text-indigo-400 font-semibold shadow-sm shadow-indigo-500/5'
                : 'text-gray-400 hover:bg-gray-800/50 hover:text-gray-200',
            ]"
          >
            <span class="text-lg" v-html="feature.icon" />
            <span>{{ feature.label }}</span>
          </router-link>

          <!-- Subpage "Статистика" and "Процент" directly under Dashboard -->
          <div class="pl-7 space-y-0.5">
            <router-link
              to="/dashboard/statistics"
              class="group flex items-center gap-2 rounded-lg px-2.5 py-1.5 text-xs font-medium transition-all duration-150"
              :class="[
                route.path.startsWith('/dashboard/statistics')
                  ? 'bg-indigo-500/15 text-indigo-300 font-semibold ring-1 ring-indigo-500/30'
                  : 'text-gray-400 hover:bg-gray-800/40 hover:text-gray-200',
              ]"
            >
              <span class="text-xs">📈</span>
              <span>Статистика</span>
            </router-link>

            <router-link
              to="/dashboard/percent"
              class="group flex items-center gap-2 rounded-lg px-2.5 py-1.5 text-xs font-medium transition-all duration-150"
              :class="[
                route.path.startsWith('/dashboard/percent')
                  ? 'bg-indigo-500/15 text-indigo-300 font-semibold ring-1 ring-indigo-500/30'
                  : 'text-gray-400 hover:bg-gray-800/40 hover:text-gray-200',
              ]"
            >
              <span class="text-xs">🧮</span>
              <span>Процент</span>
            </router-link>
          </div>
        </div>

        <!-- Default Layout for other features -->
        <router-link
          v-else
          :to="feature.route.path as string"
          class="group flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-all duration-150"
          :class="[
            currentFeature?.id === feature.id
              ? 'bg-indigo-500/10 text-indigo-400 shadow-sm shadow-indigo-500/5'
              : 'text-gray-400 hover:bg-gray-800/50 hover:text-gray-200',
          ]"
        >
          <span class="text-lg" v-html="feature.icon" />
          <span>{{ feature.label }}</span>
        </router-link>
      </template>
    </nav>

    <!-- Footer -->
    <div class="border-t px-5 py-3" :style="{ borderColor: 'var(--rev-border)' }">
      <div class="flex items-center justify-between">
        <span class="text-[11px] font-mono text-gray-500">v{{ appVersion }}</span>

        <!-- Update Action / Badge -->
        <button
          v-if="updater.status.value === 'available'"
          type="button"
          @click="updater.openModal"
          class="inline-flex items-center gap-1.5 rounded-full bg-indigo-500/20 px-2 py-0.5 text-[10px] font-semibold text-indigo-300 ring-1 ring-indigo-500/40 hover:bg-indigo-500/30 transition-all cursor-pointer animate-pulse"
          title="Доступна новая версия программы! Нажмите, чтобы обновить"
        >
          <span class="h-1.5 w-1.5 rounded-full bg-indigo-400"></span>
          <span>Обновить</span>
        </button>

        <button
          v-else-if="updater.status.value === 'checking'"
          type="button"
          disabled
          class="inline-flex items-center gap-1 text-[10px] text-gray-500"
        >
          <span class="animate-spin text-[9px]">🔄</span>
          <span>Поиск...</span>
        </button>

        <button
          v-else
          type="button"
          @click="updater.checkForUpdates(false)"
          class="text-[10px] text-gray-500 hover:text-indigo-400 transition-colors cursor-pointer flex items-center gap-1 group/upd"
          title="Проверить наличие обновлений"
        >
          <span class="group-hover/upd:rotate-180 transition-transform duration-300">🔄</span>
          <span>Обновления</span>
        </button>
      </div>

      <p class="text-[10px] mt-1" :style="{ color: 'var(--rev-text-muted)' }">© {{ new Date().getFullYear() }} Морозов Артём</p>
      <p class="text-[10px]" :style="{ color: 'var(--rev-text-muted)' }">artiks102@gmail.com</p>
    </div>

    <!-- App Update Modal -->
    <AppUpdateModal />
  </aside>
</template>
