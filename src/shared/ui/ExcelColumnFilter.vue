<script setup lang="ts">
import { ref, computed, nextTick, onMounted, onUnmounted } from 'vue'
import type { DistinctValueItem } from '../lib/useExcelColumnFilter'

const props = withDefaults(
  defineProps<{
    /** Заголовок или ключ колонки */
    title?: string
    /** Список уникальных значений для выбора (массив или ленивая функция-геттер) */
    distinctValues: DistinctValueItem[] | (() => DistinctValueItem[])
    /** Активный набор выбранных ключей (null = фильтр не применен, выбраны все) */
    modelValue: Set<string> | null
    /** Выравнивание выпадающего окна */
    align?: 'left' | 'right'
  }>(),
  {
    title: '',
    align: 'left',
  }
)

const emit = defineEmits<{
  'update:modelValue': [val: Set<string> | null]
}>()

const isOpen = ref(false)
const searchQuery = ref('')
const searchInputRef = ref<HTMLInputElement | null>(null)
const dropdownRef = ref<HTMLDivElement | null>(null)
const triggerButtonRef = ref<HTMLButtonElement | null>(null)
const popupPos = ref({ top: 0, left: 0 })

function normalizeDistinctItems(rawList: any[]): DistinctValueItem[] {
  if (!rawList || rawList.length === 0) return []
  // If already DistinctValueItem objects
  if (
    typeof rawList[0] === 'object' &&
    rawList[0] !== null &&
    'key' in rawList[0] &&
    'label' in rawList[0]
  ) {
    return rawList as DistinctValueItem[]
  }
  // Otherwise, it's a list of primitive strings/numbers or unformatted items! Count them!
  const counts = new Map<string, { label: string; count: number; isEmpty: boolean }>()
  let emptyCount = 0
  for (const raw of rawList) {
    if (raw === null || raw === undefined || String(raw).trim() === '') {
      emptyCount++
    } else {
      const key = String(raw).trim()
      const existing = counts.get(key)
      if (existing) {
        existing.count++
      } else {
        counts.set(key, { label: key, count: 1, isEmpty: false })
      }
    }
  }
  const result: DistinctValueItem[] = []
  if (emptyCount > 0) {
    result.push({ key: '__EMPTY__', label: '(Пустые)', count: emptyCount, isEmpty: true })
  }
  const sorted = Array.from(counts.entries()).sort((a, b) =>
    a[1].label.localeCompare(b[1].label, 'ru', { numeric: true, sensitivity: 'base' })
  )
  for (const [k, v] of sorted) {
    result.push({ key: k, label: v.label, count: v.count, isEmpty: false })
  }
  return result
}

// Лениво вычисляемые уникальные значения (только когда дропдаун открыт)
const resolvedDistinctValues = computed<DistinctValueItem[]>(() => {
  if (!isOpen.value) return []
  let raw: any = []
  if (typeof props.distinctValues === 'function') {
    raw = (props.distinctValues as () => any)()
  } else {
    raw = props.distinctValues || []
  }
  return normalizeDistinctItems(raw)
})

const totalDistinctCount = computed(() => {
  return resolvedDistinctValues.value.length
})

// Временный набор выбранных ключей до нажатия "ОК"
const stagedSelectedKeys = ref<Set<string>>(new Set())

const isFiltered = computed(() => props.modelValue !== null)

function initStaged() {
  const distinct = resolvedDistinctValues.value
  if (props.modelValue === null) {
    // Выбраны все
    stagedSelectedKeys.value = new Set(distinct.map((d) => d.key))
  } else {
    stagedSelectedKeys.value = new Set(props.modelValue)
  }
}

function updatePosition() {
  if (!triggerButtonRef.value) return
  const rect = triggerButtonRef.value.getBoundingClientRect()
  const dropdownWidth = 290
  let left = props.align === 'right' ? rect.right - dropdownWidth : rect.left

  // Ensure within window bounds
  if (left + dropdownWidth > window.innerWidth - 12) {
    left = window.innerWidth - dropdownWidth - 12
  }
  if (left < 12) {
    left = 12
  }

  let top = rect.bottom + 6
  // If goes beyond bottom of viewport, position above button
  if (top + 340 > window.innerHeight) {
    top = Math.max(12, rect.top - 340)
  }

  popupPos.value = { top, left }
}

function openDropdown() {
  isOpen.value = true
  initStaged()
  searchQuery.value = ''
  updatePosition()
  nextTick(() => {
    updatePosition()
    searchInputRef.value?.focus()
  })
}

function closeDropdown() {
  isOpen.value = false
  searchQuery.value = ''
}

