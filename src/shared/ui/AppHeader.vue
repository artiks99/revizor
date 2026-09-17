<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { useRoute } from 'vue-router'
import { features } from '@features/registry'
import { usePinLockStore } from '@features/auth/model/usePinLockStore'
import { useThemeStore } from '@shared/model/useThemeStore'
import type { ThemeId } from '@shared/model/useThemeStore'

const route = useRoute()
const pinStore = usePinLockStore()
const themeStore = useThemeStore()

const pageTitle = computed(() => {
  const feature = features.find((f) =>
    route.path.startsWith(f.route.path as string)
  )
  return feature?.label ?? 'Ревизор'
})

// Theme dropdown state
const isThemeDropdownOpen = ref(false)
const dropdownRef = ref<HTMLDivElement | null>(null)

function toggleThemeDropdown() {
  isThemeDropdownOpen.value = !isThemeDropdownOpen.value
}

function selectTheme(id: ThemeId) {
  themeStore.setTheme(id)
  isThemeDropdownOpen.value = false
}

function handleClickOutside(e: MouseEvent) {
  if (dropdownRef.value && !dropdownRef.value.contains(e.target as Node)) {
    isThemeDropdownOpen.value = false
  }
}

onMounted(() => {
  document.addEventListener('click', handleClickOutside, true)
})

onUnmounted(() => {
  document.removeEventListener('click', handleClickOutside, true)
})
</script>

<template>
  <header
    class="flex h-14 items-center justify-between border-b px-6 backdrop-blur-sm"
    :style="{
      backgroundColor: 'var(--rev-surface-header)',
      borderColor: 'var(--rev-border)',
    }"
  >
    <h2 class="text-base font-semibold" :style="{ color: 'var(--rev-text-primary)' }">{{ pageTitle }}</h2>

    <div class="flex items-center gap-3">
      <!-- Theme switcher -->
      <div ref="dropdownRef" class="relative">
        <button
          type="button"
          @click="toggleThemeDropdown"
          class="flex h-8 items-center gap-1.5 rounded-lg border px-2.5 text-xs font-medium transition-all hover:text-white cursor-pointer shadow-xs"
          :style="{
            borderColor: 'var(--rev-border-solid)',
            backgroundColor: 'var(--rev-surface-elevated)',
            color: 'var(--rev-text-secondary)',
          }"
          title="Выбрать тему оформления"
        >
          <span>🎨</span>
          <span class="hidden sm:inline">Тема</span>
        </button>

        <!-- Dropdown -->
        <Transition
          enter-active-class="transition duration-150 ease-out"
          enter-from-class="opacity-0 scale-95 -translate-y-1"
          enter-to-class="opacity-100 scale-100 translate-y-0"
          leave-active-class="transition duration-100 ease-in"
          leave-from-class="opacity-100 scale-100 translate-y-0"
          leave-to-class="opacity-0 scale-95 -translate-y-1"
        >
          <div
            v-if="isThemeDropdownOpen"
            class="absolute right-0 top-full mt-2 w-64 rounded-xl border p-2 shadow-2xl z-50"
            :style="{
              borderColor: 'var(--rev-border-solid)',
              backgroundColor: 'var(--rev-surface-elevated)',
            }"
          >
            <p class="px-2 py-1.5 text-[11px] font-semibold uppercase tracking-wider" :style="{ color: 'var(--rev-text-muted)' }">
              Тема оформления
            </p>

            <button
              v-for="theme in themeStore.themes"
              :key="theme.id"
              @click="selectTheme(theme.id)"
              class="group flex w-full items-center gap-3 rounded-lg px-2.5 py-2.5 text-left transition-all duration-150 cursor-pointer"
              :class="[
                themeStore.currentThemeId === theme.id
                  ? ''
                  : 'hover:bg-white/5',
              ]"
              :style="themeStore.currentThemeId === theme.id ? {
                backgroundColor: 'var(--rev-accent-glow)',
                boxShadow: 'inset 0 0 0 1px var(--rev-accent)',
              } : {}"
            >
              <!-- Theme preview swatch -->
              <div
                class="relative flex h-10 w-14 shrink-0 overflow-hidden rounded-md ring-1 ring-white/10"
              >
                <!-- Sidebar swatch -->
                <div
                  class="w-1/3"
                  :style="{ backgroundColor: theme.preview.sidebar }"
                />
                <!-- Main area swatch -->
                <div
                  class="flex w-2/3 flex-col"
                  :style="{ backgroundColor: theme.preview.surface }"
                >
                  <!-- Accent bar -->
                  <div
                    class="mx-1 mt-1.5 h-1 rounded-full"
                    :style="{ backgroundColor: theme.preview.accent }"
                  />
                  <div
                    class="mx-1 mt-1 h-0.5 w-3/4 rounded-full opacity-30"
                    :style="{ backgroundColor: theme.preview.accent }"
                  />
                  <div
                    class="mx-1 mt-0.5 h-0.5 w-1/2 rounded-full opacity-20"
                    :style="{ backgroundColor: theme.preview.accent }"
                  />
                </div>
                <!-- Active checkmark -->
                <div
                  v-if="themeStore.currentThemeId === theme.id"
                  class="absolute inset-0 flex items-center justify-center bg-black/40"
                >
                  <span class="text-xs text-white drop-shadow-lg">✓</span>
                </div>
              </div>

              <!-- Theme info -->
              <div class="min-w-0">
                <p class="text-sm font-medium" :style="{ color: 'var(--rev-text-primary)' }">
                  {{ theme.icon }} {{ theme.label }}
                </p>
                <p class="text-[11px] truncate" :style="{ color: 'var(--rev-text-muted)' }">
                  {{ theme.description }}
                </p>
              </div>
            </button>
          </div>
        </Transition>
      </div>

      <!-- Lock application button -->
      <button
        type="button"
        @click="pinStore.lock()"
        class="flex h-8 items-center gap-1.5 rounded-lg border px-2.5 text-xs font-medium transition-all hover:text-white cursor-pointer shadow-xs"
        :style="{
          borderColor: 'var(--rev-border-solid)',
          backgroundColor: 'var(--rev-surface-elevated)',
          color: 'var(--rev-text-secondary)',
        }"
        title="Заблокировать экран (ввод пин-кода)"
      >
        <span>🔒</span>
        <span class="hidden sm:inline">Заблокировать</span>
      </button>

      <!-- User avatar -->
      <div
        class="flex h-8 w-8 items-center justify-center rounded-full text-xs ring-1 ring-white/10"
        :style="{
          backgroundColor: 'var(--rev-surface-elevated)',
          color: 'var(--rev-text-muted)',
        }"
      >
        👤
      </div>
    </div>
  </header>
</template>
