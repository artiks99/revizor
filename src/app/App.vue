<script setup lang="ts">
import { onMounted } from 'vue'
import MainLayout from '@shared/ui/MainLayout.vue'
import PinLockScreen from '@features/auth/ui/PinLockScreen.vue'
import { usePinLockStore } from '@features/auth/model/usePinLockStore'
import { useAppUpdater } from '@shared/lib/useAppUpdater'

const pinStore = usePinLockStore()
const updater = useAppUpdater()

onMounted(() => {
  // Тихая фоновая проверка обновлений через 3 секунды после запуска
  setTimeout(() => {
    updater.checkForUpdates(true)
  }, 3000)
})
</script>

<template>
  <MainLayout />
  <PinLockScreen v-if="pinStore.isLocked" />
</template>
