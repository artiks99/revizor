<script setup lang="ts" generic="T extends { id: string }">
import { ref, computed, watch } from 'vue'
import { useVirtualizer } from '@tanstack/vue-virtual'
import { handleTableCopySkus } from '../lib/clipboard'

const props = withDefaults(
  defineProps<{
    /** Full data array — only visible rows will be rendered */
    items: T[]
    /** Row height in px (must be consistent for accurate virtualisation) */
    rowHeight?: number
    /** How many extra rows to render above/below the viewport */
    overscan?: number
    /** Fixed height for the scrollable container (CSS value) */
    tableHeight?: string
    /** Automatically extract clean SKUs when user copies selected table cells */
    extractSkusOnCopy?: boolean
  }>(),
  {
    rowHeight: 44,
    overscan: 10,
    tableHeight: 'calc(70vh - 88px)',
    extractSkusOnCopy: true,
  },
)

defineSlots<{
  /** Table header content (<tr> with <th> cells) */
  header(): any
  /** Render a single data row. Receives { item, index, key? } */
  row(props: { item: T; index: number; key?: any }): any
  /** Optional inline add-row at the bottom of visible area */
  addRow?(): any
  /** Optional empty-state when items.length === 0 */
  empty?(): any
}>()

const scrollContainerRef = ref<HTMLDivElement | null>(null)

const virtualizer = useVirtualizer(
  computed(() => ({
    count: props.items.length,
    getScrollElement: () => scrollContainerRef.value,
    estimateSize: () => props.rowHeight,
    overscan: props.overscan,
  })),
)

const virtualRows = computed(() => virtualizer.value.getVirtualItems())
const totalSize = computed(() => virtualizer.value.getTotalSize())

/* --- SCROLL NAVIGATION (TOP / BOTTOM) --- */
const isNearTop = ref(true)
const isNearBottom = ref(false)

function onScroll(e: Event) {
  const el = e.target as HTMLElement
  if (!el) return
  const scrollTop = el.scrollTop

  isNearTop.value = scrollTop <= 30

  const vItems = virtualRows.value
  if (vItems.length > 0) {
    const lastItem = vItems[vItems.length - 1]
    isNearBottom.value = lastItem.index >= props.items.length - 2
  } else {
    isNearBottom.value = scrollTop + el.clientHeight >= totalSize.value - 30
  }
}

function scrollToBottom() {
  if (!scrollContainerRef.value || props.items.length === 0) return
  const lastIndex = props.items.length - 1
  virtualizer.value.scrollToIndex(lastIndex, { align: 'end' })
  const targetOffset = totalSize.value + 500
  if (scrollContainerRef.value) {
    scrollContainerRef.value.scrollTop = targetOffset
  }
}

function scrollToTop() {
  if (!scrollContainerRef.value || props.items.length === 0) return
  virtualizer.value.scrollToIndex(0, { align: 'start' })
  if (scrollContainerRef.value) {
    scrollContainerRef.value.scrollTop = 0
  }
}

watch(
  () => props.items.length,
  () => {
    requestAnimationFrame(() => {
      if (scrollContainerRef.value) {
        const el = scrollContainerRef.value
        isNearTop.value = el.scrollTop <= 30
        const vItems = virtualRows.value
        if (vItems.length > 0) {
          const lastItem = vItems[vItems.length - 1]
          isNearBottom.value = lastItem.index >= props.items.length - 2
        } else {
          isNearBottom.value = el.scrollTop + el.clientHeight >= totalSize.value - 30
        }
      }
    })
  }
)

function onCopy(e: ClipboardEvent) {
  if (!props.extractSkusOnCopy) return
  const target = e.target as HTMLElement
  if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)) {
    return
  }
  handleTableCopySkus(e)
}

defineExpose({
  scrollToBottom,
  scrollToTop,
  scrollContainerRef,
})
</script>

<template>
  <div class="relative overflow-hidden rounded-xl ring-1 ring-gray-800/60 bg-gray-900/40">
    <div
      ref="scrollContainerRef"
      class="overflow-auto"
      :style="{ maxHeight: tableHeight }"
      @scroll.passive="onScroll"
      @copy="onCopy"
    >
      <table class="w-full text-left text-sm">
        <!-- Sticky header & pinned add-row at the top -->
        <thead class="sticky top-0 z-10 bg-gray-900 shadow-md select-none">
          <slot name="header" />
          <slot name="addRow" />
        </thead>

        <tbody>
          <!-- Empty state -->
          <template v-if="items.length === 0">
            <slot name="empty" />
          </template>

          <template v-else>
            <!-- Top spacer -->
            <tr
              v-if="virtualRows.length > 0 && virtualRows[0].start > 0"
              aria-hidden="true"
            >
              <td :style="{ height: `${virtualRows[0].start}px`, padding: 0 }" />
            </tr>

            <!-- Virtual rows -->
            <slot
              v-for="vRow in virtualRows"
              :key="props.items[vRow.index].id"
              name="row"
              :item="props.items[vRow.index]"
              :index="vRow.index"
            />

            <!-- Bottom spacer -->
            <tr
              v-if="virtualRows.length > 0"
              aria-hidden="true"
            >
              <td
                :style="{
                  height: `${totalSize - (virtualRows[virtualRows.length - 1].end)}px`,
                  padding: 0,
                }"
              />
            </tr>

            <!-- Extra clearance for floating scroll controls -->
            <tr aria-hidden="true">
              <td colspan="100%" class="h-10 p-0" />
            </tr>
          </template>
        </tbody>
      </table>
    </div>

    <!-- Floating Quick Scroll Navigation Pill (Bottom Right) -->
    <div
      v-if="props.items.length > 10"
      class="absolute right-3 bottom-2.5 z-20 flex items-center gap-1 rounded-full bg-gray-950/85 p-1 ring-1 ring-gray-700/80 shadow-2xl backdrop-blur-md pointer-events-auto"
    >
      <button
        type="button"
        @click="scrollToTop"
        :disabled="isNearTop"
        class="flex h-7 w-7 items-center justify-center rounded-full text-gray-300 hover:bg-indigo-600 hover:text-white disabled:opacity-25 disabled:hover:bg-transparent disabled:hover:text-gray-300 transition-all cursor-pointer disabled:cursor-default"
        title="В начало таблицы (Наверх)"
      >
        <span class="text-[11px] font-bold">▲</span>
      </button>

      <div class="h-3.5 w-px bg-gray-800" />

      <button
        type="button"
        @click="scrollToBottom"
        :disabled="isNearBottom"
        class="flex h-7 w-7 items-center justify-center rounded-full text-gray-300 hover:bg-indigo-600 hover:text-white disabled:opacity-25 disabled:hover:bg-transparent disabled:hover:text-gray-300 transition-all cursor-pointer disabled:cursor-default"
        title="В конец таблицы (Вниз списка)"
      >
        <span class="text-[11px] font-bold">▼</span>
      </button>
    </div>
  </div>
</template>
