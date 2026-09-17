<script setup lang="ts">
import { computed } from 'vue'
import StoreBadge, { type BadgeVariant } from './StoreBadge.vue'

export type StoreStatusType = '299' | 'nd' | 'duplicate' | 'non_standard' | 'in_catalog'

const props = withDefaults(
  defineProps<{
    status: StoreStatusType
    pill?: boolean
  }>(),
  {
    pill: false,
  }
)

interface StatusConfig {
  label: string
  variant: BadgeVariant
  title?: string
}

const statusConfigs: Record<StoreStatusType, StatusConfig> = {
  '299': {
    label: '299',
    variant: 'purple',
    title: 'Позиция на счете 299',
  },
  'nd': {
    label: 'Н/Д',
    variant: 'amber',
    title: 'Товар отсутствует в справочнике каталога',
  },
  'duplicate': {
    label: 'Дубль',
    variant: 'rose',
    title: 'Дублирующийся артикул',
  },
  'non_standard': {
    label: 'Нестандарт',
    variant: 'amber',
    title: 'Артикул не соответствует формату (не 7 цифр)',
  },
  'in_catalog': {
    label: 'Каталог',
    variant: 'emerald',
    title: 'Товар найден в каталоге магазина',
  },
}

const current = computed(() => statusConfigs[props.status] || { label: props.status, variant: 'gray' })
</script>

<template>
  <StoreBadge
    :variant="current.variant"
    :pill="pill"
    size="badge"
    :title="current.title"
  >
    {{ current.label }}
  </StoreBadge>
</template>
