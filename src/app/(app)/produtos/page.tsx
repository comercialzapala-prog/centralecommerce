import Link from 'next/link'
import { Boxes, Eye, EyeOff, Package, TrendingUp, Truck } from 'lucide-react'

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
    (sum, product) => sum + Math.max(0, num(product.stock_balance)) * num(product.unit_cost),
    0,
  )
  const revenue = products.reduce((sum, product) => sum + num(product.revenue_amount), 0)
  const margin = products.reduce((sum, product) => sum + num(product.margin_amount), 0)
  const totalShipping = products.reduce((sum, product) => sum + num(product.shipping_amount), 0)
  const netMargin = products.reduce(
    (sum, product) => sum + num(product.net_margin_amount ?? product.margin_amount),
    0,
  )

  return (
    <>
      <PageHeader
        title="Produtos"
        description="Catálogo, ficha técnica (NCM, EAN, ASIN, peso), frete unitário padrão e margem por SKU."
        actions={<ProductForm />}
      />

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5">
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
        <MetricCard
          title="Soma de frete nas vendas"
          value={formatCurrency(totalShipping)}
          hint="Calculado em cima dos produtos vendidos"
          tone={totalShipping > 0 ? 'warning' : 'neutral'}
          icon={Truck}
        />
        <MetricCard
          title="Margem líquida real"
          value={formatCurrency(netMargin)}
          hint="Receita − CMV − frete e taxas"
          tone={netMargin >= 0 ? 'positive' : 'negative'}
          icon={Package}
        />
      </div>

      {products.length === 0 ? (
        <EmptyState
          title="Nenhum produto cadastrado"
          description="Cadastre os produtos para acompanhar estoque, CMV, frete e margem por SKU."
          action={<ProductForm />}
        />
      ) : (
        <div className="overflow-x-auto rounded-xl border bg-card">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Produto</TableHead>
                <TableHead>Identificação / Peso</TableHead>
                <TableHead className="text-right">Estoque</TableHead>
                <TableHead className="text-right">Vendidos</TableHead>
                <TableHead className="text-right">Custo</TableHead>
                <TableHead className="text-right">Preço</TableHead>
                <TableHead className="text-right">Frete Unit.</TableHead>
                <TableHead className="text-right">Receita</TableHead>
                <TableHead className="text-right">Frete Vendas</TableHead>
                <TableHead className="text-right">Margem Líq.</TableHead>
                <TableHead className="w-[84px]" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {products.map((product) => {
                const stock = num(product.stock_balance)
                const netMarginAmount = num(product.net_margin_amount ?? product.margin_amount)
                const netMarginPct = num(product.net_margin_percent ?? product.margin_percent)
                const shippingUnit = num(product.shipping_cost)
                const shippingTotal = num(product.shipping_amount)

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
                      <div className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
                        {product.sku ? <span className="font-mono">SKU {product.sku}</span> : null}
                        {product.voltage ? (
                          <span className="rounded bg-muted px-1.5 py-0.5 font-medium text-foreground">
                            {product.voltage}
                          </span>
                        ) : null}
                        {product.category ? <span>· {product.category}</span> : null}
                      </div>
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      <div className="space-y-0.5">
                        {product.ean ? <div className="font-mono">EAN: {product.ean}</div> : null}
                        {product.asin ? <div className="font-mono">ASIN: {product.asin}</div> : null}
                        {product.ncm ? <div className="font-mono">NCM: {product.ncm}</div> : null}
                        {product.gross_weight_grams ? (
                          <div>
                            Peso: {product.net_weight_grams ? `${product.net_weight_grams}g líq. / ` : ''}
                            <span className="font-medium text-foreground">
                              {product.gross_weight_grams}g emb.
                            </span>
                          </div>
                        ) : null}
                      </div>
                    </TableCell>
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
                    <TableCell className="text-right tabular-nums text-muted-foreground">
                      {shippingUnit > 0 ? formatCurrency(shippingUnit) : '--'}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatCurrency(product.revenue_amount)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums text-amber-600 dark:text-amber-400">
                      {formatCurrency(shippingTotal)}
                    </TableCell>
                    <TableCell
                      className={cn(
                        'text-right font-medium tabular-nums',
                        netMarginAmount >= 0
                          ? 'text-emerald-600 dark:text-emerald-400'
                          : 'text-rose-600 dark:text-rose-400',
                      )}
                    >
                      {formatCurrency(netMarginAmount)}
                      <div className="text-[11px] font-normal text-muted-foreground">
                        {formatPercent(netMarginPct)}
                      </div>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-1">
                        <ProductForm product={product} />
                        <ConfirmActionButton
                          action={setProductActive}
                          fields={{
                            id: product.product_id,
                            active: product.active ? 'false' : 'true',
                          }}
                          label=""
                          size="icon-sm"
                          icon={product.active ? <EyeOff /> : <Eye />}
                          title={product.active ? 'Desativar produto' : 'Reativar produto'}
                          confirmLabel={product.active ? 'Desativar produto' : 'Reativar produto'}
                          tone={product.active ? 'warning' : 'positive'}
                          confirmMessage={
                            product.active
                              ? 'O produto deixará de aparecer em novos pedidos, mantendo todo o histórico de vendas e movimentações.'
                              : 'O produto voltará a ficar ativo para seleção em novos pedidos e movimentações.'
                          }
                          details={[
                            {
                              label: 'Produto',
                              value: product.name,
                              hint: product.category ?? undefined,
                              span: 2,
                            },
                            {
                              label: 'SKU / Voltagem',
                              value: [product.sku ?? '--', product.voltage].filter(Boolean).join(' · '),
                              mono: true,
                            },
                            {
                              label: 'EAN / ASIN',
                              value: [product.ean, product.asin].filter(Boolean).join(' · ') || '--',
                              mono: true,
                            },
                            {
                              label: 'Estoque / Vendidos',
                              value: `${formatNumber(stock)} un. · ${formatNumber(product.qty_sold)} vend.`,
                              tone: stock > 0 ? 'positive' : 'neutral',
                            },
                            {
                              label: 'Histórico & Auditoria',
                              value: '100% preservado',
                              tone: 'positive',
                            },
                          ]}
                        />
                      </div>
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
