import { defineStore } from 'pinia'
import { ref } from 'vue'

const PIN_STORAGE_KEY = 'revizor_app_pin'
export const DEFAULT_PIN = '9090'

export const usePinLockStore = defineStore('pinLock', () => {
  const isLocked = ref(true)

  function getStoredPin(): string {
    const saved = localStorage.getItem(PIN_STORAGE_KEY)
    if (saved && saved.length === 4) {
      return saved
    }
    return DEFAULT_PIN
  }

  const currentPin = ref<string>(getStoredPin())

  function unlock(inputPin: string): boolean {
    if (inputPin === currentPin.value) {
      isLocked.value = false
      return true
    }
    return false
  }

  function lock(): void {
    isLocked.value = true
  }

  function updatePin(newPin: string): void {
    if (newPin.length === 4) {
      currentPin.value = newPin
      localStorage.setItem(PIN_STORAGE_KEY, newPin)
    }
  }

  function resetToDefaultPin(): void {
    currentPin.value = DEFAULT_PIN
    localStorage.setItem(PIN_STORAGE_KEY, DEFAULT_PIN)
  }

  return {
    isLocked,
    currentPin,
    unlock,
    lock,
    updatePin,
    resetToDefaultPin,
  }
})
