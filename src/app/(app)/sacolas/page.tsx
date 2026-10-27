import Link from 'next/link'
import { Boxes, Package, ShoppingBag, TrendingUp } from 'lucide-react'

import { StockMovementForm } from '@/app/(app)/movimentacoes/StockMovementForm'
import { PackagingLinkDialog } from '@/app/(app)/produtos/PackagingLinkDialog'
import { ProductForm, type PackagingOption } from '@/app/(app)/produtos/ProductForm'
import { BoxGrid } from '@/components/BoxGrid'
import { MetricCard } from '@/components/MetricCard'
import { EmptyState, PageHeader } from '@/components/PageHeader'
import { RouteTabs } from '@/components/RouteTabs'
import { Badge } from '@/components/ui/badge'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { getProducts, getProductStats } from '@/lib/data'
import { formatCurrency, formatNumber, num } from '@/lib/format'
import { cn } from '@/lib/utils'

export const dynamic = 'force-dynamic'

export default async function SacolasPage() {
  const [products, allProductsList] = await Promise.all([getProductStats(), getProducts()])

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
  const linkedProductsCount = saleProducts.filter((p) =>
    Boolean(p.linked_packaging_product_id),
  ).length

  return (
    <>
      <PageHeader
        title="Giro Inteligente de Sacolas & Embalagens"
        description="Vincule cada produto à sacola que ele consome (P, M, G). A cada venda, a sacola vinculada é descontada automaticamente do estoque e o gasto fica rastreado por produto."
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <PackagingLinkDialog
              products={linkableProducts}
              packagingOptions={packagingOptions}
            />
            <ProductForm
              defaultItemKind="INSUMO"
              packagingOptions={packagingOptions}
              triggerLabel="Nova sacola / embalagem"
            />
          </div>
        }
      />

      <RouteTabs
        items={[
          { href: '/produtos', label: 'Catálogo de Produtos', badge: saleProducts.length },
          { href: '/sacolas', label: 'Sacolas & Embalagens', badge: packagingProducts.length },
        ]}
      />

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <MetricCard
          title="Sacolas disponíveis"
          value={`${formatNumber(totalBagsAvailable)} un.`}
          hint={`${packagingProducts.length} tipo(s) cadastrado(s)`}
          tone={totalBagsAvailable > 0 ? 'accent' : 'warning'}
          icon={ShoppingBag}
        />
        <MetricCard
          title="Sacolas descontadas"
          value={`${formatNumber(totalBagsConsumed)} un.`}
          hint="Baixa automática nas vendas"
          tone={totalBagsConsumed > 0 ? 'positive' : 'neutral'}
          icon={Boxes}
        />
        <MetricCard
          title="Gasto acumulado em sacolas"
          value={formatCurrency(totalBagsSpend)}
          hint="Custo total consumido nos pedidos"
          tone={totalBagsSpend > 0 ? 'warning' : 'neutral'}
          icon={TrendingUp}
        />
        <MetricCard
          title="Produtos com sacola vinculada"
          value={`${linkedProductsCount} / ${saleProducts.length}`}
          hint="Produtos configurados para baixa automática"
          icon={Package}
        />
      </div>

      {/* Cards de cada sacola (P, M, G...) */}
      <section className="space-y-4 rounded-xl border bg-card p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <ShoppingBag className="size-4 text-sky-600 dark:text-sky-400" />
            <h2 className="text-sm font-semibold">Estoque e Consumo por Sacola</h2>
            <Badge variant="outline">{packagingProducts.length} cadastrada(s)</Badge>
          </div>
          <PackagingLinkDialog
            products={linkableProducts}
            packagingOptions={packagingOptions}
            triggerLabel="Vincular produto a uma sacola"
            compact
          />
        </div>

        {packagingProducts.length === 0 ? (
          <EmptyState
            title="Nenhuma sacola cadastrada"
            description="Cadastre Sacola P, Sacola M, Sacola G para controlar o saldo e descontar automaticamente a cada venda."
            action={
              <ProductForm
                defaultItemKind="INSUMO"
                packagingOptions={packagingOptions}
                triggerLabel="Cadastrar primeira sacola"
              />
            }
          />
        ) : (
          <div className="grid grid-cols-1 gap-3 lg:grid-cols-3">
            {packagingProducts.map((bag) => {
              const bagStock = num(bag.stock_balance)
              const bagIn = num(bag.qty_in)
              const bagUsed = num(bag.packaging_qty_consumed ?? bag.qty_sold)
              const bagUnitCost = num(bag.unit_cost)
              const bagTotalSpent = num(bag.packaging_linked_cost_total)
              const linkedProds = saleProducts.filter(
                (p) => p.linked_packaging_product_id === bag.product_id,
              )

              return (
                <div
                  key={bag.product_id}
                  className={cn(
                    'flex flex-col justify-between gap-3 rounded-xl border bg-muted/15 p-3.5',
                    !bag.active && 'opacity-55',
                  )}
                >
                  <div className="space-y-2.5">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <Link
                          href={`/produtos/${bag.product_id}`}
                          className="text-sm font-semibold hover:underline"
                        >
                          {bag.name}
                        </Link>
                        <div className="text-xs text-muted-foreground">
                          {bag.sku ? `SKU ${bag.sku}` : 'Insumo'}
                          {bag.capacity ? ` · ${bag.capacity}` : ''}
                        </div>
                      </div>
                      <div className="flex items-center gap-1">
                        <StockMovementForm
                          products={allProductsList}
                          defaultProductId={bag.product_id}
                        />
                        <ProductForm product={bag} packagingOptions={packagingOptions} />
                      </div>
                    </div>

                    <BoxGrid
                      columns={2}
                      items={[
                        {
                          label: 'Saldo disponível',
                          value: `${formatNumber(bagStock)} un.`,
                          hint: `Entraram: ${formatNumber(bagIn)} un.`,
                          tone:
                            bagStock <= 0
                              ? 'danger'
                              : bagStock <= 15
                                ? 'warning'
                                : 'positive',
                        },
                        {
                          label: 'Saídas nas vendas',
                          value: `${formatNumber(bagUsed)} un.`,
                          hint: 'Descontadas automaticamente',
                          tone: bagUsed > 0 ? 'accent' : 'neutral',
                        },
                        {
                          label: 'Custo unitário',
                          value: formatCurrency(bagUnitCost),
                          hint:
                            bagUnitCost === 0
                              ? 'Clique no lápis p/ definir custo'
                              : 'Custo por sacola',
                        },
                        {
                          label: 'Gasto acumulado',
                          value: formatCurrency(bagTotalSpent),
                          hint: `${formatNumber(bagUsed)} × ${formatCurrency(bagUnitCost)}`,
                          tone: bagTotalSpent > 0 ? 'warning' : 'neutral',
                        },
                      ]}
                    />

                    <div className="rounded-lg border bg-background/60 p-2.5 text-xs">
                      <div className="mb-1.5 flex items-center justify-between">
                        <span className="font-medium text-muted-foreground">
                          Produtos vinculados ({linkedProds.length})
                        </span>
                        <PackagingLinkDialog
                          products={linkableProducts}
                          packagingOptions={packagingOptions}
                          defaultPackagingId={bag.product_id}
                          triggerLabel="Vincular"
                          compact
                        />
                      </div>
                      {linkedProds.length === 0 ? (
                        <p className="text-[11px] text-muted-foreground">
                          Nenhum produto vinculado ainda. Clique em &ldquo;Vincular&rdquo; para escolher quais produtos usam {bag.name}.
                        </p>
                      ) : (
                        <ul className="space-y-1">
                          {linkedProds.map((lp) => (
                            <li
                              key={lp.product_id}
                              className="flex items-center justify-between gap-2 text-[11px]"
                            >
                              <Link
                                href={`/produtos/${lp.product_id}`}
                                className="truncate font-medium hover:underline"
                              >
                                {lp.sku ? `${lp.sku} — ` : ''}
                                {lp.name}
                              </Link>
                              <span className="shrink-0 tabular-nums text-muted-foreground">
                                {formatNumber(lp.linked_packaging_qty ?? 1)}x/venda ·{' '}
                                {formatNumber(lp.packaging_qty_consumed ?? 0)} usada(s) (
                                {formatCurrency(lp.packaging_linked_cost_total ?? 0)})
                              </span>
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </section>

      {/* Matriz de Gasto de Sacolas por Produto */}
      {saleProducts.length > 0 ? (
        <section className="space-y-2.5 rounded-xl border bg-card p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-sm font-semibold">Relatório de Gasto de Sacolas por Produto</h2>
            <span className="text-xs text-muted-foreground">
              Gasto total em sacolas nas vendas:{' '}
              <strong className="text-foreground tabular-nums">
                {formatCurrency(totalBagsSpend)}
              </strong>
            </span>
          </div>
          <div className="overflow-x-auto rounded-lg border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Produto Vendido</TableHead>
                  <TableHead>Sacola Vinculada</TableHead>
                  <TableHead className="text-right">Qtd. p/ Venda</TableHead>
                  <TableHead className="text-right">Unid. Vendidas</TableHead>
                  <TableHead className="text-right">Sacolas Descontadas</TableHead>
                  <TableHead className="text-right">Custo Unit. Sacola</TableHead>
                  <TableHead className="text-right">Gasto de Sacolas no Produto</TableHead>
                  <TableHead className="w-[120px]" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {saleProducts.map((prod) => {
                  const hasBag = Boolean(prod.linked_packaging_product_id)
                  const qtyPerSale = Math.max(1, num(prod.linked_packaging_qty ?? 1))
                  const bagsConsumed = num(prod.packaging_qty_consumed)
                  const bagUnitCost = num(prod.linked_packaging_unit_cost)
                  const bagTotalCost = num(prod.packaging_linked_cost_total)

                  return (
                    <TableRow key={`bag-matrix-${prod.product_id}`}>
                      <TableCell>
                        <Link
                          href={`/produtos/${prod.product_id}`}
                          className="font-medium hover:underline"
                        >
                          {prod.name}
                        </Link>
                        {prod.sku ? (
                          <span className="ml-2 font-mono text-xs text-muted-foreground">
                            SKU {prod.sku}
                          </span>
                        ) : null}
                      </TableCell>
                      <TableCell>
                        {hasBag ? (
                          <Link
                            href={`/produtos/${prod.linked_packaging_product_id}`}
                            className="inline-flex items-center gap-1.5 rounded-md border border-sky-500/30 bg-sky-500/10 px-2 py-0.5 text-xs font-medium text-sky-600 hover:underline dark:text-sky-400"
                          >
                            <ShoppingBag className="size-3" />
                            {prod.linked_packaging_name}
                            {prod.linked_packaging_stock !== undefined ? (
                              <span className="text-[10px] opacity-80">
                                ({formatNumber(prod.linked_packaging_stock)} disp.)
                              </span>
                            ) : null}
                          </Link>
                        ) : (
                          <span className="text-xs text-muted-foreground">
                            Sem sacola vinculada
                          </span>
                        )}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {hasBag ? `${formatNumber(qtyPerSale)} un.` : '--'}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {formatNumber(prod.qty_sold)}
                      </TableCell>
                      <TableCell className="text-right font-medium tabular-nums">
                        {hasBag ? `${formatNumber(bagsConsumed)} un.` : '--'}
                      </TableCell>
                      <TableCell className="text-right tabular-nums text-muted-foreground">
                        {hasBag ? formatCurrency(bagUnitCost) : '--'}
                      </TableCell>
                      <TableCell className="text-right font-semibold tabular-nums text-amber-600 dark:text-amber-400">
                        {hasBag ? formatCurrency(bagTotalCost) : '--'}
                      </TableCell>
                      <TableCell className="text-right">
                        <PackagingLinkDialog
                          products={linkableProducts}
                          packagingOptions={packagingOptions}
                          defaultProductId={prod.product_id}
                          defaultPackagingId={prod.linked_packaging_product_id ?? undefined}
                          defaultQty={qtyPerSale}
                          triggerLabel={hasBag ? 'Trocar sacola' : 'Vincular sacola'}
                          compact
                        />
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          </div>
        </section>
      ) : null}
    </>
  )
}
