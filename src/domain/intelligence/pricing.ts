import { round2 } from '@/lib/format'
import type { VariableCosts } from '@/domain/intelligence/types'

/**
 * MARGEM E PRECO (secoes 18, 24 e 38)
 *
 * A pergunta que a Central responde e a da secao 38: o Bling diz "Preço = R$
 * 99,90"; a Central diz "neste preço sua margem líquida será 4,1%".
 *
 * Por isso margem aqui e SEMPRE liquida de custo variavel -- comissao, gateway,
 * imposto, frete e embalagem. Margem bruta (preco - custo) engana em
 * marketplace, onde a comissao come a diferenca.
 */

export type MarginResult = {
  price: number
  unitCost: number
  /** Comissao + gateway + imposto, em dinheiro por unidade. */
  percentualCosts: number
  /** Frete + embalagem por unidade. */
  fixedCosts: number
  /** preco - custo. Referencia, nao decisao. */
  grossMargin: number
  /** O que sobra de verdade por unidade. */
  netMargin: number
  /** netMargin / preco * 100. */
  netMarginPercent: number
  /** Soma dos custos variaveis percentuais, em % do preco. */
  variablePercent: number
}

function sumVariablePercent(costs: VariableCosts): number {
  return costs.marketplacePercent + costs.gatewayPercent + costs.taxPercent
}

/** Margem liquida unitaria (secao 24). */
export function calculateMargin(params: {
  price: number
  unitCost: number
  costs: VariableCosts
}): MarginResult {
  const variablePercent = sumVariablePercent(params.costs)
  const percentualCosts = round2((params.price * variablePercent) / 100)
  const fixedCosts = round2(params.costs.shippingPerUnit + params.costs.packagingPerUnit)

  const netMargin = round2(params.price - params.unitCost - percentualCosts - fixedCosts)

  return {
    price: round2(params.price),
    unitCost: round2(params.unitCost),
    percentualCosts,
    fixedCosts,
    grossMargin: round2(params.price - params.unitCost),
    netMargin,
    netMarginPercent: params.price > 0 ? round2((netMargin / params.price) * 100) : 0,
    variablePercent: round2(variablePercent),
  }
}

/**
 * Preco minimo para atingir uma margem liquida alvo (secao 24).
 *
 * Resolvendo para P:
 *   P - custo - P*(v/100) - fixos = P*(m/100)
 *   P * (1 - v/100 - m/100) = custo + fixos
 *   P = (custo + fixos) / (1 - v/100 - m/100)
 *
 * Devolve null quando o denominador e <= 0: se comissao + imposto + margem alvo
 * somam 100% ou mais, NAO existe preco que feche a conta. Devolver um numero
 * enorme seria pior do que admitir que a estrutura de custo nao fecha.
 */
export function calculateMinimumPrice(params: {
  unitCost: number
  costs: VariableCosts
  targetMarginPercent: number
}): number | null {
  const variablePercent = sumVariablePercent(params.costs)
  const denominator = 1 - variablePercent / 100 - params.targetMarginPercent / 100

  if (denominator <= 0) return null

  const fixed = params.costs.shippingPerUnit + params.costs.packagingPerUnit
  return round2((params.unitCost + fixed) / denominator)
}

/* -------------------------------------------------------------------------- */
/* Faixas de risco de alteracao de preco (secao 18)                            */
/* -------------------------------------------------------------------------- */

export type PriceRiskLevel = 'AUTO' | 'REVIEW' | 'APPROVAL' | 'DOUBLE_CONFIRM'

export type PriceChangeAssessment = {
  currentPrice: number
  newPrice: number
  /** Variacao em % (positiva = aumento). */
  changePercent: number
  absoluteChange: number
  riskLevel: PriceRiskLevel
  /** Se a faixa exige aprovacao humana. */
  requiresApproval: boolean
  /** Se exige dupla confirmacao (secao 18). */
  requiresDoubleConfirmation: boolean
}

export type PriceThresholds = {
  autoMaxPercent: number
  reviewMaxPercent: number
  approvalMaxPercent: number
}

/**
 * Classifica a alteracao nas faixas da secao 18. Os limites vem de
 * integration_settings -- nenhum numero desses esta escrito aqui.
 *
 *   |var| <= auto      -> AUTO             (pode ser automatica no futuro)
 *   |var| <= review    -> REVIEW           (aprovacao recomendada)
 *   |var| <= approval  -> APPROVAL         (aprovacao obrigatoria)
 *   acima              -> DOUBLE_CONFIRM   (dupla confirmacao)
 *
 * A comparacao usa valor ABSOLUTO: baixar 20% o preco e tao grave quanto subir
 * 20%, e um sinal trocado num calculo nao pode virar alteracao livre.
 */
export function assessPriceChange(
  currentPrice: number,
  newPrice: number,
  thresholds: PriceThresholds,
): PriceChangeAssessment {
  // Preco atual zero nao tem variacao percentual definida; tratar como o caso
  // mais grave e a leitura segura.
  const changePercent =
    currentPrice > 0 ? round2(((newPrice - currentPrice) / currentPrice) * 100) : 100

  const magnitude = Math.abs(changePercent)

  const riskLevel: PriceRiskLevel =
    magnitude <= thresholds.autoMaxPercent
      ? 'AUTO'
      : magnitude <= thresholds.reviewMaxPercent
        ? 'REVIEW'
        : magnitude <= thresholds.approvalMaxPercent
          ? 'APPROVAL'
          : 'DOUBLE_CONFIRM'

  return {
    currentPrice: round2(currentPrice),
    newPrice: round2(newPrice),
    changePercent,
    absoluteChange: round2(newPrice - currentPrice),
    riskLevel,
    requiresApproval: riskLevel !== 'AUTO',
    requiresDoubleConfirmation: riskLevel === 'DOUBLE_CONFIRM',
  }
}

/**
 * Texto da alteracao proposta, no formato da secao 16.
 * A interface renderiza isso ao lado do botao APROVAR ALTERAÇÃO.
 */
export function describePriceChange(assessment: PriceChangeAssessment, reason: string): {
  before: number
  after: number
  reason: string
  impactPercent: number
} {
  return {
    before: assessment.currentPrice,
    after: assessment.newPrice,
    reason,
    impactPercent: assessment.changePercent,
  }
}
