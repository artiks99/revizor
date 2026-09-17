<script setup lang="ts">
import StoreBadge, { type BadgeVariant } from './StoreBadge.vue'

withDefaults(
  defineProps<{
    count: number
    variant?: BadgeVariant
    emptyText?: string
  }>(),
  {
    variant: 'indigo',
    emptyText: '',
  }
)
</script>

<template>
  <StoreBadge v-if="count > 0" :variant="variant" :pill="true">
    {{ count }}
  </StoreBadge>
  <span v-else-if="emptyText && emptyText !== '0'" class="text-rose-400/80 text-[11px] italic">
    {{ emptyText }}
  </span>
  <span v-else class="text-gray-500 font-mono text-xs">0</span>
</template>
