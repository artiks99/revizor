# Graph Report - revizor  (2026-09-23)

## Corpus Check
- Large corpus: 5629 files · ~5,358,343 words. Semantic extraction will be expensive (many Claude tokens). Consider running on a subfolder.

## Summary
- 1195 nodes · 2522 edges · 66 communities (62 shown, 4 thin omitted)
- Extraction: 92% EXTRACTED · 8% INFERRED · 0% AMBIGUOUS · INFERRED: 208 edges (avg confidence: 0.85)
- Token cost: 0 input · 0 output

## Community Hubs (Navigation)
- Inventory Repository & State
- Mobile Server & Sync DTOs
- Fact Batch Operations & Exports
- Account 299 Discrepancy Tab
- Multiplicity & Packaging Rules
- Stock Accounting Tab
- RAGFlow Knowledge Base Sync
- General Reconciliation View
- Catalog & SKU Registry
- Tauri Native File System
- Excel Column Filters UI
- Dashboard Metrics & Decisions
- Fact Table Inline Editing
- Tauri Application Config
- Missing SKUs Audit Tools
- Revision Lifecycle Controls
- App Theming & Routing
- Fact Tab Display Logic
- CSV Import & Parsing
- TypeScript Configuration
- Domain Types & Contracts
- Revision Directory Explorer
- Vite & Build Tooling
- VirtualTable Data Grid
- Clipboard & CSV Converters
- NetworkIp / copyUrl
- FeatureDefinition / DatabaseProvider
- LocationClipboardEntry / handlePaste
- formatDateOnly / formatDateShort
- CatalogFilterType / CatalogSortKey
- Account299FilterType / Account299SortKey
- Account299ClipboardRow / BoxNumberClipbo
- getTierBadgeClass / PercentCalcStore
- MobileServerInfo / MobileSyncActivity
- QrOptions / VersionInfo
- dependencies / mitt
- UpdateDetails / UpdateStatus
- MultiplicityStatsItem / formatK
- Props / StoreFactFloatingBar
- copyAll / handleClear
- getItemName / handleApply
- getGitHubToken / main
- handleBackspace / handleClear
- handleCopySingle / CopyableBarcode
- devDependencies / tailwindcss
- AppEvents / ToastItem
- handleDrop / handleFileSelect
- handleCopyLocation / handleCopyName
- tsconfig.node.json / compilerOptions
- scripts / build
- SqliteDatabaseProvider / getTargetDb
- handleWidgetClick / triggerNewRevision
- generateRandomSku / handleAddRow
- ExcelColumnFilter / clearColumnFilter
- UndoRedo / checkActive
- App / pinStore
- AppUpdater / checkForUpdates
- default.json / description
- StoreAccount299Item / EditForm
- StoreCatalogItem / EditForm
- StoreStockItem / EditForm
- FactModalErrors / FactModalFormData
- handleClose / AppUpdateModal
- app

## God Nodes (most connected - your core abstractions)
1. `vue` - 54 edges
2. `useStoreFactTab()` - 53 edges
3. `withLoading()` - 53 edges
4. `useStoreAccount299Tab()` - 45 edges
5. `useStoreStockTab()` - 44 edges
6. `useStoreMultiplicityTab()` - 38 edges
7. `useStoreCatalogTab()` - 37 edges
8. `copySkusToClipboard()` - 34 edges
9. `useInventoryStore` - 27 edges
10. `useExcelColumnFilter()` - 25 edges

## Surprising Connections (you probably didn't know these)
- `executeConfirmDialog()` --calls--> `withLoading()`  [EXTRACTED]
  src/features/inventory/model/useStoreCatalogTab.ts → src/shared/lib/loadingService.ts
- `handleImportCatalog()` --calls--> `withLoading()`  [EXTRACTED]
  src/features/inventory/model/useStoreCatalogTab.ts → src/shared/lib/loadingService.ts
- `handleCopySingle()` --calls--> `copyToClipboard()`  [EXTRACTED]
  src/shared/ui/CopyableBarcode.vue → src/shared/lib/clipboard.ts
- `get_available_network_ips()` --references--> `NetworkInterfaceInfo`  [EXTRACTED]
  src-tauri/src/lib.rs → src-tauri/src/mobile_server.rs
