import { round2 } from '@/lib/format'
import type { SaleEvent } from '@/domain/intelligence/types'

/**
 * VELOCIDADE DE VENDA (secao 25)
 *
 * daily_velocity = units_sold / period_days
 *
 * Tres janelas, nao uma: a media de 30 dias esconde o que esta acontecendo
 * agora. Um produto com 2/dia em 30 dias e 5/dia em 7 dias nao tem 15 dias de
 * estoque com 30 unidades -- tem 6. A janela curta e a que evita a ruptura.
 */

export type VelocitySnapshot = {
  /** Unidades por dia em cada janela. */
  short: number
  medium: number
  long: number
  /** Unidades vendidas em cada janela (numerador, util na explicacao). */
  unitsShort: number
  unitsMedium: number
  unitsLong: number
  /** Variacao da janela curta sobre a media, em %. Null quando nao ha base. */
  accelerationPercent: number | null
  /** Data da ultima venda. Null quando nunca vendeu. */
  lastSaleDate: string | null
  /** Dias desde a ultima venda. Null quando nunca vendeu. */
  daysSinceLastSale: number | null
}

/**
 * Soma as unidades vendidas nos ultimos `days` dias contados a partir de
 * `referenceDate` (inclusive).
 *
 * `referenceDate` e parametro obrigatorio de proposito: funcao que chama
 * `new Date()` por dentro nao e testavel nem reproduzivel.
 */
export function unitsSoldInWindow(
  sales: SaleEvent[],
  days: number,
  referenceDate: string,
): number {
  if (days <= 0) return 0

  const end = Date.parse(`${referenceDate}T00:00:00Z`)
  if (Number.isNaN(end)) return 0

  // Janela de 7 dias = hoje + os 6 anteriores. Por isso `days - 1`.
  const start = end - (days - 1) * 86_400_000

  let total = 0
  for (const sale of sales) {
    const when = Date.parse(`${sale.date.slice(0, 10)}T00:00:00Z`)
    if (Number.isNaN(when)) continue
    if (when >= start && when <= end) total += sale.quantity
  }
  return total
}

/** units_sold / period_days (secao 25). */
export function calculateDailyVelocity(unitsSold: number, periodDays: number): number {
  if (periodDays <= 0) return 0
  return round2(unitsSold / periodDays)
}

export function calculateVelocity(
  sales: SaleEvent[],
  windows: { short: number; medium: number; long: number },
  referenceDate: string,
): VelocitySnapshot {
  const unitsShort = unitsSoldInWindow(sales, windows.short, referenceDate)
  const unitsMedium = unitsSoldInWindow(sales, windows.medium, referenceDate)
  const unitsLong = unitsSoldInWindow(sales, windows.long, referenceDate)

  const short = calculateDailyVelocity(unitsShort, windows.short)
  const medium = calculateDailyVelocity(unitsMedium, windows.medium)
  const long = calculateDailyVelocity(unitsLong, windows.long)

  const lastSaleDate = findLastSaleDate(sales, referenceDate)

  return {
    short,
    medium,
    long,
    unitsShort,
    unitsMedium,
    unitsLong,
    accelerationPercent: calculateAcceleration(short, medium),
    lastSaleDate,
    daysSinceLastSale: lastSaleDate ? daysBetween(lastSaleDate, referenceDate) : null,
  }
}

/**
 * Quanto a janela curta esta acima (ou abaixo) da media.
 *
 * Null quando a media e zero: um produto que nao vendia e comecou a vender nao
 * "acelerou 500%", ele estreou. Dividir por zero ali produziria Infinity e o
 * alerta viraria numero sem sentido na tela.
 */
export function calculateAcceleration(shortVelocity: number, mediumVelocity: number): number | null {
  if (mediumVelocity <= 0) return null
  return round2(((shortVelocity - mediumVelocity) / mediumVelocity) * 100)
}

/**
 * Velocidade a usar para decidir reposicao.
 *
 * Usa a MAIOR entre curta e media. Assumir a media quando o giro acelerou e como
 * comprar para a demanda do mes passado -- o erro cai justamente do lado da
 * ruptura, que e o caro (secao 25).
 */
export function planningVelocity(velocity: VelocitySnapshot): number {
  return Math.max(velocity.short, velocity.medium)
}

function findLastSaleDate(sales: SaleEvent[], referenceDate: string): string | null {
  let latest: string | null = null
  for (const sale of sales) {
    if (sale.quantity <= 0) continue
    const date = sale.date.slice(0, 10)
    if (date > referenceDate) continue
    if (!latest || date > latest) latest = date
  }
  return latest
}

/** Diferenca em dias entre duas datas `YYYY-MM-DD`. */
export function daysBetween(from: string, to: string): number {
  const start = Date.parse(`${from.slice(0, 10)}T00:00:00Z`)
  const end = Date.parse(`${to.slice(0, 10)}T00:00:00Z`)
  if (Number.isNaN(start) || Number.isNaN(end)) return 0
  return Math.round((end - start) / 86_400_000)
}
