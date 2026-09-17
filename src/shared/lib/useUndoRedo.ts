import { ref, computed, onMounted, onUnmounted, onActivated, onDeactivated, type Ref } from 'vue'

export interface UndoAction {
  description: string
  undo: () => Promise<void> | void
  redo: () => Promise<void> | void
}

export interface UseUndoRedoOptions {
  /**
   * Ref or getter indicating whether the tab is read-only.
   * Actions won't be undone/redone if read-only is true.
   */
  isReadOnly?: Ref<boolean> | (() => boolean)
  /**
   * Maximum actions to keep in history. Defaults to 50.
   */
  maxHistory?: number
  /**
   * Optional notification callback (e.g. showPasteNotif or eventBus toast).
   */
  onNotify?: (message: string) => void
  /**
   * Optional getter or Ref to check whether this tab/scope is currently active.
   * If omitted, relies on onMounted/onUnmounted and onActivated/onDeactivated.
   */
  isActive?: Ref<boolean> | (() => boolean)
}

export interface UndoRedoManager {
  undoStack: Ref<UndoAction[]>
  redoStack: Ref<UndoAction[]>
  canUndo: Ref<boolean>
  canRedo: Ref<boolean>
  lastUndoDescription: Ref<string>
  lastRedoDescription: Ref<string>
  pushAction: (action: UndoAction) => void
  undo: () => Promise<void>
  redo: () => Promise<void>
  clear: () => void
  isReadOnly: Ref<boolean>
}

export function useUndoRedo(options: UseUndoRedoOptions = {}): UndoRedoManager {
  const { maxHistory = 50, onNotify } = options

  const undoStack = ref<UndoAction[]>([])
  const redoStack = ref<UndoAction[]>([])
  const isComponentActive = ref(true)

  const isReadOnly = computed(() => {
    if (!options.isReadOnly) return false
    return typeof options.isReadOnly === 'function' ? options.isReadOnly() : options.isReadOnly.value
  })

  const canUndo = computed(() => !isReadOnly.value && undoStack.value.length > 0)
  const canRedo = computed(() => !isReadOnly.value && redoStack.value.length > 0)
  const lastUndoDescription = computed(() => undoStack.value[undoStack.value.length - 1]?.description || '')
  const lastRedoDescription = computed(() => redoStack.value[redoStack.value.length - 1]?.description || '')

  function notify(msg: string) {
    if (onNotify) {
      onNotify(msg)
    }
  }

  function pushAction(action: UndoAction) {
    undoStack.value.push(action)
    if (undoStack.value.length > maxHistory) {
      undoStack.value.shift()
    }
    redoStack.value = []
  }

  async function undo() {
    if (isReadOnly.value) return
    if (undoStack.value.length === 0) {
      notify('Нечего отменять (история пуста)')
      return
    }
    const action = undoStack.value.pop()!
    try {
      await action.undo()
      redoStack.value.push(action)
      notify(`↩️ Отменено: ${action.description}`)
    } catch (err) {
      console.error('Ошибка отмены действия (Undo):', err)
      notify('Ошибка отмены действия')
    }
  }

  async function redo() {
    if (isReadOnly.value) return
    if (redoStack.value.length === 0) {
      notify('Нечего повторять')
      return
    }
    const action = redoStack.value.pop()!
    try {
      await action.redo()
      undoStack.value.push(action)
      notify(`↪️ Повторено: ${action.description}`)
    } catch (err) {
      console.error('Ошибка повтора действия (Redo):', err)
      notify('Ошибка повтора действия')
    }
  }

  function clear() {
    undoStack.value = []
    redoStack.value = []
  }

  function checkActive(): boolean {
    if (!isComponentActive.value) return false
    if (options.isActive) {
      return typeof options.isActive === 'function' ? options.isActive() : options.isActive.value
    }
    return true
  }

  const handleKeyDown = async (e: KeyboardEvent) => {
    if (!checkActive()) return

    // If an input/textarea is currently focused and active, let the browser handle native typing undo
    const target = e.target as HTMLElement | null
    if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)) {
      return
    }

    // Undo: Ctrl+Z / Cmd+Z / Ctrl+Я (without Shift)
    if ((e.ctrlKey || e.metaKey) && !e.shiftKey && (e.key === 'z' || e.key === 'Z' || e.key === 'я' || e.key === 'Я')) {
      e.preventDefault()
      await undo()
      return
    }

    // Redo: Ctrl+Y / Cmd+Y / Ctrl+Н or Ctrl+Shift+Z / Cmd+Shift+Z / Ctrl+Shift+Я
    if (
      ((e.ctrlKey || e.metaKey) && (e.key === 'y' || e.key === 'Y' || e.key === 'н' || e.key === 'Н')) ||
      ((e.ctrlKey || e.metaKey) && e.shiftKey && (e.key === 'z' || e.key === 'Z' || e.key === 'я' || e.key === 'Я'))
    ) {
      e.preventDefault()
      await redo()
      return
    }
  }

  onMounted(() => {
    isComponentActive.value = true
    window.addEventListener('keydown', handleKeyDown)
  })

  onUnmounted(() => {
    isComponentActive.value = false
    window.removeEventListener('keydown', handleKeyDown)
  })

  onActivated(() => {
    isComponentActive.value = true
  })

  onDeactivated(() => {
    isComponentActive.value = false
  })

  return {
    undoStack,
    redoStack,
    canUndo,
    canRedo,
    lastUndoDescription,
    lastRedoDescription,
    pushAction,
    undo,
    redo,
    clear,
    isReadOnly,
  }
}