- `bootstrap()` --calls--> `SqliteDatabaseProvider`  [EXTRACTED]
  src/app/main.ts → src/shared/lib/db/SqliteDatabaseProvider.ts

## Import Cycles
- 3-file cycle: `src/features/inventory/model/useInventoryStore.ts -> src/shared/index.ts -> src/shared/ui/AppSidebar.vue -> src/features/inventory/model/useInventoryStore.ts`
- 3-file cycle: `src/features/inventory/model/useInventoryStore.ts -> src/shared/index.ts -> src/shared/ui/MainLayout.vue -> src/features/inventory/model/useInventoryStore.ts`
- 4-file cycle: `src/features/inventory/model/useInventoryStore.ts -> src/shared/index.ts -> src/shared/ui/MainLayout.vue -> src/shared/ui/AppSidebar.vue -> src/features/inventory/model/useInventoryStore.ts`
- 5-file cycle: `src/features/inventory/api/inventoryRepository.ts -> src/shared/index.ts -> src/shared/ui/AppHeader.vue -> src/features/registry.ts -> src/features/inventory/index.ts -> src/features/inventory/api/inventoryRepository.ts`
- 5-file cycle: `src/features/inventory/index.ts -> src/features/inventory/model/useInventoryStore.ts -> src/shared/index.ts -> src/shared/ui/AppHeader.vue -> src/features/registry.ts -> src/features/inventory/index.ts`
- 5-file cycle: `src/features/inventory/api/inventoryRepository.ts -> src/shared/index.ts -> src/shared/ui/AppSidebar.vue -> src/features/registry.ts -> src/features/inventory/index.ts -> src/features/inventory/api/inventoryRepository.ts`
- 5-file cycle: `src/features/inventory/index.ts -> src/features/inventory/model/useInventoryStore.ts -> src/shared/index.ts -> src/shared/ui/AppSidebar.vue -> src/features/registry.ts -> src/features/inventory/index.ts`

## Communities (66 total, 4 thin omitted)

### Community 0 - "Inventory Repository & State"
Cohesion: 0.06
Nodes (53): createInventoryRepository(), getDirPath(), getRevDb(), dirPathCache, getRevisionDb(), InventoryRepository, revisionDbCache, props (+45 more)

### Community 1 - "Mobile Server & Sync DTOs"
Cohesion: 0.10
Nodes (61): atomic, AtomicBool, Connection, Cursor, duration, Error, Header, Mutex (+53 more)

### Community 2 - "Fact Batch Operations & Exports"
Cohesion: 0.06
Nodes (45): @tauri-apps/api, xlsx, useFactBatchOperations(), applyBoxNumbersBatch(), applyLocationsBatch(), applyQuantitiesBatch(), getExportRows(), handleClearFact() (+37 more)

### Community 3 - "Account 299 Discrepancy Tab"
Cohesion: 0.08
Nodes (37): Account299ConfirmDialogOptions, useStoreAccount299Tab(), clearSelection(), closeConfirmDialog(), closeEditModal(), executeConfirmDialog(), handleAddRow(), handleClearAll() (+29 more)

### Community 4 - "Multiplicity & Packaging Rules"
Cohesion: 0.08
Nodes (34): StoreMultiplicityItem, MultiplicityConfirmDialogOptions, MultiplicityFilterType, MultiplicitySortKey, useStoreMultiplicityTab(), cancelInlineEdit(), clearSelection(), closeConfirmDialog() (+26 more)

### Community 5 - "Stock Accounting Tab"
Cohesion: 0.09
Nodes (29): useStoreStockTab(), clearSelection(), closeEditModal(), generateRandomSku(), getCatalogMap(), handleAddRow(), handleClearStock(), handleCopyFilteredSkus() (+21 more)

### Community 6 - "RAGFlow Knowledge Base Sync"
Cohesion: 0.09
Nodes (36): Exception, hashlib, json, mcp_server_fastmcp, os, get_rag_and_dataset(), Ищет релевантные куски кода и структуры в базе знаний RAGFlow., search_knowledge_base() (+28 more)

### Community 7 - "General Reconciliation View"
Cohesion: 0.07
Nodes (29): handleResetFilters(), handleResetFilters(), handleResetFilters(), GeneralRowView, useStoreGeneralTab(), clearSelection(), exportToCsv(), handleAddSingleSku() (+21 more)

