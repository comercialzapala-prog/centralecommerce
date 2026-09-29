import { round2 } from '@/lib/format'
import { evaluateAds, type AdsPerformance } from '@/domain/intelligence/ads'
import {
  assessPriceChange,
  calculateMargin,
  calculateMinimumPrice,
  type MarginResult,
} from '@/domain/intelligence/pricing'
import {
  availableAt,
  calculateStockCoverage,
  calculateSuggestedPurchase,
  physicalAt,
  reservedAt,
  totalEconomicStock,
  type PurchaseSuggestion,
} from '@/domain/intelligence/stock'
import { calculateVelocity, planningVelocity, type VelocitySnapshot } from '@/domain/intelligence/velocity'
import type { IntelligenceParams, ProductSnapshot } from '@/domain/intelligence/types'

export * from '@/domain/intelligence/types'
export * from '@/domain/intelligence/velocity'
export * from '@/domain/intelligence/stock'
export * from '@/domain/intelligence/pricing'
export * from '@/domain/intelligence/ads'

/**
 * MOTOR DE INTELIGENCIA -- COMPOSICAO (secao 24)
 *
 * `analyzeProduct` transforma o retrato de um produto no conjunto de numeros que
 * o auditor e as telas usam. Funcao pura: mesmo snapshot + mesma data = mesmo
 * resultado, sempre.
 *
 * Os detectores (`detect*`) ficam aqui e nao no auditor porque sao MATEMATICA,
 * nao regra de negocio de apresentacao: eles respondem "existe problema?" com
 * numero. O auditor transforma isso em alerta com texto, severidade e acao
 * sugerida (secao 29).
 */

export type ProductInsight = {
  productId: string
  sku: string | null
  name: string

  velocity: VelocitySnapshot
  /** Velocidade usada para planejar reposicao (a maior entre curta e media). */
  planningVelocity: number

  /** Estoque LOCAL -- o operacional, o que da para despachar daqui. */
  local: { physical: number; available: number; reserved: number }
  /** Estoque no Full do Mercado Livre. Separado de propósito (secao 22). */
  full: { physical: number; available: number; reserved: number }
  /** Soma de todas as origens. Numero economico, NAO operacional. */
  totalEconomic: number

  /** Cobertura em dias do estoque LOCAL. Null sem giro. */
  coverageDays: number | null
  /** Cobertura do Full. Null sem giro. */
  fullCoverageDays: number | null

  purchase: PurchaseSuggestion
  /** Prazo de fornecedor efetivamente usado (do produto ou o default). */
  leadDaysUsed: number

  /** Null quando o produto nao tem custo cadastrado -- nao se inventa custo. */
  margin: MarginResult | null
  /** Preco minimo para a margem meta. Null quando a estrutura nao fecha. */
  minimumPrice: number | null

  ads: AdsPerformance | null

  /** Campos de cadastro ausentes (secao 27). */
  registryGaps: RegistryGap[]
}

export type RegistryGap = 'SKU' | 'CUSTO' | 'NCM' | 'PESO' | 'DIMENSOES' | 'FORNECEDOR' | 'PRECO'

export function analyzeProduct(
  snapshot: ProductSnapshot,
  params: IntelligenceParams,
  referenceDate: string,
): ProductInsight {
  const velocity = calculateVelocity(snapshot.sales, params.velocityWindows, referenceDate)
  const planning = planningVelocity(velocity)

  const local = {
    physical: physicalAt(snapshot.balances, 'LOCAL'),
    available: availableAt(snapshot.balances, 'LOCAL'),
    reserved: reservedAt(snapshot.balances, 'LOCAL'),
  }

  const full = {
    physical: physicalAt(snapshot.balances, 'FULL_MERCADO_LIVRE'),
    available: availableAt(snapshot.balances, 'FULL_MERCADO_LIVRE'),
    reserved: reservedAt(snapshot.balances, 'FULL_MERCADO_LIVRE'),
  }

  // Sem prazo do fornecedor, usa o default configurado -- e registra a lacuna em
  // registryGaps, para o usuario saber que o numero e uma suposicao dele mesmo.
  const leadDaysUsed = snapshot.supplierLeadDays ?? params.supplierLeadDays

  const margin =
    snapshot.cost !== null && snapshot.price !== null
      ? calculateMargin({
          price: snapshot.price,
          unitCost: snapshot.cost,
          costs: snapshot.variableCosts,
        })
      : null

  return {
    productId: snapshot.productId,
    sku: snapshot.sku,
    name: snapshot.name,
    velocity,
    planningVelocity: planning,
    local,
    full,
    totalEconomic: totalEconomicStock(snapshot.balances),
    coverageDays: calculateStockCoverage(local.available, planning),
    fullCoverageDays: calculateStockCoverage(full.available, planning),
    purchase: calculateSuggestedPurchase({
      availableStock: local.available,
      dailyVelocity: planning,
      supplierLeadDays: leadDaysUsed,
      safetyDays: params.safetyDays,
      targetCoverageDays: params.purchaseCoverageDays,
      unitCost: snapshot.cost,
    }),
    leadDaysUsed,
    margin,
    minimumPrice:
      snapshot.cost === null
        ? null
        : calculateMinimumPrice({
            unitCost: snapshot.cost,
            costs: snapshot.variableCosts,
            targetMarginPercent: params.targetMarginPercent,
          }),
    ads:
      snapshot.ads && margin
        ? evaluateAds({ ads: snapshot.ads, netMarginPercent: margin.netMarginPercent })
        : null,
    registryGaps: findRegistryGaps(snapshot),
  }
}