function toggleDropdown(e: MouseEvent) {
  e.stopPropagation()
  e.preventDefault()
  if (isOpen.value) {
    closeDropdown()
  } else {
    openDropdown()
  }
}

// Список значений с учетом поисковой строки
const filteredDistinct = computed(() => {
  const q = searchQuery.value.trim().toLowerCase()
  const list = resolvedDistinctValues.value
  if (!q) return list
  return list.filter((item) =>
    item.label.toLowerCase().includes(q)
  )
})

const isAllFilteredSelected = computed(() => {
  if (filteredDistinct.value.length === 0) return false
  return filteredDistinct.value.every((item) => stagedSelectedKeys.value.has(item.key))
})

function selectAllVisible() {
  const newSet = new Set(stagedSelectedKeys.value)
  for (const item of filteredDistinct.value) {
    newSet.add(item.key)
  }
  stagedSelectedKeys.value = newSet
}

function unselectAllVisible() {
  const newSet = new Set(stagedSelectedKeys.value)
  for (const item of filteredDistinct.value) {
    newSet.delete(item.key)
  }
  stagedSelectedKeys.value = newSet
}

function toggleItem(key: string) {
  const newSet = new Set(stagedSelectedKeys.value)
  if (newSet.has(key)) {
    newSet.delete(key)
  } else {
    newSet.add(key)
  }
  stagedSelectedKeys.value = newSet
}

function selectOnlyItem(key: string) {
  stagedSelectedKeys.value = new Set([key])
}

function handleApply() {
  const allKeys = resolvedDistinctValues.value.map((d) => d.key)
  // Если выбраны абсолютно все уникальные значения, сбрасываем фильтр в null
  if (
    allKeys.length > 0 &&
    stagedSelectedKeys.value.size >= allKeys.length &&
    allKeys.every((k) => stagedSelectedKeys.value.has(k))
  ) {
    emit('update:modelValue', null)
  } else {
    emit('update:modelValue', new Set(stagedSelectedKeys.value))
  }
  closeDropdown()
}

function handleReset() {
  stagedSelectedKeys.value = new Set(resolvedDistinctValues.value.map((d) => d.key))
  emit('update:modelValue', null)
  closeDropdown()
}

function handleDocClick(e: MouseEvent) {
  if (!isOpen.value) return
  const target = e.target as HTMLElement | null
  if (
    dropdownRef.value &&
    !dropdownRef.value.contains(target) &&
    triggerButtonRef.value &&
    !triggerButtonRef.value.contains(target)
  ) {
    closeDropdown()
  }
}

function handleKeyDown(e: KeyboardEvent) {
  if (!isOpen.value) return
  if (e.key === 'Escape') {
    closeDropdown()
  } else if (e.key === 'Enter') {
    handleApply()
  }
}

function handleWindowResize() {
  if (isOpen.value) {
    updatePosition()
  }
}

onMounted(() => {
  document.addEventListener('click', handleDocClick)
  document.addEventListener('keydown', handleKeyDown)
  window.addEventListener('resize', handleWindowResize)
  window.addEventListener('scroll', handleWindowResize, true)
})

onUnmounted(() => {
  document.removeEventListener('click', handleDocClick)
  document.removeEventListener('keydown', handleKeyDown)
  window.removeEventListener('resize', handleWindowResize)
  window.removeEventListener('scroll', handleWindowResize, true)
})
</script>