### Community 8 - "Catalog & SKU Registry"
Cohesion: 0.09
Nodes (27): useStoreCatalogTab(), clearSelection(), closeEditModal(), executeConfirmDialog(), generateRandomSku(), handleAddRow(), handleClearCatalog(), handleCopyFilteredSkus() (+19 more)

### Community 9 - "Tauri Native File System"
Cohesion: 0.15
Nodes (34): command, commandext, fs, MobileServerInfo, build_revision_folder_name(), cleanup_orphan_revision_dirs(), create_revision_dir(), delete_revision_dir() (+26 more)

### Community 10 - "Excel Column Filters UI"
Cohesion: 0.08
Nodes (29): DistinctValueItem, closeDropdown(), dropdownRef, emit, filteredDistinct, handleApply(), handleDocClick(), handleKeyDown() (+21 more)

### Community 11 - "Dashboard Metrics & Decisions"
Cohesion: 0.13
Nodes (18): DashboardRepository, revDbCache, DashboardWidget, DecisionResult, DecisionType, LocationStatsItem, PercentCalcInputs, RevisionMetadata (+10 more)

### Community 12 - "Fact Table Inline Editing"
Cohesion: 0.10
Nodes (21): {
  columnFilters,
  getDistinctValues,
  setColumnFilter,
  clearAllColumnFilters,
  activeFilterCount: excelFilterCount,
  filteredItems: excelFilteredItems,
}, emit, FactSortKey, generateRandomSku(), getCatalogMap(), handleAddRow(), handleCopySelected(), handleDeleteSelected() (+13 more)

### Community 13 - "Tauri Application Config"
Cohesion: 0.08
Nodes (24): debugApplicationIdSuffix, app, security, windows, build, beforeBuildCommand, beforeDevCommand, devUrl (+16 more)

### Community 14 - "Missing SKUs Audit Tools"
Cohesion: 0.10
Nodes (20): MissingSkuItem, checkedCount, checkedSkus, clearAllChecked(), {
  columnFilters,
  getDistinctValues,
  setColumnFilter,
  clearAllColumnFilters,
  activeFilterCount,
  filteredItems,
}, currentPage, emit, enrichedItems (+12 more)

### Community 15 - "Revision Lifecycle Controls"
Cohesion: 0.11
Nodes (22): getTodayIsoDate(), closeEditDatesModal(), closeModal(), editDatesError, editDatesRevisionId, editDatesStoreNumber, editEndDateInput, editStartDateInput (+14 more)

### Community 16 - "App Theming & Routing"
Cohesion: 0.13
Nodes (14): pinia, bootstrap(), router, features, ThemeDefinition, ThemeId, themes, useThemeStore (+6 more)

### Community 17 - "Fact Tab Display Logic"
Cohesion: 0.10
Nodes (5): useStoreFactTab(), handleCheckboxClick(), handleModalSave(), onCheckboxCellMouseDown(), validateModalForm()

### Community 18 - "CSV Import & Parsing"
Cohesion: 0.12
Nodes (19): deduplicateStockBySku, emit, finalParsedStock, handleConfirmImport(), handleDrop(), handleFileInput(), isDragging, parsedFact (+11 more)

### Community 19 - "TypeScript Configuration"
Cohesion: 0.10
Nodes (19): compilerOptions, baseUrl, esModuleInterop, forceConsistentCasingInFileNames, isolatedModules, jsx, lib, module (+11 more)

### Community 20 - "Domain Types & Contracts"
Cohesion: 0.25
Nodes (13): InventoryFilter, InventoryItem, InventoryItemStatus, InventorySubTab, Revision, StoreGeneralItem, ConfirmDialogState, UseFactBatchOperationsOptions (+5 more)

### Community 21 - "Revision Directory Explorer"
Cohesion: 0.12
Nodes (12): handleOpenCurrentFolder(), openRevisionFolder(), currentFeature, handleOpenFolder(), inventoryStore, isArchiveExpanded, isInventoryExpanded, isRevisionActive() (+4 more)

### Community 22 - "Vite & Build Tooling"
Cohesion: 0.12
Nodes (16): description, name, private, type, version, ref_node_url, tailwindcss, @tailwindcss/vite (+8 more)

