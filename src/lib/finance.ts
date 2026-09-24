import { num, round2 } from '@/lib/format'
import type { OrderRow, TransactionRow } from '@/lib/types'

/**
 * NUCLEO DE CALCULO DO CONTROL CENTER
 *
 * Regras que nao podem ser quebradas:
 *  - APORTE entra no caixa e NAO entra em receita nem em resultado (secao 11).
 *  - ESTORNO entra no caixa e ABATE a despesa do centro de custo.
 *  - Lancamento CANCELADO nao entra em conta nenhuma.
 *  - Investimento nao e despesa operacional: ele so aparece no acumulado e no
 *    break-even (secao 32).
 */

export type FinancialSummary = {
  /** Receita operacional -- somente ENTRADA. */
  revenue: number
  /** Despesa operacional -- SAIDA menos ESTORNO. */
  expense: number
  /** SAIDA bruta, sem abater estorno (usada no "quanto saiu do caixa"). */
  grossOutflow: number
  /** Estornos recebidos de volta. */
  refunds: number
  /** Aportes de socio -- caixa sim, resultado nao. */
  contributions: number
  /** Receita - despesa. Nao inclui aporte nem investimento. */
  operatingResult: number
  /** Impacto liquido dos lancamentos no caixa (inclui aporte). */
  cashFlow: number
  count: number
}

export const EMPTY_SUMMARY: FinancialSummary = {
  revenue: 0,
  expense: 0,
  grossOutflow: 0,
  refunds: 0,
  contributions: 0,
  operatingResult: 0,
  cashFlow: 0,
  count: 0,
}

/**
 * Resumo separado por status: PAGO, PENDENTE e o total combinado.
 *
 * - `paid`: so lancamentos com status PAGO — e o que realmente movimentou caixa.
 * - `pending`: so lancamentos com status PENDENTE — compromissos assumidos mas
 *   ainda nao pagos (ex: fornecedor deu prazo).
 * - `combined`: PAGO + PENDENTE juntos — visao projetada do resultado.
 *
 * Lancamentos CANCELADO nunca entram em nenhuma das tres.
 */
export type FinancialSnapshot = {
  paid: FinancialSummary
  pending: FinancialSummary
  combined: FinancialSummary
}

function buildSummary(rows: TransactionRow[]): FinancialSummary {
  const summary = { ...EMPTY_SUMMARY }

  for (const row of rows) {
    summary.revenue += num(row.operational_revenue)
    summary.expense += num(row.operational_expense)
    summary.contributions += num(row.contribution_amount)
    summary.cashFlow += num(row.signed_amount)
    if (row.type === 'SAIDA') summary.grossOutflow += num(row.amount)
    if (row.type === 'ESTORNO') summary.refunds += num(row.amount)
    summary.count += 1
  }

  summary.revenue = round2(summary.revenue)
  summary.expense = round2(summary.expense)
  summary.grossOutflow = round2(summary.grossOutflow)
  summary.refunds = round2(summary.refunds)
  summary.contributions = round2(summary.contributions)
  summary.cashFlow = round2(summary.cashFlow)
  summary.operatingResult = round2(summary.revenue - summary.expense)

  return summary
}

/**
 * Versao original que inclui PAGO + PENDENTE (exclui CANCELADO).
 * Mantida para retrocompatibilidade com o acumulado do break-even e series.
 */
export function summarizeTransactions(rows: TransactionRow[]): FinancialSummary {
  return buildSummary(rows.filter((r) => r.status !== 'CANCELADO'))
}

/**
 * Versao completa que separa PAGO de PENDENTE.
 * Usada no dashboard para mostrar compromissos futuros.
 */
export function summarizeByStatus(rows: TransactionRow[]): FinancialSnapshot {
  const paid = buildSummary(rows.filter((r) => r.status === 'PAGO'))
  const pending = buildSummary(rows.filter((r) => r.status === 'PENDENTE'))
  const combined = buildSummary(rows.filter((r) => r.status !== 'CANCELADO'))
  return { paid, pending, combined }
}