function findRegistryGaps(snapshot: ProductSnapshot): RegistryGap[] {
  const gaps: RegistryGap[] = []
  if (!snapshot.sku) gaps.push('SKU')
  if (snapshot.cost === null) gaps.push('CUSTO')
  if (snapshot.price === null) gaps.push('PRECO')
  if (!snapshot.registry.ncm) gaps.push('NCM')
  if (snapshot.registry.weightKg === null) gaps.push('PESO')
  if (!snapshot.registry.hasDimensions) gaps.push('DIMENSOES')
  // Ausência de DADO não é ausência OPERACIONAL. A lacuna só existe quando a
  // fonte respondeu (MISSING, nunca UNKNOWN) E o produto exige fornecedor.
  if (snapshot.supplierRequired && snapshot.supplierLink === 'MISSING') gaps.push('FORNECEDOR')
  return gaps
}

/* ========================================================================== */
/* Detectores (secao 28 -- regras deterministicas, sem IA)                     */
/* ========================================================================== */

export type StockProblem =
  | 'ESTOQUE_NEGATIVO'
  | 'ESTOQUE_ZERADO'
  | 'RUPTURA_PROXIMA'
  | 'ESTOQUE_EXCESSIVO'
  | 'ESTOQUE_PARADO'
  | 'GIRO_ACELERADO'

/**
 * Problemas de estoque (secao 27).
 *
 * A regra central e literalmente a da secao 28:
 *   se cobertura < lead_time + dias_de_seguranca -> ruptura proxima
 *
 * Ordem importa: negativo e zerado sao fatos, nao previsao, e por isso vem
 * primeiro. Um produto zerado nao precisa de aviso de "ruptura proxima".
 */
export function detectStockProblem(
  insight: ProductInsight,
  params: IntelligenceParams,
): StockProblem[] {
  const problems: StockProblem[] = []

  if (insight.local.physical < 0 || insight.local.available < 0) {
    problems.push('ESTOQUE_NEGATIVO')
  } else if (insight.local.available === 0) {
    problems.push('ESTOQUE_ZERADO')
  } else if (
    insight.coverageDays !== null &&
    insight.coverageDays < insight.leadDaysUsed + params.safetyDays
  ) {
    problems.push('RUPTURA_PROXIMA')
  }

  if (insight.coverageDays !== null && insight.coverageDays > params.excessCoverageDays) {
    problems.push('ESTOQUE_EXCESSIVO')
  }

  // Parado = tem estoque e nao vende. Sem estoque e sem venda nao e problema de
  // capital imobilizado, e produto inativo.
  const noSales = insight.velocity.daysSinceLastSale === null
  const staleSales = (insight.velocity.daysSinceLastSale ?? 0) >= params.stagnantDays
  if (insight.local.available > 0 && (noSales || staleSales)) {
    problems.push('ESTOQUE_PARADO')
  }

  if (
    insight.velocity.accelerationPercent !== null &&
    insight.velocity.accelerationPercent >= params.accelerationAlertPercent
  ) {
    problems.push('GIRO_ACELERADO')
  }

  return problems
}

export type MarginProblem =
  | 'MARGEM_NEGATIVA'
  | 'MARGEM_ABAIXO_DO_MINIMO'
  | 'MARGEM_ABAIXO_DA_META'
  | 'CUSTO_MAIOR_QUE_PRECO'
  | 'SEM_CUSTO'

export function detectMarginProblem(
  insight: ProductInsight,
  params: IntelligenceParams,
): MarginProblem[] {
  // Sem custo nao ha margem para julgar. Assumir custo zero produziria "margem
  // 100%" e esconderia o problema real, que e o cadastro (secao 27).
  if (!insight.margin) return ['SEM_CUSTO']

  const problems: MarginProblem[] = []
  const { netMargin, netMarginPercent, price, unitCost } = insight.margin

  if (unitCost > price) problems.push('CUSTO_MAIOR_QUE_PRECO')
  if (netMargin < 0) problems.push('MARGEM_NEGATIVA')
  else if (netMarginPercent < params.minMarginPercent) problems.push('MARGEM_ABAIXO_DO_MINIMO')
  else if (netMarginPercent < params.targetMarginPercent) problems.push('MARGEM_ABAIXO_DA_META')

  return problems
}

