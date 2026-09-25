import Link from 'next/link'
import {
  ArrowDownRight,
  ArrowUpRight,
  Clock,
  Landmark,
  PiggyBank,
  Receipt,
  ShoppingCart,
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
import {
  getAllTransactionsForAccumulated,
  getCostCenterReport,
  getInvestments,
  getOrders,
  getProductStats,
  getReferenceData,
  getSettings,
  getTransactions,
  subtreeIds,
} from '@/lib/data'
import {
  buildMonthlySeries,
  computeBreakEven,
  computeCash,
  expensesByCategory,
  salesByChannel,
  summarizeByStatus,
  summarizeOrders,
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

  const reference = await getReferenceData()

  const costCenterIds = filters.costCenterId
    ? subtreeIds(reference.costCenters, filters.costCenterId)
    : null

  const [periodRows, allRows, settings, investments, costCenterReport, orders, products] =
    await Promise.all([
      getTransactions(filters, { costCenterIds }),
      getAllTransactionsForAccumulated(),
      getSettings(),
      getInvestments(),
      getCostCenterReport(filters),
      getOrders(filters),
      getProductStats(),
    ])

  /* ---------------- Financeiro ---------------- */

  const snapshot = summarizeByStatus(periodRows)
  // `period` = apenas PAGO — é o que realmente entrou/saiu do caixa no período.
  // Pendentes ficam só na seção "Compromissos pendentes".
  const period = snapshot.paid
  // Acumulado de TODA a vida separado por status: caixa usa só PAGO.
  const lifetimeSnapshot = summarizeByStatus(allRows)
  const lifetimePaid = lifetimeSnapshot.paid
  const lifetime = lifetimeSnapshot.combined

  const investmentsPaid = investments
    .filter((item) => item.status === 'PAGO')
    .reduce((sum, item) => sum + num(item.amount), 0)

  // O baseline das settings cobre o que foi investido antes do sistema existir.
  const investmentTotal = investmentsPaid + num(settings?.initial_investment)

  const cash = computeCash({
    initialBalance: num(settings?.initial_balance),
    // Caixa = só PAGO. Pendente pode ser cancelado e nunca movimentou o caixa.
    transactionCashFlow: lifetimePaid.cashFlow,
    investmentsPaid,
  })

  const breakEven = computeBreakEven({
    // Break-even usa só PAGO: pendente não é lucro até ser confirmado.
    accumulatedRevenue: lifetimePaid.revenue,
    accumulatedExpense: lifetimePaid.expense,
    investmentTotal,
  })

  const series = buildMonthlySeries(allRows, investmentTotal)

  /* ---------------- Para onde o dinheiro vai ---------------- */

  const byRootCostCenter = costCenterReport
    .filter((row) => row.depth === 1 && num(row.rollup_total) > 0)
    .sort((a, b) => num(b.rollup_total) - num(a.rollup_total))

  const byCategory = expensesByCategory(periodRows)

  /* ---------------- Comercial ---------------- */

  const sales = summarizeOrders(orders)
  const channels = salesByChannel(orders)

  const sold = products.filter((product) => num(product.qty_sold) > 0)
  const topSold = [...sold].sort((a, b) => num(b.qty_sold) - num(a.qty_sold)).slice(0, 6)
  const topRevenue = [...sold]
    .sort((a, b) => num(b.revenue_amount) - num(a.revenue_amount))
    .slice(0, 6)
  const topMargin = [...sold]
    .sort((a, b) => num(b.margin_amount) - num(a.margin_amount))
    .slice(0, 5)
  const worstMargin = [...sold]
    .filter((product) => num(product.margin_amount) < 0)
    .sort((a, b) => num(a.margin_amount) - num(b.margin_amount))
    .slice(0, 5)

  const periodLabel = describePeriod(filters)
  const noInvestment = breakEven.state === 'SEM_INVESTIMENTO'

  return (
    <>
      <PageHeader
        title="Dashboard"
        description="Quanto entrou, quanto saiu e para onde o dinheiro está indo."
      />

      <GlobalFilterBar
        fields={['period', 'centro', 'canal', 'produto', 'fornecedor']}
        options={reference}
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
        {/* Sem investimento cadastrado nao existe break-even a atingir:
            dizer "atingido" aqui contradiria o painel logo abaixo. */}
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

      {/* ---------- Secao 26 ---------- */}
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

        {/* Secao 27: categoria e outra pergunta -- "o que e esse gasto?" */}
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

      {/* ---------- Secao 28: dashboard comercial ---------- */}
      <section className="space-y-3">
        <div className="flex items-baseline justify-between">
          <h2 className="text-sm font-semibold">Comercial</h2>
          <Link
            href="/vendas"
            className="text-xs text-muted-foreground hover:text-foreground hover:underline"
          >
            Ver vendas
          </Link>
        </div>

        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <MetricCard
            title="Faturamento"
            value={formatCurrency(sales.revenue)}
            hint={periodLabel}
            tone="positive"
            icon={TrendingUp}
          />
          <MetricCard title="Pedidos" value={formatNumber(sales.ordersCount)} icon={ShoppingCart} />
          <MetricCard
            title="Ticket médio"
            value={formatCurrency(sales.averageTicket)}
            icon={Receipt}
          />
          <MetricCard
            title="Resultado comercial"
            value={formatCurrency(sales.commercialResult)}
            hint={`Margem de ${formatPercent(sales.marginPercent)}`}
            tone={sales.commercialResult >= 0 ? 'positive' : 'negative'}
          />
        </div>

        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <ChartCard
            title="Vendas por canal"
            table={{
              columns: ['Canal', 'Faturamento', 'Pedidos'],
              rows: channels.map((entry) => [
                entry.name,
                formatCurrency(entry.revenue),
                formatNumber(entry.orders),
              ]),
            }}
          >
            {channels.length === 0 ? (
              <ChartEmpty message="Nenhum pedido no período." />
            ) : (
              <RankedBarChart
                data={channels.map((entry) => ({
                  id: entry.id,
                  name: entry.name,
                  total: entry.revenue,
                }))}
              />
            )}
          </ChartCard>

          <ChartCard
            title="Produtos mais vendidos"
            description="Por quantidade de unidades."
            table={{
              columns: ['Produto', 'Unidades', 'Receita'],
              rows: topSold.map((product) => [
                product.name,
                formatNumber(product.qty_sold),
                formatCurrency(product.revenue_amount),
              ]),
            }}
          >
            {topSold.length === 0 ? (
              <ChartEmpty message="Nenhuma venda registrada." />
            ) : (
              <RankedBarChart
                data={topSold.map((product) => ({
                  id: product.product_id,
                  name: product.name,
                  total: num(product.qty_sold),
                }))}
                accent="series-2"
                valueFormatter={(value) => formatNumber(value)}
              />
            )}
          </ChartCard>
        </div>

        <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
          <ProductRanking
            title="Maior receita"
            products={topRevenue.slice(0, 5)}
            pick={(product) => formatCurrency(product.revenue_amount)}
          />
          <ProductRanking
            title="Maior margem"
            products={topMargin}
            pick={(product) =>
              `${formatCurrency(product.margin_amount)} · ${formatPercent(product.margin_percent)}`
            }
            tone="positive"
          />
          <ProductRanking
            title="Maior prejuízo"
            products={worstMargin}
            pick={(product) => formatCurrency(product.margin_amount)}
            tone="negative"
            emptyMessage="Nenhum produto com margem negativa."
          />
        </div>
      </section>
    </>
  )
}

function ProductRanking<T extends { product_id: string; name: string }>({
  title,
  products,
  pick,
  tone = 'neutral',
  emptyMessage = 'Nenhuma venda registrada.',
}: {
  title: string
  products: T[]
  pick: (product: T) => string
  tone?: 'positive' | 'negative' | 'neutral'
  emptyMessage?: string
}) {
  return (
    <section className="rounded-xl border bg-card p-4">
      <h3 className="mb-2 text-sm font-semibold">{title}</h3>
      {products.length === 0 ? (
        <p className="py-4 text-sm text-muted-foreground">{emptyMessage}</p>
      ) : (
        <ol className="space-y-1.5">
          {products.map((product, index) => (
            <li key={product.product_id} className="flex items-center gap-2 text-sm">
              <span className="w-4 shrink-0 text-xs text-muted-foreground tabular-nums">
                {index + 1}
              </span>
              <Link
                href={`/produtos/${product.product_id}`}
                className="min-w-0 flex-1 truncate hover:underline"
              >
                {product.name}
              </Link>
              <span
                className={
                  tone === 'positive'
                    ? 'shrink-0 text-emerald-600 tabular-nums dark:text-emerald-400'
                    : tone === 'negative'
                      ? 'shrink-0 text-rose-600 tabular-nums dark:text-rose-400'
                      : 'shrink-0 tabular-nums'
                }
              >
                {pick(product)}
              </span>
            </li>
          ))}
        </ol>
      )}
    </section>
  )
}
