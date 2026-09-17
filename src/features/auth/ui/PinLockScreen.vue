<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue'
import { usePinLockStore } from '../model/usePinLockStore'

const pinStore = usePinLockStore()

const enteredDigits = ref<string[]>([])
const isError = ref(false)
const isChecking = ref(false)

function handleDigit(digit: string) {
  if (isChecking.value || enteredDigits.value.length >= 4) return
  if (isError.value) {
    isError.value = false
  }

  enteredDigits.value.push(digit)

  if (enteredDigits.value.length === 4) {
    verifyPin()
  }
}

function handleBackspace() {
  if (isChecking.value) return
  if (isError.value) isError.value = false
  enteredDigits.value.pop()
}

function handleClear() {
  if (isChecking.value) return
  isError.value = false
  enteredDigits.value = []
}

function verifyPin() {
  isChecking.value = true
  const pin = enteredDigits.value.join('')

  setTimeout(() => {
    const success = pinStore.unlock(pin)
    if (!success) {
      isError.value = true
      // Небольшая задержка перед очисткой неверного ввода для эффекта тряски
      setTimeout(() => {
        enteredDigits.value = []
        isChecking.value = false
      }, 400)
    } else {
      isChecking.value = false
      enteredDigits.value = []
    }
  }, 100)
}

function onKeyDown(e: KeyboardEvent) {
  if (e.key >= '0' && e.key <= '9') {
    e.preventDefault()
    handleDigit(e.key)
  } else if (e.key === 'Backspace') {
    e.preventDefault()
    handleBackspace()
  } else if (e.key === 'Escape' || e.key === 'Delete') {
    e.preventDefault()
    handleClear()
  }
}

onMounted(() => {
  window.addEventListener('keydown', onKeyDown)
})

onUnmounted(() => {
  window.removeEventListener('keydown', onKeyDown)
})
</script>

<template>
  <div
    class="fixed inset-0 z-[9999] flex select-none items-center justify-center bg-gray-950/95 backdrop-blur-xl transition-all duration-300"
  >
    <!-- Background decorative ambient lighting -->
    <div
      class="pointer-events-none absolute -top-40 -left-40 h-96 w-96 rounded-full bg-indigo-600/10 blur-3xl"
    />
    <div
      class="pointer-events-none absolute -bottom-40 -right-40 h-96 w-96 rounded-full bg-purple-600/10 blur-3xl"
    />

    <!-- Main Lock Container Card -->
    <div
      class="relative flex w-full max-w-sm flex-col items-center rounded-3xl border border-gray-800/80 bg-gray-900/80 p-8 shadow-2xl backdrop-blur-md ring-1 ring-white/5"
    >
      <!-- Lock Badge Icon -->
      <div
        class="mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-indigo-500/10 ring-1 ring-indigo-500/20 shadow-inner"
        :class="{ 'bg-rose-500/10 ring-rose-500/20': isError }"
      >
        <svg
          v-if="!isError"
          class="h-8 w-8 text-indigo-400"
          fill="none"
          stroke="currentColor"
          stroke-width="1.8"
          viewBox="0 0 24 24"
        >
          <path
            stroke-linecap="round"
            stroke-linejoin="round"
            d="M16.5 10.5V6.75a4.5 4.5 0 10-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 002.25-2.25v-6.75a2.25 2.25 0 00-2.25-2.25H6.75a2.25 2.25 0 00-2.25 2.25v6.75a2.25 2.25 0 002.25 2.25z"
          />
        </svg>
        <svg
          v-else
          class="h-8 w-8 text-rose-400"
          fill="none"
          stroke="currentColor"
          stroke-width="1.8"
          viewBox="0 0 24 24"
        >
          <path
            stroke-linecap="round"
            stroke-linejoin="round"
            d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z"
          />
        </svg>
      </div>

      <!-- Titles -->
      <h1 class="text-xl font-bold tracking-tight text-white">Ревизор</h1>
      <p class="mt-1 text-xs text-gray-400">Введите 4-значный пин-код для доступа</p>

      <!-- 4 PIN Dots Indicator with Shake Animation -->
      <div
        class="my-7 flex items-center justify-center gap-4"
        :class="{ 'shake-anim': isError }"
      >
        <div
          v-for="index in 4"
          :key="index"
          class="h-4 w-4 rounded-full transition-all duration-200"
          :class="[
            isError
              ? 'scale-110 bg-rose-500 shadow-md shadow-rose-500/50 ring-4 ring-rose-500/20'
              : enteredDigits.length >= index
                ? 'scale-110 bg-indigo-500 shadow-md shadow-indigo-500/50 ring-4 ring-indigo-500/20'
                : 'border border-gray-700 bg-gray-800/80 ring-1 ring-gray-700/50',
          ]"
        />
      </div>

      <!-- Status or Error Message -->
      <div class="h-6 text-center">
        <p v-if="isError" class="text-xs font-medium text-rose-400 animate-pulse">
          Неверный пин-код. Попробуйте еще раз
        </p>
        <p v-else class="text-[11px] text-gray-400">
          Используйте клавиатуру или кнопки ниже
        </p>
      </div>

      <!-- Touch / Click NumPad -->
      <div class="mt-4 grid grid-cols-3 gap-3 w-full max-w-[240px]">
        <button
          v-for="n in ['1', '2', '3', '4', '5', '6', '7', '8', '9']"
          :key="n"
          type="button"
          @click="handleDigit(n)"
          class="flex h-14 w-14 items-center justify-center rounded-2xl border border-gray-800 bg-gray-800/50 text-lg font-semibold text-gray-100 transition-all hover:border-gray-700 hover:bg-gray-800 hover:text-white active:scale-95 cursor-pointer shadow-sm mx-auto"
        >
          {{ n }}
        </button>

        <!-- Clear Button -->
        <button
          type="button"
          @click="handleClear"
          class="flex h-14 w-14 items-center justify-center rounded-2xl border border-gray-800/50 bg-gray-900/40 text-xs font-semibold text-gray-400 transition-all hover:bg-gray-800/60 hover:text-gray-200 active:scale-95 cursor-pointer mx-auto"
          title="Сброс"
        >
          Сброс
        </button>

        <!-- Zero Button -->
        <button
          type="button"
          @click="handleDigit('0')"
          class="flex h-14 w-14 items-center justify-center rounded-2xl border border-gray-800 bg-gray-800/50 text-lg font-semibold text-gray-100 transition-all hover:border-gray-700 hover:bg-gray-800 hover:text-white active:scale-95 cursor-pointer shadow-sm mx-auto"
        >
          0
        </button>

        <!-- Backspace Button -->
        <button
          type="button"
          @click="handleBackspace"
          class="flex h-14 w-14 items-center justify-center rounded-2xl border border-gray-800/50 bg-gray-900/40 text-base font-semibold text-gray-400 transition-all hover:bg-gray-800/60 hover:text-gray-200 active:scale-95 cursor-pointer mx-auto"
          title="Стереть"
        >
          ⌫
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.shake-anim {
  animation: shake 0.35s cubic-bezier(0.36, 0.07, 0.19, 0.97) both;
}

@keyframes shake {
  10%,
  90% {
    transform: translate3d(-2px, 0, 0);
  }
  20%,
  80% {
    transform: translate3d(4px, 0, 0);
  }
  30%,
  50%,
  70% {
    transform: translate3d(-6px, 0, 0);
  }
  40%,
  60% {
    transform: translate3d(6px, 0, 0);
  }
}
</style>
