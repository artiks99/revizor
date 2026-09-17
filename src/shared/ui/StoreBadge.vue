<script setup lang="ts">
import { computed } from 'vue'

export type BadgeVariant = 'indigo' | 'cyan' | 'purple' | 'amber' | 'rose' | 'emerald' | 'gray'
export type BadgeSize = 'xs' | 'sm' | 'badge'

const props = withDefaults(
  defineProps<{
    variant?: BadgeVariant
    pill?: boolean
    size?: BadgeSize
    textClass?: string
  }>(),
  {
    variant: 'indigo',
    pill: true,
    size: 'xs',
    textClass: '',
  }
)

const variantClasses: Record<BadgeVariant, string> = {
  indigo: 'bg-indigo-500/20 text-indigo-300 ring-1 ring-indigo-500/30',
  cyan: 'bg-cyan-500/20 text-cyan-300 ring-1 ring-cyan-500/30',
  purple: 'bg-purple-500/20 text-purple-300 ring-1 ring-purple-500/40',
  amber: 'bg-amber-500/15 text-amber-400 ring-1 ring-amber-500/30',
  rose: 'bg-rose-500/15 text-rose-400 ring-1 ring-rose-500/30',
  emerald: 'bg-emerald-500/15 text-emerald-400 ring-1 ring-emerald-500/30',
  gray: 'bg-gray-800/60 text-gray-400 ring-1 ring-gray-700/50',
}

const sizeClasses: Record<BadgeSize, string> = {
  xs: 'px-2 py-0.5 text-xs font-semibold',
  sm: 'px-2.5 py-1 text-xs font-semibold',
  badge: 'px-1.5 py-0.5 text-[10px] font-bold',
}

const classes = computed(() => {
  return [
    'inline-flex items-center justify-center select-none transition-colors',
    props.pill ? 'rounded-full' : 'rounded-md',
    variantClasses[props.variant] || variantClasses.indigo,
    sizeClasses[props.size] || sizeClasses.xs,
    props.textClass,
  ].filter(Boolean).join(' ')
})
</script>

<template>
  <span :class="classes">
    <slot />
  </span>
</template>
