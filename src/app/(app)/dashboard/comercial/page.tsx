import Link from 'next/link'
import { Receipt, ShoppingBag, ShoppingCart, TrendingUp } from 'lucide-react'

import { ChartCard, ChartEmpty } from '@/components/ChartCard'
import { RankedBarChart } from '@/components/Charts'
import { GlobalFilterBar } from '@/components/GlobalFilterBar'
import { MetricCard } from '@/components/MetricCard'
import { PageHeader } from '@/components/PageHeader'
import { RouteTabs } from '@/components/RouteTabs'
import { getChannels, getOrders, getProducts, getProductStats } from '@/lib/data'
import { salesByChannel, summarizeOrders } from '@/lib/finance'
import { describePeriod, parseFilters, type SearchParams } from '@/lib/filters'
import { formatCurrency, formatNumber, formatPercent, num } from '@/lib/format'

export const dynamic = 'force-dynamic'

export default async function DashboardComercialPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>
}) {
  const params = await searchParams
  const filters = parseFilters(params)

  const [channelOptions, productOptions, orders, products] = await Promise.all([
    getChannels(),
    getProducts(),
    getOrders(filters),
    getProductStats(),
  ])

  const sales = summarizeOrders(orders)
  const channels = salesByChannel(orders)

  const saleProducts = products.filter((p) => p.item_kind !== 'INSUMO')
  const packagingProducts = products.filter((p) => p.item_kind === 'INSUMO')

  const sold = saleProducts.filter((product) => num(product.qty_sold) > 0)
  const topSold = [...sold].sort((a, b) => num(b.qty_sold) - num(a.qty_sold)).slice(0, 6)
  const topRevenue = [...sold]
    .sort((a, b) => num(b.revenue_amount) - num(a.revenue_amount))
    .slice(0, 5)
  const topMargin = [...sold]
    .sort((a, b) => num(b.net_margin_amount ?? b.margin_amount) - num(a.net_margin_amount ?? a.margin_amount))
    .slice(0, 5)
  const worstMargin = [...sold]
    .filter((product) => num(product.net_margin_amount ?? product.margin_amount) < 0)
    .sort((a, b) => num(a.net_margin_amount ?? a.margin_amount) - num(b.net_margin_amount ?? b.margin_amount))
    .slice(0, 5)

  const totalBagsSpend = packagingProducts.reduce(
    (sum, bag) => sum + num(bag.packaging_linked_cost_total),
    0,
  )
  const totalBagsConsumed = packagingProducts.reduce(
    (sum, bag) => sum + num(bag.packaging_qty_consumed ?? bag.qty_sold),
    0,
  )

  const periodLabel = describePeriod(filters)

  return (
    <>
      <PageHeader
        title="Dashboard Comercial & Produtos"
        description="Faturamento por canal, giro de SKUs, gasto de sacolas e ranking de margem por produto."
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
        fields={['period', 'canal', 'produto']}
        options={{ channels: channelOptions, products: productOptions }}
      />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        <MetricCard
          title="Faturamento"
          value={formatCurrency(sales.revenue)}
          hint={periodLabel}
          tone="positive"
          icon={TrendingUp}
          href="/vendas"
        />
        <MetricCard
          title="Pedidos"
          value={formatNumber(sales.ordersCount)}
          hint={periodLabel}
          icon={ShoppingCart}
          href="/vendas"
        />
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
        <MetricCard
          title="Gasto em sacolas"
          value={formatCurrency(totalBagsSpend)}
          hint={`${formatNumber(totalBagsConsumed)} sacola(s) descontadas`}
          tone={totalBagsSpend > 0 ? 'warning' : 'neutral'}
          icon={ShoppingBag}
          href="/sacolas"
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
          products={topRevenue}
          pick={(product) => formatCurrency(product.revenue_amount)}
        />
        <ProductRanking
          title="Maior margem líquida"
          products={topMargin}
          pick={(product) =>
            `${formatCurrency(product.net_margin_amount ?? product.margin_amount)} · ${formatPercent(product.net_margin_percent ?? product.margin_percent)}`
          }
          tone="positive"
        />
        <ProductRanking
          title="Maior prejuízo"
          products={worstMargin}
          pick={(product) => formatCurrency(product.net_margin_amount ?? product.margin_amount)}
          tone="negative"
          emptyMessage="Nenhum produto com margem negativa."
        />
      </div>
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
