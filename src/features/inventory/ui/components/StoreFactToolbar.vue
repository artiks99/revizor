<script setup lang="ts">
import type { useStoreFactTab } from '../../model/useStoreFactTab'
import UndoRedoButtons from '@shared/ui/UndoRedoButtons.vue'

const props = defineProps<{
  tab: ReturnType<typeof useStoreFactTab>
}>()

const {
  store,
  isReadOnly,
  searchQuery,
  filterStatus,
  selectedLocation,
  distinctLocations,
  duplicateFactCount,
  nonStandardFactCount,
  ndFactCount,
  inCatalogFactCount,
  account299FactCount,
  multGt1FactCount,
  isFilterActive,
  handleResetFilters,
  sortedItems,
  selectedIds,
  isMassMenuOpen,
  undoRedo,
  batchOps,
  openPasteQuantitiesModal,
  openPasteLocationsModal,
  handleCopyFilteredSkus,
  handleCopyNotFoundSkus,
  handleCopySelectedSkus,
  isImportModalOpen,
} = props.tab

const { isExportDropdownOpen } = batchOps
</script>

<template>
  <div class="flex flex-col gap-3">
    <!-- Header / Actions Toolbar -->
    <div class="flex flex-wrap items-center justify-between gap-3 bg-gray-900/60 p-4 rounded-xl ring-1 ring-gray-800/60">
      <div class="flex items-center gap-3">
        <div class="flex h-10 w-10 items-center justify-center rounded-lg bg-indigo-500/10 text-xl text-indigo-400">
          📋
        </div>
        <div>
          <h3 class="text-sm font-semibold text-gray-200">Фактическая ревизия магазина</h3>
          <p class="text-xs text-gray-400">
            Фактически пересчитанные товары и позиции в торговом зале и на складе
          </p>
        </div>
      </div>

      <!-- Action Buttons (Hidden when read-only) -->
      <div v-if="!isReadOnly" class="flex items-center gap-2">
        <!-- Mass Actions Dropdown -->
        <div id="fact-mass-actions-menu-wrapper" class="relative mass-actions-container">
          <button
            type="button"
            @click.stop="isMassMenuOpen = !isMassMenuOpen"
            class="flex items-center gap-1.5 rounded-lg bg-indigo-500/15 px-3 py-2 text-xs font-semibold text-indigo-300 ring-1 ring-indigo-500/30 hover:bg-indigo-500/25 hover:text-indigo-200 transition-all cursor-pointer shadow-sm"
            title="Массовые операции с позициями ревизии"
          >
            <span>⚡</span>
            <span>Массовые действия</span>
            <span class="text-[10px] opacity-70">▼</span>
          </button>

          <!-- Dropdown Menu -->
          <transition
            enter-active-class="transition duration-150 ease-out"
            enter-from-class="transform scale-95 opacity-0 -translate-y-1"
            enter-to-class="transform scale-100 opacity-100 translate-y-0"
            leave-active-class="transition duration-100 ease-in"
            leave-from-class="transform scale-100 opacity-100 translate-y-0"
            leave-to-class="transform scale-95 opacity-0 -translate-y-1"
          >
            <div
              v-if="isMassMenuOpen"
              class="absolute right-0 top-full mt-1.5 z-40 w-72 rounded-xl bg-gray-900/95 p-1.5 shadow-2xl ring-1 ring-gray-700/80 backdrop-blur-md divide-y divide-gray-800/60"
            >
              <div class="px-2.5 py-1.5 text-[11px] font-semibold uppercase tracking-wider text-gray-400">
                Групповые операции
              </div>

              <!-- Duplicate actions -->
              <div class="py-1">
                <button
                  type="button"
                  @click="batchOps.handleMergeDuplicates"
                  :disabled="duplicateFactCount === 0"
                  class="flex w-full items-center justify-between gap-2 rounded-lg px-2.5 py-2 text-left text-xs text-gray-200 hover:bg-indigo-600/20 hover:text-indigo-300 disabled:opacity-40 disabled:cursor-not-allowed transition-all cursor-pointer"
                >
                  <div class="flex items-center gap-2">
                    <span>⚡</span>
                    <div>
                      <div class="font-medium">Объединить дубликаты</div>
                      <div class="text-[10px] text-gray-400">Суммирует количество одинаковых ЛК</div>
                    </div>
                  </div>
                  <span
                    v-if="duplicateFactCount > 0"
                    class="rounded-full bg-indigo-500/20 px-2 py-0.5 text-[10px] font-bold text-indigo-300"
                  >
                    {{ duplicateFactCount }}
                  </span>
                </button>

                <button
                  type="button"
                  @click="batchOps.handleRemoveDuplicatesOnly"
                  :disabled="duplicateFactCount === 0"
                  class="flex w-full items-center justify-between gap-2 rounded-lg px-2.5 py-2 text-left text-xs text-gray-200 hover:bg-red-500/20 hover:text-red-300 disabled:opacity-40 disabled:cursor-not-allowed transition-all cursor-pointer"
                >
                  <div class="flex items-center gap-2">
                    <span>🗑️</span>
                    <div>
                      <div class="font-medium">Удалить повторы дубликатов</div>
                      <div class="text-[10px] text-gray-400">Оставить только 1 первую запись</div>
                    </div>
                  </div>
                  <span
                    v-if="duplicateFactCount > 0"
                    class="rounded-full bg-red-500/20 px-2 py-0.5 text-[10px] font-bold text-red-300"
                  >
                    {{ duplicateFactCount }}
                  </span>
                </button>
              </div>

              <!-- Cleaning actions -->
              <div class="py-1">
                <button
                  type="button"
                  @click="batchOps.handleRemoveNonStandard"
                  :disabled="nonStandardFactCount === 0"
                  class="flex w-full items-center justify-between gap-2 rounded-lg px-2.5 py-2 text-left text-xs text-gray-200 hover:bg-amber-500/20 hover:text-amber-300 disabled:opacity-40 disabled:cursor-not-allowed transition-all cursor-pointer"
                >
                  <div class="flex items-center gap-2">
                    <span>⚠️</span>
                    <div>
                      <div class="font-medium">Удалить нестандартные ЛК</div>
                      <div class="text-[10px] text-gray-400">Артикулы не из 7 цифр</div>
                    </div>
                  </div>
                  <span
                    v-if="nonStandardFactCount > 0"
                    class="rounded-full bg-amber-500/20 px-2 py-0.5 text-[10px] font-bold text-amber-300"
                  >
                    {{ nonStandardFactCount }}
                  </span>
                </button>

                <button
                  type="button"
                  @click="batchOps.handleRemoveNotFound"
                  :disabled="ndFactCount === 0"
                  class="flex w-full items-center justify-between gap-2 rounded-lg px-2.5 py-2 text-left text-xs text-gray-200 hover:bg-amber-500/20 hover:text-amber-300 disabled:opacity-40 disabled:cursor-not-allowed transition-all cursor-pointer"
                >
                  <div class="flex items-center gap-2">
                    <span>⚠️</span>
                    <div>
                      <div class="font-medium">Удалить позиции Н/Д</div>
                      <div class="text-[10px] text-gray-400">Товары, отсутствующие в каталоге</div>
                    </div>
                  </div>
                  <span
                    v-if="ndFactCount > 0"
                    class="rounded-full bg-amber-500/20 px-2 py-0.5 text-[10px] font-bold text-amber-300"
                  >
                    {{ ndFactCount }}
                  </span>
                </button>
              </div>

              <!-- Filtered delete action -->
              <div v-if="isFilterActive" class="py-1">
                <button
                  type="button"
                  @click="batchOps.handleRemoveFiltered"
                  class="flex w-full items-center justify-between gap-2 rounded-lg px-2.5 py-2 text-left text-xs text-rose-300 hover:bg-rose-500/20 transition-all cursor-pointer"
                >
                  <div class="flex items-center gap-2">
                    <span>🔍</span>
                    <div>
                      <div class="font-medium">Удалить отфильтрованные</div>
                      <div class="text-[10px] text-rose-400/80">Все текущие видимые строки</div>
                    </div>
                  </div>
                  <span class="rounded-full bg-rose-500/20 px-2 py-0.5 text-[10px] font-bold text-rose-300">
                    {{ sortedItems.length }}
                  </span>
                </button>
              </div>

              <!-- Batch Quantity Paste action -->
              <div class="py-1">
                <button
                  type="button"
                  @click="openPasteQuantitiesModal"
                  :disabled="store.items.length === 0"
                  class="flex w-full items-center justify-between gap-2 rounded-lg px-2.5 py-2 text-left text-xs text-emerald-300 hover:bg-emerald-600/20 hover:text-emerald-200 disabled:opacity-40 disabled:cursor-not-allowed transition-all cursor-pointer"
                >
                  <div class="flex items-center gap-2">
                    <span>📥</span>
                    <div>
                      <div class="font-medium">Вставить количества из буфера</div>
                      <div class="text-[10px] text-gray-400">
                        {{ selectedIds.size > 0 ? `Обновить ${selectedIds.size} выбранных` : `Построчно обновить ${sortedItems.length} видимых` }}
                      </div>
                    </div>
                  </div>
                  <span
                    v-if="selectedIds.size > 0"
                    class="rounded-full bg-emerald-500/20 px-2 py-0.5 text-[10px] font-bold text-emerald-300"
                  >
                    {{ selectedIds.size }} выбр.
                  </span>
                </button>
              </div>

              <!-- Batch Location Paste action -->
              <div class="py-1">
                <button
                  type="button"
                  @click="openPasteLocationsModal"
                  :disabled="store.items.length === 0"
                  class="flex w-full items-center justify-between gap-2 rounded-lg px-2.5 py-2 text-left text-xs text-indigo-300 hover:bg-indigo-600/20 hover:text-indigo-200 disabled:opacity-40 disabled:cursor-not-allowed transition-all cursor-pointer"
                >
                  <div class="flex items-center gap-2">
                    <span>📍</span>
                    <div>
                      <div class="font-medium">Вставить локации из буфера</div>
                      <div class="text-[10px] text-gray-400">
                        {{ selectedIds.size > 0 ? `Обновить ${selectedIds.size} выбранных` : `Построчно обновить ${sortedItems.length} видимых` }}
                      </div>
                    </div>
                  </div>
                  <span
                    v-if="selectedIds.size > 0"
                    class="rounded-full bg-indigo-500/20 px-2 py-0.5 text-[10px] font-bold text-indigo-300"
                  >
                    {{ selectedIds.size }} выбр.
                  </span>
                </button>
              </div>

              <!-- Copying section -->
              <div class="py-1">
                <div class="px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wider text-indigo-400">
                  Копирование артикулов
                </div>

                <button
                  type="button"
                  @click="handleCopyFilteredSkus"
                  :disabled="sortedItems.length === 0"
                  class="flex w-full items-center justify-between gap-2 rounded-lg px-2.5 py-2 text-left text-xs text-gray-200 hover:bg-indigo-600/20 hover:text-indigo-300 disabled:opacity-40 disabled:cursor-not-allowed transition-all cursor-pointer"
                >
                  <div class="flex items-center gap-2">
                    <span>📋</span>
                    <div>
                      <div class="font-medium">Скопировать текущие ЛК</div>
                      <div class="text-[10px] text-gray-400">Все видимые по фильтру (столбиком)</div>
                    </div>
                  </div>
                  <span
                    v-if="sortedItems.length > 0"
                    class="rounded-full bg-indigo-500/20 px-2 py-0.5 text-[10px] font-bold text-indigo-300"
                  >
                    {{ sortedItems.length }}
                  </span>
                </button>

                <button
                  v-if="ndFactCount > 0"
                  type="button"
                  @click="handleCopyNotFoundSkus"
                  class="flex w-full items-center justify-between gap-2 rounded-lg px-2.5 py-2 text-left text-xs text-amber-300 hover:bg-amber-500/15 transition-all cursor-pointer"
                >
                  <div class="flex items-center gap-2">
                    <span>📋</span>
                    <div>
                      <div class="font-medium">Скопировать только ЛК со статусом Н/Д</div>
                      <div class="text-[10px] text-amber-400/70">Отсутствующие в каталоге</div>
                    </div>
                  </div>
                  <span
                    v-if="ndFactCount > 0"
                    class="rounded-full bg-amber-500/20 px-2 py-0.5 text-[10px] font-bold text-amber-300"
                  >
                    {{ ndFactCount }}
                  </span>
                </button>

                <button
                  v-if="selectedIds.size > 0"
                  type="button"
                  @click="handleCopySelectedSkus"
                  class="flex w-full items-center justify-between gap-2 rounded-lg px-2.5 py-2 text-left text-xs text-indigo-300 hover:bg-indigo-600/20 transition-all cursor-pointer"
                >
                  <div class="flex items-center gap-2">
                    <span>📋</span>
                    <div>
                      <div class="font-medium">Скопировать выбранные ЛК</div>
                      <div class="text-[10px] text-gray-400">Отмеченные галочками</div>
                    </div>
                  </div>
                  <span
                    v-if="selectedIds.size > 0"
                    class="rounded-full bg-indigo-500/20 px-2 py-0.5 text-[10px] font-bold text-indigo-300"
                  >
                    {{ selectedIds.size }}
                  </span>
                </button>
              </div>
            </div>
          </transition>
        </div>

        <!-- Undo / Redo buttons -->
        <UndoRedoButtons :manager="undoRedo" :is-read-only="isReadOnly" />

        <!-- Export Dropdown -->
        <div class="relative export-actions-container">
          <button
            type="button"
            @click.stop="isExportDropdownOpen = !isExportDropdownOpen"
            class="flex items-center gap-1.5 rounded-lg bg-gray-800/80 px-3 py-2 text-xs font-semibold text-gray-200 ring-1 ring-gray-700/60 hover:bg-gray-700/80 hover:text-white transition-all cursor-pointer shadow-sm"
            title="Экспорт таблицы в файл"
          >
            <span>📥</span>
            <span>Экспорт</span>
            <span class="text-[10px] opacity-70">▼</span>
          </button>

          <!-- Dropdown Menu -->
          <transition
            enter-active-class="transition duration-150 ease-out"
            enter-from-class="transform scale-95 opacity-0 -translate-y-1"
            enter-to-class="transform scale-100 opacity-100 translate-y-0"
            leave-active-class="transition duration-100 ease-in"
            leave-from-class="transform scale-100 opacity-100 translate-y-0"
            leave-to-class="transform scale-95 opacity-0 -translate-y-1"
          >
            <div
              v-if="isExportDropdownOpen"
              class="absolute right-0 top-full mt-1.5 z-40 w-64 rounded-xl bg-gray-900/95 p-1.5 shadow-2xl ring-1 ring-gray-700/80 backdrop-blur-md divide-y divide-gray-800/60"
            >
              <div class="px-2.5 py-1.5 text-[11px] font-semibold uppercase tracking-wider text-gray-400">
                {{ selectedIds.size > 0 ? `Выгрузка выбранных (${selectedIds.size} поз.)` : `Выгрузка (${sortedItems.length} поз.)` }}
              </div>

              <div class="py-1">
                <button
                  type="button"
                  @click="batchOps.handleExportExcel"
                  class="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-xs text-gray-200 hover:bg-emerald-500/15 hover:text-emerald-300 transition-all cursor-pointer"
                >
                  <span class="text-base">📊</span>
                  <div>
                    <div class="font-semibold text-emerald-400">Экспорт в Excel (.xlsx)</div>
                    <div class="text-[10px] text-gray-400">Стилизованная таблица Excel</div>
                  </div>
                </button>

                <button
                  type="button"
                  @click="batchOps.handleExportCsv"
                  class="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-xs text-gray-200 hover:bg-sky-500/15 hover:text-sky-300 transition-all cursor-pointer"
                >
                  <span class="text-base">📄</span>
                  <div>
                    <div class="font-semibold text-sky-400">Экспорт в CSV (.csv)</div>
                    <div class="text-[10px] text-gray-400">UTF-8 для 1С и Excel (разделитель ;)</div>
                  </div>
                </button>
              </div>
            </div>
          </transition>
        </div>

        <button
          @click="isImportModalOpen = true"
          class="flex items-center gap-1.5 rounded-lg bg-indigo-600 px-3.5 py-2 text-xs font-medium text-white shadow-lg shadow-indigo-600/20 hover:bg-indigo-500 transition-colors cursor-pointer"
        >
          <span>📥</span> Загрузить CSV
        </button>

        <button
          v-if="store.items.length > 0"
          @click="batchOps.handleClearFact"
          class="flex items-center gap-1.5 rounded-lg bg-red-500/10 px-3 py-2 text-xs font-medium text-red-400 ring-1 ring-red-500/20 hover:bg-red-500/20 hover:text-red-300 transition-colors cursor-pointer"
        >
          <span>🗑️</span> Очистить
        </button>
      </div>
    </div>

    <!-- Search & Filter Toolbar -->
    <div class="flex flex-wrap items-center justify-between gap-3">
      <div class="flex flex-wrap items-center gap-2.5">
        <!-- Search Input -->
        <div class="relative">
          <span class="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-gray-500">
            🔍
          </span>
          <input
            v-model="searchQuery"
            type="text"
            placeholder="Поиск по названию, артикулу, локации…"
            class="w-72 rounded-lg bg-gray-900/70 py-2 pl-9 pr-8 text-sm text-gray-200 ring-1 ring-gray-800/60 placeholder:text-gray-600 focus:outline-none focus:ring-1 focus:ring-indigo-500/40 transition-all duration-200"
          />
          <button
            v-if="searchQuery"
            @click="searchQuery = ''"
            class="absolute right-2.5 top-1/2 -translate-y-1/2 text-xs text-gray-500 hover:text-gray-300 transition-colors cursor-pointer"
            title="Очистить поиск"
          >
            ✕
          </button>
        </div>

        <!-- Filter Chips -->
        <div class="flex flex-wrap items-center gap-1 rounded-lg bg-gray-900/70 p-1 ring-1 ring-gray-800/60 text-xs">
          <button
            type="button"
            @click="filterStatus = 'all'"
            class="rounded-md px-2.5 py-1 font-medium transition-all cursor-pointer"
            :class="[
              filterStatus === 'all'
                ? 'bg-indigo-600 text-white shadow-sm'
                : 'text-gray-400 hover:text-gray-200 hover:bg-gray-800/50',
            ]"
          >
            Все ({{ store.totalCount }})
          </button>

          <button
            type="button"
            @click="filterStatus = 'duplicates'"
            class="rounded-md px-2.5 py-1 font-medium transition-all flex items-center gap-1.5 cursor-pointer"
            :class="[
              filterStatus === 'duplicates'
                ? 'bg-indigo-600 text-white shadow-sm'
                : 'text-gray-400 hover:text-gray-200 hover:bg-gray-800/50',
            ]"
          >
            <span>Дубли</span>
            <span
              v-if="duplicateFactCount > 0"
              class="rounded-full px-1.5 py-0.2 text-[10px] font-bold"
              :class="filterStatus === 'duplicates' ? 'bg-indigo-400 text-gray-950' : 'bg-indigo-500/20 text-indigo-300'"
            >
              {{ duplicateFactCount }}
            </span>
          </button>

          <button
            type="button"
            @click="filterStatus = '299'"
            class="rounded-md px-2.5 py-1 font-medium transition-all flex items-center gap-1.5 cursor-pointer"
            :class="[
              filterStatus === '299'
                ? 'bg-amber-500 text-gray-950 font-bold shadow-sm'
                : 'text-gray-400 hover:text-gray-200 hover:bg-gray-800/50',
            ]"
          >
            <span>299</span>
            <span
              v-if="account299FactCount > 0"
              class="rounded-full px-1.5 py-0.2 text-[10px] font-bold"
              :class="filterStatus === '299' ? 'bg-gray-950 text-amber-400' : 'bg-amber-500/20 text-amber-300'"
            >
              {{ account299FactCount }}
            </span>
          </button>

          <button
            type="button"
            @click="filterStatus = 'nd'"
            class="rounded-md px-2.5 py-1 font-medium transition-all flex items-center gap-1.5 cursor-pointer"
            :class="[
              filterStatus === 'nd'
                ? 'bg-rose-600 text-white shadow-sm'
                : 'text-gray-400 hover:text-gray-200 hover:bg-gray-800/50',
            ]"
          >
            <span>Н/Д</span>
            <span
              v-if="ndFactCount > 0"
              class="rounded-full px-1.5 py-0.2 text-[10px] font-bold"
              :class="filterStatus === 'nd' ? 'bg-rose-400 text-gray-950' : 'bg-rose-500/20 text-rose-300'"
            >
              {{ ndFactCount }}
            </span>
          </button>

          <button
            type="button"
            @click="filterStatus = 'in_catalog'"
            class="rounded-md px-2.5 py-1 font-medium transition-all flex items-center gap-1.5 cursor-pointer"
            :class="[
              filterStatus === 'in_catalog'
                ? 'bg-cyan-600 text-white shadow-sm'
                : 'text-gray-400 hover:text-gray-200 hover:bg-gray-800/50',
            ]"
          >
            <span>В каталоге</span>
            <span
              v-if="inCatalogFactCount > 0"
              class="rounded-full px-1.5 py-0.2 text-[10px] font-bold"
              :class="filterStatus === 'in_catalog' ? 'bg-cyan-400 text-gray-950' : 'bg-cyan-500/20 text-cyan-300'"
            >
              {{ inCatalogFactCount }}
            </span>
          </button>

          <button
            type="button"
            @click="filterStatus = 'non_standard'"
            class="rounded-md px-2.5 py-1 font-medium transition-all flex items-center gap-1.5 cursor-pointer"
            :class="[
              filterStatus === 'non_standard'
                ? 'bg-indigo-600 text-white shadow-sm'
                : 'text-gray-400 hover:text-gray-200 hover:bg-gray-800/50',
            ]"
          >
            <span>Нестандарт</span>
            <span
              v-if="nonStandardFactCount > 0"
              class="rounded-full px-1.5 py-0.2 text-[10px] font-bold"
              :class="filterStatus === 'non_standard' ? 'bg-indigo-400 text-gray-950' : 'bg-indigo-500/20 text-indigo-300'"
            >
              {{ nonStandardFactCount }}
            </span>
          </button>

          <button
            type="button"
            @click="filterStatus = 'mult_gt_1'"
            class="rounded-md px-2.5 py-1 font-medium transition-all flex items-center gap-1.5 cursor-pointer"
            :class="[
              filterStatus === 'mult_gt_1'
                ? 'bg-purple-600 text-white shadow-sm'
                : 'text-gray-400 hover:text-gray-200 hover:bg-gray-800/50',
            ]"
          >
            <span>Кратность &gt; 1</span>
            <span
              v-if="multGt1FactCount > 0"
              class="rounded-full px-1.5 py-0.2 text-[10px] font-bold"
              :class="filterStatus === 'mult_gt_1' ? 'bg-purple-400 text-gray-950' : 'bg-purple-500/20 text-purple-300'"
            >
              {{ multGt1FactCount }}
            </span>
          </button>
        </div>

        <!-- Location Dropdown -->
        <div v-if="distinctLocations.length > 0" class="flex items-center">
          <select
            v-model="selectedLocation"
            class="rounded-lg bg-gray-900/70 px-3 py-2 text-xs font-medium text-gray-200 ring-1 ring-gray-800/60 focus:outline-none focus:ring-1 focus:ring-indigo-500/40 cursor-pointer"
          >
            <option :value="null">📍 Все локации ({{ distinctLocations.length }})</option>
            <option v-for="loc in distinctLocations" :key="loc" :value="loc">
              📍 {{ loc }}
            </option>
          </select>
        </div>

        <!-- Reset Button -->
        <button
          v-if="isFilterActive"
          type="button"
          @click="handleResetFilters"
          class="flex items-center gap-1 rounded-lg bg-gray-800/70 px-2.5 py-1.5 text-xs text-gray-400 hover:text-red-300 hover:bg-red-500/10 ring-1 ring-gray-700/50 transition-all cursor-pointer"
          title="Сбросить все фильтры и сортировку"
        >
          <span>✕</span>
          <span>Сбросить</span>
        </button>
      </div>

      <!-- Stats & Quick Actions -->
      <div class="flex items-center gap-2.5">
        <!-- Direct Quick Copy Button for visible items -->
        <button
          v-if="sortedItems.length > 0"
          type="button"
          @click="handleCopyFilteredSkus"
          class="flex items-center gap-1.5 rounded-lg bg-indigo-500/15 px-3 py-1.5 text-xs font-semibold text-indigo-300 ring-1 ring-indigo-500/30 hover:bg-indigo-500/25 hover:text-indigo-200 transition-all cursor-pointer shadow-sm"
          :title="isFilterActive ? `Скопировать ${sortedItems.length} отфильтрованных ЛК в буфер обмена` : `Скопировать все ${sortedItems.length} ЛК в буфер обмена`"
        >
          <span>📋</span>
          <span>Скопировать ЛК ({{ sortedItems.length }})</span>
        </button>

        <!-- Direct Quick Fix Button for Active Filter -->
        <button
          v-if="!isReadOnly && filterStatus === 'duplicates' && duplicateFactCount > 0"
          type="button"
          @click="batchOps.handleMergeDuplicates"
          class="inline-flex items-center gap-1.5 rounded-lg bg-rose-500/20 px-3 py-1.5 text-xs font-semibold text-rose-300 ring-1 ring-rose-500/40 hover:bg-rose-500/30 transition-all cursor-pointer shadow-sm animate-pulse"
        >
          <span>⚡</span>
          <span>Объединить {{ duplicateFactCount }} дубликатов</span>
        </button>

        <button
          v-else-if="!isReadOnly && filterStatus === 'non_standard' && nonStandardFactCount > 0"
          type="button"
          @click="batchOps.handleRemoveNonStandard"
          class="inline-flex items-center gap-1.5 rounded-lg bg-amber-500/20 px-3 py-1.5 text-xs font-semibold text-amber-300 ring-1 ring-amber-500/40 hover:bg-amber-500/30 transition-all cursor-pointer shadow-sm"
        >
          <span>🗑️</span>
          <span>Удалить {{ nonStandardFactCount }} нестандартных</span>
        </button>

        <button
          v-else-if="!isReadOnly && filterStatus === 'nd' && ndFactCount > 0"
          type="button"
          @click="batchOps.handleRemoveNotFound"
          class="inline-flex items-center gap-1.5 rounded-lg bg-amber-500/20 px-3 py-1.5 text-xs font-semibold text-amber-300 ring-1 ring-amber-500/40 hover:bg-amber-500/30 transition-all cursor-pointer shadow-sm"
        >
          <span>🗑️</span>
          <span>Удалить {{ ndFactCount }} позиций Н/Д</span>
        </button>

        <div class="text-xs font-mono text-gray-400">
          Показано: <strong class="text-indigo-400 font-semibold">{{ sortedItems.length }}</strong> из {{ store.totalCount }}
        </div>
      </div>
    </div>
  </div>
</template>