/**
 * Caixa disponivel.
 *
 * `initialBalance` e o saldo com que a operacao comecou. `investmentsPaid` sai
 * do caixa porque investimento e dinheiro efetivamente desembolsado.
 * `settings.initial_investment` NAO entra aqui: ele representa dinheiro gasto
 * antes do sistema existir, ja refletido no saldo inicial -- serve apenas para
 * o break-even.
 */
export function computeCash(params: {
  initialBalance: number
  transactionCashFlow: number
  investmentsPaid: number
}): number {
  return round2(params.initialBalance + params.transactionCashFlow - params.investmentsPaid)
}

export type BreakEvenState = 'SEM_INVESTIMENTO' | 'EM_RECUPERACAO' | 'BREAK_EVEN' | 'LUCRATIVO'

export type BreakEvenStatus = {
  /** Investimento total a recuperar (tabela investments + baseline das settings). */
  investmentTotal: number
  /** Lucro operacional acumulado: receitas - despesas, sem aporte. */
  accumulatedProfit: number
  /** Resultado acumulado (secao 32) = lucro acumulado - investimento. */
  accumulatedResult: number
  /** Quanto do investimento ja voltou. Nunca passa do investimento total. */
  recovered: number
  /** Quanto ainda falta para zerar. */
  remaining: number
  /** 0 a 100. E PERCENTUAL, nunca dinheiro. */
  percent: number
  /** Posicao na escala 0..50. 50 e apenas a escala, nao reais (secao 31). */
  scale: number
  state: BreakEvenState
  /** Lucro acumulado depois de pagar todo o investimento. */
  profitAfterBreakEven: number
}

export const BREAK_EVEN_SCALE = 50

/**
 * Progresso 0/50 (secoes 31, 32 e 33).
 *
 * O "50" e a escala do indicador e nada mais. Nunca traduza 20/50 como
 * "R$ 20.000 de R$ 50.000" -- os reais vivem em `recovered` / `remaining`.
 */
export function computeBreakEven(params: {
  accumulatedRevenue: number
  accumulatedExpense: number
  investmentTotal: number
}): BreakEvenStatus {
  const investmentTotal = round2(Math.max(params.investmentTotal, 0))
  const accumulatedProfit = round2(params.accumulatedRevenue - params.accumulatedExpense)
  const accumulatedResult = round2(accumulatedProfit - investmentTotal)

  if (investmentTotal <= 0) {
    // Sem investimento cadastrado nao existe o que recuperar: o indicador nao
    // tem escala e mostrar "50/50" seria mentira.
    return {
      investmentTotal: 0,
      accumulatedProfit,
      accumulatedResult,
      recovered: 0,
      remaining: 0,
      percent: 0,
      scale: 0,
      state: 'SEM_INVESTIMENTO',
      profitAfterBreakEven: Math.max(accumulatedResult, 0),
    }
  }

  const recovered = round2(Math.min(Math.max(accumulatedProfit, 0), investmentTotal))
  const remaining = round2(Math.max(investmentTotal - accumulatedProfit, 0))
  const rawPercent = (Math.max(accumulatedProfit, 0) / investmentTotal) * 100
  const percent = Math.min(round2(rawPercent), 100)

  const reached = accumulatedResult >= 0
  const scale = reached
    ? BREAK_EVEN_SCALE
    : Math.min(BREAK_EVEN_SCALE - 1, Math.floor((percent / 100) * BREAK_EVEN_SCALE))

  let state: BreakEvenState = 'EM_RECUPERACAO'
  if (accumulatedResult > 0) state = 'LUCRATIVO'
  else if (accumulatedResult === 0) state = 'BREAK_EVEN'

  return {
    investmentTotal,
    accumulatedProfit,
    accumulatedResult,
    recovered,
    remaining,
    percent,
    scale,
    state,
    profitAfterBreakEven: Math.max(accumulatedResult, 0),
  }
}

