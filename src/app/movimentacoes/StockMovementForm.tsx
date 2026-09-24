'use client'

import * as React from 'react'
import { Plus } from 'lucide-react'

import { Field } from '@/components/FormControls'
import { FormDialog } from '@/components/FormDialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { NativeSelect } from '@/components/ui/native-select'
import { Textarea } from '@/components/ui/textarea'
import { todayISO } from '@/lib/format'
import { STOCK_MOVEMENT_META, STOCK_MOVEMENT_TYPES, type Product, type StockMovementType } from '@/lib/types'

import { createStockMovement } from './actions'

const TYPE_HINT: Record<StockMovementType, string> = {
  ENTRADA: 'Soma ao estoque. Use para compra e reposição.',
  VENDA: 'Subtrai do estoque. Vendas lançadas em Vendas já geram esta saída sozinhas — use aqui só para venda fora do módulo de pedidos.',
  DEVOLUCAO: 'Soma de volta ao estoque.',
  PERDA: 'Subtrai do estoque. Item perdido.',
  AVARIA: 'Subtrai do estoque. Item danificado.',
  AJUSTE: 'Acerto de inventário. Único tipo que aceita quantidade negativa.',
}

export function StockMovementForm({
  products,
  defaultProductId,
}: {
  products: Product[]
  defaultProductId?: string
}) {
  const [type, setType] = React.useState<StockMovementType>('ENTRADA')

  return (
    <FormDialog
      trigger={
        <Button size="sm">
          <Plus /> Nova movimentação
        </Button>
      }
      title="Nova movimentação de estoque"
      description="Saída de mercadoria é diferente de saída financeira: aqui é quantidade, não dinheiro."
      action={createStockMovement}
      submitLabel="Registrar"
    >
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label="Produto" className="sm:col-span-2">
          <NativeSelect name="product_id" required defaultValue={defaultProductId ?? ''}>
            <option value="">Selecione...</option>
            {products
              .filter((product) => product.active || product.id === defaultProductId)
              .map((product) => (
                <option key={product.id} value={product.id}>
                  {product.sku ? `${product.sku} — ${product.name}` : product.name}
                </option>
              ))}
          </NativeSelect>
        </Field>

        <Field label="Tipo" hint={TYPE_HINT[type]} className="sm:col-span-2">
          <NativeSelect
            name="type"
            value={type}
            onChange={(event) => setType(event.target.value as StockMovementType)}
          >
            {STOCK_MOVEMENT_TYPES.map((item) => (
              <option key={item} value={item}>
                {STOCK_MOVEMENT_META[item].label}
              </option>
            ))}
          </NativeSelect>
        </Field>

        <Field label="Quantidade" htmlFor="sm-qty">
          <Input
            id="sm-qty"
            name="quantity"
            type="number"
            step="1"
            required
            defaultValue="1"
            min={type === 'AJUSTE' ? undefined : 1}
            className="tabular-nums"
          />
        </Field>

        <Field label="Data" htmlFor="sm-date">
          <Input
            id="sm-date"
            type="date"
            name="movement_date"
            required
            defaultValue={todayISO()}
          />
        </Field>

        <Field label="Motivo" htmlFor="sm-reason" className="sm:col-span-2">
          <Input
            id="sm-reason"
            name="reason"
            placeholder="Ex.: recebimento do fornecedor"
          />
        </Field>

        <Field label="Observações" htmlFor="sm-notes" className="sm:col-span-2">
          <Textarea id="sm-notes" name="notes" rows={2} />
        </Field>
      </div>
    </FormDialog>
  )
}
