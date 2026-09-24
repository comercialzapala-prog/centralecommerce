import Link from 'next/link'
import { notFound } from 'next/navigation'
import { Boxes, PackageCheck, PackageX, TrendingUp, Undo2 } from 'lucide-react'

import { MetricCard } from '@/components/MetricCard'
import { PageHeader } from '@/components/PageHeader'
import { StockMovementsTable } from '@/components/StockMovementsTable'
import { StockMovementForm } from '@/app/movimentacoes/StockMovementForm'
import { deleteStockMovement } from '@/app/movimentacoes/actions'
import { EMPTY_FILTERS } from '@/lib/filters'
import { getProductById, getProducts, getStockMovements } from '@/lib/data'
import { formatCurrency, formatNumber, formatPercent, num } from '@/lib/format'
import { cn } from '@/lib/utils'

import { ProductForm } from '../ProductForm'

export const dynamic = 'force-dynamic'

/** Detalhe do produto (secao 24). */
export default async function ProductDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params

  const [product, products, movements] = await Promise.all([
    getProductById(id),
    getProducts(),
    getStockMovements(EMPTY_FILTERS, id),
  ])

  if (!product) notFound()

  const stock = num(product.stock_balance)
  const margin = num(product.margin_amount)

  const ledger = [
    { label: 'Entraram', value: num(product.qty_in), tone: 'text-emerald-600 dark:text-emerald-400' },
    { label: 'Vendidos', value: num(product.qty_sold), tone: 'text-rose-600 dark:text-rose-400' },
    { label: 'Devolvidos', value: num(product.qty_returned), tone: 'text-sky-600 dark:text-sky-400' },
    { label: 'Perdidos', value: num(product.qty_lost), tone: 'text-rose-600 dark:text-rose-400' },
    { label: 'Avariados', value: num(product.qty_damaged), tone: 'text-amber-600 dark:text-amber-400' },
    { label: 'Ajustes', value: num(product.qty_adjusted), tone: 'text-muted-foreground' },
  ]

  return (
    <>
      <nav className="text-xs text-muted-foreground">
        <Link href="/produtos" className="hover:underline">
          Produtos
        </Link>
        <span className="mx-1">/</span>
        <span className="font-medium text-foreground">{product.name}</span>
      </nav>

      <PageHeader
        title={product.name}
        description={
          [product.sku ? `SKU ${product.sku}` : null, product.category]
            .filter(Boolean)
            .join(' · ') || undefined
        }
        actions={
          <>
            <StockMovementForm products={products} defaultProductId={id} />
            <ProductForm product={product} />
          </>
        }
      />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        <MetricCard
          title="Estoque atual"
          value={formatNumber(stock)}
          hint={`${formatCurrency(stock * num(product.unit_cost))} em custo`}
          tone={stock < 0 ? 'negative' : stock === 0 ? 'warning' : 'neutral'}
          icon={Boxes}
        />
        <MetricCard
          title="Quantidade vendida"
          value={formatNumber(product.qty_sold)}
          hint={`${formatNumber(product.orders_count)} pedido(s)`}
          icon={PackageCheck}
        />
        <MetricCard
          title="Valor vendido"
          value={formatCurrency(product.revenue_amount)}
          tone="positive"
          icon={TrendingUp}
        />
        <MetricCard
          title="CMV"
          value={formatCurrency(product.cogs_amount)}
          hint="Custo da mercadoria vendida"
          tone="negative"
          icon={PackageX}
        />
        <MetricCard
          title="Resultado"
          value={formatCurrency(margin)}
          hint={`Margem de ${formatPercent(product.margin_percent)}`}
          tone={margin >= 0 ? 'positive' : 'negative'}
          icon={Undo2}
        />
      </div>

      <section className="rounded-xl border bg-card p-4">
        <h2 className="mb-3 text-sm font-semibold">Composição do saldo</h2>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          {ledger.map((entry) => (
            <div key={entry.label}>
              <div className="text-xs text-muted-foreground">{entry.label}</div>
              <div className={cn('text-lg font-semibold tabular-nums', entry.tone)}>
                {formatNumber(entry.value)}
              </div>
            </div>
          ))}
        </div>
        <p className="mt-3 border-t pt-3 text-sm text-muted-foreground">
          Saldo ={' '}
          <span className="font-medium text-foreground tabular-nums">{formatNumber(stock)}</span>{' '}
          (entradas + devoluções − vendas − perdas − avarias ± ajustes). Pedidos cancelados não
          entram na conta.
        </p>
      </section>

      <section className="space-y-2">
        <h2 className="text-sm font-semibold">
          Histórico de movimentações{' '}
          <span className="font-normal text-muted-foreground">({movements.length})</span>
        </h2>
        <StockMovementsTable
          rows={movements}
          showProduct={false}
          deleteAction={deleteStockMovement}
          emptyMessage="Nenhuma movimentação registrada para este produto."
        />
      </section>
    </>
  )
}
