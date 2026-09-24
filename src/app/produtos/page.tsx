import Link from 'next/link'
import { Boxes, Eye, EyeOff, Package, TrendingUp } from 'lucide-react'

import { ConfirmActionButton } from '@/components/FormDialog'
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
import { getProductStats } from '@/lib/data'
import { formatCurrency, formatNumber, formatPercent, num } from '@/lib/format'
import { cn } from '@/lib/utils'

import { setProductActive } from './actions'
import { ProductForm } from './ProductForm'

export const dynamic = 'force-dynamic'

export default async function ProductsPage() {
  const products = await getProductStats()

  const stockValue = products.reduce(
    (sum, product) => sum + num(product.stock_balance) * num(product.unit_cost),
    0,
  )
  const revenue = products.reduce((sum, product) => sum + num(product.revenue_amount), 0)
  const margin = products.reduce((sum, product) => sum + num(product.margin_amount), 0)

  return (
    <>
      <PageHeader
        title="Produtos"
        description="Catálogo, estoque e margem por SKU."
        actions={<ProductForm />}
      />

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <MetricCard
          title="Valor em estoque"
          value={formatCurrency(stockValue)}
          hint="Saldo atual × custo unitário"
          icon={Boxes}
        />
        <MetricCard
          title="Receita dos produtos"
          value={formatCurrency(revenue)}
          hint="Somente pedidos não cancelados"
          tone="positive"
          icon={TrendingUp}
        />
        <MetricCard
          title="Margem de contribuição"
          value={formatCurrency(margin)}
          hint="Receita menos CMV"
          tone={margin >= 0 ? 'positive' : 'negative'}
          icon={Package}
        />
      </div>

      {products.length === 0 ? (
        <EmptyState
          title="Nenhum produto cadastrado"
          description="Cadastre os produtos para acompanhar estoque, CMV e margem por SKU."
          action={<ProductForm />}
        />
      ) : (
        <div className="overflow-x-auto rounded-xl border bg-card">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Produto</TableHead>
                <TableHead>SKU</TableHead>
                <TableHead className="text-right">Estoque</TableHead>
                <TableHead className="text-right">Vendidos</TableHead>
                <TableHead className="text-right">Custo</TableHead>
                <TableHead className="text-right">Preço</TableHead>
                <TableHead className="text-right">Receita</TableHead>
                <TableHead className="text-right">Margem</TableHead>
                <TableHead className="w-[60px]" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {products.map((product) => {
                const stock = num(product.stock_balance)
                const marginAmount = num(product.margin_amount)

                return (
                  <TableRow
                    key={product.product_id}
                    className={cn(!product.active && 'opacity-55')}
                  >
                    <TableCell>
                      <Link
                        href={`/produtos/${product.product_id}`}
                        className="font-medium hover:underline"
                      >
                        {product.name}
                      </Link>
                      {product.category ? (
                        <div className="text-xs text-muted-foreground">{product.category}</div>
                      ) : null}
                    </TableCell>
                    <TableCell className="text-muted-foreground">{product.sku ?? '--'}</TableCell>
                    <TableCell
                      className={cn(
                        'text-right font-medium tabular-nums',
                        stock < 0 && 'text-rose-600 dark:text-rose-400',
                        stock === 0 && 'text-muted-foreground',
                      )}
                    >
                      {formatNumber(stock)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatNumber(product.qty_sold)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums text-muted-foreground">
                      {formatCurrency(product.unit_cost)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums text-muted-foreground">
                      {formatCurrency(product.sale_price)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatCurrency(product.revenue_amount)}
                    </TableCell>
                    <TableCell
                      className={cn(
                        'text-right font-medium tabular-nums',
                        marginAmount >= 0
                          ? 'text-emerald-600 dark:text-emerald-400'
                          : 'text-rose-600 dark:text-rose-400',
                      )}
                    >
                      {formatCurrency(marginAmount)}
                      <div className="text-[11px] font-normal text-muted-foreground">
                        {formatPercent(product.margin_percent)}
                      </div>
                    </TableCell>
                    <TableCell className="text-right">
                      <ConfirmActionButton
                        action={setProductActive}
                        fields={{
                          id: product.product_id,
                          active: product.active ? 'false' : 'true',
                        }}
                        label=""
                        size="icon-sm"
                        icon={product.active ? <EyeOff /> : <Eye />}
                        confirmMessage={
                          product.active
                            ? `Desativar ${product.name}? O histórico de movimentações é preservado.`
                            : `Reativar ${product.name}?`
                        }
                      />
                    </TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
        </div>
      )}
    </>
  )
}