### Community 23 - "VirtualTable Data Grid"
Cohesion: 0.12
Nodes (10): @tanstack/vue-virtual, handleTableCopySkus(), isNearBottom, isNearTop, onCopy(), props, scrollContainerRef, totalSize (+2 more)

### Community 24 - "Clipboard & CSV Converters"
Cohesion: 0.16
Nodes (15): parsedAccount299, parsedCatalog, parsedStock, FactClipboardRow, cleanBarcode(), detectDelimiter(), parseAccount299Csv(), parseCatalogCsv() (+7 more)

### Community 25 - "NetworkIp / copyUrl"
Cohesion: 0.14
Nodes (16): activeIp, availableIps, connectUrl, copied, copyUrl(), customPort, emit, initServer() (+8 more)

### Community 26 - "FeatureDefinition / DatabaseProvider"
Cohesion: 0.28
Nodes (6): createDashboardRepository(), dashboardFeature, inventoryFeature, FeatureDefinition, DatabaseProvider, QueryResult

### Community 27 - "LocationClipboardEntry / handlePaste"
Cohesion: 0.16
Nodes (14): handlePaste(), countToApply, emit, handleApply(), hasSkuBinding, parsedEntries, pasteText, previewRows (+6 more)

### Community 28 - "formatDateOnly / formatDateShort"
Cohesion: 0.19
Nodes (11): props, props, props, vFocus, props, src_shared_index_copyablebarcode, src_shared_index_copyablesku, formatDateOnly() (+3 more)

### Community 29 - "CatalogFilterType / CatalogSortKey"
Cohesion: 0.18
Nodes (9): vue, CatalogFilterType, CatalogSortKey, StockFilterStatus, StockSortKey, CopyOptions, ColumnExtractorMap, EMPTY_VALUE_KEY (+1 more)

### Community 30 - "Account299FilterType / Account299SortKey"
Cohesion: 0.16
Nodes (10): {
  columnFilters,
  getDistinctValues,
  setColumnFilter,
  clearAllColumnFilters,
  activeFilterCount,
  filteredItems,
}, emit, props, { sortKey, sortDirection, toggleSort, sortedItems }, Account299FilterType, Account299SortKey, formatDateRange(), SortDirection (+2 more)

### Community 31 - "Account299ClipboardRow / BoxNumberClipbo"
Cohesion: 0.34
Nodes (14): Account299ClipboardRow, BoxNumberClipboardEntry, CatalogClipboardRow, getClipboardGrid(), isLikelySku(), isNumericString(), parseAccount299Clipboard(), parseCatalogClipboard() (+6 more)

### Community 32 - "getTierBadgeClass / PercentCalcStore"
Cohesion: 0.16
Nodes (10): vue-router, usePercentCalcStore, decisionBadgeClass, decisionBgClass, decisionIcon, store, currentPercent, store (+2 more)

### Community 33 - "MobileServerInfo / MobileSyncActivity"
Cohesion: 0.16
Nodes (9): isServerRunning, MobileServerInfo, MobileSyncActivity, pushActivity(), recentActivities, serverInfo, useMobileSync(), initListener() (+1 more)

### Community 34 - "QrOptions / VersionInfo"
Cohesion: 0.22
Nodes (10): generateQrSvg(), GF256_EXP, GF256_LOG, gfMul(), QrOptions, rsEncode(), rsGenPoly(), selectVersion() (+2 more)

### Community 35 - "dependencies / mitt"
Cohesion: 0.18
Nodes (11): dependencies, mitt, pinia, @tanstack/vue-virtual, @tauri-apps/api, @tauri-apps/plugin-sql, @tauri-apps/plugin-updater, vue (+3 more)

### Community 36 - "UpdateDetails / UpdateStatus"
Cohesion: 0.18
Nodes (10): @tauri-apps/plugin-updater, downloadedBytes, downloadProgress, errorMessage, isModalOpen, status, totalBytes, UpdateDetails (+2 more)

### Community 37 - "MultiplicityStatsItem / formatK"
Cohesion: 0.20
Nodes (8): MultiplicityStatsItem, checkedCount, checkedMultiplicities, props, saveChecked(), storageKey, toggleMultiplicity(), totalUnmatchedSkus

### Community 38 - "Props / StoreFactFloatingBar"
Cohesion: 0.18
Nodes (6): props, props, props, emit, Props, tab

