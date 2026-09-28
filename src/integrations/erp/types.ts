/**
 * TIPOS NEUTROS DE ERP (secoes 1 e 24)
 *
 * Nada aqui conhece o Bling. Sao os tipos que a Central entende: o adapter de
 * cada ERP traduz o payload dele para ca (src/integrations/erp/bling/mapper.ts).
 * Trocar de ERP amanha significa escrever outro mapper -- a inteligencia
 * (src/domain/intelligence) e o auditor (src/domain/auditor) nao mudam.
 *
 * Dinheiro e quantidade chegam como `number` JA normalizado pelo mapper. O que
 * vem do Postgres passa por `num()` de src/lib/format.ts antes de entrar em
 * conta, porque PostgREST devolve `numeric` como string.
 */

/* -------------------------------------------------------------------------- */
/* Identidade                                                                  */
/* -------------------------------------------------------------------------- */

export const ERP_PROVIDERS = ['BLING', 'MOCK'] as const
export type ErpProviderName = (typeof ERP_PROVIDERS)[number]

/** Canais externos com id proprio de produto (secao 3). */
export const PRODUCT_CHANNELS = ['BLING', 'MERCADO_LIVRE', 'SHOPEE', 'NUVEMSHOP'] as const
export type ProductChannel = (typeof PRODUCT_CHANNELS)[number]

/**
 * Origem de um saldo de estoque (secoes 2, 20 e 22).
 *
 * LOCAL               -- deposito proprio, fonte operacional e o ERP.
 * FULL_MERCADO_LIVRE  -- estoque que ja esta no centro de distribuicao do ML.
 *
 * LOCAL e FULL nunca somam no mesmo numero operacional. O total economico
 * existe, mas e outra coisa (ver `totalEconomicStock` em domain/intelligence).
 */
export const STOCK_SOURCES = ['LOCAL', 'FULL_MERCADO_LIVRE', 'SHOPEE', 'OTHER'] as const
export type StockSource = (typeof STOCK_SOURCES)[number]

/* -------------------------------------------------------------------------- */
/* Recursos                                                                    */
/* -------------------------------------------------------------------------- */

/** Produto como o ERP o conhece (cadastro operacional -- secao 37). */
export type ErpProduct = {
  /** Id do produto NO ERP. Nunca o uuid interno. */
  externalId: string
  sku: string | null
  name: string
  /** Preco de venda cadastrado no ERP. */
  price: number | null
  /** Custo cadastrado no ERP. Pode vir vazio -- o auditor reclama disso. */
  cost: number | null
  active: boolean
  /** Dados fiscais/logisticos que o auditor de cadastro confere (secao 27). */
  ncm: string | null
  gtin: string | null
  weightKg: number | null
  dimensions: { lengthCm: number | null; widthCm: number | null; heightCm: number | null } | null
  unit: string | null
  brand: string | null
  /** Variacao: quando o ERP trabalha com pai/filho. */
  parentExternalId: string | null
  updatedAt: string | null
}

/** Um saldo, sempre amarrado a uma origem e a um deposito (secoes 20 e 21). */
export type ErpStock = {
  productExternalId: string
  source: StockSource
  warehouseExternalId: string | null
  warehouseName: string | null
  /** O que esta fisicamente no deposito. */
  physicalQuantity: number
  /** O que o ERP considera disponivel para vender (fisico - reservas). */
  virtualQuantity: number
  /** Unidades comprometidas com pedidos ainda nao expedidos. */
  reservedQuantity: number
  updatedAt: string | null
}

export type ErpOrderItem = {
  productExternalId: string | null
  sku: string | null
  description: string
  quantity: number
  unitPrice: number
  unitCost: number | null
}

export type ErpOrder = {
  externalId: string
  number: string
  date: string
  status: string
  /** Canal de origem quando o ERP informa (loja/marketplace). */
  channelName: string | null
  customerName: string | null
  grossAmount: number
  discountAmount: number
  shippingCharged: number
  totalAmount: number
  items: ErpOrderItem[]
  updatedAt: string | null
}

export type ErpSupplier = {
  externalId: string
  name: string
  document: string | null
  email: string | null
  phone: string | null
  active: boolean
}

/** Vinculo produto <-> fornecedor: e daqui que sai o lead time real (secao 26). */
export type ErpProductSupplier = {
  productExternalId: string
  supplierExternalId: string
  supplierSku: string | null
  cost: number | null
  /** Prazo de entrega em dias, quando o ERP guarda. */
  leadTimeDays: number | null
  primary: boolean
}

export type ErpWarehouse = {
  externalId: string
  name: string
  active: boolean
  /** Alguns ERPs marcam o deposito de marketplace como nao-proprio. */
  kind: 'OWN' | 'EXTERNAL' | 'UNKNOWN'
}