export type PriceProblem = 'PRECO_ABAIXO_DO_MINIMO' | 'SEM_PRECO'

export function detectPriceProblem(insight: ProductInsight): PriceProblem[] {
  if (insight.margin === null) {
    return insight.registryGaps.includes('PRECO') ? ['SEM_PRECO'] : []
  }
  if (insight.minimumPrice === null) return []

  return insight.margin.price < insight.minimumPrice ? ['PRECO_ABAIXO_DO_MINIMO'] : []
}

export type AdsProblem =
  | 'ROAS_ABAIXO_DO_BREAK_EVEN'
  | 'ADS_SEM_ESTOQUE'
  | 'ADS_COM_MARGEM_BAIXA'
  | 'RENTAVEL_SEM_ADS'

export function detectAdsProblem(
  insight: ProductInsight,
  params: IntelligenceParams,
): AdsProblem[] {
  const problems: AdsProblem[] = []

  // Produto rentavel, com giro e com estoque, que ninguem esta anunciando: e a
  // "oportunidade" da secao 30, nao um defeito.
  if (!insight.ads || insight.ads.spend === 0) {
    if (
      insight.margin !== null &&
      insight.margin.netMarginPercent >= params.targetMarginPercent &&
      insight.local.available > 0 &&
      insight.velocity.medium > 0
    ) {
      problems.push('RENTAVEL_SEM_ADS')
    }
    return problems
  }

  if (insight.ads.belowBreakEven) problems.push('ROAS_ABAIXO_DO_BREAK_EVEN')

  // Anunciar o que nao da para entregar queima verba e reputacao.
  if (
    insight.coverageDays !== null &&
    insight.coverageDays < insight.leadDaysUsed + params.safetyDays
  ) {
    problems.push('ADS_SEM_ESTOQUE')
  } else if (insight.local.available <= 0) {
    problems.push('ADS_SEM_ESTOQUE')
  }

  if (insight.margin !== null && insight.margin.netMarginPercent < params.minMarginPercent) {
    problems.push('ADS_COM_MARGEM_BAIXA')
  }

  return problems
}

export type FullProblem = 'FULL_QUASE_SEM_ESTOQUE' | 'FULL_EXCESSIVO' | 'FULL_PARADO' | 'ELEGIVEL_PARA_FULL'

export function detectFullProblem(
  insight: ProductInsight,
  params: IntelligenceParams,
): FullProblem[] {
  const problems: FullProblem[] = []
  const hasFull = insight.full.physical > 0 || insight.full.available > 0

  if (!hasFull) {
    // Candidato a Full: gira, tem estoque local sobrando e da margem.
    if (
      insight.velocity.medium > 0 &&
      insight.coverageDays !== null &&
      insight.coverageDays > params.excessCoverageDays / 2 &&
      insight.margin !== null &&
      insight.margin.netMarginPercent >= params.targetMarginPercent
    ) {
      problems.push('ELEGIVEL_PARA_FULL')
    }
    return problems
  }

  if (
    insight.fullCoverageDays !== null &&
    insight.fullCoverageDays < params.fullLowCoverageDays
  ) {
    problems.push('FULL_QUASE_SEM_ESTOQUE')
  }

  if (insight.fullCoverageDays !== null && insight.fullCoverageDays > params.excessCoverageDays) {
    problems.push('FULL_EXCESSIVO')
  }

  if (
    insight.full.available > 0 &&
    (insight.velocity.daysSinceLastSale === null ||
      insight.velocity.daysSinceLastSale >= params.stagnantDays)
  ) {
    problems.push('FULL_PARADO')
  }

  return problems
}

/**
 * Preco recomendado para chegar a margem meta, com a faixa de risco da secao 18.
 * Devolve null quando nao ha o que recomendar (sem custo ou ja na meta).
 */
export function recommendPrice(
  insight: ProductInsight,
  params: IntelligenceParams,
): { current: number; recommended: number; assessment: ReturnType<typeof assessPriceChange> } | null {
  if (!insight.margin || insight.minimumPrice === null) return null
  if (insight.margin.netMarginPercent >= params.targetMarginPercent) return null

  const recommended = round2(insight.minimumPrice)
  if (recommended <= insight.margin.price) return null

  return {
    current: insight.margin.price,
    recommended,
    assessment: assessPriceChange(insight.margin.price, recommended, params.priceThresholds),
  }
}
