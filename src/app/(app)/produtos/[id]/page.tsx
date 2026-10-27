import Link from 'next/link'
import { notFound } from 'next/navigation'
import { Boxes, PackageCheck, PackageX, TrendingUp, Truck, Undo2 } from 'lucide-react'

import { BoxGrid } from '@/components/BoxGrid'
import { MetricCard } from '@/components/MetricCard'
import { PageHeader } from '@/components/PageHeader'
import { StockMovementsTable } from '@/components/StockMovementsTable'
import { StockMovementForm } from '@/app/(app)/movimentacoes/StockMovementForm'
import { deleteStockMovement } from '@/app/(app)/movimentacoes/actions'
import { EMPTY_FILTERS } from '@/lib/filters'
import { getProductById, getProducts, getStockMovements } from '@/lib/data'
import { formatCurrency, formatNumber, formatPercent, num } from '@/lib/format'

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
  const unitShipping = num(product.shipping_cost)
  const unitPackaging = num(product.packaging_cost)
  const mktPct = num(product.marketplace_percent)
  const taxPct = num(product.tax_percent)
  const unitMargin = num(product.sale_price) - num(product.unit_cost)
  const unitPctCosts = num(product.sale_price) * ((mktPct + taxPct) / 100)
  const unitNetMargin = unitMargin - unitShipping - unitPackaging - unitPctCosts

  const shippingAmount = num(product.shipping_amount)
  const extraCostsAmount = num(product.extra_costs_amount)
  const netMarginAmount = num(product.net_margin_amount ?? product.margin_amount)
  const netMarginPercent = num(product.net_margin_percent ?? product.margin_percent)

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
          [
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
          <>
            <StockMovementForm products={products} defaultProductId={id} />
            <ProductForm product={product} />
          </>
        }
      />

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
          title="Soma de frete (vendas)"
          value={formatCurrency(shippingAmount)}
          hint={`Frete unit.: ${formatCurrency(unitShipping)} · Total taxas: ${formatCurrency(extraCostsAmount)}`}
          tone={shippingAmount > 0 ? 'warning' : 'neutral'}
          icon={Truck}
        />
        <MetricCard
          title="Resultado líquido"
          value={formatCurrency(netMarginAmount)}
          hint={`Líquida: ${formatPercent(netMarginPercent)} · Bruta: ${formatCurrency(margin)}`}
          tone={netMarginAmount >= 0 ? 'positive' : 'negative'}
          icon={Undo2}
        />
      </div>

      <section className="rounded-xl border bg-card p-4 space-y-4">
        <div>
          <h2 className="text-sm font-semibold">Ficha técnica e cálculo automático no ERP</h2>
          <p className="text-xs text-muted-foreground">
            Quando este produto é vendido no ERP, o frete unitário e as taxas abaixo são somados automaticamente em cima da quantidade vendida.
          </p>
        </div>

        <BoxGrid
          columns={4}
          items={[
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
              label: 'Origem / Garantia',
              value:
                [
                  product.origin_country,
                  product.warranty_months ? `${product.warranty_months} meses` : null,
                ]
                  .filter(Boolean)
                  .join(' · ') || '--',
            },
            {
              label: 'Frete unitário padrão',
              value: formatCurrency(unitShipping),
              hint: 'Multiplicado na venda',
              tone: unitShipping > 0 ? 'warning' : 'neutral',
            },
            {
              label: 'Embalagem unitária',
              value: formatCurrency(unitPackaging),
              hint: 'Somado por item',
            },
            {
              label: 'Comissão / Imposto (%)',
              value: `${formatPercent(mktPct)} / ${formatPercent(taxPct)}`,
              hint: 'Percentuais sobre a venda',
            },
            {
              label: 'Margem líq. estimada / un.',
              value: formatCurrency(unitNetMargin),
              tone: unitNetMargin >= 0 ? 'positive' : 'danger',
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

      <section className="rounded-xl border bg-card p-4 space-y-3">
        <h2 className="text-sm font-semibold">Composição do saldo</h2>
        <BoxGrid
          columns={3}
          items={[
            { label: '+ Entraram', value: formatNumber(product.qty_in), tone: 'positive' },
            { label: '− Vendidos', value: formatNumber(product.qty_sold), tone: 'danger' },
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
          emptyMessage="Nenhuma movimentação registrada para este produto."
        />
      </section>
    </>
  )
}
