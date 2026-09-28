/**
 * VOCABULARIO DA INTELIGENCIA (secao 24)
 *
 * Esta pasta e o coracao da Central e NAO pode depender de ERP nenhum. Nenhum
 * arquivo em src/domain/ importa de src/integrations/ -- a dependencia corre no
 * sentido contrario: o adapter traduz para ca.
 *
 * O motivo e pratico: os dados vem do Bling hoje e podem vir de outro ERP
 * amanha. Se `calculateReorderPoint` conhecesse o formato do Bling, trocar de
 * ERP obrigaria a reescrever a inteligencia.
 *
 * Todas as funcoes daqui sao PURAS: recebem numeros, devolvem numeros. Sem
 * fetch, sem Supabase, sem `new Date()` implicito -- a data de referencia sempre
 * entra como parametro, senao o teste passa hoje e falha amanha.
 */

/** Origem de um saldo. Definido aqui porque e conceito de negocio, nao de ERP. */
export const STOCK_SOURCES = ['LOCAL', 'FULL_MERCADO_LIVRE', 'SHOPEE', 'OTHER'] as const
export type StockSource = (typeof STOCK_SOURCES)[number]

/** Um saldo, sempre com a origem colada (secoes 20 e 22). */
export type StockBalance = {
  source: StockSource
  physical: number
  /** Disponivel para vender. NUNCA igual ao fisico quando ha reserva (secao 21). */
  virtual: number
  reserved: number
}

/** Uma venda. `date` em `YYYY-MM-DD`. */
export type SaleEvent = {
  date: string
  quantity: number
}

/** Custos variaveis que incidem sobre a venda, em % da receita. */
export type VariableCosts = {
  /** Comissao do marketplace. */
  marketplacePercent: number
  /** Gateway / antecipacao. */
  gatewayPercent: number
  /** Imposto sobre a venda. */
  taxPercent: number
  /** Frete e embalagem por unidade, em dinheiro. */
  shippingPerUnit: number
  packagingPerUnit: number
}

export const NO_VARIABLE_COSTS: VariableCosts = {
  marketplacePercent: 0,
  gatewayPercent: 0,
  taxPercent: 0,
  shippingPerUnit: 0,
  packagingPerUnit: 0,
}

/** Investimento em anuncio de um produto num periodo. */
export type AdsSpend = {
  spend: number
  attributedRevenue: number
  days: number
}

/**
 * Limiares. Vem de integration_settings (secao 18: nao hardcode). A inteligencia
 * nao tem default proprio -- ela exige o parametro, para nao existirem dois
 * numeros diferentes valendo ao mesmo tempo.
 */
export type IntelligenceParams = {
  supplierLeadDays: number
  safetyDays: number
  purchaseCoverageDays: number
  velocityWindows: { short: number; medium: number; long: number }
  targetMarginPercent: number
  minMarginPercent: number
  excessCoverageDays: number
  stagnantDays: number
  fullLowCoverageDays: number
  accelerationAlertPercent: number
  priceThresholds: {
    autoMaxPercent: number
    reviewMaxPercent: number
    approvalMaxPercent: number
  }
}

/**
 * Tudo que a inteligencia sabe sobre um produto num instante.
 *
 * Montado por quem le o banco (a camada de dados), nunca pela inteligencia.
 */
export type ProductSnapshot = {
  productId: string
  sku: string | null
  name: string
  /** Custo unitario. `null` = cadastro incompleto, e o auditor precisa saber. */
  cost: number | null
  price: number | null
  balances: StockBalance[]
  /** Historico de vendas do produto, nao agregado. */
  sales: SaleEvent[]
  /** Prazo do fornecedor quando conhecido; null cai no default configurado. */
  supplierLeadDays: number | null
  hasSupplier: boolean
  variableCosts: VariableCosts
  ads: AdsSpend | null
  /** Campos de cadastro que o auditor confere (secao 27). */
  registry: {
    ncm: string | null
    weightKg: number | null
    hasDimensions: boolean
  }
}
