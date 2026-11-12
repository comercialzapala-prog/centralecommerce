import Link from 'next/link'
import { Boxes, Package, ShieldCheck, ShoppingBag, Sparkles, TrendingUp } from 'lucide-react'

import { StockMovementForm } from '@/app/(app)/movimentacoes/StockMovementForm'
import { BubbleWrapLinkDialog, type BubbleWrapProductItem } from '@/app/(app)/produtos/BubbleWrapLinkDialog'
import { PackagingLinkDialog } from '@/app/(app)/produtos/PackagingLinkDialog'
import { ProductForm, type PackagingOption } from '@/app/(app)/produtos/ProductForm'
import { BoxGrid } from '@/components/BoxGrid'
import { MetricCard } from '@/components/MetricCard'
import { EmptyState, PageHeader } from '@/components/PageHeader'
import { RouteTabs } from '@/components/RouteTabs'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
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

  const bubbleWrapInsumo = packagingProducts.find(
    (p) => p.name.toUpperCase().includes('BOLHA') || p.sku?.toUpperCase().includes('BOLHA'),
  )
  const shippingBags = packagingProducts.filter(
    (p) => !p.name.toUpperCase().includes('BOLHA') && !p.sku?.toUpperCase().includes('BOLHA'),
  )

  const bubbleWrapOption: PackagingOption | null = bubbleWrapInsumo
    ? {
        id: bubbleWrapInsumo.product_id,
        name: bubbleWrapInsumo.name,
        sku: bubbleWrapInsumo.sku,
        unit_cost: bubbleWrapInsumo.unit_cost,
        stock_balance: bubbleWrapInsumo.stock_balance,
      }
    : null

  const bubbleProducts: BubbleWrapProductItem[] = saleProducts.map((p) => ({
    id: p.product_id,
    name: p.name,
    sku: p.sku,
    category: p.category,
    sale_price: p.sale_price,
    unit_cost: p.unit_cost,
    packaging_cost: p.packaging_cost,
    linked_packaging_name: p.linked_packaging_name,
    linked_packaging_sku: p.linked_packaging_sku,
    linked_packaging_unit_cost: p.linked_packaging_unit_cost,
    use_bubble_wrap: p.use_bubble_wrap,
    linked_bubble_wrap_qty: p.linked_bubble_wrap_qty,
  }))

  const bubbleWrapLinkedProducts = saleProducts.filter((p) => Boolean(p.use_bubble_wrap))

  const linkableProducts = saleProducts.map((prod) => ({
    id: prod.product_id,
    name: prod.name,
    sku: prod.sku,
    sale_price: prod.sale_price,
    unit_cost: prod.unit_cost,
    gross_weight_grams: prod.gross_weight_grams,
    shipping_cost: prod.shipping_cost,
    linked_packaging_product_id: prod.linked_packaging_product_id,
    linked_packaging_name: prod.linked_packaging_name,
    linked_packaging_qty: prod.linked_packaging_qty,
  }))

  const totalBagsAvailable = shippingBags.reduce(
    (sum, bag) => sum + Math.max(0, num(bag.stock_balance)),
    0,
  )
  const totalBagsConsumed = shippingBags.reduce(
    (sum, bag) => sum + num(bag.packaging_qty_consumed ?? bag.qty_sold),
    0,
  )
  const totalBagsSpend = shippingBags.reduce(
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
        description="Controle o estoque de sacolas de envio (32x40, 40x50) e plástico bolha unitário (R$ 0,60). A cada venda no ERP ou Mercado Livre, as embalagens são baixadas automaticamente e o custo é rastreado por produto."
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <BubbleWrapLinkDialog
              products={bubbleProducts}
              bubbleWrapInsumo={bubbleWrapOption}
              triggerLabel="🫧 Atribuir Plástico Bolha"
            />
            <PackagingLinkDialog
              products={linkableProducts}
              packagingOptions={packagingOptions}
            />
            <ProductForm
              defaultItemKind="INSUMO"
              packagingOptions={packagingOptions}
              linkableProducts={linkableProducts}
              triggerLabel="Nova sacola / embalagem"
            />
          </div>
        }
      />

      <RouteTabs
        items={[
          { href: '/produtos', label: 'Catálogo de Produtos', badge: saleProducts.length },
          {
            href: '/precificacao',
            label: 'Planilha de Precificação (ML)',
            badge: saleProducts.length,
          },
          { href: '/sacolas', label: 'Sacolas & Embalagens', badge: packagingProducts.length },
          { href: '/logistica', label: 'Logística & Frota' },
        ]}
      />

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <MetricCard
          title="Sacolas disponíveis"
          value={`${formatNumber(totalBagsAvailable)} un.`}
          hint={`${shippingBags.length} tamanho(s) de sacola (32x40, 40x50)`}
          tone={totalBagsAvailable > 0 ? 'accent' : 'warning'}
          icon={ShoppingBag}
        />
        <MetricCard
          title="Plástico Bolha (Estoque)"
          value={`${formatNumber(bubbleWrapInsumo?.stock_balance ?? 100)} un.`}
          hint={`Custo: ${formatCurrency(num(bubbleWrapInsumo?.unit_cost) || 0.6)}/un. · ${bubbleWrapLinkedProducts.length} produtos`}
          tone={num(bubbleWrapInsumo?.stock_balance ?? 100) > 0 ? 'positive' : 'warning'}
          icon={ShieldCheck}
        />
        <MetricCard
          title="Sacolas descontadas"
          value={`${formatNumber(totalBagsConsumed)} un.`}
          hint="Baixa automática nas vendas"
          tone={totalBagsConsumed > 0 ? 'positive' : 'neutral'}
          icon={Boxes}
        />
        <MetricCard
          title="Produtos configurados"
          value={`${linkedProductsCount} / ${saleProducts.length}`}
          hint={`${bubbleWrapLinkedProducts.length} produtos com plástico bolha`}
          icon={Package}
        />
      </div>

      {/* Seção Exclusiva: Plástico Bolha & Proteção Extra */}
      <section className="space-y-4 rounded-xl border-2 border-sky-500/40 bg-sky-500/5 p-4 shadow-xs">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <div className="flex size-7 items-center justify-center rounded-lg bg-sky-500/20 text-sky-700 dark:text-sky-300 font-bold">
              🫧
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-sm font-bold text-foreground">Plástico Bolha &amp; Proteção de Frágeis</h2>
                <Badge variant="outline" className="border-sky-500/50 bg-sky-500/10 text-sky-700 dark:text-sky-300">
                  Unidades (un.)
                </Badge>
              </div>
              <p className="text-xs text-muted-foreground">
                Cadastrado e controlado por unidade (R$ 0,60/un.). Atribua aos produtos de vidro e eletroportáteis para somar o gasto de proteção na precificação.
              </p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <BubbleWrapLinkDialog
              products={bubbleProducts}
              bubbleWrapInsumo={bubbleWrapOption}
              triggerLabel="Atribuir Plástico Bolha aos Produtos"
            />
            {bubbleWrapInsumo ? (
              <StockMovementForm
                products={allProductsList}
                defaultProductId={bubbleWrapInsumo.product_id}
              />
            ) : null}
          </div>
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <div className="rounded-xl border bg-background/80 p-3 space-y-1">
            <span className="text-[11px] font-medium text-muted-foreground">Saldo Disponível em Estoque</span>
            <div className="text-xl font-bold tabular-nums text-foreground">
              {formatNumber(bubbleWrapInsumo?.stock_balance ?? 100)} un.
            </div>
            <p className="text-[10px] text-muted-foreground">Controle por unidades consumidas</p>
          </div>

          <div className="rounded-xl border bg-background/80 p-3 space-y-1">
            <span className="text-[11px] font-medium text-muted-foreground">Custo Unitário da Proteção</span>
            <div className="text-xl font-bold tabular-nums text-sky-700 dark:text-sky-300">
              {formatCurrency(num(bubbleWrapInsumo?.unit_cost) || 0.6)}
            </div>
            <p className="text-[10px] text-muted-foreground">Adicionado automaticamente ao custo de embalagem</p>
          </div>

          <div className="rounded-xl border bg-background/80 p-3 space-y-1">
            <span className="text-[11px] font-medium text-muted-foreground">Produtos Atribuídos</span>
            <div className="text-xl font-bold tabular-nums text-foreground">
              {bubbleWrapLinkedProducts.length} <span className="text-xs font-normal text-muted-foreground">de {saleProducts.length} produtos</span>
            </div>
            <p className="text-[10px] text-emerald-600 dark:text-emerald-400 font-medium">
              Vidros, chaleiras e frágeis protegidos
            </p>
          </div>
        </div>

        {/* Lista de produtos com Plástico Bolha ativo */}
        <div className="rounded-lg border bg-background/60 p-3 text-xs space-y-2">
          <div className="flex items-center justify-between font-semibold text-muted-foreground">
            <span>Produtos com Plástico Bolha Ativo ({bubbleWrapLinkedProducts.length})</span>
            <BubbleWrapLinkDialog
              products={bubbleProducts}
              bubbleWrapInsumo={bubbleWrapOption}
              triggerLabel="Adicionar / Remover Produtos"
              compact
            />
          </div>
          {bubbleWrapLinkedProducts.length === 0 ? (
            <p className="text-[11px] text-muted-foreground">
              Nenhum produto atribuído ainda. Clique em &ldquo;Atribuir Plástico Bolha aos Produtos&rdquo; para marcar seus produtos frágeis (vidros, chaleiras, etc.).
            </p>
          ) : (
            <div className="flex flex-wrap gap-1.5">
              {bubbleWrapLinkedProducts.map((p) => (
                <Link
                  key={p.product_id}
                  href={`/produtos/${p.product_id}`}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-sky-500/30 bg-sky-500/10 px-2.5 py-1 text-xs font-medium text-sky-800 hover:bg-sky-500/20 dark:text-sky-200 transition-colors"
                >
                  <span>🫧</span>
                  <span className="truncate max-w-[220px]">{p.name}</span>
                  <span className="text-[10px] opacity-75">
                    ({p.linked_packaging_name ?? 'Sacola'} + {formatCurrency(num(bubbleWrapInsumo?.unit_cost) || 0.6)})
                  </span>
                </Link>
              ))}
            </div>
          )}
        </div>
      </section>

      {/* Cards de cada sacola (P, M, G...) */}
      <section className="space-y-4 rounded-xl border bg-card p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <ShoppingBag className="size-4 text-sky-600 dark:text-sky-400" />
            <h2 className="text-sm font-semibold">Estoque e Consumo por Sacola de Envio</h2>
            <Badge variant="outline">{shippingBags.length} cadastrada(s)</Badge>
          </div>
          <PackagingLinkDialog
            products={linkableProducts}
            packagingOptions={packagingOptions}
            triggerLabel="Vincular produto a uma sacola"
            compact
          />
        </div>

        {shippingBags.length === 0 ? (
          <EmptyState
            title="Nenhuma sacola cadastrada"
            description="Cadastre Sacola 32x40, Sacola 40x50 para controlar o saldo e descontar automaticamente a cada venda."
            action={
              <ProductForm
                defaultItemKind="INSUMO"
                packagingOptions={packagingOptions}
                linkableProducts={linkableProducts}
                triggerLabel="Cadastrar primeira sacola"
              />
            }
          />
        ) : (
          <div className="grid grid-cols-1 gap-3 lg:grid-cols-3">
            {shippingBags.map((bag) => {
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
                        <ProductForm
                          product={bag}
                          packagingOptions={packagingOptions}
                          linkableProducts={linkableProducts}
                        />
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
                        <div className="flex flex-col gap-1 items-start">
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

                          {prod.use_bubble_wrap && (
                            <span className="inline-flex items-center gap-1 rounded bg-sky-500/15 text-sky-700 dark:text-sky-300 px-1.5 py-0.5 text-[10px] font-bold border border-sky-500/20">
                              🫧 Plástico Bolha (+{formatCurrency(num(bubbleWrapInsumo?.unit_cost) || 0.6)})
                            </span>
                          )}
                        </div>
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
