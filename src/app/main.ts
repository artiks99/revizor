import { createApp } from 'vue'
import { createPinia } from 'pinia'
import router from './router'
import App from './App.vue'
import { features } from '@features/registry'
import { SqliteDatabaseProvider } from '@shared'
import { useThemeStore } from '@shared/model/useThemeStore'

import './app.css'

// Глобальный перехват ошибок при старте (чтобы экран никогда не оставался безмолвно чёрным)
window.addEventListener('error', (event) => {
  console.error('[Global Error]', event.error || event.message)
})

window.addEventListener('unhandledrejection', (event) => {
  console.error('[Unhandled Rejection]', event.reason)
})

async function bootstrap() {
  const app = createApp(App)

  /* ── Plugins ── */
  app.use(createPinia())
  app.use(router)

  /* ── Инициализация темы ДО монтирования, чтобы не было мигания ── */
  const themeStore = useThemeStore()
  themeStore.initTheme()

  /* ── Монтируем приложение СРАЗУ, чтобы пользователь моментально видел каркас UI ── */
  app.mount('#app')

  /* ── Database Initialization ── */
  try {
    const db = new SqliteDatabaseProvider()

    /* ── Initialize all registered features ── */
    for (const feature of features) {
      if (feature.initialize) {
        try {
          await feature.initialize(db)
        } catch (err) {
          console.error(`[feature:${feature.id}] initialization failed:`, err)
        }
      }
    }

    console.log(
      `[app] Ревизор запущен. Активные фичи: ${features.map((f) => f.id).join(', ')}`,
    )
  } catch (err) {
    console.error('[app] Database/Feature initialization error:', err)
  }
}

bootstrap()
