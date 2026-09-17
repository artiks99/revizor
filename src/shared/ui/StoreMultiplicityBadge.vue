<script setup lang="ts">
import StoreBadge, { type BadgeVariant } from './StoreBadge.vue'

withDefaults(
  defineProps<{
    value: number
    variant?: BadgeVariant
  }>(),
  {
    variant: 'indigo',
  }
)
</script>

<template>
  <StoreBadge v-if="value > 1" :variant="variant" :pill="true">
    ×{{ value }}
  </StoreBadge>
  <span v-else class="text-gray-500 font-mono text-xs">1</span>
</template>
