'use client'

import * as React from 'react'
import { Plus } from 'lucide-react'

import { Field, MoneyInput } from '@/components/FormControls'
import { FormDialog } from '@/components/FormDialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { NativeSelect } from '@/components/ui/native-select'
import { num } from '@/lib/format'
import type { Product } from '@/lib/types'

import { addOrderItem } from './actions'

export function AddOrderItemForm({
  orderId,
  products,
}: {
  orderId: string
  products: Product[]
}) {
  const [productId, setProductId] = React.useState('')
  const product = products.find((item) => item.id === productId)

  return (
    <FormDialog
      trigger={
        <Button variant="outline" size="sm">
          <Plus /> Adicionar item
        </Button>
      }
      title="Adicionar item ao pedido"
      description="Adicionar o item baixa o estoque do produto automaticamente."
      action={addOrderItem}
      submitLabel="Adicionar"
    >
      <input type="hidden" name="order_id" value={orderId} />

      <Field label="Produto">
        <NativeSelect
          name="product_id"
          required
          value={productId}
          onChange={(event) => setProductId(event.target.value)}
        >
          <option value="">Selecione...</option>
          {products
            .filter((item) => item.active)
            .map((item) => (
              <option key={item.id} value={item.id}>
                {item.sku ? `${item.sku} — ${item.name}` : item.name}
              </option>
            ))}
        </NativeSelect>
      </Field>

      <div className="grid grid-cols-3 gap-3">
        <Field label="Quantidade" htmlFor="item-qty">
          <Input
            id="item-qty"
            name="quantity"
            type="number"
            min={1}
            step={1}
            required
            defaultValue="1"
            className="tabular-nums"
          />
        </Field>

        <Field label="Preço unitário" htmlFor="item-price">
          <MoneyInput
            id="item-price"
            name="unit_price"
            key={`price-${productId}`}
            defaultValue={product ? String(num(product.sale_price)) : ''}
          />
        </Field>

        <Field label="Custo unitário" htmlFor="item-cost">
          <MoneyInput
            id="item-cost"
            name="unit_cost"
            key={`cost-${productId}`}
            defaultValue={product ? String(num(product.unit_cost)) : ''}
          />
        </Field>
      </div>

      <p className="text-xs text-muted-foreground">
        O custo é congelado no item: mudar o custo do produto depois não reescreve o CMV de vendas
        que já aconteceram.
      </p>
    </FormDialog>
  )
}
