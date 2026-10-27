import Link from 'next/link'
import {
  ArrowDownRight,
  ArrowUpRight,
  Clock,
  Landmark,
  PiggyBank,
  Target,
  TrendingUp,
  Wallet,
} from 'lucide-react'

import { ChartCard, ChartEmpty } from '@/components/ChartCard'
import {
  AccumulatedResultChart,
  RankedBarChart,
  RevenueExpenseChart,
  Scale50Chart,
} from '@/components/Charts'
import { GlobalFilterBar } from '@/components/GlobalFilterBar'
import { MetricCard } from '@/components/MetricCard'
import { PageHeader } from '@/components/PageHeader'
import { Progress50 } from '@/components/Progress50'
import { RouteTabs } from '@/components/RouteTabs'
import {
  getAllTransactionsForAccumulated,
  getChannels,
  getCostCenterNodes,
  getCostCenterReport,
  getInvestments,
  getSettings,
  getSuppliers,
  getTransactions,
  subtreeIds,
} from '@/lib/data'
import {
  buildMonthlySeries,
  computeBreakEven,
  computeCash,
  expensesByCategory,
  summarizeByStatus,
} from '@/lib/finance'
import { describePeriod, parseFilters, type SearchParams } from '@/lib/filters'
import { formatCurrency, formatNumber, formatPercent, num } from '@/lib/format'

