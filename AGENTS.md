# AI Agent Instructions (Revizor)

## Tech Stack & Architecture
- Windows desktop application built with Tauri v2 + Vue 3 (Composition API, `<script setup>`) + TypeScript + Tailwind CSS.
- State management: Pinia (modular stores per feature).
- Local Database / Storage: SQLite / Tauri SQL plugin (`tauri-plugin-sql`) with a dedicated repository layer. Raw SQL queries must reside strictly within repository classes/functions, never in UI components or Pinia actions directly.
- Feature-driven modular architecture with strict layer boundaries:
  - `src/shared`: Reusable low-level utilities, database providers/connections, base UI primitives (`VirtualTable`, modal dialogs, buttons, inputs).
  - `src/features`: Domain modules (e.g., `inventory`, `catalog`, `audit`, `multiplicity`) containing their own `ui/`, `model/` (Pinia stores & composables), and `api/` (repositories & raw SQL).
  - `src/pages`: Composition of features, route views.
- Cross-feature communication must use the centralized typed event bus (`mitt`). Direct state mutation or cross-importing private models across unrelated feature stores is forbidden.

---

## MCP & Autonomous Knowledge Retrieval (RAGFlow) — Strict Policy

### 1. Autonomous Responsibility & High-Level Directives
- The user provides high-level business goals and will NOT provide file paths, AST layouts, or internal naming conventions. You are 100% responsible for navigating the codebase via RAGFlow autonomously.
- **Primary Retrieval Rule:** Always invoke the MCP tool `search_knowledge_base` first to retrieve architectural patterns, existing store methods, database schema migrations, and UI components.

### 2. Autonomous Query Decomposition
- NEVER dump raw chains of DOM attributes, CSS classes, or concatenated filenames into RAG (e.g., avoid queries like `StoreAccount299Tab.vue template header row addRow empty colspan`).
- Decompose every user task into **1 to 2 targeted semantic queries**:
  - **Query 1 (State & Data):** Focus on domain models or schemas (e.g., `"inventory repository schema and queries"` or `"account299 store actions and computed"`).
  - **Query 2 (UI & Layout):** Focus on component composition (e.g., `"inventory table action buttons and layout"` or `"tab component virtual table pattern"`).

### 3. Context Conservation & Zero-Loop Reading Policy
- **Hard Inspection Limit:** NEVER inspect or analyze the same file path more than ONCE during a single task. If you must inspect a file to determine line offsets, do it in a single pass and immediately output the edit.
- **No Intermediate Dumps:** Strictly forbidden to write search results, intermediate outputs, or tool responses to temporary files (e.g., `output.txt`, `temp.json`) to read them back. Process tool outputs directly in memory.
- **Forbidden Search Actions:**
  - Strictly DO NOT execute terminal search commands (`Select-String`, `grep`, `findstr`, `Get-ChildItem -Recurse`).
  - DO NOT browse directories sequentially or guess filenames with repeated read operations.
- If RAG retrieval returns the interface, pattern, or types, proceed directly with code implementation without checking the file on disk.

---

## Code Quality & Implementation Rules

### 1. Component Size & Decomposition Constraints (Anti-Bloat Policy)
- **Hard File Limit:** Any Vue Single File Component exceeding **300 lines of code** is strictly considered a critical architectural bug and must be decomposed before adding new features.
- **Mandatory Sub-Component Extraction:**
  - **Modals & Dialogs:** All modal popups, confirmation alerts, and data import overlays must be isolated in `src/features/<feature>/ui/components/` or `.../modals/`. Never embed raw modal DOM inside tab views.
  - **Toolbars & Filter Panels:** Search inputs, action buttons, export toggles, and status badges belong in dedicated `<Feature>Toolbar.vue` files.
  - **Complex Script Logic:** If setup script logic exceeds 50 lines (complex parsing, clipboard reading, computed aggregates), extract it into a local composable (`use<Feature>Tab.ts`).
- **Tab Component Architecture:** Tab components (`StoreFactTab.vue`, `StoreStockTab.vue`, etc.) must serve solely as thin orchestrators bringing together `<FeatureToolbar />`, `<VirtualTable />`, and child modals.

### 2. Large File Emergency Refactoring Protocol
- **Refactor Before Append:** If you are instructed to modify or extend an existing monolithic file (>500 lines), DO NOT append new markup, methods, or modals directly to it.
- **Decompose First:**
  1. Extract existing embedded modals into independent components under `ui/modals/`.
  2. Extract bulk calculations, clipboard handlers, and table filters into a composable under `model/`.
  3. Only then implement the requested change inside the newly isolated sub-component or composable.
- **Incremental Line-Diffs:** When editing large files, emit precise line-targeted replacements. Never regenerate an entire 1000+ line component in a single output stream.

### 3. Vue 3 Components & Performance
- Always use TypeScript with `<script setup lang="ts">`.
- Strict typing for component interfaces: always use `defineProps<{ ... }>()` and `defineEmits<{ ... }>()`. Default values must be handled via `withDefaults()`.
- **Large Dataset Virtualization:** Any view displaying table rows, audit lines, or catalog entries MUST use `VirtualTable` or virtualized list primitives. Raw HTML tables or unbounded `v-for` on database records are strictly forbidden.
- Ensure all reactive state updates are predictable and clean up event listeners or timers in `onUnmounted()`.

