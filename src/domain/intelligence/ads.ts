import { round2 } from '@/lib/format'
import type { AdsSpend } from '@/domain/intelligence/types'

/**
 * ANUNCIOS (secoes 24 e 27)
 *
 * Duas contas que mudam decisao de midia:
 *
 * 1. ROAS de break-even -- abaixo dele o anuncio vende com prejuizo.
 * 2. Teto de investimento -- quanto cabe em anuncio sem furar a margem meta.
 */

/**
 * break_even_ROAS = 100 / margem_liquida_%
 *
 * Com 25% de margem liquida, cada real de anuncio precisa gerar R$ 4,00 de
 * receita (100/25) para empatar. Acima disso ha lucro; abaixo, prejuizo.
 *
 * Null quando a margem e <= 0: produto que perde dinheiro sem anuncio nao tem
 * ROAS que o salve, e qualquer numero devolvido aqui seria enganoso.
 */
export function calculateBreakEvenROAS(netMarginPercent: number): number | null {
  if (netMarginPercent <= 0) return null
  return round2(100 / netMarginPercent)
}

/**
 * Teto de investimento em anuncio para o periodo (secao 24).
 *
 * A margem liquida gerada pela receita e o orcamento total disponivel; a margem
 * meta e o que deve sobrar depois do anuncio. A diferenca e o teto.
 *
 * Zero quando a margem atual ja esta abaixo da meta -- nesse caso nao existe
 * espaco para anuncio, e o auditor trata como problema de margem, nao de midia.
 */
export function calculateMaximumAdSpend(params: {
  revenue: number
  netMarginPercent: number
  targetMarginPercent: number
}): number {
  const available = params.netMarginPercent - params.targetMarginPercent
  if (available <= 0) return 0
  return round2((params.revenue * available) / 100)
}

export type AdsPerformance = {
  spend: number
  attributedRevenue: number
  /** receita atribuida / investimento. Null quando nao houve investimento. */
  roas: number | null
  breakEvenRoas: number | null
  /** Verdadeiro quando o ROAS esta abaixo do break-even -- anuncio no prejuizo. */
  belowBreakEven: boolean
  /** Lucro (ou perda) liquido gerado pela midia no periodo. */
  netResult: number
  dailySpend: number
}

/**
 * Desempenho da midia.
 *
 * `netResult` = margem liquida gerada pela receita atribuida - investimento.
 * E o numero que responde "o anuncio pagou a si mesmo?".
 */
export function evaluateAds(params: {
  ads: AdsSpend
  netMarginPercent: number
}): AdsPerformance {
  const { ads } = params
  const breakEvenRoas = calculateBreakEvenROAS(params.netMarginPercent)
  const roas = ads.spend > 0 ? round2(ads.attributedRevenue / ads.spend) : null

  const marginGenerated = round2((ads.attributedRevenue * params.netMarginPercent) / 100)

  return {
    spend: round2(ads.spend),
    attributedRevenue: round2(ads.attributedRevenue),
    roas,
    breakEvenRoas,
    belowBreakEven: roas !== null && breakEvenRoas !== null && roas < breakEvenRoas,
    netResult: round2(marginGenerated - ads.spend),
    dailySpend: ads.days > 0 ? round2(ads.spend / ads.days) : 0,
  }
}
