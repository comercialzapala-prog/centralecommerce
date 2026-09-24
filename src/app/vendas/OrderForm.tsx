'use client'

import * as React from 'react'
import { Pencil, Plus, Trash2 } from 'lucide-react'

import { Field, MoneyInput } from '@/components/FormControls'
import { FormDialog } from '@/components/FormDialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { NativeSelect } from '@/components/ui/native-select'
import { Textarea } from '@/components/ui/textarea'
import { resultTone } from '@/lib/finance'
import { formatCurrency, num, parseAmount, round2, todayISO } from '@/lib/format'
import { ORDER_STATUSES, type Channel, type OrderRow, type Product } from '@/lib/types'
import { cn } from '@/lib/utils'

import { createOrder, updateOrder } from './actions'

type ItemDraft = {
  key: string
  product_id: string
  quantity: string
  unit_price: string
  unit_cost: string
}

const EXTRA_COST_FIELDS = [
  { name: 'marketplace_fee', label: 'Taxa do marketplace' },
  { name: 'gateway_fee', label: 'Taxa do gateway' },
  { name: 'tax_amount', label: 'Imposto' },
  { name: 'shipping_cost', label: 'Frete pago pela empresa' },
  { name: 'packaging_cost', label: 'Embalagem' },
  { name: 'marketing_cost', label: 'Marketing atribuído' },
  { name: 'other_costs', label: 'Outros custos' },
] as const

function PreviewRow({
  label,
  value,
  strong,
}: {
  label: string
  value: string
  strong?: boolean
}) {
  return (
    <div className={cn('flex justify-between', strong && 'font-medium')}>
      <span className={strong ? undefined : 'text-muted-foreground'}>{label}</span>
      <span className="tabular-nums">{value}</span>
    </div>
  )
}

function emptyItem(): ItemDraft {
  return {
    key: Math.random().toString(36).slice(2),
    product_id: '',
    quantity: '1',
    unit_price: '',
    unit_cost: '',
  }
}

/**
 * Formulario de pedido (secoes 16 a 19).
 *
 * Na criacao o pedido ja nasce com os itens. Na edicao so o cabecalho e os
 * custos mudam -- os itens sao gerenciados na pagina do pedido, porque cada
 * item carrega junto a sua baixa de estoque.
 */
