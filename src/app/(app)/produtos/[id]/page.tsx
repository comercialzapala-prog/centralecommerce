import Link from 'next/link'
import { notFound } from 'next/navigation'
import { Boxes, PackageCheck, PackageX, ShoppingBag, TrendingUp, Truck, Undo2 } from 'lucide-react'

import { BoxGrid } from '@/components/BoxGrid'
import { MetricCard } from '@/components/MetricCard'
import { PageHeader } from '@/components/PageHeader'
import { StockMovementsTable } from '@/components/StockMovementsTable'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { StockMovementForm } from '@/app/(app)/movimentacoes/StockMovementForm'
import { deleteStockMovement } from '@/app/(app)/movimentacoes/actions'
import { EMPTY_FILTERS } from '@/lib/filters'
import { getProductById, getProducts, getProductStats, getStockMovements } from '@/lib/data'
import { formatCurrency, formatNumber, formatPercent, num } from '@/lib/format'

import { PackagingLinkDialog } from '../PackagingLinkDialog'
import { ProductForm, type PackagingOption } from '../ProductForm'

export const dynamic = 'force-dynamic'

/** Detalhe do produto ou sacola/insumo (secao 24). */
export default async function ProductDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params

  const [product, products, allStats, movements] = await Promise.all([
    getProductById(id),
    getProducts(),
    getProductStats(),
    getStockMovements(EMPTY_FILTERS, id),
  ])

  if (!product) notFound()

  const isInsumo = product.item_kind === 'INSUMO'
  const packagingOptions: PackagingOption[] = allStats
    .filter((p) => p.item_kind === 'INSUMO')
    .map((bag) => ({
      id: bag.product_id,
      name: bag.name,
      sku: bag.sku,
      unit_cost: bag.unit_cost,
      stock_balance: bag.stock_balance,
    }))

  const linkableProducts = allStats
    .filter((p) => p.item_kind !== 'INSUMO')
    .map((p) => ({
      id: p.product_id,
      name: p.name,
      sku: p.sku,
      linked_packaging_product_id: p.linked_packaging_product_id,
      linked_packaging_qty: p.linked_packaging_qty,
    }))

  const stock = num(product.stock_balance)
  const unitShipping = num(product.shipping_cost)
  const unitPackaging = num(product.packaging_cost)
  const mktPct = num(product.marketplace_percent)
  const taxPct = num(product.tax_percent)
  const unitMargin = num(product.sale_price) - num(product.unit_cost)
  const unitPctCosts = num(product.sale_price) * ((mktPct + taxPct) / 100)
  const unitNetMargin = unitMargin - unitShipping - unitPackaging - unitPctCosts

  const shippingAmount = num(product.shipping_amount)
  const packagingAmount = num(product.packaging_amount)
  const extraCostsAmount = num(product.extra_costs_amount)
  const netMarginAmount = num(product.net_margin_amount ?? product.margin_amount)
  const netMarginPercent = num(product.net_margin_percent ?? product.margin_percent)

  const consumptions = product.consumption_by_product ?? []

  return (
    <>
      <nav className="text-xs text-muted-foreground">
        <Link href="/produtos" className="hover:underline">
          Produtos &amp; Sacolas
        </Link>
        <span className="mx-1">/</span>
        <span className="font-medium text-foreground">{product.name}</span>
      </nav>

      <PageHeader
        title={product.name}
        description={
          [
            isInsumo ? 'Sacola / Embalagem' : 'Produto de Venda',
            product.sku ? `SKU ${product.sku}` : null,
            product.ean ? `EAN ${product.ean}` : null,
            product.asin ? `ASIN ${product.asin}` : null,
            product.voltage ? `Voltagem ${product.voltage}` : null,
            product.category,
          ]
            .filter(Boolean)
            .join(' · ') || undefined
        }
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <PackagingLinkDialog
              products={linkableProducts}
              packagingOptions={packagingOptions}
              defaultProductId={isInsumo ? undefined : id}
              defaultPackagingId={
                isInsumo ? id : (product.linked_packaging_product_id ?? undefined)
              }
              defaultQty={Math.max(1, num(product.linked_packaging_qty ?? 1))}
              triggerLabel={
                isInsumo ? 'Vincular produto a esta sacola' : 'Vincular / trocar sacola'
              }
            />
            <StockMovementForm products={products} defaultProductId={id} />
            <ProductForm product={product} packagingOptions={packagingOptions} />
          </div>
        }
      />

      {isInsumo ? (
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <MetricCard
            title="Saldo disponível"
            value={`${formatNumber(stock)} un.`}
            hint={`${formatCurrency(Math.max(0, stock) * num(product.unit_cost))} em estoque`}
            tone={stock <= 0 ? 'negative' : stock <= 15 ? 'warning' : 'positive'}
            icon={ShoppingBag}
          />
          <MetricCard
            title="Descontadas em vendas"
            value={`${formatNumber(product.packaging_qty_consumed ?? product.qty_sold)} un.`}
            hint="Baixa automática pelos produtos vinculados"
            tone="accent"
            icon={PackageCheck}
          />
          <MetricCard
            title="Custo unitário da sacola"
            value={formatCurrency(product.unit_cost)}
            hint="Aplicado em cada unidade consumida"
            icon={Boxes}
          />
          <MetricCard
            title="Gasto acumulado em vendas"
            value={formatCurrency(product.packaging_linked_cost_total ?? 0)}
            hint={`${consumptions.length} produto(s) vinculado(s)`}
            tone="warning"
            icon={Truck}
          />
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-6">
          <MetricCard
            title="Estoque atual"
            value={formatNumber(stock)}
            hint={`${formatCurrency(Math.max(0, stock) * num(product.unit_cost))} em custo`}
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
            title="Frete + Sacolas (vendas)"
            value={formatCurrency(shippingAmount + packagingAmount)}
            hint={`Frete: ${formatCurrency(shippingAmount)} · Sacolas: ${formatCurrency(packagingAmount)}`}
            tone={shippingAmount + packagingAmount > 0 ? 'warning' : 'neutral'}
            icon={Truck}
          />
          <MetricCard
            title="Resultado líquido"
            value={formatCurrency(netMarginAmount)}
            hint={`Líquida: ${formatPercent(netMarginPercent)} · Total taxas: ${formatCurrency(extraCostsAmount)}`}
            tone={netMarginAmount >= 0 ? 'positive' : 'negative'}
            icon={Undo2}
          />
        </div>
      )}

      {isInsumo ? (
        <section className="space-y-3 rounded-xl border bg-card p-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-sm font-semibold">
                Consumo e gasto de {product.name} por produto vendido
              </h2>
              <p className="text-xs text-muted-foreground">
                Cada vez que um produto vinculado é vendido, o estoque desta sacola é descontado automaticamente.
              </p>
            </div>
            <PackagingLinkDialog
              products={linkableProducts}
              packagingOptions={packagingOptions}
              defaultPackagingId={id}
              triggerLabel="Vincular mais um produto"
              compact
            />
          </div>

          {consumptions.length === 0 ? (
            <p className="py-4 text-sm text-muted-foreground">
              Nenhum produto vinculado a {product.name} ainda. Clique em &ldquo;Vincular mais um produto&rdquo; acima para escolher quais produtos descontam esta sacola.
            </p>
          ) : (
            <div className="overflow-x-auto rounded-lg border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Produto Vinculado</TableHead>
                    <TableHead className="text-right">Sacolas p/ 1 Venda</TableHead>
                    <TableHead className="text-right">Unidades Vendidas</TableHead>
                    <TableHead className="text-right">Sacolas Descontadas</TableHead>
                    <TableHead className="text-right">Gasto de Sacolas neste Produto</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {consumptions.map((entry) => (
                    <TableRow key={entry.product_id}>
                      <TableCell>
                        <Link
                          href={`/produtos/${entry.product_id}`}
                          className="font-medium hover:underline"
                        >
                          {entry.product_name}
                        </Link>
                        {entry.product_sku ? (
                          <span className="ml-2 font-mono text-xs text-muted-foreground">
                            SKU {entry.product_sku}
                          </span>
                        ) : null}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {formatNumber(entry.qty_per_unit)} un.
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {formatNumber(entry.units_sold)}
                      </TableCell>
                      <TableCell className="text-right font-medium tabular-nums">
                        {formatNumber(entry.qty_consumed)} un.
                      </TableCell>
                      <TableCell className="text-right font-semibold tabular-nums text-amber-600 dark:text-amber-400">
                        {formatCurrency(entry.total_cost)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </section>
      ) : (
        <section className="rounded-xl border bg-card p-4 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h2 className="text-sm font-semibold">
                Ficha técnica, Sacola vinculada e cálculo automático no ERP
              </h2>
              <p className="text-xs text-muted-foreground">
                Quando este produto é vendido no ERP, o frete unitário, as taxas e a baixa da sacola vinculada acontecem automaticamente.
              </p>
            </div>
          </div>

          <BoxGrid
            columns={4}
            items={[
              {
                label: 'Sacola / Embalagem Vinculada',
                value: product.linked_packaging_name
                  ? `${product.linked_packaging_name} (${formatNumber(product.linked_packaging_qty ?? 1)}x por venda)`
                  : 'Nenhuma sacola vinculada',
                hint:
                  product.linked_packaging_stock !== undefined
                    ? `Saldo da sacola: ${formatNumber(product.linked_packaging_stock)} un. disponíveis`
                    : 'Clique em "Vincular / trocar sacola" no topo',
                tone: product.linked_packaging_name ? 'accent' : 'neutral',
              },
              {
                label: 'Gasto de Sacolas neste Produto',
                value: formatCurrency(product.packaging_linked_cost_total ?? 0),
                hint: `${formatNumber(product.packaging_qty_consumed ?? 0)} sacola(s) descontada(s) em vendas`,
                tone: num(product.packaging_linked_cost_total) > 0 ? 'warning' : 'neutral',
              },
              {
                label: 'Frete unitário padrão',
                value: formatCurrency(unitShipping),
                hint: 'Multiplicado na venda',
                tone: unitShipping > 0 ? 'warning' : 'neutral',
              },
              {
                label: 'Margem líq. estimada / un.',
                value: formatCurrency(unitNetMargin),
                hint: `Embalagem/sacola unit.: ${formatCurrency(unitPackaging)}`,
                tone: unitNetMargin >= 0 ? 'positive' : 'danger',
              },
              { label: 'SKU Interno', value: product.sku ?? '--', mono: true },
              { label: 'EAN / GTIN', value: product.ean ?? '--', mono: true },
              { label: 'ASIN (Amazon)', value: product.asin ?? '--', mono: true },
              { label: 'NCM Fiscal', value: product.ncm ?? '--', mono: true },
              { label: 'Ref. Petrus / Fabricante', value: product.supplier_sku ?? '--', mono: true },
              {
                label: 'Peso Líq. / Embalado',
                value: `${product.net_weight_grams ? `${product.net_weight_grams}g` : '--'} / ${
                  product.gross_weight_grams ? `${product.gross_weight_grams}g` : '--'
                }`,
                tone: product.gross_weight_grams ? 'accent' : 'neutral',
              },
              {
                label: 'Voltagem / Capacidade',
                value: [product.voltage, product.capacity].filter(Boolean).join(' · ') || '--',
              },
              {
                label: 'Comissão / Imposto (%)',
                value: `${formatPercent(mktPct)} / ${formatPercent(taxPct)}`,
                hint: 'Percentuais sobre a venda',
              },
            ]}
          />

          {product.description ? (
            <div className="rounded-xl border bg-muted/20 p-3.5 text-xs text-muted-foreground space-y-1">
              <div className="font-medium text-foreground">Descrição técnica</div>
              <p>{product.description}</p>
              {product.included_items ? (
                <p>
                  <span className="font-medium text-foreground">Itens inclusos:</span>{' '}
                  {product.included_items}
                </p>
              ) : null}
            </div>
          ) : null}
        </section>
      )}

      <section className="rounded-xl border bg-card p-4 space-y-3">
        <h2 className="text-sm font-semibold">Composição do saldo</h2>
        <BoxGrid
          columns={3}
          items={[
            { label: '+ Entraram', value: formatNumber(product.qty_in), tone: 'positive' },
            {
              label: isInsumo ? '− Baixas em vendas' : '− Vendidos',
              value: formatNumber(product.qty_sold),
              tone: 'danger',
            },
            { label: '+ Devolvidos', value: formatNumber(product.qty_returned), tone: 'accent' },
            { label: '− Perdidos', value: formatNumber(product.qty_lost), tone: 'danger' },
            { label: '− Avariados', value: formatNumber(product.qty_damaged), tone: 'warning' },
            { label: '± Ajustes', value: formatNumber(product.qty_adjusted), tone: 'neutral' },
          ]}
        />
        <p className="border-t pt-3 text-sm text-muted-foreground">
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
          emptyMessage="Nenhuma movimentação registrada para este item."
        />
      </section>
    </>
  )
}