export const dynamic = 'force-dynamic'

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>
}) {
  const params = await searchParams
  const filters = parseFilters(params)

  const [
    costCenters,
    channels,
    suppliers,
    allRows,
    settings,
    investments,
    costCenterReport,
    directPeriodRows,
  ] = await Promise.all([
    getCostCenterNodes(),
    getChannels(),
    getSuppliers(),
    getAllTransactionsForAccumulated(),
    getSettings(),
    getInvestments(),
    getCostCenterReport(filters),
    filters.costCenterId ? Promise.resolve(null) : getTransactions(filters),
  ])

  const costCenterIds = filters.costCenterId
    ? subtreeIds(costCenters, filters.costCenterId)
    : null

  const periodRows = directPeriodRows ?? (await getTransactions(filters, { costCenterIds }))

  const snapshot = summarizeByStatus(periodRows)
  const period = snapshot.paid
  const lifetimeSnapshot = summarizeByStatus(allRows)
  const lifetimePaid = lifetimeSnapshot.paid

  const investmentsPaid = investments
    .filter((item) => item.status === 'PAGO')
    .reduce((sum, item) => sum + num(item.amount), 0)

  const investmentTotal = investmentsPaid + num(settings?.initial_investment)

  const cash = computeCash({
    initialBalance: num(settings?.initial_balance),
    transactionCashFlow: lifetimePaid.cashFlow,
    investmentsPaid,
  })

  const breakEven = computeBreakEven({
    accumulatedRevenue: lifetimePaid.revenue,
    accumulatedExpense: lifetimePaid.expense,
    investmentTotal,
  })

  const series = buildMonthlySeries(allRows, investmentTotal)

  const byRootCostCenter = costCenterReport
    .filter((row) => row.depth === 1 && num(row.rollup_total) > 0)
    .sort((a, b) => num(b.rollup_total) - num(a.rollup_total))

  const byCategory = expensesByCategory(periodRows)

  const periodLabel = describePeriod(filters)
  const noInvestment = breakEven.state === 'SEM_INVESTIMENTO'

  return (
    <>
      <PageHeader
        title="Dashboard Financeiro & Caixa"
        description="Quanto entrou, quanto saiu, progresso do break-even (0/50) e para onde o dinheiro está indo."
      />

      <RouteTabs
        items={[
          { href: '/dashboard', label: 'Financeiro & Caixa (0/50)', preserveQuery: true },
          {
            href: '/dashboard/comercial',
            label: 'Comercial, Canais & Rankings',
            preserveQuery: true,
          },
        ]}
      />

      <GlobalFilterBar
        fields={['period', 'centro', 'canal', 'fornecedor']}
        options={{ costCenters, channels, suppliers }}
      />

      {/* ---------- Linha 1: o período filtrado ---------- */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <MetricCard
          title="Receita"
          value={formatCurrency(period.revenue)}
          hint={periodLabel}
          tone="positive"
          icon={ArrowUpRight}
          href="/lancamentos?tipo=ENTRADA"
        />
        <MetricCard
          title="Saídas"
          value={formatCurrency(period.expense)}
          hint={periodLabel}
          tone="negative"
          icon={ArrowDownRight}
          href="/lancamentos?tipo=SAIDA"
        />
        <MetricCard
          title="Resultado"
          value={formatCurrency(period.operatingResult)}
          hint="Receita menos despesa, sem aporte"
          tone={period.operatingResult >= 0 ? 'positive' : 'negative'}
          icon={TrendingUp}
        />
        <MetricCard
          title="Caixa"
          value={formatCurrency(cash)}
          hint="Saldo atual — inclui aportes, desconta investimentos"
          tone={cash >= 0 ? 'neutral' : 'negative'}
          icon={Wallet}
        />
      </div>

      {/* ---------- Pendentes: compromissos futuros ---------- */}
      {snapshot.pending.count > 0 && (
        <section className="space-y-2">
          <div className="flex items-baseline gap-2">
            <Clock size={14} className="text-amber-500" />
            <h2 className="text-sm font-semibold text-amber-700 dark:text-amber-400">
              Compromissos pendentes
            </h2>
            <span className="text-xs text-muted-foreground">
              — gastos futuros já comprometidos mas ainda não pagos
            </span>
          </div>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <MetricCard
              title="Receita pendente"
              value={formatCurrency(snapshot.pending.revenue)}
              hint="Entradas com status Pendente"
              tone="neutral"
              icon={Clock}
              href="/lancamentos?tipo=ENTRADA&status=PENDENTE"
            />
            <MetricCard
              title="Saídas pendentes"
              value={formatCurrency(snapshot.pending.expense)}
              hint="Ex: fornecedor deu prazo, conta a pagar"
              tone="warning"
              icon={Clock}
              href="/lancamentos?tipo=SAIDA&status=PENDENTE"
            />
            <MetricCard
              title="Resultado projetado"
              value={formatCurrency(snapshot.combined.operatingResult)}
              hint="Se tudo pendente fosse pago agora"
              tone={snapshot.combined.operatingResult >= 0 ? 'positive' : 'negative'}
              icon={TrendingUp}
            />
            <MetricCard
              title="Lançamentos pendentes"
              value={formatNumber(snapshot.pending.count)}
              hint="Total de itens com status Pendente"
              tone="warning"
              icon={Clock}
              href="/lancamentos?status=PENDENTE"
            />
          </div>
        </section>
      )}

      {/* ---------- Linha 2: números de vida inteira ---------- */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <MetricCard
          title="Investimento inicial"
          value={formatCurrency(breakEven.investmentTotal)}
          hint="Total a recuperar"
          icon={Landmark}
          href="/investimentos"
        />
        <MetricCard
          title="Resultado acumulado"
          value={formatCurrency(breakEven.accumulatedResult)}
          hint="Lucro acumulado menos investimento"
          tone={breakEven.accumulatedResult >= 0 ? 'positive' : 'negative'}
          icon={PiggyBank}
        />
        <MetricCard
          title="Falta para o break-even"
          value={noInvestment ? '--' : formatCurrency(breakEven.remaining)}
          hint={
            noInvestment
              ? 'Cadastre o investimento inicial'
              : breakEven.remaining === 0
                ? 'Break-even atingido'
                : 'Ainda a recuperar'
          }
          tone={noInvestment ? 'neutral' : breakEven.remaining === 0 ? 'positive' : 'warning'}
          icon={Target}
        />
        <MetricCard
          title="Progresso 0/50"
          value={noInvestment ? '--' : `${breakEven.scale} / 50`}
          hint={
            noInvestment
              ? 'O indicador precisa do investimento para ter escala'
              : `${formatPercent(breakEven.percent)} do caminho — 50 é a escala, não reais`
          }
          tone={noInvestment ? 'neutral' : 'accent'}
        />
      </div>

      <p className="-mt-2 text-xs text-muted-foreground">
        A segunda linha é acumulada desde o início da operação e não muda com o filtro de
        período.
      </p>

      <section className="rounded-xl border bg-card p-4">
        <Progress50 status={breakEven} />
      </section>

      {/* ---------- Para onde o dinheiro vai ---------- */}
      <section className="space-y-2">
        <div className="flex items-baseline justify-between">
          <h2 className="text-sm font-semibold">Para onde nosso dinheiro está indo?</h2>
          <Link
            href="/centros-de-custo"
            className="text-xs text-muted-foreground hover:text-foreground hover:underline"
          >
            Ver todos os centros
          </Link>
        </div>

        {byRootCostCenter.length === 0 ? (
          <p className="rounded-xl border border-dashed p-8 text-center text-sm text-muted-foreground">
            Nenhuma saída registrada no período.
          </p>
        ) : (
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            {byRootCostCenter.map((row) => (
              <MetricCard
                key={row.cost_center_id}
                title={row.cost_center_name}
                value={formatCurrency(row.rollup_total)}
                hint={`${formatNumber(row.rollup_count)} lançamento(s)`}
                tone="negative"
                href={`/centros-de-custo/${row.cost_center_id}`}
              />
            ))}
          </div>
        )}
      </section>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <ChartCard
          title="Gastos por centro de custo"
          description="Qual área da operação consumiu o recurso."
          table={{
            columns: ['Centro', 'Total'],
            rows: byRootCostCenter.map((row) => [
              row.cost_center_name,
              formatCurrency(row.rollup_total),
            ]),
          }}
        >
          {byRootCostCenter.length === 0 ? (
            <ChartEmpty message="Sem saídas no período." />
          ) : (
            <RankedBarChart
              data={byRootCostCenter.map((row) => ({
                id: row.cost_center_id,
                name: row.cost_center_name,
                total: num(row.rollup_total),
              }))}
            />
          )}
        </ChartCard>

        <ChartCard
          title="Gastos por categoria"
          description="O que foi comprado, independente da área que consumiu."
          table={{
            columns: ['Categoria', 'Total'],
            rows: byCategory.map((entry) => [entry.name, formatCurrency(entry.total)]),
          }}
        >
          {byCategory.length === 0 ? (
            <ChartEmpty message="Sem saídas no período." />
          ) : (
            <RankedBarChart data={byCategory.slice(0, 8)} accent="series-2" />
          )}
        </ChartCard>

        <ChartCard
          title="Receita × despesas por mês"
          description="Histórico completo da operação."
          table={{
            columns: ['Mês', 'Receita', 'Despesa', 'Resultado'],
            rows: series.map((point) => [
              point.label,
              formatCurrency(point.revenue),
              formatCurrency(point.expense),
              formatCurrency(point.result),
            ]),
          }}
        >
          {series.length === 0 ? (
            <ChartEmpty message="Nenhum lançamento registrado ainda." />
          ) : (
            <RevenueExpenseChart data={series} />
          )}
        </ChartCard>

        <ChartCard
          title="Resultado acumulado"
          description="Parte do investimento total e sobe conforme a operação gera lucro. Zero é o break-even."
          table={{
            columns: ['Mês', 'Lucro acumulado', 'Resultado acumulado'],
            rows: series.map((point) => [
              point.label,
              formatCurrency(point.cumulativeProfit),
              formatCurrency(point.cumulativeResult),
            ]),
          }}
        >
          {series.length === 0 ? (
            <ChartEmpty message="Nenhum lançamento registrado ainda." />
          ) : (
            <AccumulatedResultChart data={series} />
          )}
        </ChartCard>
      </div>

      <ChartCard
        title="Evolução do 0/50"
        description="Posição do indicador mês a mês. A escala vai de 0 a 50 e não representa dinheiro."
        table={{
          columns: ['Mês', 'Progresso', 'Resultado acumulado'],
          rows: series.map((point) => [
            point.label,
            `${point.scale} / 50`,
            formatCurrency(point.cumulativeResult),
          ]),
        }}
      >
        {series.length === 0 || investmentTotal <= 0 ? (
          <ChartEmpty message="Cadastre o investimento inicial para o indicador ganhar escala." />
        ) : (
          <Scale50Chart data={series} />
        )}
      </ChartCard>
    </>
  )
}