export function OrderForm({
  channels,
  products,
  order,
  suggestedNumber,
}: {
  channels: Channel[]
  products: Product[]
  order?: OrderRow
  suggestedNumber?: string
}) {
  const editing = Boolean(order)
  const [items, setItems] = React.useState<ItemDraft[]>(() => [emptyItem()])
  const [costs, setCosts] = React.useState<Record<string, string>>(() =>
    Object.fromEntries(
      EXTRA_COST_FIELDS.map((field) => [
        field.name,
        order ? String(order[field.name as keyof OrderRow] ?? '') : '',
      ]),
    ),
  )
  const [discount, setDiscount] = React.useState(order ? String(order.discount_amount) : '')
  const [shipping, setShipping] = React.useState(order ? String(order.shipping_charged) : '')

  const updateItem = (key: string, patch: Partial<ItemDraft>) => {
    setItems((current) =>
      current.map((item) => (item.key === key ? { ...item, ...patch } : item)),
    )
  }

  // Trocar o produto puxa custo e preco do cadastro, mas o usuario pode
  // sobrescrever -- o CMV congelado no item e o que vale para o resultado.
  const pickProduct = (key: string, productId: string) => {
    const product = products.find((item) => item.id === productId)
    updateItem(key, {
      product_id: productId,
      unit_price: product ? String(num(product.sale_price)) : '',
      unit_cost: product ? String(num(product.unit_cost)) : '',
    })
  }

  const itemsGross = items.reduce(
    (sum, item) => sum + (Number(item.quantity) || 0) * (parseAmount(item.unit_price) ?? 0),
    0,
  )
  const itemsCogs = items.reduce(
    (sum, item) => sum + (Number(item.quantity) || 0) * (parseAmount(item.unit_cost) ?? 0),
    0,
  )
  const extraCosts = EXTRA_COST_FIELDS.reduce(
    (sum, field) => sum + (parseAmount(costs[field.name]) ?? 0),
    0,
  )

  const gross = editing ? num(order?.gross_amount) : itemsGross
  const cogs = editing ? num(order?.cogs_amount) : itemsCogs
  const total = round2(gross - (parseAmount(discount) ?? 0) + (parseAmount(shipping) ?? 0))
  const result = round2(total - cogs - extraCosts)
  const tone = resultTone(result, total)

  const payload = JSON.stringify(
    items
      .filter((item) => item.product_id)
      .map((item) => ({
        product_id: item.product_id,
        quantity: Number(item.quantity) || 0,
        unit_price: item.unit_price,
        unit_cost: item.unit_cost,
      })),
  )

  return (
    <FormDialog
      trigger={
        editing ? (
          <Button variant="outline" size="sm">
            <Pencil /> Editar pedido
          </Button>
        ) : (
          <Button size="sm">
            <Plus /> Novo pedido
          </Button>
        )
      }
      title={editing ? `Editar pedido ${order?.order_number}` : 'Novo pedido'}
      action={editing ? updateOrder : createOrder}
      submitLabel={editing ? 'Salvar' : 'Registrar venda'}
      className="sm:max-w-3xl"
    >
      {order ? <input type="hidden" name="id" value={order.id} /> : null}
      {!editing ? <input type="hidden" name="items_json" value={payload} /> : null}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-4">
        <Field label="Número do pedido" htmlFor="ord-number">
          <Input
            id="ord-number"
            name="order_number"
            required
            defaultValue={order?.order_number ?? suggestedNumber ?? ''}
          />
        </Field>

        <Field label="Data" htmlFor="ord-date">
          <Input
            id="ord-date"
            type="date"
            name="order_date"
            required
            defaultValue={order?.order_date?.slice(0, 10) ?? todayISO()}
          />
        </Field>

        <Field label="Canal">
          <NativeSelect name="channel_id" defaultValue={order?.channel_id ?? ''}>
            <option value="">Sem canal</option>
            {channels
              .filter((channel) => channel.active)
              .map((channel) => (
                <option key={channel.id} value={channel.id}>
                  {channel.name}
                </option>
              ))}
          </NativeSelect>
        </Field>

        <Field label="Status">
          <NativeSelect name="status" defaultValue={order?.status ?? 'CONCLUIDO'}>
            {ORDER_STATUSES.map((status) => (
              <option key={status} value={status}>
                {status}
              </option>
            ))}
          </NativeSelect>
        </Field>

        <Field label="Cliente" htmlFor="ord-customer" className="sm:col-span-4">
          <Input
            id="ord-customer"
            name="customer_name"
            defaultValue={order?.customer_name ?? ''}
            placeholder="Opcional"
          />
        </Field>
      </div>

      {!editing ? (
        <section className="space-y-2 rounded-lg border p-3">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-medium">Produtos</h3>
            <Button
              type="button"
              variant="outline"
              size="xs"
              onClick={() => setItems((current) => [...current, emptyItem()])}
            >
              <Plus /> Adicionar item
            </Button>
          </div>

          {items.map((item) => (
            <div key={item.key} className="grid grid-cols-12 items-end gap-2">
              <div className="col-span-12 sm:col-span-5">
                <span className="text-[11px] text-muted-foreground">Produto</span>
                <NativeSelect
                  value={item.product_id}
                  onChange={(event) => pickProduct(item.key, event.target.value)}
                >
                  <option value="">Selecione...</option>
                  {products
                    .filter((product) => product.active || product.id === item.product_id)
                    .map((product) => (
                      <option key={product.id} value={product.id}>
                        {product.sku ? `${product.sku} — ${product.name}` : product.name}
                      </option>
                    ))}
                </NativeSelect>
              </div>

              <div className="col-span-3 sm:col-span-2">
                <span className="text-[11px] text-muted-foreground">Qtd.</span>
                <Input
                  type="number"
                  min={1}
                  step={1}
                  value={item.quantity}
                  onChange={(event) => updateItem(item.key, { quantity: event.target.value })}
                  className="tabular-nums"
                />
              </div>

              <div className="col-span-4 sm:col-span-2">
                <span className="text-[11px] text-muted-foreground">Preço</span>
                <Input
                  inputMode="decimal"
                  value={item.unit_price}
                  onChange={(event) => updateItem(item.key, { unit_price: event.target.value })}
                  className="tabular-nums"
                />
              </div>

              <div className="col-span-4 sm:col-span-2">
                <span className="text-[11px] text-muted-foreground">Custo</span>
                <Input
                  inputMode="decimal"
                  value={item.unit_cost}
                  onChange={(event) => updateItem(item.key, { unit_cost: event.target.value })}
                  className="tabular-nums"
                />
              </div>

              <div className="col-span-1 flex justify-end">
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  aria-label="Remover item"
                  disabled={items.length === 1}
                  onClick={() =>
                    setItems((current) => current.filter((entry) => entry.key !== item.key))
                  }
                >
                  <Trash2 />
                </Button>
              </div>
            </div>
          ))}
        </section>
      ) : (
        <p className="rounded-lg bg-muted/60 px-3 py-2 text-xs text-muted-foreground">
          Os itens deste pedido são editados na página do pedido — cada item carrega junto a baixa
          de estoque.
        </p>
      )}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label="Desconto" htmlFor="ord-discount">
          <MoneyInput
            id="ord-discount"
            name="discount_amount"
            value={discount}
            onChange={setDiscount}
          />
        </Field>

        <Field label="Frete cobrado do cliente" htmlFor="ord-shipping">
          <MoneyInput
            id="ord-shipping"
            name="shipping_charged"
            value={shipping}
            onChange={setShipping}
          />
        </Field>
      </div>

      <section className="space-y-2 rounded-lg border p-3">
        <h3 className="text-sm font-medium">Custos da venda</h3>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          {EXTRA_COST_FIELDS.map((field) => (
            <Field key={field.name} label={field.label} htmlFor={`ord-${field.name}`}>
              <MoneyInput
                id={`ord-${field.name}`}
                name={field.name}
                value={costs[field.name] ?? ''}
                onChange={(value) =>
                  setCosts((current) => ({ ...current, [field.name]: value }))
                }
              />
            </Field>
          ))}
        </div>
        <p className="text-[11px] text-muted-foreground">
          Total de custos da venda:{' '}
          <span className="font-medium tabular-nums">{formatCurrency(extraCosts)}</span>
        </p>
      </section>

      <Field label="Observações" htmlFor="ord-notes">
        <Textarea id="ord-notes" name="notes" rows={2} defaultValue={order?.notes ?? ''} />
      </Field>

      {/* Secao 19: resultado do pedido em tempo real, verde/amarelo/vermelho. */}
      <div className="rounded-lg border bg-muted/40 p-3 text-sm">
        <PreviewRow label="Receita bruta" value={formatCurrency(gross)} />
        <PreviewRow label="Desconto" value={`- ${formatCurrency(parseAmount(discount) ?? 0)}`} />
        <PreviewRow
          label="Frete cobrado"
          value={`+ ${formatCurrency(parseAmount(shipping) ?? 0)}`}
        />
        <PreviewRow label="Valor final" value={formatCurrency(total)} strong />
        <PreviewRow label="CMV" value={`- ${formatCurrency(cogs)}`} />
        <PreviewRow label="Custos da venda" value={`- ${formatCurrency(extraCosts)}`} />
        <div className="mt-1 flex justify-between border-t pt-1 font-medium">
          <span>Resultado do pedido</span>
          <span
            className={cn(
              'tabular-nums',
              tone === 'positive' && 'text-emerald-600 dark:text-emerald-400',
              tone === 'warning' && 'text-amber-600 dark:text-amber-400',
              tone === 'negative' && 'text-rose-600 dark:text-rose-400',
            )}
          >
            {formatCurrency(result)}
          </span>
        </div>
      </div>
    </FormDialog>
  )
}
