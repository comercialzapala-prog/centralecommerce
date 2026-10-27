import Link from 'next/link'
import { Boxes, Eye, EyeOff, Package, ShoppingBag, TrendingUp, Truck } from 'lucide-react'

import { StockMovementForm } from '@/app/(app)/movimentacoes/StockMovementForm'
import { BoxGrid } from '@/components/BoxGrid'
import { ConfirmActionButton } from '@/components/FormDialog'
import { MetricCard } from '@/components/MetricCard'
import { EmptyState, PageHeader } from '@/components/PageHeader'
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
import { formatCurrency, formatNumber, formatPercent, num } from '@/lib/format'
import { cn } from '@/lib/utils'

import { setProductActive } from './actions'
import { PackagingLinkDialog } from './PackagingLinkDialog'
import { ProductForm, type PackagingOption } from './ProductForm'

export const dynamic = 'force-dynamic'

export default async function ProductsPage() {
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
        title="Produtos & Giro de Sacolas"
        description="Catálogo de mercadorias, vínculo inteligente de sacolas (P, M, G) com baixa automática na venda e controle de gasto de embalagem por produto."
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
            <ProductForm packagingOptions={packagingOptions} />
          </div>
        }
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
          hint={`${formatNumber(totalBagsConsumed)} descontada(s) em vendas · Gasto: ${formatCurrency(totalBagsSpend)}`}
          tone={totalBagsAvailable > 0 ? 'accent' : 'warning'}
          icon={ShoppingBag}
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

      {/* ----------------- GIRO INTELIGENTE DE SACOLAS & EMBALAGENS ----------------- */}
      <section className="space-y-4 rounded-xl border bg-card p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <ShoppingBag className="size-4 text-sky-600 dark:text-sky-400" />
              <h2 className="text-sm font-semibold">
                Giro Inteligente de Sacolas &amp; Embalagens
              </h2>
              <Badge variant="outline">{packagingProducts.length} cadastrada(s)</Badge>
            </div>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Vincule cada produto à sacola que ele consome (ex.: Sacola P, Sacola M, Sacola G). Quando o produto é vendido, a sacola já é descontada automaticamente do estoque e o gasto fica rastreado por produto.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <PackagingLinkDialog
              products={linkableProducts}
              packagingOptions={packagingOptions}
              triggerLabel="Vincular produto a uma sacola"
              compact
            />
          </div>
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

        {/* Matriz de Gasto de Sacolas por Produto */}
        {saleProducts.length > 0 ? (
          <div className="space-y-2 border-t pt-3">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Relatório de Gasto de Sacolas por Produto
              </h3>
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
          </div>
        ) : null}
      </section>

      {/* ----------------- TABELA PRINCIPAL DO CATALOGO DE PRODUTOS ----------------- */}
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
                          <div className="text-sky-600 dark:text-sky-400 font-medium">
                            Sacola: {product.linked_packaging_name} (
                            {formatNumber(product.linked_packaging_qty ?? 1)}x)
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