/* -------------------------------------------------------------------------- */
/* Series temporais                                                            */
/* -------------------------------------------------------------------------- */

export type MonthlyPoint = {
  month: string
  label: string
  revenue: number
  expense: number
  result: number
  cumulativeProfit: number
  /** Resultado acumulado ja descontando o investimento total. */
  cumulativeResult: number
  /** Posicao no indicador 0/50 naquele mes. */
  scale: number
}

const MONTH_LABELS = [
  'jan', 'fev', 'mar', 'abr', 'mai', 'jun',
  'jul', 'ago', 'set', 'out', 'nov', 'dez',
]

function monthLabel(month: string): string {
  const [year, monthPart] = month.split('-')
  const index = Number(monthPart) - 1
  if (!MONTH_LABELS[index]) return month
  return `${MONTH_LABELS[index]}/${year.slice(2)}`
}

/**
 * Serie mensal de receita x despesa com o acumulado e a evolucao do 0/50.
 * `investmentTotal` entra como divida inicial: o acumulado comeca negativo e
 * sobe conforme a operacao gera lucro.
 */
export function buildMonthlySeries(
  rows: TransactionRow[],
  investmentTotal = 0,
): MonthlyPoint[] {
  const buckets = new Map<string, { revenue: number; expense: number }>()

  for (const row of rows) {
    if (row.status === 'CANCELADO') continue
    const month = row.transaction_date.slice(0, 7)
    const bucket = buckets.get(month) ?? { revenue: 0, expense: 0 }
    bucket.revenue += num(row.operational_revenue)
    bucket.expense += num(row.operational_expense)
    buckets.set(month, bucket)
  }

  const months = [...buckets.keys()].sort()
  let cumulativeProfit = 0

  return months.map((month) => {
    const bucket = buckets.get(month)!
    const revenue = round2(bucket.revenue)
    const expense = round2(bucket.expense)
    cumulativeProfit = round2(cumulativeProfit + revenue - expense)
    const cumulativeResult = round2(cumulativeProfit - investmentTotal)
    const scale =
      investmentTotal > 0
        ? cumulativeResult >= 0
          ? BREAK_EVEN_SCALE
          : Math.min(
              BREAK_EVEN_SCALE - 1,
              Math.floor(
                (Math.min(Math.max(cumulativeProfit, 0) / investmentTotal, 1)) * BREAK_EVEN_SCALE,
              ),
            )
        : 0

    return {
      month,
      label: monthLabel(month),
      revenue,
      expense,
      result: round2(revenue - expense),
      cumulativeProfit,
      cumulativeResult,
      scale,
    }
  })
}

/* -------------------------------------------------------------------------- */
/* Agrupamentos                                                                */
/* -------------------------------------------------------------------------- */

export type GroupTotal = {
  id: string | null
  name: string
  total: number
  count: number
}

function groupTotals(
  rows: TransactionRow[],
  getId: (row: TransactionRow) => string | null,
  getName: (row: TransactionRow) => string,
  getAmount: (row: TransactionRow) => number,
): GroupTotal[] {
  const map = new Map<string, GroupTotal>()

  for (const row of rows) {
    if (row.status === 'CANCELADO') continue
    const amount = getAmount(row)
    if (amount === 0) continue

    const id = getId(row)
    const key = id ?? '__sem__'
    const entry = map.get(key) ?? { id, name: getName(row), total: 0, count: 0 }
    entry.total += amount
    entry.count += 1
    map.set(key, entry)
  }

  return [...map.values()]
    .map((entry) => ({ ...entry, total: round2(entry.total) }))
    .filter((entry) => entry.total !== 0)
    .sort((a, b) => b.total - a.total)
}

/** Gastos por categoria -- "o que e esse gasto?" (secao 27). */
export function expensesByCategory(rows: TransactionRow[]): GroupTotal[] {
  return groupTotals(
    rows,
    (row) => row.category_id,
    (row) => row.category_name ?? 'Sem categoria',
    (row) => num(row.operational_expense),
  )
}

