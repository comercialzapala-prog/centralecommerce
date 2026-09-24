import Link from 'next/link'
import { notFound } from 'next/navigation'
import { Ban, CheckCircle2, Trash2 } from 'lucide-react'

import { ConfirmActionButton } from '@/components/FormDialog'
import { PageHeader } from '@/components/PageHeader'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { getChannels, getOrderById, getOrderItems, getProducts } from '@/lib/data'
import { resultTone } from '@/lib/finance'
import { formatCurrency, formatDate, formatNumber, formatPercent, num } from '@/lib/format'
import { cn } from '@/lib/utils'

import { AddOrderItemForm } from '../AddOrderItemForm'
import { OrderForm } from '../OrderForm'
import { removeOrderItem, setOrderStatus } from '../actions'

export const dynamic = 'force-dynamic'

/** Detalhe do pedido (secao 20). */
export default async function OrderDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params

  const [order, items, channels, products] = await Promise.all([
    getOrderById(id),
    getOrderItems(id),
    getChannels(),
    getProducts(),
  ])

  if (!order) notFound()

  const result = num(order.result_amount)
  const total = num(order.total_amount)
  const tone = resultTone(result, total)
  const cancelled = order.status === 'CANCELADO'

  const breakdown = [
    { label: 'Receita bruta', value: num(order.gross_amount), sign: '+' },
    { label: 'Desconto', value: -num(order.discount_amount), sign: '-' },
    { label: 'Frete cobrado do cliente', value: num(order.shipping_charged), sign: '+' },
  ]

  const costs = [
    { label: 'CMV', value: num(order.cogs_amount) },
    { label: 'Taxa do marketplace', value: num(order.marketplace_fee) },
    { label: 'Taxa do gateway', value: num(order.gateway_fee) },
    { label: 'Imposto', value: num(order.tax_amount) },
    { label: 'Frete pago pela empresa', value: num(order.shipping_cost) },
    { label: 'Embalagem', value: num(order.packaging_cost) },
    { label: 'Marketing atribuído', value: num(order.marketing_cost) },
    { label: 'Outros custos', value: num(order.other_costs) },
  ].filter((entry) => entry.value !== 0)

  return (
    <>
      <nav className="text-xs text-muted-foreground">
        <Link href="/vendas" className="hover:underline">
          Vendas
        </Link>
        <span className="mx-1">/</span>
        <span className="font-medium text-foreground">Pedido {order.order_number}</span>
      </nav>

      <PageHeader
        title={`Pedido ${order.order_number}`}
        description={[
          formatDate(order.order_date),
          order.channel_name,
          order.customer_name,
        ]
          .filter(Boolean)
          .join(' · ')}
        actions={
          <>
            <OrderForm channels={channels} products={products} order={order} />
            {cancelled ? (
              <ConfirmActionButton
                action={setOrderStatus}
                fields={{ id: order.id, status: 'CONCLUIDO' }}
                label="Reativar pedido"
                variant="outline"
                icon={<CheckCircle2 />}
                confirmMessage="Reativar este pedido? Ele volta a contar em faturamento, resultado e estoque."
              />
            ) : (
              <ConfirmActionButton
                action={setOrderStatus}
                fields={{ id: order.id, status: 'CANCELADO' }}
                label="Cancelar pedido"
                variant="outline"
                icon={<Ban />}
                confirmMessage="Cancelar este pedido? Ele sai do faturamento, do resultado e devolve os itens ao estoque, mas continua no histórico."
              />
            )}
          </>
        }
      />

      {cancelled ? (
        <p className="rounded-xl border border-amber-500/40 bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:bg-amber-950/40 dark:text-amber-300">
          Pedido cancelado — não entra em faturamento, resultado nem estoque.
        </p>
      ) : null}

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <section className="rounded-xl border bg-card p-4 lg:col-span-2">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-sm font-semibold">Produtos</h2>
            <AddOrderItemForm orderId={order.id} products={products} />
          </div>

          {items.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">
              Nenhum item neste pedido.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Produto</TableHead>
                    <TableHead className="text-right">Qtd.</TableHead>
                    <TableHead className="text-right">Preço</TableHead>
                    <TableHead className="text-right">Custo</TableHead>
                    <TableHead className="text-right">Total</TableHead>
                    <TableHead className="text-right">Margem</TableHead>
                    <TableHead className="w-[50px]" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {items.map((item) => {
                    const itemMargin = num(item.gross_total) - num(item.cost_total)
                    return (
                      <TableRow key={item.id}>
                        <TableCell>
                          {item.product ? (
                            <Link
                              href={`/produtos/${item.product.id}`}
                              className="font-medium hover:underline"
                            >
                              {item.product.name}
                            </Link>
                          ) : (
                            '--'
                          )}
                          {item.product?.sku ? (
                            <div className="text-xs text-muted-foreground">
                              {item.product.sku}
                            </div>
                          ) : null}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {formatNumber(item.quantity)}
                        </TableCell>
                        <TableCell className="text-right tabular-nums text-muted-foreground">
                          {formatCurrency(item.unit_price)}
                        </TableCell>
                        <TableCell className="text-right tabular-nums text-muted-foreground">
                          {formatCurrency(item.unit_cost)}
                        </TableCell>
                        <TableCell className="text-right font-medium tabular-nums">
                          {formatCurrency(item.gross_total)}
                        </TableCell>
                        <TableCell
                          className={cn(
                            'text-right tabular-nums',
                            itemMargin >= 0
                              ? 'text-emerald-600 dark:text-emerald-400'
                              : 'text-rose-600 dark:text-rose-400',
                          )}
                        >
                          {formatCurrency(itemMargin)}
                        </TableCell>
                        <TableCell className="text-right">
                          <ConfirmActionButton
                            action={removeOrderItem}
                            fields={{ id: item.id }}
                            label=""
                            size="icon-sm"
                            icon={<Trash2 />}
                            confirmMessage="Remover este item? A baixa de estoque correspondente também é desfeita."
                          />
                        </TableCell>
                      </TableRow>
                    )
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </section>

        <section className="space-y-3 rounded-xl border bg-card p-4">
          <h2 className="text-sm font-semibold">Resultado do pedido</h2>

          <dl className="space-y-1 text-sm">
            {breakdown.map((entry) => (
              <div key={entry.label} className="flex justify-between">
                <dt className="text-muted-foreground">{entry.label}</dt>
                <dd className="tabular-nums">{formatCurrency(Math.abs(entry.value))}</dd>
              </div>
            ))}

            <div className="flex justify-between border-t pt-1 font-medium">
              <dt>Valor final</dt>
              <dd className="tabular-nums">{formatCurrency(total)}</dd>
            </div>

            {costs.map((entry) => (
              <div key={entry.label} className="flex justify-between">
                <dt className="text-muted-foreground">{entry.label}</dt>
                <dd className="tabular-nums text-rose-600 dark:text-rose-400">
                  - {formatCurrency(entry.value)}
                </dd>
              </div>
            ))}

            <div className="flex justify-between border-t pt-2 text-base font-semibold">
              <dt>Resultado</dt>
              <dd
                className={cn(
                  'tabular-nums',
                  cancelled
                    ? 'text-muted-foreground'
                    : tone === 'positive'
                      ? 'text-emerald-600 dark:text-emerald-400'
                      : tone === 'warning'
                        ? 'text-amber-600 dark:text-amber-400'
                        : 'text-rose-600 dark:text-rose-400',
                )}
              >
                {formatCurrency(result)}
              </dd>
            </div>

            <div className="flex justify-between text-xs text-muted-foreground">
              <dt>Margem sobre o valor final</dt>
              <dd className="tabular-nums">{formatPercent(order.result_percent)}</dd>
            </div>
          </dl>

          {order.notes ? (
            <p className="border-t pt-2 text-xs text-muted-foreground">{order.notes}</p>
          ) : null}

          <p className="border-t pt-2 text-[11px] text-muted-foreground">
            Cada item deste pedido gerou automaticamente uma saída de estoque do tipo VENDA,
            visível em{' '}
            <Link href="/movimentacoes" className="underline underline-offset-2">
              Movimentações
            </Link>
            .
          </p>
        </section>
      </div>
    </>
  )
}
