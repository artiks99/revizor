<script setup lang="ts">
import type { DistinctValueItem } from '../lib/useExcelColumnFilter'
import ExcelColumnFilter from './ExcelColumnFilter.vue'

const props = withDefaults(
  defineProps<{
    /** Название колонки для заголовка и тултипа фильтра */
    title: string
    /** Ключ колонки в модели данных */
    columnKey: string
    /** Текущий активный ключ сортировки */
    sortKey?: string | null
    /** Направление сортировки */
    sortDirection?: 'asc' | 'desc' | null
    /** Доступна ли сортировка */
    sortable?: boolean
    /** Доступен ли Excel-фильтр */
    filterable?: boolean
    /** Список уникальных значений для фильтра (массив или ленивый геттер) */
    distinctValues?: DistinctValueItem[] | (() => DistinctValueItem[])
    /** Выбранные значения фильтра (null = все выбраны) */
    modelValue?: Set<string> | null
    /** Выравнивание контента */
    align?: 'left' | 'right' | 'center'
    /** Tailwind классы ширины (напр. 'w-32', 'min-w-[200px]') */
    width?: string
    /** Дополнительные CSS классы для ячейки <th> */
    headerClass?: string
    /** Компактный режим с уменьшенным шрифтом и отступами */
    compact?: boolean
  }>(),
  {
    sortKey: null,
    sortDirection: null,
    sortable: true,
    filterable: true,
    distinctValues: () => [],
    modelValue: null,
    align: 'left',
    width: '',
    headerClass: '',
    compact: false,
  }
)

const emit = defineEmits<{
  'sort': [key: string]
  'update:modelValue': [val: Set<string> | null]
}>()

function handleSort() {
  if (props.sortable) {
    emit('sort', props.columnKey)
  }
}
</script>

<template>
  <th
    class="font-medium select-none transition-colors hover:bg-gray-800/40"
    :class="[
      compact ? 'px-2 py-1.5 text-[10px]' : 'px-3 py-3 text-xs',
      sortKey === columnKey ? 'text-indigo-400 font-semibold bg-gray-800/20' : '',
      align === 'right' ? 'text-right' : align === 'center' ? 'text-center' : 'text-left',
      width,
      headerClass,
    ]"
  >
    <div
      class="flex items-center"
      :class="[
        compact ? 'gap-1' : 'gap-1.5',
        align === 'right' ? 'justify-end' : align === 'center' ? 'justify-center' : 'justify-between',
      ]"
    >
      <!-- Левая кнопка фильтра при правом выравнивании -->
      <ExcelColumnFilter
        v-if="filterable && align === 'right'"
        :title="title"
        :distinct-values="distinctValues"
        :model-value="modelValue"
        align="right"
        @update:model-value="emit('update:modelValue', $event)"
      />

      <!-- Заголовок и индикатор сортировки -->
      <div
        class="flex items-center"
        :class="[
          compact ? 'gap-1' : 'gap-1.5',
          sortable ? 'cursor-pointer select-none' : '',
          align === 'right' ? 'justify-end' : align === 'center' ? 'justify-center' : 'flex-1',
        ]"
        :title="sortable ? `Нажмите для сортировки по колонке «${title}»` : undefined"
        @click="handleSort"
      >
        <slot name="title">
          <span class="whitespace-nowrap">{{ title }}</span>
        </slot>

        <span
          v-if="sortable"
          class="transition-opacity select-none"
          :class="[
            compact ? 'text-[9px]' : 'text-xs',
            sortKey === columnKey ? 'text-indigo-400 opacity-100 font-bold' : 'opacity-30 hover:opacity-80'
          ]"
        >
          <template v-if="sortKey === columnKey">
            {{ sortDirection === 'asc' ? '▲' : '▼' }}
          </template>
          <template v-else>↕</template>
        </span>
      </div>

      <!-- Правая кнопка фильтра при левом или центральном выравнивании -->
      <ExcelColumnFilter
        v-if="filterable && align !== 'right'"
        :title="title"
        :distinct-values="distinctValues"
        :model-value="modelValue"
        align="left"
        @update:model-value="emit('update:modelValue', $event)"
      />
    </div>
  </th>
</template>
