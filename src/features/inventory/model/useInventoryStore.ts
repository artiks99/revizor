import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import type { InventoryItem, InventoryFilter, StoreCatalogItem, StoreStockItem, StoreAccount299Item, StoreMultiplicityItem, StoreGeneralItem, InventorySubTab, Revision } from './types'
import type { InventoryRepository } from '../api/inventoryRepository'
import { eventBus } from '@shared/lib/eventBus'
import { formatDateOnly } from '@shared/lib/formatDate'
import { updateLoading, formatFactLocationTooltip, type FactLocationEntry } from '@shared'

export const useInventoryStore = defineStore('inventory', () => {
  const items = ref<InventoryItem[]>([])
  const isLoading = ref(false)
  const error = ref<string | null>(null)
  const filter = ref<InventoryFilter>({ search: '', status: null })

  // Sub-tab selection
  const activeSubTab = ref<InventorySubTab>('fact')

  // General items (Общее)
  const generalItems = ref<StoreGeneralItem[]>([])
  const isGeneralLoading = ref(false)

  // Catalog items (Товары магазина)
  const catalogItems = ref<StoreCatalogItem[]>([])
  const isCatalogLoading = ref(false)

  // Stock items (Системные остатки магазина)
  const stockItems = ref<StoreStockItem[]>([])
  const isStockLoading = ref(false)

  // Account 299 items (Счет 299)
  const account299Items = ref<StoreAccount299Item[]>([])
  const isAccount299Loading = ref(false)

  // Multiplicity items (Кратность)
  const multiplicityItems = ref<StoreMultiplicityItem[]>([])
  const isMultiplicityLoading = ref(false)
  
  // Revisions state
  const revisions = ref<Revision[]>([])
  const activeRevisionId = ref<string | null>(
    localStorage.getItem('active_revision_id') || localStorage.getItem('active_store_number')
  )

  const activeRevisions = computed(() => revisions.value.filter((r) => !r.isArchived))
  const archivedRevisions = computed(() => revisions.value.filter((r) => !!r.isArchived))

  let repo: InventoryRepository | null = null

  function setRepository(repository: InventoryRepository) {
    repo = repository
  }

  const activeRevision = computed<Revision | null>(() => {
    if (!activeRevisionId.value) return null
    return (
      revisions.value.find((r) => r.id === activeRevisionId.value || r.storeNumber === activeRevisionId.value) ?? null
    )
  })

  const activeStoreNumber = computed<string | null>(() => {
    return activeRevision.value?.storeNumber ?? activeRevisionId.value
  })

  function setActiveRevisionId(id: string | null) {
    activeRevisionId.value = id
    if (id) {
      localStorage.setItem('active_revision_id', id)
      const found = revisions.value.find((r) => r.id === id || r.storeNumber === id)
      if (found) {
        localStorage.setItem('active_store_number', found.storeNumber)
      }
    } else {
      localStorage.removeItem('active_revision_id')
      localStorage.removeItem('active_store_number')
    }
  }

  function setActiveStoreNumber(storeNumberOrId: string | null) {
    if (!storeNumberOrId) {
      setActiveRevisionId(null)
      return
    }
    const found =
      activeRevisions.value.find((r) => r.id === storeNumberOrId || r.storeNumber === storeNumberOrId) ||
      revisions.value.find((r) => r.id === storeNumberOrId || r.storeNumber === storeNumberOrId)
    if (found) {
      setActiveRevisionId(found.id)
    } else {
      setActiveRevisionId(storeNumberOrId)
    }
  }

  function setActiveSubTab(tab: InventorySubTab) {
    activeSubTab.value = tab
  }

  /** Проверка пересечения дат для одного магазина (только среди активных ревизий) */
  function findConflictingRevision(
    storeNumber: string,
    startDate: string,
    endDate: string,
    excludeId?: string
  ): Revision | null {
    const normalizedStore = storeNumber.trim().toLowerCase()
    return (
      activeRevisions.value.find((r) => {
        if (excludeId && r.id === excludeId) return false
        if (r.storeNumber.trim().toLowerCase() !== normalizedStore) return false
        // Проверяем пересечение отрезков [startDate, endDate] и [r.startDate, r.endDate]
        if (r.startDate && r.endDate) {
          return startDate <= r.endDate && endDate >= r.startDate
        }
        return true
      }) ?? null
    )
  }

  /** Множество артикулов из справочника «Товары магазина» для быстрой проверки */
  const catalogSkuSet = computed(() => {
    return new Set(catalogItems.value.map((c) => c.sku.trim()))
  })

  /** Кэш SKU → Name для O(1) автодополнения (вместо .find()) */
  const catalogSkuMap = computed(() => {
    const map = new Map<string, string>()
    for (const c of catalogItems.value) {
      map.set(c.sku.trim(), c.name.trim())
    }
    return map
  })

  /** Кэш Name → SKU для O(1) обратного поиска */
  const catalogNameMap = computed(() => {
    const map = new Map<string, string>()
    for (const c of catalogItems.value) {
      map.set(c.name.trim().toLowerCase(), c.sku.trim())
    }
    return map
  })

  /** Множество артикулов из списка «Счет 299» для быстрой проверки */
  const account299SkuSet = computed(() => {
    return new Set(account299Items.value.map((a) => a.sku.trim()))
  })

  /** Проверка, присутствует ли артикул в счете 299 */
  function isAccount299Item(sku: string): boolean {
    return account299SkuSet.value.has(sku.trim())
  }

  /** Получить актуальное наименование для позиции счета 299 с автопривязкой из каталога */
  function getAccount299ItemName(sku: string, currentName?: string): string {
    const clean = sku.trim()
    const catalogName = catalogSkuMap.value.get(clean)
    if (catalogName) return catalogName
    if (currentName && currentName !== 'Н/Д' && !currentName.startsWith('Товар ') && currentName !== 'Товар без названия') {
      return currentName
    }
    return 'Н/Д'
  }

  /** Получить актуальное наименование для позиции фактической ревизии с автопривязкой из каталога */
  function getFactItemName(sku: string, currentName?: string): string {
    const clean = sku.trim()
    const catalogName = catalogSkuMap.value.get(clean)
    if (catalogName) return catalogName
    if (currentName && currentName !== 'Н/Д' && !currentName.startsWith('Товар ') && currentName !== 'Товар без названия') {
      return currentName
    }
    return 'Н/Д'
  }

  /** Получить актуальное наименование для позиции остатков с автопривязкой из каталога */
  function getStockItemName(sku: string, currentName?: string): string {
    const clean = sku.trim()
    const catalogName = catalogSkuMap.value.get(clean)
    if (catalogName) return catalogName
    if (currentName && currentName !== 'Н/Д' && !currentName.startsWith('Товар ') && currentName !== 'Товар без названия') {
      return currentName
    }
    return 'Н/Д'
  }

  /** Проверка Н/Д для одного элемента (вызывается лениво при рендере) */
  function isNotFoundInCatalog(sku: string): boolean {
    return !catalogSkuSet.value.has(sku.trim())
  }

  /** Карта количества системных остатков (аудит) по артикулу */
  const stockSkuQtyMap = computed(() => {
    const map = new Map<string, number>()
    for (const item of stockItems.value) {
      const sku = item.sku.trim()
      if (sku) {
        map.set(sku, (map.get(sku) || 0) + (Number(item.quantity) || 0))
      }
    }
    return map
  })

  /** Получить системное количество (аудит) для артикула */
  function getStockItemQuantity(sku: string): number | null {
    const clean = sku.trim()
    if (!clean) return null
    if (stockSkuQtyMap.value.has(clean)) {
      return stockSkuQtyMap.value.get(clean)!
    }
    return null
  }

  /** Карта статистики факта по SKU: { count: сколько раз посчитан, totalQty: сумма по факту } */
  const factSkuStatsMap = computed(() => {
    const map = new Map<string, { count: number; totalQty: number }>()
    for (const item of items.value) {
      const sku = item.sku.trim()
      if (!sku) continue
      const existing = map.get(sku)
      if (existing) {
        existing.count += 1
        existing.totalQty += Number(item.quantity) || 0
      } else {
        map.set(sku, { count: 1, totalQty: Number(item.quantity) || 0 })
      }
    }
    return map
  })

  /** Получить количество упоминаний в факте */
  function getFactSkuCount(sku: string): number {
    return factSkuStatsMap.value.get(sku.trim())?.count ?? 0
  }

  /** Получить суммарное количество посчитанного в факте */
  function getFactSkuQuantity(sku: string): number {
    return factSkuStatsMap.value.get(sku.trim())?.totalQty ?? 0
  }

  /** Карта локаций и количеств по SKU для быстрой выборки "где посчитан" */
  const factSkuLocationsMap = computed(() => {
    const map = new Map<string, FactLocationEntry[]>()
    for (const item of items.value) {
      const sku = (item.sku || '').trim()
      if (!sku) continue
      const skuKey = sku.toLowerCase()
      const entry: FactLocationEntry = {
        id: item.id,
        location: (item.location || '').trim(),
        boxNumber: (item.boxNumber || '').trim(),
        quantity: Number(item.quantity) || 0,
        unit: item.unit || 'шт.',
      }
      const existing = map.get(skuKey)
      if (existing) {
        existing.push(entry)
      } else {
        map.set(skuKey, [entry])
      }
    }
    return map
  })

  /** Получить массив записей о местах подсчёта товара в факте */
  function getFactSkuLocations(sku: string): FactLocationEntry[] {
    return factSkuLocationsMap.value.get(sku.trim().toLowerCase()) || []
  }

  /** Получить форматированную подсказку "где посчитан товар" */
  function getFactLocationTooltip(sku: string): string {
    return formatFactLocationTooltip(getFactSkuLocations(sku))
  }

  /** Карта кратности по SKU */
  const multiplicitySkuMap = computed(() => {
    const map = new Map<string, number>()
    for (const item of multiplicityItems.value) {
      const sku = item.sku.trim()
      if (sku) {
        map.set(sku, item.multiplicity)
      }
    }
    return map
  })

  /** Получить кратность для SKU */
  function getMultiplicityValue(sku: string): number {
    return multiplicitySkuMap.value.get(sku.trim()) ?? 1
  }

  /** Есть ли загруженный каталог товаров */
  const hasCatalog = computed(() => catalogItems.value.length > 0)

  /** Список уникальных локаций текущей ревизии */
  const distinctLocations = computed(() => {
    const set = new Set<string>()
    for (const item of items.value) {
      if (item.location && item.location.trim()) {
        set.add(item.location.trim())
      }
    }
    return Array.from(set).sort((a, b) => a.localeCompare(b, 'ru', { sensitivity: 'base' }))
  })

  /** Количество позиций фактической ревизии со статусом Н/Д */
  const ndFactCount = computed(() => {
    return items.value.filter((i) => isNotFoundInCatalog(i.sku)).length
  })

  /** Количество позиций фактической ревизии, найденных в каталоге */
  const inCatalogFactCount = computed(() => {
    return items.value.filter((i) => !isNotFoundInCatalog(i.sku)).length
  })

  /** Множество дублирующихся артикулов в фактической ревизии */
  const duplicateFactSkuSet = computed(() => {
    const counts = new Map<string, number>()
    for (const item of items.value) {
      const sku = item.sku.trim().toLowerCase()
      if (sku) {
        counts.set(sku, (counts.get(sku) || 0) + 1)
      }
    }
    const dupes = new Set<string>()
    for (const [sku, count] of counts.entries()) {
      if (count > 1) {
        dupes.add(sku)
      }
    }
    return dupes
  })

  /** Количество дублированных позиций в фактической ревизии */
  const duplicateFactCount = computed(() => {
    return items.value.filter((i) => duplicateFactSkuSet.value.has(i.sku.trim().toLowerCase())).length
  })

  /** Количество позиций с нестандартным ЛК/ДК (не 7 цифр) */
  const nonStandardFactCount = computed(() => {
    return items.value.filter((i) => !/^\d{7}$/.test(i.sku.trim())).length
  })

  /** Количество позиций фактической ревизии, присутствующих в счете 299 */
  const account299FactCount = computed(() => {
    return items.value.filter((i) => isAccount299Item(i.sku)).length
  })

  /** Filtered items (без .map() — isNotFoundInCatalog проверяется лениво) */
  const filteredItems = computed(() => {
    let result: InventoryItem[] = items.value

    if (filter.value.search) {
      const q = filter.value.search.toLowerCase().trim()
      result = result.filter(
        (i) =>
          getFactItemName(i.sku, i.name).toLowerCase().includes(q) ||
          i.sku.toLowerCase().includes(q) ||
          i.location.toLowerCase().includes(q),
      )
    }

    if (filter.value.status) {
      result = result.filter((i) => i.status === filter.value.status)
    }

    if (filter.value.catalogStatus === '299') {
      result = result.filter((i) => isAccount299Item(i.sku))
    } else if (filter.value.catalogStatus === 'nd') {
      result = result.filter((i) => isNotFoundInCatalog(i.sku))
    } else if (filter.value.catalogStatus === 'in_catalog') {
      result = result.filter((i) => !isNotFoundInCatalog(i.sku))
    } else if (filter.value.catalogStatus === 'duplicates') {
      result = result.filter((i) => duplicateFactSkuSet.value.has(i.sku.trim().toLowerCase()))
    } else if (filter.value.catalogStatus === 'non_standard') {
      result = result.filter((i) => !/^\d{7}$/.test(i.sku.trim()))
    }

    if (filter.value.location) {
      const loc = filter.value.location.trim().toLowerCase()
      result = result.filter((i) => i.location.trim().toLowerCase() === loc)
    }

    return result
  })

  /** Filtered stock items (без .map() — isNotFoundInCatalog проверяется лениво) */
  const filteredStockItems = computed(() => {
    let result: StoreStockItem[] = stockItems.value

    if (filter.value.search) {
      const q = filter.value.search.toLowerCase().trim()
      result = result.filter(
        (i) =>
          getStockItemName(i.sku, i.name).toLowerCase().includes(q) ||
          i.sku.toLowerCase().includes(q),
      )
    }

    return result
  })

  function resetFactFilter() {
    filter.value = {
      search: '',
      status: null,
      catalogStatus: 'all',
      location: null,
    }
  }

  const totalCount = computed(() => items.value.length)
  const totalGeneralCount = computed(() => generalItems.value.length)
  const totalCatalogCount = computed(() => catalogItems.value.length)
  const totalStockCount = computed(() => stockItems.value.length)
  const totalAccount299Count = computed(() => account299Items.value.length)
  const totalMultiplicityCount = computed(() => multiplicityItems.value.length)

  async function loadRevisions() {
    if (!repo) return
    try {
      revisions.value = await repo.getAllRevisions()
    } catch (e) {
      error.value = e instanceof Error ? e.message : 'Ошибка загрузки ревизий'
    }
  }

  async function createRevision(payload: { storeNumber: string; startDate: string; endDate: string }) {
    if (!repo) return
    const { storeNumber, startDate, endDate } = payload
    
    // Проверка дат на валидность
    if (!startDate || !endDate) {
      throw new Error('Укажите даты начала и окончания ревизии')
    }
    if (startDate > endDate) {
      throw new Error('Дата окончания не может быть раньше даты начала')
    }

    // Проверка пересечения дат для этого же магазина
    const conflict = findConflictingRevision(storeNumber, startDate, endDate)
    if (conflict) {
      const formattedConflictRange = `${formatDateOnly(conflict.startDate)} – ${formatDateOnly(conflict.endDate)}`
      throw new Error(
        `Для магазина №${storeNumber} уже запланирована ревизия на этот период (${formattedConflictRange}). Выберите другие даты.`
      )
    }

    try {
      const newId = await repo.createRevision({ storeNumber, startDate, endDate })
      await loadRevisions()
      eventBus.emit('revision:created', { id: newId, storeNumber })
      return newId
    } catch (e) {
      error.value = e instanceof Error ? e.message : 'Ошибка создания ревизии'
      throw e
    }
  }

  async function deleteRevision(targetId: string) {
    if (!repo) return
    try {
      const revToDelete = revisions.value.find((r) => r.id === targetId || r.storeNumber === targetId)
      const storeNum = revToDelete?.storeNumber || targetId

      await repo.deleteRevision(targetId)
      await loadRevisions()
      
      if (activeRevisionId.value === targetId || activeRevisionId.value === storeNum) {
        const nextRev = revisions.value.length > 0 ? revisions.value[0].id : null
        setActiveRevisionId(nextRev)
      }
      
      eventBus.emit('revision:deleted', { id: targetId, storeNumber: storeNum })
    } catch (e) {
      error.value = e instanceof Error ? e.message : 'Ошибка удаления ревизии'
      throw e
    }
  }

  async function archiveRevision(targetId: string, isArchived = true) {
    if (!repo) return
    try {
      const rev = revisions.value.find((r) => r.id === targetId || r.storeNumber === targetId)
      const id = rev?.id || targetId
      const storeNum = rev?.storeNumber || targetId

      await repo.setRevisionArchived(id, isArchived)
      await loadRevisions()

      eventBus.emit('revision:archived', { id, storeNumber: storeNum, isArchived })
    } catch (e) {
      error.value = e instanceof Error ? e.message : 'Ошибка изменения статуса архива'
      throw e
    }
  }

  async function updateRevisionDates(targetId: string, startDate: string, endDate: string) {
    if (!repo) return
    const rev = revisions.value.find((r) => r.id === targetId || r.storeNumber === targetId)
    if (rev?.isArchived) {
      throw new Error('Нельзя изменять даты архивной ревизии. Сначала верните её из архива.')
    }
    const storeNum = rev?.storeNumber || targetId
    const id = rev?.id || targetId

    // Проверяем конфликт с другими активными ревизиями этого же магазина
    const conflict = findConflictingRevision(storeNum, startDate, endDate, id)
    if (conflict) {
      const formattedConflictRange =
        conflict.startDate && conflict.endDate
          ? `${formatDateOnly(conflict.startDate)} — ${formatDateOnly(conflict.endDate)}`
          : 'уже существует'
      throw new Error(
        `Для магазина №${storeNum} уже есть ревизия на этот период (${formattedConflictRange}). Выберите другие даты.`
      )
    }

    try {
      await repo.updateRevisionDates(id, startDate, endDate)
      await loadRevisions()

      // Если обновляется текущая открытая ревизия — перезагружаем данные для переподключения нового пути папки
      if (activeRevisionId.value === id || activeStoreNumber.value === storeNum) {
        updateLoading({
          title: 'Обновление данных',
          message: 'Переподключение рабочей базы магазина...',
          icon: '🔄',
        })
        await loadAllStoreData()
      }

      eventBus.emit('revision:dates-updated', { id, storeNumber: storeNum, startDate, endDate })
      eventBus.emit('app:toast', {
        type: 'success',
        message: `Период ревизии магазина №${storeNum} изменён: с ${formatDateOnly(startDate)} по ${formatDateOnly(endDate)}`,
      })
    } catch (e) {
      error.value = e instanceof Error ? e.message : 'Ошибка изменения дат ревизии'
      throw e
    }
  }

  const currentPartitionId = computed(() => {
    return activeRevision.value?.id || activeRevisionId.value || ''
  })

  async function loadItems() {
    if (!repo || !currentPartitionId.value) {
      items.value = []
      return
    }
    isLoading.value = true
    error.value = null
    try {
      items.value = await repo.getAll(currentPartitionId.value)
      eventBus.emit('inventory:count-changed', { total: items.value.length })
    } catch (e) {
      error.value = e instanceof Error ? e.message : 'Ошибка загрузки'
    } finally {
      isLoading.value = false
    }
  }

  async function loadCatalog() {
    if (!repo || !currentPartitionId.value) {
      catalogItems.value = []
      return
    }
    isCatalogLoading.value = true
    try {
      catalogItems.value = await repo.getCatalog(currentPartitionId.value)
    } catch (e) {
      console.error('[loadCatalog] Error:', e)
    } finally {
      isCatalogLoading.value = false
    }
  }

  async function loadStock() {
    if (!repo || !currentPartitionId.value) {
      stockItems.value = []
      return
    }
    isStockLoading.value = true
    try {
      stockItems.value = await repo.getStock(currentPartitionId.value)
    } catch (e) {
      console.error('[loadStock] Error:', e)
    } finally {
      isStockLoading.value = false
    }
  }

  async function loadAccount299() {
    if (!repo || !currentPartitionId.value) {
      account299Items.value = []
      return
    }
    isAccount299Loading.value = true
    try {
      account299Items.value = await repo.getAccount299(currentPartitionId.value)
    } catch (e) {
      console.error('[loadAccount299] Error:', e)
    } finally {
      isAccount299Loading.value = false
    }
  }

  async function loadMultiplicity() {
    if (!repo || !currentPartitionId.value) {
      multiplicityItems.value = []
      return
    }
    isMultiplicityLoading.value = true
    try {
      multiplicityItems.value = await repo.getMultiplicity(currentPartitionId.value)
    } catch (e) {
      console.error('[loadMultiplicity] Error:', e)
    } finally {
      isMultiplicityLoading.value = false
    }
  }

  async function loadGeneral() {
    if (!repo || !currentPartitionId.value) {
      generalItems.value = []
      return
    }
    isGeneralLoading.value = true
    try {
      generalItems.value = await repo.getGeneral(currentPartitionId.value)
    } catch (e) {
      console.error('[loadGeneral] Error:', e)
    } finally {
      isGeneralLoading.value = false
    }
  }

  async function loadAllStoreData() {
    await Promise.all([loadCatalog(), loadItems(), loadStock(), loadAccount299(), loadMultiplicity(), loadGeneral()])
  }

  /* --- Fact items actions --- */

  async function addItem(item: Omit<InventoryItem, 'createdAt' | 'updatedAt'>) {
    if (!repo || !currentPartitionId.value) return
    try {
      await repo.create({
        ...item,
        revisionId: currentPartitionId.value,
        storeNumber: activeStoreNumber.value || '',
      })
      const now = new Date().toISOString()
      const newItem: InventoryItem = {
        ...item,
        createdAt: now,
        updatedAt: now,
      }
      items.value = [...items.value, newItem]
      eventBus.emit('inventory:count-changed', { total: items.value.length })
    } catch (e) {
      error.value = e instanceof Error ? e.message : 'Ошибка добавления'
      throw e
    }
  }

  async function addItemsBatch(
    batch: { sku: string; name?: string; quantity?: number; unit?: string; location?: string }[],
    onProgress?: (processed: number, total: number, chunkIndex: number, totalChunks: number) => void
  ) {
    if (!repo || !currentPartitionId.value || batch.length === 0) return
    isLoading.value = true
    try {
      const prepared = batch.map((item) => {
        let name = item.name?.trim() || ''
        const sku = item.sku.replace(/\D/g, '').slice(0, 7) || item.sku.trim()
        if (!name && sku) {
          const match = catalogItems.value.find((c) => c.sku.trim() === sku)
          if (match) name = match.name
        }
        return {
          sku,
          name: name || `Товар ${sku}`,
          quantity: item.quantity ?? 0,
          unit: item.unit || 'шт.',
          location: item.location || '',
        }
      }).filter((item) => item.sku.length > 0 || item.name.length > 0)

      await repo.createBatch(currentPartitionId.value, activeStoreNumber.value || '', prepared, onProgress)
      await loadItems()
    } catch (e) {
      error.value = e instanceof Error ? e.message : 'Ошибка пакетного добавления'
      throw e
    } finally {
      isLoading.value = false
    }
  }

  async function importFactBatch(
    batch: { sku: string; name?: string; quantity?: number; unit?: string; location?: string }[],
    replaceAll = true,
    onProgress?: (processed: number, total: number, chunkIndex: number, totalChunks: number) => void
  ) {
    if (!repo || !currentPartitionId.value) return
    isLoading.value = true
    error.value = null
    try {
      const prepared = batch.map((item) => {
        let name = (item.name || '').trim()
        const sku = item.sku.replace(/\D/g, '').slice(0, 7) || item.sku.trim()
        if (!name && sku) {
          const match = catalogSkuMap.value.get(sku)
          if (match) name = match
        }
        return {
          sku,
          name: name || (sku ? `Товар ${sku}` : 'Товар без названия'),
          quantity: typeof item.quantity === 'number' && !isNaN(item.quantity) ? item.quantity : 0,
          unit: item.unit || 'шт.',
          location: item.location || '',
        }
      }).filter((item) => item.sku.length > 0 || item.name.length > 0)

      await repo.saveFactBatch(currentPartitionId.value, activeStoreNumber.value || '', prepared, replaceAll, onProgress)
      await loadItems()
    } catch (e) {
      error.value = e instanceof Error ? e.message : (typeof e === 'string' ? e : 'Ошибка импорта фактической ревизии')
      throw e
    } finally {
      isLoading.value = false
    }
  }

  async function clearFact() {
    if (!repo || !currentPartitionId.value) return
    try {
      await repo.clearFact(currentPartitionId.value)
      items.value = []
      eventBus.emit('inventory:count-changed', { total: 0 })
    } catch (e) {
      console.error('Ошибка очистки фактической ревизии:', e)
    }
  }

  async function updateFactQuantitiesBatch(updates: { id: string; quantity: number }[]) {
    if (!repo || updates.length === 0) return
    isLoading.value = true
    try {
      await repo.updateQuantitiesBatch(updates, currentPartitionId.value)
      const qtyMap = new Map<string, number>()
      for (const u of updates) {
        qtyMap.set(u.id, u.quantity)
      }
      items.value = items.value.map((item) => {
        if (qtyMap.has(item.id)) {
          return {
            ...item,
            quantity: qtyMap.get(item.id)!,
            updatedAt: new Date().toISOString(),
          }
        }
        return item
      })
    } catch (e) {
      error.value = e instanceof Error ? e.message : 'Ошибка обновления количеств'
      throw e
    } finally {
      isLoading.value = false
    }
  }

  async function updateFactLocationsBatch(updates: { id: string; location: string }[]) {
    if (!repo || updates.length === 0) return
    isLoading.value = true
    try {
      await repo.updateLocationsBatch(updates, currentPartitionId.value)
      const locMap = new Map<string, string>()
      for (const u of updates) {
        locMap.set(u.id, u.location)
      }
      items.value = items.value.map((item) => {
        if (locMap.has(item.id)) {
          return {
            ...item,
            location: locMap.get(item.id)!,
            updatedAt: new Date().toISOString(),
          }
        }
        return item
      })
    } catch (e) {
      error.value = e instanceof Error ? e.message : 'Ошибка обновления локаций'
      throw e
    } finally {
      isLoading.value = false
    }
  }

  async function updateFactBoxNumbersBatch(updates: { id: string; boxNumber: string }[]) {
    if (!repo || updates.length === 0) return
    isLoading.value = true
    try {
      await repo.updateBoxNumbersBatch(updates, currentPartitionId.value)
      const boxMap = new Map<string, string>()
      for (const u of updates) {
        boxMap.set(u.id, u.boxNumber)
      }
      items.value = items.value.map((item) => {
        if (boxMap.has(item.id)) {
          return {
            ...item,
            boxNumber: boxMap.get(item.id)!,
            updatedAt: new Date().toISOString(),
          }
        }
        return item
      })
    } catch (e) {
      error.value = e instanceof Error ? e.message : 'Ошибка обновления номеров коробок'
      throw e
    } finally {
      isLoading.value = false
    }
  }

  async function updateItem(id: string, updatedFields: Omit<InventoryItem, 'id' | 'createdAt' | 'updatedAt'>) {
    if (!repo) return
    try {
      await repo.update(id, updatedFields, currentPartitionId.value)
      const idx = items.value.findIndex((i) => i.id === id)
      if (idx !== -1) {
        items.value[idx] = {
          ...items.value[idx],
          ...updatedFields,
          updatedAt: new Date().toISOString(),
        }
        items.value = [...items.value]
      }
      eventBus.emit('inventory:count-changed', { total: items.value.length })
    } catch (e) {
      error.value = e instanceof Error ? e.message : 'Ошибка обновления'
      throw e
    }
  }

  async function removeItem(id: string) {
    if (!repo) return
    try {
      await repo.remove(id, currentPartitionId.value)
      items.value = items.value.filter((i) => i.id !== id)
      eventBus.emit('inventory:item-deleted', { id })
      eventBus.emit('inventory:count-changed', { total: items.value.length })
    } catch (e) {
      error.value = e instanceof Error ? e.message : 'Ошибка удаления'
    }
  }

  async function deleteItemsBatch(ids: string[]) {
    if (!repo || ids.length === 0) return
    isLoading.value = true
    try {
      await repo.removeBatch(ids, currentPartitionId.value)
      const idSet = new Set(ids)
      items.value = items.value.filter((i) => !idSet.has(i.id))
      eventBus.emit('inventory:count-changed', { total: items.value.length })
    } catch (e) {
      error.value = e instanceof Error ? e.message : 'Ошибка массового удаления'
      throw e
    } finally {
      isLoading.value = false
    }
  }

  async function mergeFactDuplicates() {
    if (!repo || !currentPartitionId.value) return
    isLoading.value = true
    try {
      const map = new Map<string, InventoryItem>()
      let hasDuplicates = false

      for (const item of items.value) {
        // Group by SKU and Location (if location specified) or SKU
        const key = `${item.sku.trim().toLowerCase()}:::${item.location.trim().toLowerCase()}`
        if (!map.has(key)) {
          map.set(key, { ...item })
        } else {
          hasDuplicates = true
          const existing = map.get(key)!
          existing.quantity += item.quantity
        }
      }

      if (hasDuplicates) {
        const mergedList = Array.from(map.values())
        // Clear and rewrite batch
        await repo.createBatch(
          currentPartitionId.value,
          activeStoreNumber.value || '',
          mergedList.map((m) => ({
            sku: m.sku,
            name: m.name,
            quantity: m.quantity,
            unit: m.unit,
            location: m.location,
          }))
        )
        // Delete all old rows and reload
        await repo.deleteRevision(currentPartitionId.value)
        // Wait, instead of deleting revision, we just rewrite items:
        // Actually, deleting old items by IDs not in merged or re-saving:
        // To be safe: remove all current items for this partition and save merged
        await loadItems()
      }
    } catch (e) {
      error.value = e instanceof Error ? e.message : 'Ошибка объединения дубликатов'
      throw e
    } finally {
      isLoading.value = false
    }
  }

  async function removeFactDuplicates(keepOne = true) {
    if (!repo || items.value.length === 0) return
    const seen = new Set<string>()
    const idsToDelete: string[] = []

    if (keepOne) {
      for (const item of items.value) {
        const sku = item.sku.trim().toLowerCase()
        if (seen.has(sku)) {
          idsToDelete.push(item.id)
        } else {
          seen.add(sku)
        }
      }
    } else {
      const counts = new Map<string, number>()
      for (const item of items.value) {
        const sku = item.sku.trim().toLowerCase()
        counts.set(sku, (counts.get(sku) || 0) + 1)
      }
      for (const item of items.value) {
        const sku = item.sku.trim().toLowerCase()
        if ((counts.get(sku) || 0) > 1) {
          idsToDelete.push(item.id)
        }
      }
    }

    if (idsToDelete.length > 0) {
      await deleteItemsBatch(idsToDelete)
    }
  }

  async function removeFactNonStandard() {
    const idsToDelete = items.value
      .filter((i) => !/^\d{7}$/.test(i.sku.trim()))
      .map((i) => i.id)
    if (idsToDelete.length > 0) {
      await deleteItemsBatch(idsToDelete)
    }
  }

  async function removeFactNotFound() {
    const idsToDelete = items.value
      .filter((i) => isNotFoundInCatalog(i.sku))
      .map((i) => i.id)
    if (idsToDelete.length > 0) {
      await deleteItemsBatch(idsToDelete)
    }
  }

  /* --- Catalog actions --- */

  async function syncAllNamesWithCatalog() {
    if (!repo || !currentPartitionId.value) return
    try {
      await repo.syncNamesFromCatalog(currentPartitionId.value)
    } catch (e) {
      console.warn('[syncAllNamesWithCatalog] Error:', e)
    }
  }

  async function importCatalogBatch(
    batch: { sku: string; name: string; barcode?: string }[],
    replaceAll = true,
    onProgress?: (processed: number, total: number, chunkIndex: number, totalChunks: number) => void
  ) {
    if (!repo || !currentPartitionId.value) return
    isCatalogLoading.value = true
    error.value = null
    try {
      await repo.saveCatalogBatch(currentPartitionId.value, activeStoreNumber.value || '', batch, replaceAll, onProgress)
      await loadCatalog()
      await syncAllNamesWithCatalog()
      await Promise.all([loadItems(), loadStock(), loadAccount299()])
    } catch (e) {
      error.value = e instanceof Error ? e.message : (typeof e === 'string' ? e : 'Ошибка импорта каталога')
      throw e
    } finally {
      isCatalogLoading.value = false
    }
  }

  async function syncSkuWithCatalog(sku: string, name: string) {
    if (!repo || !currentPartitionId.value || !sku) return
    try {
      await repo.syncSingleSkuFromCatalog(currentPartitionId.value, sku, name)
      for (const it of items.value) {
        if (it.sku === sku) it.name = name
      }
      for (const st of stockItems.value) {
        if (st.sku === sku) st.name = name
      }
      for (const acc of account299Items.value) {
        if (acc.sku === sku) acc.name = name
      }
    } catch (e) {
      console.warn('[syncSkuWithCatalog] Error:', e)
    }
  }

  async function addCatalogItem(sku: string, name: string, barcode = '') {
    if (!repo || !currentPartitionId.value) return
    try {
      const created = await repo.addCatalogItem({
        revisionId: currentPartitionId.value,
        storeNumber: activeStoreNumber.value || '',
        sku,
        name,
        barcode,
      })
      if (created) {
        catalogItems.value.push(created)
      }
      await syncSkuWithCatalog(sku, name)
    } catch (e) {
      error.value = e instanceof Error ? e.message : 'Ошибка добавления товара в каталог'
      throw e
    }
  }

  async function updateCatalogItem(item: { id: string; sku: string; name: string; barcode?: string }) {
    if (!repo) return
    try {
      const clean = (item.sku || '').replace(/\D/g, '').slice(0, 7) || (item.sku || '').trim()
      const cleanName = item.name.trim() || (clean ? `Товар ${clean}` : 'Товар')
      await repo.updateCatalogItem({
        id: item.id,
        sku: clean,
        name: cleanName,
        barcode: item.barcode,
      }, currentPartitionId.value)
      const found = catalogItems.value.find((c) => c.id === item.id)
      if (found) {
        found.sku = clean
        found.name = cleanName
        found.barcode = item.barcode || ''
        found.updatedAt = new Date().toISOString()
      }
      await syncSkuWithCatalog(clean, cleanName)
    } catch (e) {
      error.value = e instanceof Error ? e.message : 'Ошибка изменения товара в каталоге'
      throw e
    }
  }

  async function removeCatalogItem(id: string) {
    if (!repo) return
    try {
      const itemToDelete = catalogItems.value.find((c) => c.id === id)
      await repo.deleteCatalogItem(id, currentPartitionId.value)
      catalogItems.value = catalogItems.value.filter((c) => c.id !== id)
      if (itemToDelete && currentPartitionId.value) {
        const hasOther = catalogItems.value.some((c) => c.sku === itemToDelete.sku)
        if (!hasOther) {
          await syncSkuWithCatalog(itemToDelete.sku, 'Н/Д')
        }
      }
    } catch (e) {
      console.error('Ошибка удаления товара из каталога:', e)
    }
  }

  async function deleteCatalogItemsBatch(ids: string[]) {
    if (!repo || ids.length === 0) return
    isCatalogLoading.value = true
    try {
      if (catalogItems.value.length > 0 && ids.length >= catalogItems.value.length) {
        await repo.clearCatalog(currentPartitionId.value)
        catalogItems.value = []
      } else {
        await repo.deleteCatalogBatch(ids, currentPartitionId.value)
        const idSet = new Set(ids)
        catalogItems.value = catalogItems.value.filter((c) => !idSet.has(c.id))
      }
      await syncAllNamesWithCatalog()
      await Promise.all([loadItems(), loadStock(), loadAccount299()])
    } catch (e) {
      console.error('Ошибка массового удаления из каталога:', e)
      throw e
    } finally {
      isCatalogLoading.value = false
    }
  }

  async function deduplicateCatalog() {
    if (!repo || catalogItems.value.length === 0) return
    const seen = new Set<string>()
    const idsToDelete: string[] = []

    for (const item of catalogItems.value) {
      const sku = item.sku.trim().toLowerCase()
      if (seen.has(sku)) {
        idsToDelete.push(item.id)
      } else {
        seen.add(sku)
      }
    }

    if (idsToDelete.length > 0) {
      await deleteCatalogItemsBatch(idsToDelete)
    }
  }

  async function removeCatalogNonStandard() {
    const idsToDelete = catalogItems.value
      .filter((i) => !/^\d{7}$/.test(i.sku.trim()))
      .map((i) => i.id)
    if (idsToDelete.length > 0) {
      await deleteCatalogItemsBatch(idsToDelete)
    }
  }

  async function clearCatalog() {
    if (!repo || !currentPartitionId.value) return
    try {
      await repo.clearCatalog(currentPartitionId.value)
      catalogItems.value = []
      await syncAllNamesWithCatalog()
      await Promise.all([loadItems(), loadStock(), loadAccount299()])
    } catch (e) {
      console.error('Ошибка очистки каталога:', e)
    }
  }

  /* --- Stock actions --- */

  async function importStockBatch(
    batch: { sku: string; name: string; quantity: number }[],
    replaceAll = true,
    onProgress?: (processed: number, total: number, chunkIndex: number, totalChunks: number) => void
  ) {
    if (!repo || !currentPartitionId.value) return
    isStockLoading.value = true
    error.value = null
    try {
      const prepared = batch.map((item) => {
        let name = (item.name || '').trim()
        const sku = item.sku.replace(/\D/g, '').slice(0, 7) || item.sku.trim()
        if (!name && sku) {
          const match = catalogSkuMap.value.get(sku)
          if (match) name = match
        }
        return {
          sku,
          name: name || (sku ? `Товар ${sku}` : 'Товар без названия'),
          quantity: typeof item.quantity === 'number' && !isNaN(item.quantity) ? item.quantity : 0,
        }
      }).filter((item) => item.sku.length > 0 || item.name.length > 0)

      await repo.saveStockBatch(currentPartitionId.value, activeStoreNumber.value || '', prepared, replaceAll, onProgress)
      await loadStock()
    } catch (e) {
      error.value = e instanceof Error ? e.message : (typeof e === 'string' ? e : 'Ошибка импорта остатков')
      throw e
    } finally {
      isStockLoading.value = false
    }
  }

  async function addStockItem(sku: string, name: string, quantity: number) {
    if (!repo || !currentPartitionId.value) return
    try {
      await repo.addStockItem({
        revisionId: currentPartitionId.value,
        storeNumber: activeStoreNumber.value || '',
        sku,
        name,
        quantity,
      })
      await loadStock()
    } catch (e) {
      error.value = e instanceof Error ? e.message : 'Ошибка добавления остатка'
      throw e
    }
  }

  async function removeStockItem(id: string) {
    if (!repo) return
    try {
      await repo.deleteStockItem(id, currentPartitionId.value)
      stockItems.value = stockItems.value.filter((s) => s.id !== id)
    } catch (e) {
      console.error('Ошибка удаления остатка:', e)
    }
  }

  async function updateStockItem(item: { id: string; sku: string; name: string; quantity: number }) {
    if (!repo) return
    try {
      await repo.updateStockItem({
        id: item.id,
        sku: item.sku,
        name: item.name,
        quantity: item.quantity,
      }, currentPartitionId.value)
      const target = stockItems.value.find((s) => s.id === item.id)
      if (target) {
        target.sku = item.sku.trim()
        target.name = item.name.trim() || (target.sku ? `Товар ${target.sku}` : 'Товар')
        target.quantity = item.quantity
      }
    } catch (e) {
      console.error('Ошибка обновления остатка:', e)
      throw e
    }
  }

  async function deleteStockItemsBatch(ids: string[]) {
    if (!repo || ids.length === 0) return
    isStockLoading.value = true
    try {
      if (stockItems.value.length > 0 && ids.length >= stockItems.value.length) {
        await repo.clearStock(currentPartitionId.value)
        stockItems.value = []
      } else {
        await repo.deleteStockBatch(ids, currentPartitionId.value)
        const idSet = new Set(ids)
        stockItems.value = stockItems.value.filter((s) => !idSet.has(s.id))
      }
    } catch (e) {
      console.error('Ошибка массового удаления остатков:', e)
      throw e
    } finally {
      isStockLoading.value = false
    }
  }

  /** Объединить дубликаты остатков: суммирует количество одинаковых ЛК в одну позицию */
  async function mergeStockDuplicates() {
    if (!repo || !currentPartitionId.value || stockItems.value.length === 0) return
    isStockLoading.value = true
    try {
      const map = new Map<string, StoreStockItem>()
      let hasDuplicates = false

      for (const item of stockItems.value) {
        const key = item.sku.trim().toLowerCase()
        if (!map.has(key)) {
          map.set(key, { ...item })
        } else {
          hasDuplicates = true
          const existing = map.get(key)!
          existing.quantity += item.quantity
        }
      }

      if (hasDuplicates) {
        const mergedList = Array.from(map.values())
        await repo.saveStockBatch(
          currentPartitionId.value,
          activeStoreNumber.value || '',
          mergedList.map((m) => ({ sku: m.sku, name: m.name, quantity: m.quantity })),
          true
        )
        await loadStock()
      }
    } catch (e) {
      error.value = e instanceof Error ? e.message : 'Ошибка объединения дубликатов остатков'
      throw e
    } finally {
      isStockLoading.value = false
    }
  }

  /** Удалить дубликаты остатков (keepOne = true: оставить по 1 записи; keepOne = false: удалить все копии) */
  async function removeStockDuplicates(keepOne = true) {
    if (!repo || !currentPartitionId.value || stockItems.value.length === 0) return

    if (keepOne) {
      isStockLoading.value = true
      try {
        await repo.deduplicateStock(currentPartitionId.value)
        await loadStock()
      } catch (e) {
        error.value = e instanceof Error ? e.message : 'Ошибка удаления повторов остатков'
        throw e
      } finally {
        isStockLoading.value = false
      }
      return
    }

    const counts = new Map<string, number>()
    for (const item of stockItems.value) {
      const sku = item.sku.trim().toLowerCase()
      counts.set(sku, (counts.get(sku) || 0) + 1)
    }
    const idsToDelete: string[] = []
    for (const item of stockItems.value) {
      const sku = item.sku.trim().toLowerCase()
      if ((counts.get(sku) || 0) > 1) {
        idsToDelete.push(item.id)
      }
    }

    if (idsToDelete.length > 0) {
      await deleteStockItemsBatch(idsToDelete)
    }
  }

  async function removeStockNonStandard() {
    const idsToDelete = stockItems.value
      .filter((i) => !/^\d{7}$/.test(i.sku.trim()))
      .map((i) => i.id)
    if (idsToDelete.length > 0) {
      await deleteStockItemsBatch(idsToDelete)
    }
  }

  async function removeStockNotFound() {
    const idsToDelete = stockItems.value
      .filter((i) => isNotFoundInCatalog(i.sku))
      .map((i) => i.id)
    if (idsToDelete.length > 0) {
      await deleteStockItemsBatch(idsToDelete)
    }
  }

  async function removeStockZero() {
    const idsToDelete = stockItems.value
      .filter((i) => i.quantity <= 0)
      .map((i) => i.id)
    if (idsToDelete.length > 0) {
      await deleteStockItemsBatch(idsToDelete)
    }
  }

  async function clearStock() {
    if (!repo || !currentPartitionId.value) return
    try {
      await repo.clearStock(currentPartitionId.value)
      stockItems.value = []
    } catch (e) {
      console.error('Ошибка очистки остатков:', e)
    }
  }

  /* --- Account 299 actions --- */

  async function importAccount299Batch(
    itemsToImport: { sku: string; name?: string }[],
    replaceAll = false,
    onProgress?: (processed: number, total: number, chunkIndex: number, totalChunks: number) => void
  ) {
    if (!repo || !currentPartitionId.value) return
    isAccount299Loading.value = true
    try {
      const mapped = itemsToImport.map((i) => {
        const clean = (i.sku || '').replace(/\D/g, '').slice(0, 7) || (i.sku || '').trim()
        let name = ''
        if (clean && catalogSkuMap.value.has(clean)) {
          name = catalogSkuMap.value.get(clean)!
        } else if (i.name && !/^\d+$/.test(i.name.trim()) && i.name.trim() !== 'Товар ' + clean && i.name.trim() !== 'Товар без названия') {
          name = i.name.trim()
        } else {
          name = 'Н/Д'
        }
        return {
          sku: clean,
          name,
        }
      }).filter((i) => i.sku.length > 0)

      await repo.saveAccount299Batch(
        currentPartitionId.value,
        activeStoreNumber.value || '',
        mapped,
        replaceAll,
        onProgress
      )
      await loadAccount299()
    } catch (e) {
      error.value = e instanceof Error ? e.message : 'Ошибка импорта 299'
      throw e
    } finally {
      isAccount299Loading.value = false
    }
  }

  async function addAccount299Item(item: { sku: string; name?: string }) {
    if (!repo || !currentPartitionId.value) return
    try {
      const clean = (item.sku || '').replace(/\D/g, '').slice(0, 7) || (item.sku || '').trim()
      let name = ''
      if (clean && catalogSkuMap.value.has(clean)) {
        name = catalogSkuMap.value.get(clean)!
      } else if (item.name && item.name.trim() && !/^\d+$/.test(item.name.trim()) && item.name.trim() !== 'Товар ' + clean) {
        name = item.name.trim()
      } else {
        name = 'Н/Д'
      }
      await repo.addAccount299Item({
        revisionId: currentPartitionId.value,
        storeNumber: activeStoreNumber.value || '',
        sku: clean,
        name,
      })
      await loadAccount299()
    } catch (e) {
      error.value = e instanceof Error ? e.message : 'Ошибка добавления позиции 299'
      throw e
    }
  }

  async function updateAccount299Item(item: { id: string; sku: string; name: string }) {
    if (!repo) return
    try {
      const clean = (item.sku || '').replace(/\D/g, '').slice(0, 7) || (item.sku || '').trim()
      await repo.updateAccount299Item({
        id: item.id,
        sku: clean,
        name: item.name.trim() || (clean ? `Товар ${clean}` : 'Товар'),
      }, currentPartitionId.value)
      await loadAccount299()
    } catch (e) {
      error.value = e instanceof Error ? e.message : 'Ошибка изменения позиции 299'
      throw e
    }
  }

  async function removeAccount299Item(id: string) {
    if (!repo) return
    try {
      await repo.deleteAccount299Item(id, currentPartitionId.value)
      account299Items.value = account299Items.value.filter((i) => i.id !== id)
    } catch (e) {
      error.value = e instanceof Error ? e.message : 'Ошибка удаления позиции 299'
      throw e
    }
  }

  async function deleteAccount299ItemsBatch(ids: string[]) {
    if (!repo || ids.length === 0) return
    try {
      if (account299Items.value.length > 0 && ids.length >= account299Items.value.length) {
        await repo.clearAccount299(currentPartitionId.value)
        account299Items.value = []
      } else {
        await repo.deleteAccount299Batch(ids, currentPartitionId.value)
        const idSet = new Set(ids)
        account299Items.value = account299Items.value.filter((i) => !idSet.has(i.id))
      }
    } catch (e) {
      error.value = e instanceof Error ? e.message : 'Ошибка удаления позиций 299'
      throw e
    }
  }

  async function removeAccount299Duplicates(keepFirst = true) {
    if (!repo) return
    const idsToDelete: string[] = []
    if (keepFirst) {
      const seen = new Set<string>()
      for (const item of account299Items.value) {
        const sku = item.sku.trim().toLowerCase()
        if (seen.has(sku)) {
          idsToDelete.push(item.id)
        } else {
          seen.add(sku)
        }
      }
    } else {
      const counts = new Map<string, number>()
      for (const item of account299Items.value) {
        const sku = item.sku.trim().toLowerCase()
        counts.set(sku, (counts.get(sku) || 0) + 1)
      }
      for (const item of account299Items.value) {
        const sku = item.sku.trim().toLowerCase()
        if ((counts.get(sku) || 0) > 1) {
          idsToDelete.push(item.id)
        }
      }
    }

    if (idsToDelete.length > 0) {
      await deleteAccount299ItemsBatch(idsToDelete)
    }
  }

  async function removeAccount299NonStandard() {
    const idsToDelete = account299Items.value
      .filter((i) => !/^\d{7}$/.test(i.sku.trim()))
      .map((i) => i.id)
    if (idsToDelete.length > 0) {
      await deleteAccount299ItemsBatch(idsToDelete)
    }
  }

  async function removeAccount299NotFound() {
    const idsToDelete = account299Items.value
      .filter((i) => isNotFoundInCatalog(i.sku))
      .map((i) => i.id)
    if (idsToDelete.length > 0) {
      await deleteAccount299ItemsBatch(idsToDelete)
    }
  }

  async function clearAccount299() {
    if (!repo || !currentPartitionId.value) return
    try {
      await repo.clearAccount299(currentPartitionId.value)
      account299Items.value = []
    } catch (e) {
      console.error('Ошибка очистки счета 299:', e)
    }
  }

  async function rebindAccount299Names(): Promise<number> {
    if (!repo || !currentPartitionId.value || account299Items.value.length === 0) return 0
    isAccount299Loading.value = true
    try {
      await syncAllNamesWithCatalog()
      await Promise.all([loadAccount299(), loadItems(), loadStock()])
      return account299Items.value.length
    } catch (e) {
      console.error('Ошибка перепривязки наименований:', e)
      return 0
    } finally {
      isAccount299Loading.value = false
    }
  }

  /* --- Multiplicity actions (Кратность) --- */

  async function addMultiplicityItem(item: { sku: string; multiplicity: number }) {
    if (!repo || !currentPartitionId.value) return
    const sku = (item.sku || '').trim()
    const catalogName = catalogSkuMap.value.get(sku)
    const name = catalogName || (sku ? `Товар ${sku}` : 'Товар')
    try {
      await repo.addMultiplicityItem({
        revisionId: currentPartitionId.value,
        storeNumber: activeStoreNumber.value || '',
        sku,
        name,
        multiplicity: item.multiplicity || 1,
      })
      await loadMultiplicity()
    } catch (e) {
      console.error('Ошибка добавления кратности:', e)
    }
  }

  async function addMultiplicityBatch(
    items: { sku: string; multiplicity: number }[],
    onProgress?: (processed: number, total: number, currentSku?: string) => void
  ) {
    if (!repo || !currentPartitionId.value || items.length === 0) return
    const mapped = items.map((it) => {
      const sku = (it.sku || '').trim()
      const catalogName = catalogSkuMap.value.get(sku)
      const name = catalogName || (sku ? `Товар ${sku}` : 'Товар')
      return {
        sku,
        name,
        multiplicity: it.multiplicity || 1,
      }
    })

    try {
      await repo.addMultiplicityBatch(mapped, currentPartitionId.value, onProgress)
      await loadMultiplicity()
    } catch (e) {
      console.error('Ошибка пакетного добавления кратности:', e)
      throw e
    }
  }

  async function updateMultiplicityItem(item: { id: string; sku: string; name: string; multiplicity: number }) {
    if (!repo || !currentPartitionId.value) return
    try {
      await repo.updateMultiplicityItem({
        id: item.id,
        sku: item.sku,
        name: item.name,
        multiplicity: item.multiplicity,
      }, currentPartitionId.value)
      await loadMultiplicity()
    } catch (e) {
      console.error('Ошибка обновления кратности:', e)
    }
  }

  async function removeMultiplicityItem(id: string) {
    if (!repo || !currentPartitionId.value) return
    try {
      await repo.deleteMultiplicityItem(id, currentPartitionId.value)
      multiplicityItems.value = multiplicityItems.value.filter((i) => i.id !== id)
    } catch (e) {
      console.error('Ошибка удаления кратности:', e)
    }
  }

  async function deleteMultiplicityItemsBatch(ids: string[]) {
    if (!repo || !currentPartitionId.value || ids.length === 0) return
    try {
      if (multiplicityItems.value.length > 0 && ids.length >= multiplicityItems.value.length) {
        await repo.clearMultiplicity(currentPartitionId.value)
        multiplicityItems.value = []
      } else {
        await repo.deleteMultiplicityBatch(ids, currentPartitionId.value)
        const idSet = new Set(ids)
        multiplicityItems.value = multiplicityItems.value.filter((i) => !idSet.has(i.id))
      }
    } catch (e) {
      error.value = e instanceof Error ? e.message : 'Ошибка удаления позиций кратности'
      throw e
    }
  }

  async function clearMultiplicity() {
    if (!repo || !currentPartitionId.value) return
    try {
      await repo.clearMultiplicity(currentPartitionId.value)
      multiplicityItems.value = []
    } catch (e) {
      console.error('Ошибка очистки кратности:', e)
    }
  }

  /* --- General items actions --- */

  async function addGeneralItem(sku: string) {
    if (!repo || !currentPartitionId.value) return
    const clean = sku.trim()
    if (!clean) return
    try {
      const created = await repo.addGeneralItem({
        sku: clean,
        revisionId: currentPartitionId.value,
        storeNumber: activeStoreNumber.value || '',
      })
      generalItems.value.push(created)
      return created
    } catch (e) {
      console.error('Ошибка добавления ЛК в общее:', e)
      throw e
    }
  }

  async function addGeneralBatch(
    itemsToAdd: { sku: string }[],
    onProgress?: (processed: number, total: number, currentSku?: string) => void
  ) {
    if (!repo || !currentPartitionId.value || itemsToAdd.length === 0) return 0
    try {
      const count = await repo.addGeneralBatch(
        itemsToAdd,
        currentPartitionId.value,
        activeStoreNumber.value || '',
        onProgress
      )
      await loadGeneral()
      return count
    } catch (e) {
      console.error('Ошибка пакетной вставки в общее:', e)
      throw e
    }
  }

  async function updateGeneralItem(id: string, newSku: string) {
    if (!repo || !currentPartitionId.value) return
    try {
      await repo.updateGeneralItemSku(id, newSku, currentPartitionId.value)
      const found = generalItems.value.find((i) => i.id === id)
      if (found) {
        found.sku = newSku.trim()
      }
    } catch (e) {
      console.error('Ошибка обновления ЛК в общем:', e)
      throw e
    }
  }

  async function removeGeneralItem(id: string) {
    if (!repo || !currentPartitionId.value) return
    try {
      await repo.deleteGeneralItem(id, currentPartitionId.value)
      generalItems.value = generalItems.value.filter((i) => i.id !== id)
    } catch (e) {
      console.error('Ошибка удаления позиции из общего:', e)
      throw e
    }
  }

  async function deleteGeneralItemsBatch(ids: string[]) {
    if (!repo || !currentPartitionId.value || ids.length === 0) return
    try {
      await repo.deleteGeneralItemsBatch(ids, currentPartitionId.value)
      generalItems.value = generalItems.value.filter((i) => !ids.includes(i.id))
    } catch (e) {
      console.error('Ошибка массового удаления из общего:', e)
      throw e
    }
  }

  async function clearGeneral() {
    if (!repo || !currentPartitionId.value) return
    try {
      await repo.clearGeneral(currentPartitionId.value)
      generalItems.value = []
    } catch (e) {
      console.error('Ошибка очистки общего:', e)
      throw e
    }
  }

  return {
    items,
    filteredItems,
    totalCount,
    isLoading,
    error,
    filter,
    activeSubTab,
    catalogItems,
    isCatalogLoading,
    totalCatalogCount,
    stockItems,
    filteredStockItems,
    isStockLoading,
    totalStockCount,
    account299Items,
    isAccount299Loading,
    totalAccount299Count,
    multiplicityItems,
    isMultiplicityLoading,
    totalMultiplicityCount,
    generalItems,
    isGeneralLoading,
    totalGeneralCount,
    factSkuStatsMap,
    getFactSkuCount,
    getFactSkuQuantity,
    factSkuLocationsMap,
    getFactSkuLocations,
    getFactLocationTooltip,
    multiplicitySkuMap,
    getMultiplicityValue,
    hasCatalog,
    distinctLocations,
    ndFactCount,
    inCatalogFactCount,
    duplicateFactSkuSet,
    duplicateFactCount,
    nonStandardFactCount,
    account299FactCount,
    resetFactFilter,
    catalogSkuSet,
    catalogSkuMap,
    catalogNameMap,
    account299SkuSet,
    isAccount299Item,
    isNotFoundInCatalog,
    getAccount299ItemName,
    getFactItemName,
    getStockItemName,
    syncAllNamesWithCatalog,
    revisions,
    activeRevisions,
    archivedRevisions,
    activeRevisionId,
    activeRevision,
    activeStoreNumber,
    findConflictingRevision,
    setRepository,
    setActiveRevisionId,
    setActiveStoreNumber,
    setActiveSubTab,
    loadRevisions,
    createRevision,
    deleteRevision,
    archiveRevision,
    updateRevisionDates,
    loadItems,
    loadCatalog,
    loadStock,
    loadAccount299,
    loadMultiplicity,
    loadGeneral,
    loadAllStoreData,
    addItem,
    addItemsBatch,
    importFactBatch,
    updateFactQuantitiesBatch,
    updateFactLocationsBatch,
    updateFactBoxNumbersBatch,
    clearFact,
    updateItem,
    removeItem,
    deleteItemsBatch,
    mergeFactDuplicates,
    removeFactDuplicates,
    removeFactNonStandard,
    removeFactNotFound,
    importCatalogBatch,
    addCatalogItem,
    updateCatalogItem,
    removeCatalogItem,
    deleteCatalogItemsBatch,
    deduplicateCatalog,
    removeCatalogNonStandard,
    clearCatalog,
    importStockBatch,
    addStockItem,
    updateStockItem,
    removeStockItem,
    deleteStockItemsBatch,
    mergeStockDuplicates,
    removeStockDuplicates,
    removeStockNonStandard,
    removeStockNotFound,
    removeStockZero,
    clearStock,
    stockSkuQtyMap,
    getStockItemQuantity,
    importAccount299Batch,
    addAccount299Item,
    updateAccount299Item,
    removeAccount299Item,
    deleteAccount299ItemsBatch,
    removeAccount299Duplicates,
    removeAccount299NonStandard,
    removeAccount299NotFound,
    clearAccount299,
    rebindAccount299Names,
    addMultiplicityItem,
    addMultiplicityBatch,
    updateMultiplicityItem,
    removeMultiplicityItem,
    deleteMultiplicityItemsBatch,
    clearMultiplicity,
    addGeneralItem,
    addGeneralBatch,
    updateGeneralItem,
    removeGeneralItem,
    deleteGeneralItemsBatch,
    clearGeneral,
  }
})

