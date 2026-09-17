<script setup lang="ts">
import { ref, computed } from 'vue'
import type { LocationStatsItem } from '../../model/types'

const props = defineProps<{
  items: LocationStatsItem[]
  totalFactQty: number
  searchQuery: string
}>()

const emit = defineEmits<{
  (e: 'update:searchQuery', val: string): void
}>()

const currentPage = ref(1)
const pageSize = 50

const paginatedItems = computed(() => {
  const start = (currentPage.value - 1) * pageSize
  return props.items.slice(start, start + pageSize)
})

const totalPages = computed(() => Math.max(1, Math.ceil(props.items.length / pageSize)))
</script>

<template>
  <div class="rounded-xl border border-gray-800/60 bg-gray-900/60 p-4 space-y-3">
    <!-- Toolbar -->
    <div class="flex flex-wrap items-center justify-between gap-3">
      <div class="flex items-center gap-2">
        <div class="relative w-64 sm:w-72">
          <input
            :value="searchQuery"
            @input="emit('update:searchQuery', ($event.target as HTMLInputElement).value); currentPage = 1"
            type="text"
            class="w-full rounded-lg bg-gray-950/80 py-1.5 pl-8 pr-7 text-xs text-gray-200 placeholder-gray-500 ring-1 ring-gray-800 focus:outline-none focus:ring-1 focus:ring-purple-500/50"
            placeholder="Поиск по названию локации…"
          />
          <span class="absolute left-2.5 top-1/2 -translate-y-1/2 text-xs text-gray-500">🔍</span>
          <button
            v-if="searchQuery"
            @click="emit('update:searchQuery', ''); currentPage = 1"
            class="absolute right-2.5 top-1/2 -translate-y-1/2 text-xs text-gray-500 hover:text-gray-300"
          >
            ✕
          </button>
        </div>

        <span class="text-xs text-gray-400">
          Всего локаций: <strong class="text-gray-200">{{ items.length }}</strong>
        </span>
      </div>
    </div>

    <!-- Empty State -->
    <div
      v-if="items.length === 0"
      class="flex flex-col items-center justify-center rounded-lg border border-dashed border-gray-800 py-12 text-center"
    >
      <span class="text-3xl">📍</span>
      <h4 class="mt-2 text-sm font-medium text-gray-200">
        {{ searchQuery ? 'Локации не найдены' : 'Локации не заполнены' }}
      </h4>
      <p class="mt-1 text-xs text-gray-500">
        {{ searchQuery ? 'Попробуйте изменить поисковый запрос' : 'В фактической ревизии пока не указаны локации хранения.' }}
      </p>
    </div>

    <!-- Table -->
    <div v-else class="overflow-x-auto rounded-lg border border-gray-800/80">
      <table class="w-full text-left text-xs text-gray-300">
        <thead class="border-b border-gray-800/80 bg-gray-950/80 text-[11px] uppercase tracking-wider text-gray-400 font-semibold">
          <tr>
            <th class="w-12 px-3 py-2.5 text-center">№</th>
            <th class="px-3 py-2.5">Локация склада</th>
            <th class="w-36 px-3 py-2.5 text-right">Позиций (строк)</th>
            <th class="w-36 px-3 py-2.5 text-right">Сумма товара (шт.)</th>
            <th class="w-28 px-3 py-2.5 text-right">Доля</th>
          </tr>
        </thead>
        <tbody class="divide-y divide-gray-800/50 bg-gray-900/40">
          <tr
            v-for="(loc, idx) in paginatedItems"
            :key="loc.location"
            class="hover:bg-gray-800/40 transition-colors"
          >
            <td class="px-3 py-2 text-center text-gray-500 font-mono text-[11px]">
              {{ (currentPage - 1) * pageSize + idx + 1 }}
            </td>
            <td class="px-3 py-2 font-medium text-gray-100 flex items-center gap-1.5">
              <span class="text-purple-400">📍</span>
              <span>{{ loc.location }}</span>
            </td>
            <td class="px-3 py-2 text-right font-mono text-gray-300">
              {{ loc.count.toLocaleString('ru-RU') }}
            </td>
            <td class="px-3 py-2 text-right font-mono font-semibold text-cyan-300">
              {{ loc.totalQty.toLocaleString('ru-RU') }}
            </td>
            <td class="px-3 py-2 text-right font-mono text-gray-400 text-[11px]">
              {{ totalFactQty > 0 ? ((loc.totalQty / totalFactQty) * 100).toFixed(1) : '0' }}%
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <!-- Pagination -->
    <div v-if="totalPages > 1" class="flex items-center justify-between pt-1 text-xs text-gray-400">
      <div>
        Страница {{ currentPage }} из {{ totalPages }}
      </div>
      <div class="flex items-center gap-1">
        <button
          :disabled="currentPage <= 1"
          @click="currentPage--"
          class="rounded px-2.5 py-1 text-xs bg-gray-800 hover:bg-gray-700 disabled:opacity-40 disabled:pointer-events-none text-gray-300"
        >
          Назад
        </button>
        <button
          :disabled="currentPage >= totalPages"
          @click="currentPage++"
          class="rounded px-2.5 py-1 text-xs bg-gray-800 hover:bg-gray-700 disabled:opacity-40 disabled:pointer-events-none text-gray-300"
        >
          Вперед
        </button>
      </div>
    </div>
  </div>
</template>