### Community 39 - "copyAll / handleClear"
Cohesion: 0.22
Nodes (10): copyAll(), emit, filteredActivities, filterType, handleClear(), isExpanded, props, scanCount (+2 more)

### Community 40 - "getItemName / handleApply"
Cohesion: 0.24
Nodes (9): countToApply, emit, handleApply(), parsedQuantities, pasteText, previewRows, props, readFromClipboard() (+1 more)

### Community 41 - "getGitHubToken / main"
Cohesion: 0.29
Nodes (8): ref_node_child_process, ref_node_fs, ref_node_path, keyPath, result, getGitHubToken(), main(), runCurl()

### Community 42 - "handleBackspace / handleClear"
Cohesion: 0.29
Nodes (9): enteredDigits, handleBackspace(), handleClear(), handleDigit(), isChecking, isError, onKeyDown(), pinStore (+1 more)

### Community 43 - "handleCopySingle / CopyableBarcode"
Cohesion: 0.20
Nodes (9): allBarcodesTooltip, barcodes, extraBarcodes, extraCount, handleCopySingle(), isCopiedAll, isCopiedSingle, primaryBarcode (+1 more)

### Community 44 - "devDependencies / tailwindcss"
Cohesion: 0.22
Nodes (9): devDependencies, tailwindcss, @tailwindcss/vite, @tauri-apps/cli, @types/node, typescript, vite, @vitejs/plugin-vue (+1 more)

### Community 45 - "AppEvents / ToastItem"
Cohesion: 0.28
Nodes (7): mitt, AppEvents, eventBus, addToast(), removeToast(), ToastItem, toasts

### Community 46 - "handleDrop / handleFileSelect"
Cohesion: 0.28
Nodes (7): fileInputRef, handleDrop(), handleFileSelect(), importMessage, isDragging, processFile(), store

### Community 47 - "handleCopyLocation / handleCopyName"
Cohesion: 0.25
Nodes (8): handleCopyLocation(), handleCopyName(), handleCopySkuSingle(), copyToClipboard(), handleCopyAll(), handleCopy(), isCopied, props

### Community 48 - "tsconfig.node.json / compilerOptions"
Cohesion: 0.22
Nodes (8): compilerOptions, allowSyntheticDefaultImports, module, moduleResolution, noEmit, strict, target, include

### Community 49 - "scripts / build"
Cohesion: 0.25
Nodes (8): scripts, build, build:release, dev, preview, publish:release, tauri, typecheck

### Community 50 - "SqliteDatabaseProvider / getTargetDb"
Cohesion: 0.32
Nodes (3): getTargetDb(), closeRevisionDb(), SqliteDatabaseProvider

### Community 51 - "handleWidgetClick / triggerNewRevision"
Cohesion: 0.25
Nodes (5): useDashboardStore, activeRevisions, archivedRevisions, router, store

### Community 52 - "generateRandomSku / handleAddRow"
Cohesion: 0.25
Nodes (8): generateRandomSku(), handleAddRow(), handleCopyFilteredSkus(), handleCopyNotFoundSkus(), handleCopySelectedSkus(), handleImportFact(), saveInlineEdit(), showPasteNotif()

### Community 53 - "ExcelColumnFilter / clearColumnFilter"
Cohesion: 0.39
Nodes (7): useExcelColumnFilter(), clearColumnFilter(), formatValueKey(), getDistinctValues(), getExtractor(), getRawItems(), setColumnFilter()

### Community 54 - "UndoRedo / checkActive"
Cohesion: 0.38
Nodes (4): useUndoRedo(), notify(), redo(), undo()

### Community 55 - "App / pinStore"
Cohesion: 0.40
Nodes (4): pinStore, updater, DEFAULT_PIN, usePinLockStore

### Community 57 - "default.json / description"
Cohesion: 0.33
Nodes (5): description, identifier, permissions, $schema, windows

### Community 58 - "StoreAccount299Item / EditForm"
Cohesion: 0.50
Nodes (4): StoreAccount299Item, EditForm, emit, Props

### Community 59 - "StoreCatalogItem / EditForm"
Cohesion: 0.50
Nodes (4): StoreCatalogItem, EditForm, emit, Props

### Community 60 - "StoreStockItem / EditForm"
Cohesion: 0.50
Nodes (4): StoreStockItem, EditForm, emit, Props

