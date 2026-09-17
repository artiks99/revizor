<script setup lang="ts">
import StoreBadge from './StoreBadge.vue'

defineProps<{
  value?: number | null
}>()
</script>

<template>
  <template v-if="value === null || value === undefined">
    <span class="text-gray-600 font-normal">—</span>
  </template>
  <template v-else-if="value === 0">
    <StoreBadge variant="emerald" :pill="false" text-class="font-mono font-bold">
      ОК
    </StoreBadge>
  </template>
  <template v-else-if="value > 0">
    <StoreBadge variant="amber" :pill="false" text-class="font-mono font-bold">
      +{{ value }}
    </StoreBadge>
  </template>
  <template v-else>
    <StoreBadge variant="rose" :pill="false" text-class="font-mono font-bold">
      {{ value }}
    </StoreBadge>
  </template>
</template>
