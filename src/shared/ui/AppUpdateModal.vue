<script setup lang="ts">
import { computed } from 'vue'
import { useAppUpdater } from '@shared/lib/useAppUpdater'

const updater = useAppUpdater()

const formattedProgress = computed(() => {
  return `${updater.downloadProgress.value}%`
})

const formattedSize = computed(() => {
  const mbDownloaded = (updater.downloadedBytes.value / (1024 * 1024)).toFixed(1)
  const mbTotal = (updater.totalBytes.value / (1024 * 1024)).toFixed(1)
  if (updater.totalBytes.value > 0) {
    return `${mbDownloaded} МБ из ${mbTotal} МБ`
  }
  return `${mbDownloaded} МБ`
})

function handleClose() {
  if (updater.status.value !== 'downloading') {
    updater.closeModal()
  }
}
</script>

<template>
  <Teleport to="body">
    <Transition
      enter-active-class="transition duration-200 ease-out"
      enter-from-class="opacity-0 scale-95"
      enter-to-class="opacity-100 scale-100"
      leave-active-class="transition duration-150 ease-in"
      leave-from-class="opacity-100 scale-100"
      leave-to-class="opacity-0 scale-95"
    >
      <div
        v-if="updater.isModalOpen.value"
        class="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm"
        @click.self="handleClose"
      >
        <div
          class="relative w-full max-w-md overflow-hidden rounded-2xl border border-gray-800 bg-gray-900/95 shadow-2xl ring-1 ring-white/10"
        >
          <!-- Top Accent Glow Header -->
          <div class="relative px-6 pt-6 pb-4 border-b border-gray-800/80 bg-gradient-to-b from-indigo-500/10 to-transparent">
            <div class="flex items-start justify-between">
              <div class="flex items-center gap-3">
                <div
                  class="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-indigo-600/20 text-indigo-400 ring-1 ring-indigo-500/30 shadow-inner"
                >
                  <span class="text-xl">🚀</span>
                </div>
                <div>
                  <h3 class="text-base font-semibold text-gray-100">Обновление приложения</h3>
                  <p class="text-xs text-gray-400">
                    {{ updater.status.value === 'downloaded' ? 'Загрузка завершена' : 'Доступна свежая версия Ревизора' }}
                  </p>
                </div>
              </div>

              <button
                v-if="updater.status.value !== 'downloading'"
                type="button"
                @click="updater.closeModal"
                class="rounded-lg p-1.5 text-gray-400 hover:bg-gray-800 hover:text-gray-200 transition-colors cursor-pointer"
              >
                ✕
              </button>
            </div>

            <!-- Version Badge Strip -->
            <div v-if="updater.updateInfo.value" class="mt-4 flex items-center gap-2 text-xs">
              <span class="rounded-md bg-gray-800/90 px-2 py-1 font-mono text-gray-400 ring-1 ring-gray-700/60">
                Текущая: v{{ updater.updateInfo.value.currentVersion }}
              </span>
              <span class="text-gray-500 font-bold">➔</span>
              <span class="rounded-md bg-indigo-500/20 px-2 py-1 font-mono font-semibold text-indigo-300 ring-1 ring-indigo-500/40">
                Новая: v{{ updater.updateInfo.value.version }}
              </span>
            </div>
          </div>

          <!-- Body Content -->
          <div class="p-6 space-y-4">
            <!-- Release Notes -->
            <div v-if="updater.updateInfo.value?.body" class="space-y-1.5">
              <div class="text-xs font-medium text-gray-400">Что нового:</div>
              <div
                class="max-h-36 overflow-y-auto rounded-lg border border-gray-800 bg-gray-950/60 p-3 text-xs text-gray-300 leading-relaxed whitespace-pre-line select-text"
              >
                {{ updater.updateInfo.value.body }}
              </div>
            </div>

            <!-- Error State -->
            <div
              v-if="updater.status.value === 'error'"
              class="rounded-lg border border-rose-500/30 bg-rose-500/10 p-3 text-xs text-rose-300 flex items-start gap-2.5"
            >
              <span class="text-base shrink-0">⚠️</span>
              <div class="min-w-0 flex-1">
                <div class="font-medium">Ошибка при обновлении</div>
                <div class="text-[11px] text-rose-400/90 mt-0.5 break-words">
                  {{ updater.errorMessage.value }}
                </div>
              </div>
            </div>

            <!-- Downloading Progress Bar -->
            <div v-if="updater.status.value === 'downloading'" class="space-y-2 pt-2">
              <div class="flex items-center justify-between text-xs font-medium text-gray-300">
                <span class="flex items-center gap-2">
                  <span class="inline-block h-2 w-2 rounded-full bg-indigo-400 animate-ping" />
                  Загрузка пакета обновления...
                </span>
                <span class="font-mono text-indigo-400">{{ formattedProgress }}</span>
              </div>

              <!-- Track -->
              <div class="h-2 w-full overflow-hidden rounded-full bg-gray-800">
                <div
                  class="h-full bg-gradient-to-r from-indigo-500 to-cyan-400 transition-all duration-200"
                  :style="{ width: formattedProgress }"
                />
              </div>

              <div class="text-right text-[11px] font-mono text-gray-500">
                {{ formattedSize }}
              </div>
            </div>

            <!-- Downloaded / Ready State -->
            <div
              v-if="updater.status.value === 'downloaded'"
              class="rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-3 text-xs text-emerald-300 flex items-center gap-2.5"
            >
              <span class="text-lg">✅</span>
              <div>
                <div class="font-semibold">Обновление загружено</div>
                <div class="text-[11px] text-emerald-400/90">
                  Нажмите кнопку ниже, чтобы перезапустить приложение и применить изменения.
                </div>
              </div>
            </div>
          </div>

          <!-- Footer Actions -->
          <div class="flex items-center justify-end gap-2 border-t border-gray-800/80 bg-gray-950/40 px-6 py-4">
            <!-- Ready to restart -->
            <template v-if="updater.status.value === 'downloaded'">
              <button
                type="button"
                @click="updater.restartApp"
                class="flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 text-xs font-medium text-white shadow-lg shadow-emerald-600/20 hover:bg-emerald-500 transition-all cursor-pointer"
              >
                <span>🔄</span>
                <span>Перезапустить сейчас</span>
              </button>
            </template>

            <!-- Downloading (Disabled button) -->
            <template v-else-if="updater.status.value === 'downloading'">
              <div class="text-xs text-gray-500 italic">Пожалуйста, подождите завершения скачивания...</div>
            </template>

            <!-- Available / Error -->
            <template v-else>
              <button
                type="button"
                @click="updater.closeModal"
                class="rounded-lg border border-gray-700 bg-gray-800 px-3.5 py-2 text-xs font-medium text-gray-300 hover:bg-gray-700 transition-colors cursor-pointer"
              >
                Напомнить позже
              </button>

              <button
                type="button"
                @click="updater.downloadAndInstall"
                class="flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-xs font-medium text-white shadow-lg shadow-indigo-600/30 hover:bg-indigo-500 transition-all cursor-pointer"
              >
                <span>📥</span>
                <span>Обновить сейчас</span>
              </button>
            </template>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>
