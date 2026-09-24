import Link from 'next/link'
import {
  Boxes,
  Coins,
  PackageMinus,
  Percent,
  Receipt,
  ShoppingCart,
  TrendingUp,
} from 'lucide-react'

import { GlobalFilterBar } from '@/components/GlobalFilterBar'
import { MetricCard } from '@/components/MetricCard'
import { EmptyState, PageHeader } from '@/components/PageHeader'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { getChannels, getOrderIdsByProduct, getOrders, getProducts } from '@/lib/data'
import { resultTone, summarizeOrders } from '@/lib/finance'
import { describePeriod, parseFilters, type SearchParams } from '@/lib/filters'
import { formatCurrency, formatDate, formatNumber, formatPercent, num } from '@/lib/format'
import { cn } from '@/lib/utils'

import { OrderForm } from './OrderForm'

export const dynamic = 'force-dynamic'

const STATUS_CLASS: Record<string, string> = {
  CONCLUIDO: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300',
  PENDENTE: 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300',
  CANCELADO: 'bg-muted text-muted-foreground line-through',
}

export default async function SalesPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>
}) {
  const params = await searchParams
  const filters = parseFilters(params)

  const [channels, products, allOrders] = await Promise.all([
    getChannels(),
    getProducts(),
    getOrders(filters),
  ])

  // Filtro por produto: restringe aos pedidos que contem aquele SKU.
  let orders = allOrders
  if (filters.productId) {
    const ids = new Set(await getOrderIdsByProduct(filters.productId))
    orders = orders.filter((order) => ids.has(order.id))
  }

  const summary = summarizeOrders(orders)
  const nextNumber = `PED-${String(allOrders.length + 1).padStart(4, '0')}`

  return (
    <>
      <PageHeader
        title="Vendas"
        description="Faturamento, CMV e resultado de cada pedido."
        actions={
          <OrderForm channels={channels} products={products} suggestedNumber={nextNumber} />
        }
      />

      <GlobalFilterBar
        fields={['busca', 'period', 'canal', 'produto', 'statusPedido']}
        options={{ channels, products }}
        searchPlaceholder="Número do pedido ou cliente..."
      />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4 xl:grid-cols-7">
        <MetricCard
          title="Faturamento"
          value={formatCurrency(summary.revenue)}
          hint={describePeriod(filters)}
          tone="positive"
          icon={TrendingUp}
        />
        <MetricCard title="Pedidos" value={formatNumber(summary.ordersCount)} icon={ShoppingCart} />
        <MetricCard title="Itens vendidos" value={formatNumber(summary.itemsCount)} icon={Boxes} />
        <MetricCard
          title="Ticket médio"
          value={formatCurrency(summary.averageTicket)}
          icon={Receipt}
        />
        <MetricCard
          title="CMV"
          value={formatCurrency(summary.cogs)}
          hint="Custo da mercadoria vendida"
          tone="negative"
          icon={PackageMinus}
        />
        <MetricCard
          title="Margem de contribuição"
          value={formatCurrency(summary.contributionMargin)}
          hint="Faturamento menos CMV"
          tone={summary.contributionMargin >= 0 ? 'positive' : 'negative'}
          icon={Coins}
        />
        <MetricCard
          title="Resultado comercial"
          value={formatCurrency(summary.commercialResult)}
          hint={`Margem de ${formatPercent(summary.marginPercent)} após taxas`}
          tone={summary.commercialResult >= 0 ? 'positive' : 'negative'}
          icon={Percent}
        />
      </div>

      {orders.length === 0 ? (
        <EmptyState
          title="Nenhum pedido no período"
          description="Cada venda registrada aqui cria o pedido, os itens e a baixa de estoque automaticamente."
          action={
            <OrderForm channels={channels} products={products} suggestedNumber={nextNumber} />
          }
        />
      ) : (
        <div className="overflow-x-auto rounded-xl border bg-card">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[96px]">Data</TableHead>
                <TableHead>Pedido</TableHead>
                <TableHead>Canal</TableHead>
                <TableHead>Cliente</TableHead>
                <TableHead className="text-right">Itens</TableHead>
                <TableHead className="text-right">Receita</TableHead>
                <TableHead className="text-right">CMV</TableHead>
                <TableHead className="text-right">Custos</TableHead>
                <TableHead className="text-right">Resultado</TableHead>
                <TableHead className="w-[100px]">Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {orders.map((order) => {
                const result = num(order.result_amount)
                const tone = resultTone(result, num(order.total_amount))
                const cancelled = order.status === 'CANCELADO'

                return (
                  <TableRow key={order.id} className={cn(cancelled && 'opacity-55')}>
                    <TableCell className="whitespace-nowrap tabular-nums">
                      {formatDate(order.order_date)}
                    </TableCell>
                    <TableCell>
                      <Link href={`/vendas/${order.id}`} className="font-medium hover:underline">
                        {order.order_number}
                      </Link>
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {order.channel_name ?? '--'}
                    </TableCell>
                    <TableCell className="max-w-[160px] truncate text-muted-foreground">
                      {order.customer_name ?? '--'}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatNumber(order.items_quantity)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatCurrency(order.total_amount)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums text-muted-foreground">
                      {formatCurrency(order.cogs_amount)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums text-muted-foreground">
                      {formatCurrency(order.extra_costs)}
                    </TableCell>
                    <TableCell
                      className={cn(
                        'text-right font-medium tabular-nums',
                        !cancelled && tone === 'positive' && 'text-emerald-600 dark:text-emerald-400',
                        !cancelled && tone === 'warning' && 'text-amber-600 dark:text-amber-400',
                        !cancelled && tone === 'negative' && 'text-rose-600 dark:text-rose-400',
                      )}
                    >
                      {formatCurrency(result)}
                      <div className="text-[11px] font-normal text-muted-foreground">
                        {formatPercent(order.result_percent)}
                      </div>
                    </TableCell>
                    <TableCell>
                      <span
                        className={cn(
                          'rounded px-1.5 py-0.5 text-[11px] font-medium',
                          STATUS_CLASS[order.status],
                        )}
                      >
                        {order.status}
                      </span>
                    </TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
        </div>
      )}

      <p className="text-xs text-muted-foreground">
        Verde = lucro, amarelo = perto de zero (margem abaixo de 5%), vermelho = prejuízo. Pedidos
        cancelados não entram em faturamento, resultado nem estoque.
      </p>
    </>
  )
}
