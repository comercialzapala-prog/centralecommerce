import { round2 } from '@/lib/format'
import type { IntelligenceParams, ProductInsight } from '@/domain/intelligence'

/**
 * IMPACTO FINANCEIRO DE UM ACHADO (secao 29)
 *
 * REGRA QUE GOVERNA ESTE ARQUIVO: quando nao ha base para calcular, o resultado e
 * `null` -- nunca zero. Zero afirma "isto nao custa nada", e essa e uma afirmacao
 * diferente de "nao sei quanto custa". A tela mostra "—" para null e um valor em
 * reais para o resto; confundir os dois faria a ordenacao por impacto enterrar
 * alerta grave sem custo conhecido embaixo de alerta trivial de R$ 3.
 *
 * Nenhum numero aqui e estimativa de IA ou heuristica: todos saem de
 * `ProductInsight`, que veio do motor de inteligencia, que veio dos dados.
 *
 * A JANELA DE PROJECAO e `params.velocityWindows.medium` (30 dias por default,
 * configuravel em integration_settings). Nao e constante no codigo.
 */

export const IMPACT_KINDS = ['RISCO_RECEITA', 'PERDA_MARGEM', 'CAPITAL_PARADO', 'DESEMBOLSO'] as const
export type ImpactKind = (typeof IMPACT_KINDS)[number]

export type FinancialImpact = {
  amount: number
  kind: ImpactKind
}

/** Margem liquida por unidade. Null sem custo ou sem preco cadastrado. */
function unitMargin(insight: ProductInsight): number | null {
  return insight.margin ? insight.margin.netMargin : null
}

/**
 * RISCO DE RECEITA -- margem que deixa de entrar pelos dias em que o produto
 * ficara sem estoque.
 *
 * Usa margem, nao faturamento: faturamento perdido inclui o custo que tambem nao
 * foi gasto, e contar isso como perda inflaria o numero.
 */
export function stockoutImpact(
  insight: ProductInsight,
  params: IntelligenceParams,
): FinancialImpact | null {
  const margin = unitMargin(insight)
  if (margin === null || margin <= 0) return null
  if (insight.planningVelocity <= 0) return null

  const coverUntilRestock = insight.leadDaysUsed + params.safetyDays
  // Dias descobertos: quanto falta para a cobertura alcancar a reposicao.
  const uncoveredDays = Math.max(coverUntilRestock - (insight.coverageDays ?? 0), 0)
  if (uncoveredDays <= 0) return null

  return {
    amount: round2(uncoveredDays * insight.planningVelocity * margin),
    kind: 'RISCO_RECEITA',
  }
}

/** CAPITAL PARADO -- dinheiro imobilizado nas unidades que nao giram. */
export function idleCapitalImpact(units: number, insight: ProductInsight): FinancialImpact | null {
  if (units <= 0) return null
  const cost = insight.margin?.unitCost
  if (cost === undefined || cost <= 0) return null

  return { amount: round2(units * cost), kind: 'CAPITAL_PARADO' }
}

/**
 * PERDA DE MARGEM -- quanto a diferenca de margem custa na janela de projecao.
 *
 * `missingPerUnit` e o que falta por unidade (em dinheiro). Multiplicado pelo giro
 * e pela janela, vira "quanto isto custa por mes no ritmo atual".
 */
export function marginGapImpact(
  missingPerUnit: number,
  insight: ProductInsight,
  params: IntelligenceParams,
): FinancialImpact | null {
  if (missingPerUnit <= 0) return null
  if (insight.planningVelocity <= 0) return null

  return {
    amount: round2(missingPerUnit * insight.planningVelocity * params.velocityWindows.medium),
    kind: 'PERDA_MARGEM',
  }
}

/** DESEMBOLSO -- dinheiro que sera gasto sem retorno se nada mudar. */
export function wastedSpendImpact(amount: number): FinancialImpact | null {
  if (amount <= 0) return null
  return { amount: round2(amount), kind: 'DESEMBOLSO' }
}

/* -------------------------------------------------------------------------- */
/* Onde resolver                                                              */
/* -------------------------------------------------------------------------- */

/**
 * Tela em que o problema se resolve.
 *
 * Fica junto da regra, e nao na pagina, por um motivo: a regra sabe o que esta
 * errado, entao ela sabe onde se corrige. Se a tela tivesse de adivinhar a partir
 * do dominio, cada regra nova exigiria editar um switch em outro arquivo.
 */
export const RESOLVE_PATHS = {
  produto: (productId: string) => `/produtos/${productId}`,
  estoque: (productId: string) => `/produtos/${productId}`,
  movimentacoes: () => '/movimentacoes',
  lancamentos: () => '/lancamentos',
  integracao: () => '/configuracoes/integracoes/bling',
  configuracoes: () => '/configuracoes',
  produtos: () => '/produtos',
} as const