/* -------------------------------------------------------------------------- */
/* Paginacao                                                                   */
/* -------------------------------------------------------------------------- */

export type ErpPageRequest = {
  page?: number
  pageSize?: number
  /** So o que mudou depois desta data -- usado na sincronizacao incremental. */
  updatedSince?: string | null
}

export type ErpPage<T> = {
  items: T[]
  page: number
  pageSize: number
  /** O ERP raramente informa o total; `hasMore` e o que da para garantir. */
  hasMore: boolean
}

/* -------------------------------------------------------------------------- */
/* Escrita (secoes 16, 17 e 18)                                                */
/* -------------------------------------------------------------------------- */

/**
 * Toda escrita carrega o motivo e o valor anterior. Sem isso o registro em
 * integration_actions nao consegue explicar a alteracao depois.
 */
export type ErpPriceUpdate = {
  productExternalId: string
  /** Preco lido do ERP no momento da proposta -- serve de guarda contra corrida. */
  currentPrice: number
  newPrice: number
  reason: string
}

export type ErpProductUpdate = {
  productExternalId: string
  patch: Partial<Pick<ErpProduct, 'name' | 'cost' | 'ncm' | 'gtin' | 'weightKg' | 'unit' | 'brand'>>
  reason: string
}

export type ErpWriteResult = {
  ok: boolean
  productExternalId: string
  /** O que o ERP devolveu depois de aplicar. Vai para executed_data. */
  applied: Record<string, unknown> | null
  error: string | null
}

/* -------------------------------------------------------------------------- */
/* Eventos (secoes 5, 6 e 7)                                                   */
/* -------------------------------------------------------------------------- */

export const ERP_EVENT_TYPES = [
  'product.created',
  'product.updated',
  'product.deleted',
  'stock.created',
  'stock.updated',
  'stock.deleted',
  'virtual_stock.updated',
  'order.created',
  'order.updated',
  'order.deleted',
  'product_supplier.created',
  'product_supplier.updated',
  'product_supplier.deleted',
  'invoice.created',
  'invoice.updated',
  'invoice.deleted',
] as const

export type ErpEventType = (typeof ERP_EVENT_TYPES)[number]

export function isErpEventType(value: string): value is ErpEventType {
  return (ERP_EVENT_TYPES as readonly string[]).includes(value)
}

/**
 * Evento normalizado depois da validacao de assinatura.
 *
 * `eventId` e o que garante idempotencia: vai para
 * integration_events.external_event_id, que tem UNIQUE (secao 6).
 */
export type ErpEvent = {
  eventId: string
  type: string
  resourceType: string | null
  resourceId: string | null
  /** Data que o ERP declara. NAO serve para ordenar processamento (secao 7). */
  occurredAt: string | null
  payload: Record<string, unknown>
}

/* -------------------------------------------------------------------------- */
/* Conexao e saude                                                             */
/* -------------------------------------------------------------------------- */

export const ERP_CONNECTION_STATUSES = [
  'NOT_CONFIGURED',
  'CONNECTED',
  'TOKEN_EXPIRED',
  'ERROR',
  'DISCONNECTED',
] as const
export type ErpConnectionStatus = (typeof ERP_CONNECTION_STATUSES)[number]

export const ERP_HEALTH_STATES = ['UNKNOWN', 'HEALTHY', 'DEGRADED', 'DOWN'] as const
export type ErpHealthState = (typeof ERP_HEALTH_STATES)[number]

/** Escopos minimos (secao 14). WRITE so entra quando for realmente preciso. */
export const ERP_SCOPES = {
  READ_PRODUCTS: 'read:products',
  READ_STOCK: 'read:stock',
  READ_ORDERS: 'read:orders',
  READ_SUPPLIERS: 'read:suppliers',
  WRITE_PRODUCT_PRICES: 'write:product-prices',
  WRITE_PRODUCTS: 'write:products',
} as const

export type ErpScope = (typeof ERP_SCOPES)[keyof typeof ERP_SCOPES]

/** O que a Fase A pede: leitura, nada mais (secao 39). */
export const READ_ONLY_SCOPES: ErpScope[] = [
  ERP_SCOPES.READ_PRODUCTS,
  ERP_SCOPES.READ_STOCK,
  ERP_SCOPES.READ_ORDERS,
  ERP_SCOPES.READ_SUPPLIERS,
]

/** Modos de automacao (secao 15). */
export const AUTOMATION_MODES = ['READ_ONLY', 'APPROVAL_REQUIRED', 'AUTOMATIC'] as const
export type AutomationMode = (typeof AUTOMATION_MODES)[number]
