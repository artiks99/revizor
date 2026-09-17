<script setup lang="ts">
import { computed } from 'vue'
import { useLoading } from '../lib/loadingService'

const { loadingState } = useLoading()

const formattedCurrent = computed(() => {
  if (loadingState.value.current === undefined) return ''
  return loadingState.value.current.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ' ')
})

const formattedTotal = computed(() => {
  if (loadingState.value.total === undefined) return ''
  return loadingState.value.total.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ' ')
})
</script>

<template>
  <Teleport to="body">
    <transition
      enter-active-class="transition-all duration-200 ease-out"
      enter-from-class="opacity-0 scale-95"
      enter-to-class="opacity-100 scale-100"
      leave-active-class="transition-all duration-150 ease-in"
      leave-from-class="opacity-100 scale-100"
      leave-to-class="opacity-0 scale-95"
    >
      <div
        v-if="loadingState.isActive"
        class="fixed inset-0 z-[9999] flex flex-col items-center justify-center bg-gray-950/80 backdrop-blur-md p-4 select-none"
      >
        <div
          class="flex flex-col items-center gap-3.5 p-6 rounded-2xl bg-gray-900/95 border border-indigo-500/30 shadow-2xl shadow-indigo-500/20 max-w-lg w-full text-center relative overflow-hidden"
        >
          <!-- Ambient decorative light glow -->
          <div
            class="absolute -top-12 -right-12 h-32 w-32 rounded-full bg-indigo-500/15 blur-2xl pointer-events-none"
          />
          <div
            class="absolute -bottom-12 -left-12 h-32 w-32 rounded-full bg-purple-500/15 blur-2xl pointer-events-none"
          />

          <!-- Animated Icon with dual rotating spinner -->
          <div class="relative flex h-16 w-16 items-center justify-center shrink-0">
            <div
              class="absolute h-full w-full rounded-full border-2 border-indigo-500/20 border-t-indigo-500 animate-spin"
            />
            <div
              class="absolute h-12 w-12 rounded-full border-2 border-purple-500/20 border-b-purple-400 animate-spin"
              style="animation-direction: reverse; animation-duration: 1.5s;"
            />
            <span class="text-2xl animate-bounce">{{ loadingState.icon || '⏳' }}</span>
          </div>

          <!-- Titles and Stage Badge -->
          <div class="space-y-1.5 w-full">
            <div class="flex items-center justify-center gap-2 flex-wrap">
              <h3 class="text-base font-semibold text-gray-100 tracking-tight">
                {{ loadingState.title }}
              </h3>
              <span
                v-if="loadingState.stage"
                class="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium bg-indigo-500/15 border border-indigo-500/30 text-indigo-300"
              >
                {{ loadingState.stage }}
              </span>
            </div>

            <p
              v-if="loadingState.message"
              class="text-xs text-indigo-400 font-medium break-words leading-relaxed"
            >
              {{ loadingState.message }}
            </p>
          </div>

          <!-- Current Item / Chunk Phase Badge -->
          <div
            v-if="loadingState.chunkText || loadingState.currentItem"
            class="w-full flex items-center justify-center"
          >
            <div
              class="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-indigo-500/10 border border-indigo-500/25 text-[11px] text-indigo-200 max-w-full"
              :title="loadingState.chunkText || loadingState.currentItem"
            >
              <span class="relative flex h-2 w-2 shrink-0">
                <span class="animate-ping absolute inline-flex h-full w-full rounded-full bg-indigo-400 opacity-75" />
                <span class="relative inline-flex rounded-full h-2 w-2 bg-indigo-500" />
              </span>
              <span class="truncate font-mono">
                {{ loadingState.chunkText || loadingState.currentItem }}
              </span>
            </div>
          </div>

          <!-- Progress Bar Area -->
          <div class="w-full space-y-2 mt-1">
            <!-- Detailed Progress: when total or progress is provided -->
            <div
              v-if="loadingState.progress !== null && loadingState.progress !== undefined"
              class="space-y-2"
            >
              <!-- Numbers header -->
              <div class="flex items-center justify-between text-[11px] text-gray-400 font-mono">
                <div v-if="loadingState.total" class="flex items-center gap-1">
                  <span class="text-gray-400">Обработано:</span>
                  <span class="text-indigo-200 font-semibold">{{ formattedCurrent }}</span>
                  <span>из</span>
                  <span class="text-gray-300">{{ formattedTotal }} {{ loadingState.unit || 'поз.' }}</span>
                </div>
                <div v-else>
                  <span>Прогресс</span>
                </div>
                <span class="text-indigo-300 font-bold ml-auto">{{ Math.round(loadingState.progress) }}%</span>
              </div>

              <!-- Bar with shimmer -->
              <div class="w-full h-2.5 bg-gray-800/90 rounded-full overflow-hidden p-0.5 border border-gray-700/50 relative">
                <div
                  class="h-full bg-gradient-to-r from-indigo-500 via-purple-500 to-indigo-400 rounded-full transition-all duration-150 relative overflow-hidden"
                  :style="{ width: `${Math.min(100, Math.max(0, loadingState.progress))}%` }"
                >
                  <div class="absolute inset-0 bg-white/20 animate-[shimmer_2s_infinite] -skew-x-12" />
                </div>
              </div>

              <!-- Detailed 3-metrics stats footer -->
              <div class="grid grid-cols-3 gap-2 text-[10px] font-mono pt-1 text-center">
                <div class="p-1.5 rounded-lg bg-gray-800/60 border border-gray-700/40">
                  <span class="text-gray-500 block text-[9px] uppercase tracking-wider">⚡ Скорость</span>
                  <span class="text-indigo-200 font-semibold truncate block">
                    {{ loadingState.speedText || '—' }}
                  </span>
                </div>
                <div class="p-1.5 rounded-lg bg-gray-800/60 border border-gray-700/40">
                  <span class="text-gray-500 block text-[9px] uppercase tracking-wider">⏳ Осталось</span>
                  <span class="text-indigo-200 font-semibold truncate block">
                    {{ loadingState.etaText || loadingState.remainingText || '—' }}
                  </span>
                </div>
                <div class="p-1.5 rounded-lg bg-gray-800/60 border border-gray-700/40">
                  <span class="text-gray-500 block text-[9px] uppercase tracking-wider">⏱️ Прошло</span>
                  <span class="text-indigo-200 font-semibold truncate block">
                    {{ loadingState.elapsedText }}
                  </span>
                </div>
              </div>
            </div>

            <!-- Indeterminate Progress Pulse with live timer -->
            <div
              v-else
              class="space-y-2"
            >
              <div class="flex items-center justify-between text-[11px] text-gray-400 font-mono">
                <span v-if="loadingState.total">Общий объём: {{ formattedTotal }} {{ loadingState.unit || 'поз.' }}</span>
                <span v-else>Выполняется действие...</span>
                <span class="text-indigo-300 font-semibold ml-auto">⏱️ {{ loadingState.elapsedText }}</span>
              </div>

              <div class="w-full h-2 bg-gray-800/80 rounded-full overflow-hidden border border-gray-800">
                <div
                  class="h-full bg-gradient-to-r from-indigo-500 via-purple-500 to-indigo-400 rounded-full animate-pulse w-full"
                />
              </div>

              <div v-if="loadingState.remainingText" class="text-[10px] text-indigo-300/80 font-mono text-center">
                {{ loadingState.remainingText }}
              </div>
            </div>
          </div>

          <!-- Safe SQLite Transaction Warning (for large writes) -->
          <div
            v-if="loadingState.showSafeWarning"
            class="w-full flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg bg-amber-500/10 border border-amber-500/25 text-[11px] text-amber-300/90 text-center"
          >
            <span class="shrink-0">🛡️</span>
            <span>Безопасная транзакция SQLite. Пожалуйста, не закрывайте приложение.</span>
          </div>

          <!-- Description / Details -->
          <p
            v-if="loadingState.details"
            class="text-[11px] text-gray-400 leading-normal max-w-sm"
          >
            {{ loadingState.details }}
          </p>
        </div>
      </div>
    </transition>
  </Teleport>
</template>
