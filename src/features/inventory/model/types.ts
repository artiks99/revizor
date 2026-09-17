export interface InventoryItem {
  id: string
  name: string
  sku: string
  category?: string
  quantity: number
  unit: string
  location: string
  boxNumber?: string
  status: InventoryItemStatus
  lastAuditDate: string | null
  createdAt: string
  updatedAt: string
  isNotFoundInCatalog?: boolean
}

export interface StoreCatalogItem {
  id: string
  storeNumber: string
  sku: string
  name: string
  barcode: string
  createdAt?: string
  updatedAt?: string
}

export interface StoreStockItem {
  id: string
  storeNumber: string
  sku: string
  name: string
  quantity: number
  createdAt?: string
  updatedAt?: string
  isNotFoundInCatalog?: boolean
}

export interface StoreAccount299Item {
  id: string
  revisionId?: string
  storeNumber: string
  sku: string
  name: string
  createdAt?: string
  updatedAt?: string
  isNotFoundInCatalog?: boolean
}

export interface StoreMultiplicityItem {
  id: string
  sku: string
  name: string
  multiplicity: number
  createdAt?: string
  updatedAt?: string
}

export interface Revision {
  id: string
  storeNumber: string
  startDate: string
  endDate: string
  createdAt: string
  isArchived?: boolean
  /** Абсолютный путь к папке ревизии на диске */
  dirPath?: string
}

export interface StoreGeneralItem {
  id: string
  revisionId?: string
  storeNumber?: string
  sku: string
  createdAt?: string
  updatedAt?: string
}

export type InventorySubTab = 'general' | 'fact' | 'stock' | 'catalog' | '299' | 'multiplicity'

export type InventoryItemStatus = 'ok' | 'discrepancy' | 'missing' | 'surplus'

export interface InventoryFilter {
  search?: string
  status?: InventoryItemStatus | null
  catalogStatus?: 'all' | 'nd' | 'in_catalog' | 'duplicates' | 'non_standard' | '299' | null
  location?: string | null
}