### Community 61 - "FactModalErrors / FactModalFormData"
Cohesion: 0.40
Nodes (4): emit, FactModalErrors, FactModalFormData, Props

### Community 62 - "handleClose / AppUpdateModal"
Cohesion: 0.40
Nodes (3): formattedProgress, formattedSize, updater

## Knowledge Gaps
- **373 isolated node(s):** `name`, `private`, `description`, `type`, `dev` (+368 more)
  These have ≤1 connection - possible missing edges or undocumented components. (Counts symbols only; 518 node(s) total have ≤1 connection when file, concept and rationale nodes are included.)
- **4 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `vue` connect `CatalogFilterType / CatalogSortKey` to `Inventory Repository & State`, `Fact Batch Operations & Exports`, `Multiplicity & Packaging Rules`, `General Reconciliation View`, `Excel Column Filters UI`, `Dashboard Metrics & Decisions`, `Fact Table Inline Editing`, `Missing SKUs Audit Tools`, `Revision Lifecycle Controls`, `App Theming & Routing`, `CSV Import & Parsing`, `Domain Types & Contracts`, `Revision Directory Explorer`, `Vite & Build Tooling`, `VirtualTable Data Grid`, `NetworkIp / copyUrl`, `LocationClipboardEntry / handlePaste`, `Account299FilterType / Account299SortKey`, `getTierBadgeClass / PercentCalcStore`, `MobileServerInfo / MobileSyncActivity`, `UpdateDetails / UpdateStatus`, `MultiplicityStatsItem / formatK`, `copyAll / handleClear`, `getItemName / handleApply`, `handleBackspace / handleClear`, `handleCopySingle / CopyableBarcode`, `AppEvents / ToastItem`, `handleDrop / handleFileSelect`, `handleCopyLocation / handleCopyName`, `handleWidgetClick / triggerNewRevision`, `App / pinStore`, `handleClose / AppUpdateModal`?**
  _High betweenness centrality (0.196) - this node is a cross-community bridge._
- **Why does `useStoreFactTab()` connect `Fact Tab Display Logic` to `Inventory Repository & State`, `Fact Batch Operations & Exports`, `Account 299 Discrepancy Tab`, `Props / StoreFactFloatingBar`, `General Reconciliation View`, `getItemName / handleApply`, `handleCopyLocation / handleCopyName`, `Domain Types & Contracts`, `generateRandomSku / handleAddRow`, `ExcelColumnFilter / clearColumnFilter`, `UndoRedo / checkActive`, `LocationClipboardEntry / handlePaste`, `formatDateOnly / formatDateShort`, `Account299FilterType / Account299SortKey`, `Account299ClipboardRow / BoxNumberClipbo`?**
  _High betweenness centrality (0.074) - this node is a cross-community bridge._
- **Why does `useStoreStockTab()` connect `Stock Accounting Tab` to `Fact Batch Operations & Exports`, `Account 299 Discrepancy Tab`, `General Reconciliation View`, `Domain Types & Contracts`, `ExcelColumnFilter / clearColumnFilter`, `UndoRedo / checkActive`, `formatDateOnly / formatDateShort`, `CatalogFilterType / CatalogSortKey`, `Account299FilterType / Account299SortKey`, `Account299ClipboardRow / BoxNumberClipbo`?**
  _High betweenness centrality (0.063) - this node is a cross-community bridge._
- **Are the 30 inferred relationships involving `useStoreFactTab()` (e.g. with `cancelInlineEdit()` and `clearSelection()`) actually correct?**
  _`useStoreFactTab()` has 30 INFERRED edges - model-reasoned connections that need verification._
- **Are the 29 inferred relationships involving `useStoreAccount299Tab()` (e.g. with `clearSelection()` and `closeConfirmDialog()`) actually correct?**
  _`useStoreAccount299Tab()` has 29 INFERRED edges - model-reasoned connections that need verification._
- **Are the 27 inferred relationships involving `useStoreStockTab()` (e.g. with `clearSelection()` and `closeEditModal()`) actually correct?**
  _`useStoreStockTab()` has 27 INFERRED edges - model-reasoned connections that need verification._
- **What connects `name`, `private`, `description` to the rest of the system?**
  _373 weakly-connected nodes found - possible documentation gaps or missing edges._