### 3.1 Store Tab UI Standard (Reference: `StoreFactTab.vue`)
All inventory tabs and future feature views displaying tables must strictly follow the visual standard of `StoreFactTab.vue`:
1. **Top Header Card:** Must use `<StoreTabHeaderCard icon="..." title="..." description="...">` with action buttons (Undo/Redo, Export, Clear) placed inside `#actions`.
2. **Search & Filter Toolbar:**
   - Search input on left: `w-72 rounded-lg bg-gray-900/70 py-2 pl-9 pr-8 ring-1 ring-gray-800/60 text-sm` with `🔍` icon and clear button `✕`.
   - Filter chips group: `bg-gray-900/70 p-1 ring-1 ring-gray-800/60 rounded-lg text-xs` with active colors: Indigo (`bg-indigo-600`), Amber (`bg-amber-500 text-gray-950`), Rose (`bg-rose-600`), Cyan (`bg-cyan-600`), Purple (`bg-purple-600`).
   - Right side: Quick copy button `📋 Скопировать ЛК (N)` and counter `Показано: N из Total`.
3. **Table Header & Inline Add Row:**
   - Header titles: `tr class="border-b border-gray-800/60 bg-gray-900/90 text-xs uppercase tracking-wider text-gray-500"`.
   - **Unified Column Headers with Filters:** Every filterable table column MUST use `<StoreTableTh>` from `@shared`:
     ```vue
     <StoreTableTh
       title="Заголовок"
       column-key="field"
       :sort-key="sortKey"
       :sort-direction="sortDirection"
       :distinct-values="() => getDistinctValues('field')"
       :model-value="columnFilters['field'] || null"
       @sort="toggleSort"
       @update:model-value="setColumnFilter('field', $event)"
     />
     ```
   - **Excel Column Filter Composable:** All tabs must wire filters via `useExcelColumnFilter<ItemType>(() => baseItems.value, { ...extractors })` with `DistinctValueItem[]` support.
   - Inline Add row directly inside `#header`: `tr class="border-b border-indigo-500/30 bg-indigo-950/20"` for instant entry/paste in the table header.
4. **Empty State:** MUST use `<StoreTabEmptyState :colspan="N" icon="..." title="..." description="..." />` to properly span the entire width of `VirtualTable` (`<tr><td :colspan="N">...</td></tr>`). Never embed bare `<div>` in `#empty`.
5. **Multi-Selection Floating Bar:** Must use `<StoreTabFloatingBar :count="selectedIds.size" :is-read-only="isReadOnly" @copy="..." @delete="..." @clear="..." />`.
6. **Standard Badges & Table Indicators:** All table cells displaying badges, counts, multiplicity, discrepancies, or statuses MUST use shared primitives from `@shared` instead of repeating raw Tailwind strings:
   - `<StoreCountBadge :count="item.mentionsCount" />` (Unified Indigo pill for >0 or gray `0`).
   - `<StoreMultiplicityBadge :value="item.multiplicity" />` (Unified pill for >1 or gray `1`).
   - `<StoreDiscrepancyBadge :value="item.discrepancy" />` (Emerald `ОК`, Amber `+N`, Rose `-N`, or `—`).
   - `<StoreStatusBadge status="299" | "nd" | "duplicate" | "non_standard" | "in_catalog" />`.
   - `<StoreBadge variant="indigo|cyan|purple|amber|rose|emerald|gray" :pill="true|false">` for arbitrary custom tags.
7. **Interactive Tooltips & Cursor Standard:**
   - Any table cell or badge displaying rich hover context/breakdown via `:title` (e.g., mentions count breakdown across locations, discrepancy explanations, status details) MUST use `cursor-help` to visually indicate to the user with a question-mark cursor that interactive details are available on hover. Standard non-informational cells continue to use `cursor-default`.

### 4. SQLite Repository Pattern (Tauri SQL)
- All table migrations, schema creation scripts (`CREATE TABLE IF NOT EXISTS`), and parameterized queries must live inside `src/features/<feature>/api/<feature>Repository.ts`.
- Always use parameterized bindings (`?` or `$1`) to avoid SQL injection.
- Explicitly type all database query return values (e.g., `db.select<InventoryRow[]>('SELECT ...')`). Never cast database results to `any`.
- Keep transaction logic inside the repository boundary.

### 5. Type Safety & Contracts
- **Strict `no-any`:** Shared domain interfaces must be placed and exported from `src/features/<feature>/model/types.ts` or `src/shared/types`.
- Database row entities, DTOs, and UI view-models must have clear, distinct type definitions. Nullable database columns must be explicitly typed as `T | null`.

### 6. Error Handling & State Resilience
- Async store actions and database invocations must be wrapped in `try/catch` blocks with feedback sent through the app's centralized notification/toast bus.
- Never leave operations silently failing without UI feedback.
- Maintain immutability when updating arrays or entities in Pinia state.

---

## Autonomous Execution Workflow

1. **Deconstruct Intent:** Break the user's high-level task into necessary domain components (Database ➔ Pinia Store ➔ UI Sub-components).
2. **RAG Semantic Lookup:** Perform 1–2 focused queries via `ragflow/search_knowledge_base` to retrieve existing reference implementations.
3. **Plan Small Units:** Determine what sub-components, modals, or composables must be created before modifying the main view. Check if the target component exceeds 300 lines; if so, schedule decomposition first.
4. **Targeted Read (Optional):** Only if editing an existing file, read the relevant section once to get exact line anchors.
5. **Implement & Diff:** Emit clean, modular, production-ready code. Keep new and refactored components well under 300 lines.
6. **Verify Contracts:** Verify TypeScript types, props, imports, and event names before completing the turn.
7. **Automatic Version Bump:** After completing code changes, features, or fixes in any task, automatically increment the patch version (e.g. `1.0.1` -> `1.0.2`) simultaneously in `package.json` and `src-tauri/tauri.conf.json`.