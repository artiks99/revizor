<script setup lang="ts">
withDefaults(
  defineProps<{
    colspan: number
    icon?: string
    title: string
    description?: string
  }>(),
  {
    icon: '📭',
    description: '',
  }
)
</script>

<template>
  <tr>
    <td :colspan="colspan" class="py-16 text-center select-none">
      <div class="text-4xl mb-3">{{ icon }}</div>
      <p class="text-sm font-medium text-gray-300">{{ title }}</p>
      <p v-if="description" class="text-xs text-gray-500 mt-1 max-w-md mx-auto leading-relaxed">
        {{ description }}
      </p>
      <slot />
    </td>
  </tr>
</template>
