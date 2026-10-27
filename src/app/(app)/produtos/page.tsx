import Link from 'next/link'
import { Boxes, Eye, EyeOff, Package, ShoppingBag, TrendingUp, Truck } from 'lucide-react'

import { ConfirmActionButton } from '@/components/FormDialog'
import { MetricCard } from '@/components/MetricCard'
import { EmptyState, PageHeader } from '@/components/PageHeader'
import { RouteTabs } from '@/components/RouteTabs'
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
import { PackagingLinkDialog } from './PackagingLinkDialog'
import { ProductForm, type PackagingOption } from './ProductForm'

export const dynamic = 'force-dynamic'

export default async function ProductsPage() {
  const products = await getProductStats()

  const saleProducts = products.filter((p) => p.item_kind !== 'INSUMO')
  const packagingProducts = products.filter((p) => p.item_kind === 'INSUMO')

  const packagingOptions: PackagingOption[] = packagingProducts.map((bag) => ({
    id: bag.product_id,
    name: bag.name,
    sku: bag.sku,
    unit_cost: bag.unit_cost,
    stock_balance: bag.stock_balance,
  }))

  const linkableProducts = saleProducts.map((prod) => ({
    id: prod.product_id,
    name: prod.name,
    sku: prod.sku,
    linked_packaging_product_id: prod.linked_packaging_product_id,
    linked_packaging_qty: prod.linked_packaging_qty,
  }))

  const stockValue = products.reduce(
    (sum, product) => sum + Math.max(0, num(product.stock_balance)) * num(product.unit_cost),
    0,
  )
  const revenue = saleProducts.reduce((sum, product) => sum + num(product.revenue_amount), 0)
  const totalShipping = saleProducts.reduce((sum, product) => sum + num(product.shipping_amount), 0)
  const netMargin = saleProducts.reduce(
    (sum, product) => sum + num(product.net_margin_amount ?? product.margin_amount),
    0,
  )

  const totalBagsAvailable = packagingProducts.reduce(
    (sum, bag) => sum + Math.max(0, num(bag.stock_balance)),
    0,
  )
  const totalBagsConsumed = packagingProducts.reduce(
    (sum, bag) => sum + num(bag.packaging_qty_consumed ?? bag.qty_sold),
    0,
  )
  const totalBagsSpend = packagingProducts.reduce(
    (sum, bag) => sum + num(bag.packaging_linked_cost_total),
    0,
  )

  return (
    <>
      <PageHeader
        title="Catálogo de Produtos"
        description="Acompanhe estoque, ficha técnica, CMV, frete, sacola vinculada e margem líquida por SKU."
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <PackagingLinkDialog
              products={linkableProducts}
              packagingOptions={packagingOptions}
            />
            <ProductForm packagingOptions={packagingOptions} />
          </div>
        }
      />

      <RouteTabs
        items={[
          { href: '/produtos', label: 'Catálogo de Produtos', badge: saleProducts.length },
          { href: '/sacolas', label: 'Sacolas & Embalagens', badge: packagingProducts.length },
        ]}
      />

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <MetricCard
          title="Valor em estoque"
          value={formatCurrency(stockValue)}
          hint="Produtos + sacolas em saldo"
          icon={Boxes}
        />
        <MetricCard
          title="Sacolas disponíveis"
          value={`${formatNumber(totalBagsAvailable)} un.`}
          hint={`${formatNumber(totalBagsConsumed)} descontada(s) · Gasto: ${formatCurrency(totalBagsSpend)}`}
          tone={totalBagsAvailable > 0 ? 'accent' : 'warning'}
          icon={ShoppingBag}
          href="/sacolas"
        />
        <MetricCard
          title="Receita dos produtos"
          value={formatCurrency(revenue)}
          hint="Somente pedidos não cancelados"
          tone="positive"
          icon={TrendingUp}
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
          hint="Receita − CMV − frete, taxas e sacolas"
          tone={netMargin >= 0 ? 'positive' : 'negative'}
          icon={Package}
        />
      </div>

      {saleProducts.length === 0 ? (
        <EmptyState
          title="Nenhum produto de venda cadastrado"
          description="Cadastre os produtos para acompanhar estoque, CMV, frete, sacola vinculada e margem por SKU."
          action={<ProductForm packagingOptions={packagingOptions} />}
        />
      ) : (
        <div className="overflow-x-auto rounded-xl border bg-card">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Produto</TableHead>
                <TableHead>Identificação / Sacola</TableHead>
                <TableHead className="text-right">Estoque</TableHead>
                <TableHead className="text-right">Vendidos</TableHead>
                <TableHead className="text-right">Custo</TableHead>
                <TableHead className="text-right">Preço</TableHead>
                <TableHead className="text-right">Frete Unit.</TableHead>
                <TableHead className="text-right">Receita</TableHead>
                <TableHead className="text-right">Frete + Sacolas</TableHead>
                <TableHead className="text-right">Margem Líq.</TableHead>
                <TableHead className="w-[84px]" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {saleProducts.map((product) => {
                const stock = num(product.stock_balance)
                const netMarginAmount = num(product.net_margin_amount ?? product.margin_amount)
                const netMarginPct = num(product.net_margin_percent ?? product.margin_percent)
                const shippingUnit = num(product.shipping_cost)
                const shippingTotal = num(product.shipping_amount)
                const packagingTotal = num(product.packaging_amount)

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
                        {product.gross_weight_grams ? (
                          <div>
                            Peso: {product.net_weight_grams ? `${product.net_weight_grams}g líq. / ` : ''}
                            <span className="font-medium text-foreground">
                              {product.gross_weight_grams}g emb.
                            </span>
                          </div>
                        ) : null}
                        {product.linked_packaging_name ? (
                          <Link
                            href="/sacolas"
                            className="inline-block text-sky-600 hover:underline dark:text-sky-400 font-medium"
                          >
                            Sacola: {product.linked_packaging_name} (
                            {formatNumber(product.linked_packaging_qty ?? 1)}x)
                          </Link>
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
                      <div>{formatCurrency(shippingTotal + packagingTotal)}</div>
                      {packagingTotal > 0 ? (
                        <div className="text-[10px] text-muted-foreground">
                          Sacolas: {formatCurrency(packagingTotal)}
                        </div>
                      ) : null}
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
                        <ProductForm product={product} packagingOptions={packagingOptions} />
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
                              label: 'Sacola Vinculada',
                              value: product.linked_packaging_name ?? 'Nenhuma',
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