<template>
  <div class="relative inline-flex items-center" @click.stop>
    <!-- Trigger Button in Header -->
    <button
      ref="triggerButtonRef"
      type="button"
      @click="toggleDropdown"
      class="inline-flex items-center justify-center gap-1 rounded-md px-1.5 py-0.5 text-xs font-semibold transition-all cursor-pointer select-none ring-1 shadow-xs"
      :class="[
        isFiltered
          ? 'bg-emerald-500/25 text-emerald-300 ring-emerald-400/60 hover:bg-emerald-500/35 hover:text-white'
          : 'bg-gray-800/80 text-gray-400 ring-gray-700/60 hover:bg-gray-700 hover:text-gray-100',
      ]"
      :title="isFiltered ? `Фильтр активен (${modelValue?.size || 0} из ${totalDistinctCount}). Нажмите для настройки` : `Excel-фильтр: ${title}`"
    >
      <span v-if="isFiltered" class="text-[11px]">🌪️</span>
      <span v-else class="text-[9px] opacity-75">▼</span>
    </button>

    <!-- Excel-like Dropdown Pop-up -->
    <teleport to="body">
      <transition
        enter-active-class="transition duration-150 ease-out"
        enter-from-class="transform scale-95 opacity-0 -translate-y-1"
        enter-to-class="transform scale-100 opacity-100 translate-y-0"
        leave-active-class="transition duration-100 ease-in"
        leave-from-class="transform scale-100 opacity-100 translate-y-0"
        leave-to-class="transform scale-95 opacity-0 -translate-y-1"
      >
        <div
          v-if="isOpen"
          ref="dropdownRef"
          class="fixed z-[9999] flex flex-col w-72 max-w-sm rounded-xl bg-gray-950 p-3.5 shadow-2xl ring-1 ring-gray-700 text-gray-200"
          :style="{
            top: `${popupPos.top}px`,
            left: `${popupPos.left}px`,
          }"
          @click.stop
        >
          <!-- Header Title & Counter -->
          <div class="flex items-center justify-between pb-2 text-[11px] font-medium border-b border-gray-800 select-none">
            <div class="flex items-center gap-1.5">
              <button
                type="button"
                @click="selectAllVisible"
                class="text-indigo-400 hover:text-indigo-300 hover:underline cursor-pointer"
              >
                Выбрать все ({{ filteredDistinct.length }})
              </button>
              <span class="text-gray-600">-</span>
              <button
                type="button"
                @click="unselectAllVisible"
                class="text-gray-400 hover:text-rose-300 hover:underline cursor-pointer"
              >
                Сбросить
              </button>
            </div>
            <div class="text-gray-500 font-mono text-[10px]">
              Показано: {{ filteredDistinct.length }}
            </div>
          </div>

          <!-- Search Box -->
          <div class="relative my-2.5">
            <span class="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-500 text-xs">
              🔍
            </span>
            <input
              ref="searchInputRef"
              v-model="searchQuery"
              type="text"
              placeholder="Поиск значений…"
              class="w-full rounded-lg bg-gray-900 py-1.5 pl-8 pr-7 text-xs text-gray-200 ring-1 ring-gray-700 placeholder:text-gray-600 focus:outline-none focus:ring-1 focus:ring-emerald-500"
            />
            <button
              v-if="searchQuery"
              type="button"
              @click="searchQuery = ''"
              class="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-gray-500 hover:text-gray-300 cursor-pointer"
            >
              ✖
            </button>
          </div>

          <!-- Scrollable Values List -->
          <div class="max-h-56 overflow-y-auto space-y-0.5 pr-1 my-1 divide-y divide-gray-800/40 text-xs">
            <div
              v-if="filteredDistinct.length === 0"
              class="py-5 text-center text-xs text-gray-500 italic"
            >
              Значений не найдено
            </div>

            <label
              v-for="item in filteredDistinct"
              :key="item.key"
              class="flex items-center justify-between gap-2 px-2 py-1.5 rounded hover:bg-gray-800/60 cursor-pointer select-none group transition-colors"
              @dblclick.prevent="selectOnlyItem(item.key)"
            >
              <div class="flex items-center gap-2 min-w-0 flex-1">
                <input
                  type="checkbox"
                  :checked="stagedSelectedKeys.has(item.key)"
                  @change="toggleItem(item.key)"
                  class="h-3.5 w-3.5 rounded border-gray-700 bg-gray-900 text-emerald-600 focus:ring-emerald-500 cursor-pointer"
                />
                <span
                  class="truncate text-xs"
                  :class="[
                    item.isEmpty ? 'text-gray-500 italic' : 'text-gray-200',
                    stagedSelectedKeys.has(item.key) ? 'font-medium text-gray-100' : 'opacity-70',
                  ]"
                  :title="item.label"
                >
                  {{ item.label }}
                </span>
              </div>
              <span class="rounded bg-gray-800/80 px-1.5 py-0.2 text-[10px] font-mono text-gray-400 shrink-0">
                {{ item.count }}
              </span>
            </label>
          </div>

          <!-- Footer Action Buttons -->
          <div class="flex items-center justify-between gap-2 pt-2.5 border-t border-gray-800 mt-1">
            <button
              v-if="isFiltered"
              type="button"
              @click="handleReset"
              class="text-[11px] text-rose-400 hover:text-rose-300 hover:underline cursor-pointer"
            >
              Очистить
            </button>
            <div v-else />

            <div class="flex items-center gap-2">
              <button
                type="button"
                @click="closeDropdown"
                class="rounded-lg bg-gray-800 px-3 py-1.5 text-xs font-medium text-gray-300 hover:bg-gray-700 hover:text-white transition-colors cursor-pointer"
              >
                Отмена
              </button>
              <button
                type="button"
                @click="handleApply"
                class="rounded-lg bg-emerald-700 hover:bg-emerald-600 px-4 py-1.5 text-xs font-semibold text-white shadow-md shadow-emerald-950/40 transition-colors cursor-pointer"
              >
                ОК
              </button>
            </div>
          </div>
        </div>
      </transition>
    </teleport>
  </div>
</template>
