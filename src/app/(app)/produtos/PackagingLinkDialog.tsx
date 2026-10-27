'use client'

import { Link2 } from 'lucide-react'

import { Field } from '@/components/FormControls'
import { FormDialog } from '@/components/FormDialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { NativeSelect } from '@/components/ui/native-select'
import { formatCurrency, formatNumber } from '@/lib/format'

import { linkProductPackaging } from './actions'
import type { PackagingOption } from './ProductForm'

export type LinkableProductOption = {
  id: string
  name: string
  sku: string | null
  linked_packaging_product_id?: string | null
  linked_packaging_qty?: number | null
}

export function PackagingLinkDialog({
  products,
  packagingOptions,
  defaultProductId,
  defaultPackagingId,
  defaultQty = 1,
  triggerLabel = 'Vincular sacola a produto',
  compact = false,
}: {
  products: LinkableProductOption[]
  packagingOptions: PackagingOption[]
  defaultProductId?: string
  defaultPackagingId?: string
  defaultQty?: number
  triggerLabel?: string
  compact?: boolean
}) {
  return (
    <FormDialog
      trigger={
        compact ? (
          <Button variant="outline" size="xs">
            <Link2 /> {triggerLabel}
          </Button>
        ) : (
          <Button variant="outline" size="sm">
            <Link2 /> {triggerLabel}
          </Button>
        )
      }
      title="Vincular sacola / embalagem ao produto"
      description="Toda vez que o produto escolhido for vendido, o sistema dará baixa automática na sacola vinculada e registrará o gasto de sacolas daquele produto."
      action={linkProductPackaging}
      submitLabel="Salvar vínculo"
    >
      <Field label="Produto de venda" htmlFor="link-prod-id">
        <NativeSelect
          id="link-prod-id"
          name="product_id"
          required
          defaultValue={defaultProductId ?? ''}
        >
          <option value="">Selecione o produto...</option>
          {products.map((prod) => (
            <option key={prod.id} value={prod.id}>
              {prod.sku ? `${prod.sku} — ${prod.name}` : prod.name}
            </option>
          ))}
        </NativeSelect>
      </Field>

      <Field label="Sacola / Embalagem que será descontada na venda" htmlFor="link-bag-id">
        <NativeSelect
          id="link-bag-id"
          name="linked_packaging_product_id"
          defaultValue={defaultPackagingId ?? ''}
        >
          <option value="">Nenhuma (remover vínculo)</option>
          {packagingOptions.map((bag) => (
            <option key={bag.id} value={bag.id}>
              {bag.name}
              {bag.sku ? ` (${bag.sku})` : ''} — Saldo:{' '}
              {formatNumber(bag.stock_balance ?? 0)} un. · Custo:{' '}
              {formatCurrency(bag.unit_cost)}/un.
            </option>
          ))}
        </NativeSelect>
      </Field>

      <Field
        label="Quantidade de sacolas por 1 unidade vendida"
        htmlFor="link-bag-qty"
        hint="Ex.: 1 = desconta 1 sacola a cada 1 unidade vendida do produto"
      >
        <Input
          id="link-bag-qty"
          name="linked_packaging_qty"
          type="number"
          min={1}
          step={1}
          defaultValue={String(defaultQty)}
          className="tabular-nums"
        />
      </Field>
    </FormDialog>
  )
}
