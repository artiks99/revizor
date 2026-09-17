import { defineStore } from 'pinia'
import { ref } from 'vue'

export type ThemeId = 'midnight' | 'discord'

export interface ThemeDefinition {
  id: ThemeId
  label: string
  icon: string
  description: string
  preview: {
    surface: string
    sidebar: string
    accent: string
  }
  vars: Record<string, string>
}

const themes: ThemeDefinition[] = [
  {
    id: 'midnight',
    label: 'Midnight',
    icon: '🌑',
    description: 'Глубокий тёмный с индиго',
    preview: {
      surface: '#0a0a0f',
      sidebar: '#111119',
      accent: '#6366f1',
    },
    vars: {
      '--rev-surface': '#0a0a0f',
      '--rev-surface-elevated': '#111119',
      '--rev-surface-sidebar': '#111119',
      '--rev-surface-header': 'rgba(17, 17, 25, 0.5)',
      '--rev-surface-main': '#030712',
      '--rev-text-primary': '#e5e7eb',
      '--rev-text-secondary': '#9ca3af',
      '--rev-text-muted': '#6b7280',
      '--rev-border': 'rgba(55, 65, 81, 0.6)',
      '--rev-border-solid': '#1f2937',
      '--rev-accent': '#6366f1',
      '--rev-accent-hover': '#818cf8',
      '--rev-accent-glow': 'rgba(99, 102, 241, 0.2)',
      '--rev-accent-text': '#a5b4fc',
      '--rev-scrollbar-thumb': '#27272a',
      '--rev-scrollbar-thumb-hover': '#3f3f46',
      '--rev-selection-bg': 'rgba(99, 102, 241, 0.3)',
      '--rev-input-bg': '#111827',
      '--rev-hover-bg': 'rgba(55, 65, 81, 0.5)',
    },
  },
  {
    id: 'discord',
    label: 'Discord',
    icon: '💜',
    description: 'Тёплый фиолетовый',
    preview: {
      surface: '#313338',
      sidebar: '#1e1f22',
      accent: '#5865f2',
    },
    vars: {
      '--rev-surface': '#313338',
      '--rev-surface-elevated': '#2b2d31',
      '--rev-surface-sidebar': '#1e1f22',
      '--rev-surface-header': 'rgba(43, 45, 49, 0.8)',
      '--rev-surface-main': '#313338',
      '--rev-text-primary': '#f2f3f5',
      '--rev-text-secondary': '#b5bac1',
      '--rev-text-muted': '#80848e',
      '--rev-border': 'rgba(63, 65, 71, 0.8)',
      '--rev-border-solid': '#3f4147',
      '--rev-accent': '#5865f2',
      '--rev-accent-hover': '#4752c4',
      '--rev-accent-glow': 'rgba(88, 101, 242, 0.25)',
      '--rev-accent-text': '#949cf7',
      '--rev-scrollbar-thumb': '#1a1b1e',
      '--rev-scrollbar-thumb-hover': '#2e2f34',
      '--rev-selection-bg': 'rgba(88, 101, 242, 0.3)',
      '--rev-input-bg': '#1e1f22',
      '--rev-hover-bg': 'rgba(79, 84, 92, 0.4)',
    },
  },
]

const STORAGE_KEY = 'revizor-theme'

export const useThemeStore = defineStore('theme', () => {
  const currentThemeId = ref<ThemeId>('midnight')

  function getTheme(id: ThemeId): ThemeDefinition {
    return themes.find((t) => t.id === id) ?? themes[0]
  }

  function applyTheme(id: ThemeId) {
    const theme = getTheme(id)
    const root = document.documentElement

    // Set CSS custom properties
    for (const [key, value] of Object.entries(theme.vars)) {
      root.style.setProperty(key, value)
    }

    // Set theme class on html for targeted overrides
    root.classList.remove(...themes.map((t) => `theme-${t.id}`))
    root.classList.add(`theme-${theme.id}`)

    currentThemeId.value = id
  }

  function setTheme(id: ThemeId) {
    applyTheme(id)
    try {
      localStorage.setItem(STORAGE_KEY, id)
    } catch {
      // localStorage may be unavailable in some contexts
    }
  }

  function initTheme() {
    let saved: string | null = null
    try {
      saved = localStorage.getItem(STORAGE_KEY)
    } catch {
      // ignore
    }
    const id = saved === 'discord' ? 'discord' : 'midnight'
    applyTheme(id)
  }

  return {
    currentThemeId,
    themes,
    getTheme,
    setTheme,
    initTheme,
  }
})
