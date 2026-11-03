'use client'

import * as React from 'react'
import { Link2, PackageCheck, ShoppingBag } from 'lucide-react'

import { Field } from '@/components/FormControls'
import { FormDialog } from '@/components/FormDialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { NativeSelect } from '@/components/ui/native-select'
import { formatCurrency, formatNumber, num } from '@/lib/format'

import { linkProductPackaging } from './actions'
import type { PackagingOption } from './ProductForm'

export type LinkableProductOption = {
  id: string
  name: string
  sku: string | null
  sale_price?: number | string
  unit_cost?: number | string
  gross_weight_grams?: number | null
  shipping_cost?: number | string
  linked_packaging_product_id?: string | null
  linked_packaging_name?: string | null
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
  const [selectedProdId, setSelectedProdId] = React.useState(defaultProductId ?? '')
  const [selectedBagId, setSelectedBagId] = React.useState(defaultPackagingId ?? '')
  const [qty, setQty] = React.useState(String(defaultQty))

  const selectedProduct = React.useMemo(
    () => products.find((p) => p.id === selectedProdId),
    [products, selectedProdId],
  )
  const selectedBag = React.useMemo(
    () => packagingOptions.find((b) => b.id === selectedBagId),
    [packagingOptions, selectedBagId],
  )

  const bagTotalForOneSale = num(selectedBag?.unit_cost) * Math.max(1, Number(qty) || 1)

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
      description="A sacola puxa automaticamente o preço, o peso, o CMV e o frete do produto vinculado, adicionando apenas o custo da sacola e descontando seu saldo a cada venda."
      action={linkProductPackaging}
      submitLabel="Salvar vínculo"
    >
      <Field label="Produto de venda" htmlFor="link-prod-id">
        <NativeSelect
          id="link-prod-id"
          name="product_id"
          required
          value={selectedProdId}
          onChange={(e) => setSelectedProdId(e.target.value)}
        >
          <option value="">Selecione o produto...</option>
          {products.map((prod) => (
            <option key={prod.id} value={prod.id}>
              {prod.sku ? `${prod.sku} — ${prod.name}` : prod.name}
            </option>
          ))}
        </NativeSelect>
      </Field>

      {selectedProduct ? (
        <div className="rounded-xl border border-sky-500/25 bg-sky-500/5 p-3 text-xs space-y-2">
          <div className="flex items-center gap-1.5 font-semibold text-sky-600 dark:text-sky-400">
            <PackageCheck className="size-3.5" />
            Dados puxados automaticamente do produto:
          </div>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <div className="rounded-lg border bg-background/70 p-2">
              <div className="text-[10px] text-muted-foreground">Preço de venda</div>
              <div className="font-semibold tabular-nums">
                {formatCurrency(selectedProduct.sale_price ?? 0)}
              </div>
            </div>
            <div className="rounded-lg border bg-background/70 p-2">
              <div className="text-[10px] text-muted-foreground">CMV do produto</div>
              <div className="font-semibold tabular-nums">
                {formatCurrency(selectedProduct.unit_cost ?? 0)}
              </div>
            </div>
            <div className="rounded-lg border bg-background/70 p-2">
              <div className="text-[10px] text-muted-foreground">Peso c/ emb.</div>
              <div className="font-semibold tabular-nums">
                {selectedProduct.gross_weight_grams
                  ? `${formatNumber(selectedProduct.gross_weight_grams)} g`
                  : 'No cadastro'}
              </div>
            </div>
            <div className="rounded-lg border bg-background/70 p-2">
              <div className="text-[10px] text-muted-foreground">Frete padrão</div>
              <div className="font-semibold tabular-nums">
                {formatCurrency(selectedProduct.shipping_cost ?? 0)}
              </div>
            </div>
          </div>
        </div>
      ) : null}

      <Field label="Sacola / Embalagem que será descontada na venda" htmlFor="link-bag-id">
        <NativeSelect
          id="link-bag-id"
          name="linked_packaging_product_id"
          value={selectedBagId}
          onChange={(e) => setSelectedBagId(e.target.value)}
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
          value={qty}
          onChange={(e) => setQty(e.target.value)}
          className="tabular-nums"
        />
      </Field>

      {selectedProduct && selectedBag ? (
        <div className="flex items-center justify-between rounded-lg border bg-muted/30 px-3 py-2 text-xs">
          <span className="flex items-center gap-1.5 text-muted-foreground">
            <ShoppingBag className="size-3.5 text-amber-600 dark:text-amber-400" />
            Custo da sacola somado por venda deste produto:
          </span>
          <strong className="tabular-nums text-amber-600 dark:text-amber-400">
            + {formatCurrency(bagTotalForOneSale)} / venda
          </strong>
        </div>
      ) : null}
    </FormDialog>
  )
}
