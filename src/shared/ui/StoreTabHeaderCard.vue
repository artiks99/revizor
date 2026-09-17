<script setup lang="ts">
defineProps<{
  icon?: string
  title: string
  description?: string
}>()
</script>

<template>
  <div class="flex flex-wrap items-center justify-between gap-3 bg-gray-900/60 p-4 rounded-xl ring-1 ring-gray-800/60">
    <div class="flex items-center gap-3">
      <div class="flex h-10 w-10 items-center justify-center rounded-lg bg-indigo-500/10 text-xl text-indigo-400 shrink-0">
        {{ icon || '📋' }}
      </div>
      <div>
        <h3 class="text-sm font-semibold text-gray-200">{{ title }}</h3>
        <p v-if="description" class="text-xs text-gray-400">
          {{ description }}
        </p>
      </div>
    </div>

    <!-- Action Buttons Slot -->
    <div class="flex items-center gap-2">
      <slot name="actions" />
    </div>
  </div>
</template>
