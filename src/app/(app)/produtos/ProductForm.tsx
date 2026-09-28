'use client'

import { Pencil, Plus } from 'lucide-react'

import { Field, MoneyInput } from '@/components/FormControls'
import { FormDialog } from '@/components/FormDialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import type { ProductStats } from '@/lib/types'

import { createProduct, updateProduct } from './actions'

export function ProductForm({ product }: { product?: ProductStats }) {
  const editing = Boolean(product)

  return (
    <FormDialog
      trigger={
        editing ? (
          <Button variant="outline" size="sm">
            <Pencil /> Editar
          </Button>
        ) : (
          <Button size="sm">
            <Plus /> Novo produto
          </Button>
        )
      }
      title={editing ? `Editar ${product?.name}` : 'Novo produto'}
      action={editing ? updateProduct : createProduct}
    >
      {product ? <input type="hidden" name="id" value={product.product_id} /> : null}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label="Nome" htmlFor="prod-name" className="sm:col-span-2">
          <Input
            id="prod-name"
            name="name"
            required
            autoFocus
            defaultValue={product?.name ?? ''}
          />
        </Field>

        <Field label="SKU" htmlFor="prod-sku">
          <Input id="prod-sku" name="sku" defaultValue={product?.sku ?? ''} />
        </Field>

        <Field label="Categoria" htmlFor="prod-category">
          <Input
            id="prod-category"
            name="category"
            defaultValue={product?.category ?? ''}
            placeholder="Ex.: Acessórios"
          />
        </Field>

        <Field
          label="Custo unitário"
          htmlFor="prod-cost"
          hint="Entra no CMV de cada venda deste produto."
        >
          <MoneyInput
            id="prod-cost"
            name="unit_cost"
            defaultValue={product ? String(product.unit_cost) : ''}
          />
        </Field>

        <Field label="Preço de venda" htmlFor="prod-price" hint="Sugestão preenchida no pedido.">
          <MoneyInput
            id="prod-price"
            name="sale_price"
            defaultValue={product ? String(product.sale_price) : ''}
          />
        </Field>
      </div>
    </FormDialog>
  )
}
