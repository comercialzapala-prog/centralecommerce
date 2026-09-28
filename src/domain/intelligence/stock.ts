import { round2 } from '@/lib/format'
import type { StockBalance, StockSource } from '@/domain/intelligence/types'

/**
 * ESTOQUE, COBERTURA E REPOSICAO (secoes 20, 21, 22, 25 e 26)
 *
 * O numero que importa para decidir venda e o DISPONIVEL (virtual), nunca o
 * fisico: 100 fisico com 5 reservado nao sao 100 para vender (secao 21).
 */

/* -------------------------------------------------------------------------- */
/* Leitura de saldo                                                            */
/* -------------------------------------------------------------------------- */

export type SourceStock = {
  source: StockSource
  physical: number
  available: number
  reserved: number
}

/** Agrupa por origem. Nunca soma origens diferentes (secao 22). */
export function stockBySource(balances: StockBalance[]): SourceStock[] {
  const groups = new Map<StockSource, SourceStock>()

  for (const balance of balances) {
    const entry =
      groups.get(balance.source) ??
      { source: balance.source, physical: 0, available: 0, reserved: 0 }

    entry.physical += balance.physical
    entry.available += balance.virtual
    entry.reserved += balance.reserved
    groups.set(balance.source, entry)
  }

  return [...groups.values()].map((entry) => ({
    source: entry.source,
    physical: round2(entry.physical),
    available: round2(entry.available),
    reserved: round2(entry.reserved),
  }))
}

export function availableAt(balances: StockBalance[], source: StockSource): number {
  return round2(
    balances
      .filter((balance) => balance.source === source)
      .reduce((sum, balance) => sum + balance.virtual, 0),
  )
}

export function physicalAt(balances: StockBalance[], source: StockSource): number {
  return round2(
    balances
      .filter((balance) => balance.source === source)
      .reduce((sum, balance) => sum + balance.physical, 0),
  )
}

export function reservedAt(balances: StockBalance[], source: StockSource): number {
  return round2(
    balances
      .filter((balance) => balance.source === source)
      .reduce((sum, balance) => sum + balance.reserved, 0),
  )
}

/**
 * Soma de TODAS as origens.
 *
 * Existe porque a pergunta "quantas unidades eu tenho no mundo?" e legitima
 * (exemplo da secao 22: LOCAL 80 + FULL 25 = 105). O nome diz "economico" para
 * deixar claro que NAO e um numero operacional: nao da para despachar do Full o
 * que se vende no site. Nunca use isto para calcular reposicao local.
 */
export function totalEconomicStock(balances: StockBalance[]): number {
  return round2(balances.reduce((sum, balance) => sum + balance.virtual, 0))
}

/* -------------------------------------------------------------------------- */
/* Cobertura                                                                   */
/* -------------------------------------------------------------------------- */

/**
 * stock_coverage_days = available_stock / daily_velocity  (secao 25)
 *
 * Devolve null quando a velocidade e zero. Nao e "infinito" nem um numero
 * gigante: sem venda a cobertura nao esta definida, e mostrar "99999 dias" no
 * painel seria pior do que mostrar "sem giro".
 */
export function calculateStockCoverage(
  availableStock: number,
  dailyVelocity: number,
): number | null {
  if (dailyVelocity <= 0) return null
  if (availableStock <= 0) return 0
  return round2(availableStock / dailyVelocity)
}

/**
 * reorder_point = velocidade * lead_time + velocidade * dias_de_seguranca
 * (secao 26, formula inicial)
 */
export function calculateReorderPoint(params: {
  dailyVelocity: number
  supplierLeadDays: number
  safetyDays: number
}): number {
  const lead = Math.max(params.supplierLeadDays, 0)
  const safety = Math.max(params.safetyDays, 0)
  return round2(params.dailyVelocity * lead + params.dailyVelocity * safety)
}

export type PurchaseSuggestion = {
  /** Unidades a comprar. Inteiro arredondado para cima -- nao se compra 28,4. */
  quantity: number
  reorderPoint: number
  coverageDays: number | null
  /** Quantos dias de cobertura a compra pretende garantir. */
  targetCoverageDays: number
  /** Dias em que o estoque zera se nada for comprado. Null sem giro. */
  daysUntilStockout: number | null
  /** Custo estimado da compra. Null quando o produto nao tem custo cadastrado. */
  estimatedCost: number | null
}

/**
 * Quanto comprar (secao 26).
 *
 * Compra para chegar a `targetCoverageDays` de cobertura, nunca menos do que o
 * ponto de reposicao. Se ja ha estoque suficiente, devolve 0 -- a sugestao e de
 * compra, e "comprar 0" e uma resposta valida.
 */
export function calculateSuggestedPurchase(params: {
  availableStock: number
  dailyVelocity: number
  supplierLeadDays: number
  safetyDays: number
  targetCoverageDays: number
  unitCost: number | null
}): PurchaseSuggestion {
  const reorderPoint = calculateReorderPoint(params)
  const coverageDays = calculateStockCoverage(params.availableStock, params.dailyVelocity)

  // Alvo em unidades: o maior entre cobrir o horizonte e repor o ponto minimo.
  const targetUnits = Math.max(params.dailyVelocity * params.targetCoverageDays, reorderPoint)
  const missing = targetUnits - params.availableStock
  const quantity = missing > 0 ? Math.ceil(missing) : 0

  return {
    quantity,
    reorderPoint,
    coverageDays,
    targetCoverageDays: params.targetCoverageDays,
    daysUntilStockout: coverageDays,
    estimatedCost:
      params.unitCost === null ? null : round2(quantity * params.unitCost),
  }
}

/* -------------------------------------------------------------------------- */
/* Full (secao 22)                                                             */
/* -------------------------------------------------------------------------- */

export type FullRestockSuggestion = {
  /** Unidades a enviar para o Full. */
  quantity: number
  /** Quanto disso o estoque LOCAL consegue atender agora. */
  availableToSend: number
  /** Falta comprar antes de enviar. */
  shortfall: number
  fullCoverageDays: number | null
}

/**
 * Reposicao do Full (secao 22).
 *
 * Duas regras que o calculo respeita:
 *  - o Full so pode ser abastecido com estoque LOCAL disponivel, entao o envio
 *    e limitado pelo que existe aqui;
 *  - enviar tudo deixaria o canal proprio sem estoque, por isso `reserveLocal`
 *    protege uma cobertura minima local.
 */
export function calculateFullRestock(params: {
  fullAvailable: number
  localAvailable: number
  fullDailyVelocity: number
  targetCoverageDays: number
  /** Unidades que devem permanecer no local. */
  reserveLocal: number
}): FullRestockSuggestion {
  const fullCoverageDays = calculateStockCoverage(params.fullAvailable, params.fullDailyVelocity)

  const targetUnits = params.fullDailyVelocity * params.targetCoverageDays
  const needed = Math.max(Math.ceil(targetUnits - params.fullAvailable), 0)

  const sendable = Math.max(params.localAvailable - Math.max(params.reserveLocal, 0), 0)
  const availableToSend = Math.min(needed, Math.floor(sendable))

  return {
    quantity: needed,
    availableToSend,
    shortfall: Math.max(needed - availableToSend, 0),
    fullCoverageDays,
  }
}
