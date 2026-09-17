/* ── Shared Kernel — Public API ── */

// Database
export type { DatabaseProvider, QueryResult } from './lib/db'
export { SqliteDatabaseProvider } from './lib/db'

// Event Bus
export { eventBus } from './lib/eventBus'
export type { AppEvents } from './lib/eventBus'

// Theme
export { useThemeStore } from './model/useThemeStore'
export type { ThemeId, ThemeDefinition } from './model/useThemeStore'

// Revision Storage (File System)
export {
  ensureStoresDir,
  getStoresBasePath,
  createRevisionDir,
  deleteRevisionDir,
  getRevisionDbUri,
  openRevisionFolder,
  moveRevisionToArchive,
  restoreRevisionFromArchive,
  renameRevisionDir,
  cleanupOrphanRevisionDirs,
} from './lib/revisionStorageService'

// UI
export { default as MainLayout } from './ui/MainLayout.vue'
export { default as AppSidebar } from './ui/AppSidebar.vue'
export { default as AppHeader } from './ui/AppHeader.vue'
export { default as ToastContainer } from './ui/ToastContainer.vue'
export { default as CopyableSku } from './ui/CopyableSku.vue'
export { default as CopyableBarcode } from './ui/CopyableBarcode.vue'
export { default as ExcelColumnFilter } from './ui/ExcelColumnFilter.vue'
export { default as StoreTabHeaderCard } from './ui/StoreTabHeaderCard.vue'
export { default as StoreTabEmptyState } from './ui/StoreTabEmptyState.vue'
export { default as StoreTabFloatingBar } from './ui/StoreTabFloatingBar.vue'
export { default as StoreTableTh } from './ui/StoreTableTh.vue'
export { default as StoreBadge } from './ui/StoreBadge.vue'
export { default as StoreCountBadge } from './ui/StoreCountBadge.vue'
export { default as StoreMultiplicityBadge } from './ui/StoreMultiplicityBadge.vue'
export { default as StoreDiscrepancyBadge } from './ui/StoreDiscrepancyBadge.vue'
export { default as StoreStatusBadge } from './ui/StoreStatusBadge.vue'

// Utilities & Composables
export { copyToClipboard, copySkusToClipboard } from './lib/clipboard'
// Loading Overlay System
export {
  useLoading,
  showLoading,
  updateLoading,
  setProgressStep,
  hideLoading,
  withLoading,
} from './lib/loadingService'
export type { LoadingOptions, LoadingTracker } from './lib/loadingService'
export { default as GlobalLoadingOverlay } from './ui/GlobalLoadingOverlay.vue'
export { useTableSort } from './lib/useTableSort'
export { useExcelColumnFilter } from './lib/useExcelColumnFilter'

// Undo / Redo
export { useUndoRedo } from './lib/useUndoRedo'
export type { UndoAction, UseUndoRedoOptions, UndoRedoManager } from './lib/useUndoRedo'
export { default as UndoRedoButtons } from './ui/UndoRedoButtons.vue'

// Tooltips
export { formatFactLocationTooltip, formatLocationAndBox } from './lib/formatFactTooltip'
export type { FactLocationEntry } from './lib/formatFactTooltip'