/** Gastos agrupados pelo centro RAIZ -- "qual area consumiu?" (secao 26). */
export function expensesByRootCostCenter(rows: TransactionRow[]): GroupTotal[] {
  return groupTotals(
    rows,
    (row) => row.cost_center_root_id,
    (row) => row.cost_center_root_name ?? 'Sem centro de custo',
    (row) => num(row.operational_expense),
  )
}

export function expensesBySupplier(rows: TransactionRow[]): GroupTotal[] {
  return groupTotals(
    rows,
    (row) => row.supplier_id,
    (row) => row.supplier_name ?? 'Sem fornecedor',
    (row) => num(row.operational_expense),
  )
}

/* -------------------------------------------------------------------------- */
/* Comercial                                                                   */
/* -------------------------------------------------------------------------- */

export type SalesSummary = {
  revenue: number
  ordersCount: number
  itemsCount: number
  averageTicket: number
  cogs: number
  extraCosts: number
  contributionMargin: number
  commercialResult: number
  marginPercent: number
}

export const EMPTY_SALES: SalesSummary = {
  revenue: 0,
  ordersCount: 0,
  itemsCount: 0,
  averageTicket: 0,
  cogs: 0,
  extraCosts: 0,
  contributionMargin: 0,
  commercialResult: 0,
  marginPercent: 0,
}

/**
 * Resumo comercial (secao 15). Pedido cancelado nao conta.
 *
 * `contributionMargin` = receita - CMV.
 * `commercialResult`   = receita - CMV - taxas - imposto - frete - embalagem
 *                        - marketing - outros (secao 19).
 */
export function summarizeOrders(orders: OrderRow[]): SalesSummary {
  const summary = { ...EMPTY_SALES }

  for (const order of orders) {
    if (order.status === 'CANCELADO') continue
    summary.revenue += num(order.total_amount)
    summary.cogs += num(order.cogs_amount)
    summary.extraCosts += num(order.extra_costs)
    summary.itemsCount += num(order.items_quantity)
    summary.ordersCount += 1
  }

  summary.revenue = round2(summary.revenue)
  summary.cogs = round2(summary.cogs)
  summary.extraCosts = round2(summary.extraCosts)
  summary.contributionMargin = round2(summary.revenue - summary.cogs)
  summary.commercialResult = round2(summary.revenue - summary.cogs - summary.extraCosts)
  summary.averageTicket =
    summary.ordersCount > 0 ? round2(summary.revenue / summary.ordersCount) : 0
  summary.marginPercent =
    summary.revenue > 0 ? round2((summary.commercialResult / summary.revenue) * 100) : 0

  return summary
}

export type ChannelSales = {
  id: string | null
  name: string
  revenue: number
  orders: number
  result: number
}

export function salesByChannel(orders: OrderRow[]): ChannelSales[] {
  const map = new Map<string, ChannelSales>()

  for (const order of orders) {
    if (order.status === 'CANCELADO') continue
    const key = order.channel_id ?? '__sem__'
    const entry =
      map.get(key) ??
      { id: order.channel_id, name: order.channel_name ?? 'Sem canal', revenue: 0, orders: 0, result: 0 }
    entry.revenue += num(order.total_amount)
    entry.result += num(order.result_amount)
    entry.orders += 1
    map.set(key, entry)
  }

  return [...map.values()]
    .map((entry) => ({ ...entry, revenue: round2(entry.revenue), result: round2(entry.result) }))
    .sort((a, b) => b.revenue - a.revenue)
}

/** Faixa de cor do resultado do pedido (secao 19). */
export function resultTone(result: number, revenue: number): 'positive' | 'warning' | 'negative' {
  if (result < 0) return 'negative'
  if (revenue > 0 && result / revenue < 0.05) return 'warning'
  if (revenue === 0 && result === 0) return 'warning'
  return 'positive'
}
