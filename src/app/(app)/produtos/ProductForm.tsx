'use client'

import * as React from 'react'
import { PackagePlus, Pencil, Plus } from 'lucide-react'

import { Field, MoneyInput } from '@/components/FormControls'
import { FormDialog } from '@/components/FormDialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { NativeSelect } from '@/components/ui/native-select'
import { Textarea } from '@/components/ui/textarea'
import { formatCurrency, formatNumber, num } from '@/lib/format'
import type { Product, ProductItemKind, ProductStats } from '@/lib/types'

import { createProduct, updateProduct } from './actions'

export type PackagingOption = {
  id: string
  name: string
  sku: string | null
  unit_cost: number | string
  stock_balance?: number | string
}

export function ProductForm({
  product,
  packagingOptions = [],
  defaultItemKind = 'PRODUTO',
  triggerLabel,
}: {
  product?: Product | ProductStats
  packagingOptions?: PackagingOption[]
  defaultItemKind?: ProductItemKind
  triggerLabel?: string
}) {
  const id = product ? ('product_id' in product ? product.product_id : product.id) : null
  const isEditing = Boolean(id)

  const initialKind: ProductItemKind = product?.item_kind ?? defaultItemKind
  const [itemKind, setItemKind] = React.useState<ProductItemKind>(initialKind)

  const selectableBags = React.useMemo(
    () => packagingOptions.filter((opt) => opt.id !== id),
    [packagingOptions, id],
  )

  return (
    <FormDialog
      trigger={
        isEditing ? (
          <Button variant="ghost" size="icon-sm" title="Editar cadastro">
            <Pencil />
          </Button>
        ) : defaultItemKind === 'INSUMO' ? (
          <Button variant="outline" size="sm">
            <PackagePlus /> {triggerLabel ?? 'Nova sacola / embalagem'}
          </Button>
        ) : (
          <Button size="sm">
            <Plus /> {triggerLabel ?? 'Novo produto'}
          </Button>
        )
      }
      title={
        isEditing
          ? `Editar ${itemKind === 'INSUMO' ? 'sacola / embalagem' : 'produto'}`
          : itemKind === 'INSUMO'
            ? 'Nova sacola / embalagem'
            : 'Novo produto'
      }
      description={
        itemKind === 'INSUMO'
          ? 'Cadastre sacolas (P, M, G) ou insumos de expedição. Ao vincular a um produto, cada venda desconta automaticamente o estoque da sacola e calcula o gasto por produto.'
          : 'O CMV, o frete unitário, as taxas padrão e a sacola vinculada são aplicados e baixados automaticamente nos pedidos de venda.'
      }
      action={isEditing ? updateProduct : createProduct}
      submitLabel={isEditing ? 'Salvar alterações' : 'Cadastrar'}
      className="sm:max-w-3xl"
    >
      {id ? <input type="hidden" name="id" value={id} /> : null}

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-4">
        <Field label="Tipo do cadastro" htmlFor="prod-kind">
          <NativeSelect
            id="prod-kind"
            name="item_kind"
            value={itemKind}
            onChange={(e) => setItemKind(e.target.value === 'INSUMO' ? 'INSUMO' : 'PRODUTO')}
          >
            <option value="PRODUTO">Produto de Venda</option>
            <option value="INSUMO">Sacola / Embalagem (Insumo)</option>
          </NativeSelect>
        </Field>

        <Field
          label={itemKind === 'INSUMO' ? 'Nome da sacola / embalagem' : 'Nome do produto'}
          htmlFor="prod-name"
          className="sm:col-span-2"
        >
          <Input
            id="prod-name"
            name="name"
            required
            defaultValue={product?.name ?? ''}
            placeholder={
              itemKind === 'INSUMO'
                ? 'Ex.: SACOLA P, SACOLA M, SACOLA G'
                : 'Ex.: CHALEIRA ELETRICA INOX 1,8L - 220V'
            }
          />
        </Field>

        <Field label="SKU (código interno)" htmlFor="prod-sku">
          <Input
            id="prod-sku"
            name="sku"
            defaultValue={product?.sku ?? ''}
            placeholder={itemKind === 'INSUMO' ? 'Ex.: SAC-P' : 'Ex.: 78899'}
          />
        </Field>
      </div>

      {!isEditing ? (
        <div className="rounded-xl border border-emerald-500/25 bg-emerald-500/5 p-3">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <Field
              label="Estoque inicial (unidades)"
              htmlFor="prod-init-stock"
              hint="Gera automaticamente a entrada inicial no estoque"
            >
              <Input
                id="prod-init-stock"
                name="initial_stock"
                type="number"
                min={0}
                step={1}
                defaultValue={itemKind === 'INSUMO' ? '100' : ''}
                placeholder="Ex.: 100"
                className="tabular-nums"
              />
            </Field>
            <div className="flex items-center text-xs text-muted-foreground sm:col-span-2">
              {itemKind === 'INSUMO'
                ? 'Exemplo: informe 100 unidades para já iniciar o saldo da sacola com 100 disponíveis para baixa automática nas vendas.'
                : 'Opcional: se informar uma quantidade maior que zero, o saldo inicial já entra automaticamente em Movimentações.'}
            </div>
          </div>
        </div>
      ) : null}

      {itemKind === 'PRODUTO' ? (
        <div className="rounded-xl border border-sky-500/30 bg-sky-500/5 p-3.5 space-y-2.5">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-sky-600 dark:text-sky-400">
              Vínculo inteligente de Sacola / Embalagem
            </p>
            <p className="text-xs text-muted-foreground">
              Quando este produto for vendido, o sistema descontará automaticamente a sacola escolhida do estoque e somará o gasto dela neste produto.
            </p>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <Field
              label="Sacola / Embalagem usada na venda"
              htmlFor="prod-linked-bag"
              className="sm:col-span-2"
            >
              <NativeSelect
                id="prod-linked-bag"
                name="linked_packaging_product_id"
                defaultValue={product?.linked_packaging_product_id ?? ''}
              >
                <option value="">Nenhuma sacola vinculada</option>
                {selectableBags.map((bag) => (
                  <option key={bag.id} value={bag.id}>
                    {bag.name}
                    {bag.sku ? ` (${bag.sku})` : ''} — Estoque:{' '}
                    {formatNumber(bag.stock_balance ?? 0)} un. · Custo:{' '}
                    {formatCurrency(bag.unit_cost)}/un.
                  </option>
                ))}
              </NativeSelect>
            </Field>

            <Field
              label="Qtd. de sacolas por 1 un. vendida"
              htmlFor="prod-linked-bag-qty"
              hint="Padrão: 1 sacola por produto"
            >
              <Input
                id="prod-linked-bag-qty"
                name="linked_packaging_qty"
                type="number"
                min={1}
                step={1}
                defaultValue={String(product?.linked_packaging_qty ?? 1)}
                className="tabular-nums"
              />
            </Field>
          </div>
        </div>
      ) : null}

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-4">
        <Field label="EAN / GTIN" htmlFor="prod-ean">
          <Input
            id="prod-ean"
            name="ean"
            defaultValue={product?.ean ?? ''}
            placeholder="Ex.: 7899911228381"
          />
        </Field>

        <Field label="ASIN (Amazon)" htmlFor="prod-asin">
          <Input
            id="prod-asin"
            name="asin"
            defaultValue={product?.asin ?? ''}
            placeholder="Ex.: B0F9KJSLXX"
          />
        </Field>

        <Field label="NCM" htmlFor="prod-ncm">
          <Input
            id="prod-ncm"
            name="ncm"
            defaultValue={product?.ncm ?? ''}
            placeholder="Ex.: 8516.10.00"
          />
        </Field>

        <Field label="Ref. Fabricante / Petrus" htmlFor="prod-supp-sku">
          <Input
            id="prod-supp-sku"
            name="supplier_sku"
            defaultValue={product?.supplier_sku ?? ''}
            placeholder="Ex.: 82543"
          />
        </Field>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-4">
        <Field label="Categoria / Linha" htmlFor="prod-cat" className="sm:col-span-2">
          <Input
            id="prod-cat"
            name="category"
            defaultValue={
              product?.category ?? (itemKind === 'INSUMO' ? 'Embalagens e Sacolas' : '')
            }
            placeholder={
              itemKind === 'INSUMO'
                ? 'Ex.: Embalagens e Sacolas'
                : 'Ex.: Linha Eletroportáteis Chaleira Inox'
            }
          />
        </Field>

        <Field label="Voltagem" htmlFor="prod-voltage">
          <Input
            id="prod-voltage"
            name="voltage"
            defaultValue={product?.voltage ?? ''}
            placeholder="Ex.: 220V ou 127V"
          />
        </Field>

        <Field label="Tamanho / Capacidade" htmlFor="prod-capacity">
          <Input
            id="prod-capacity"
            name="capacity"
            defaultValue={product?.capacity ?? ''}
            placeholder={itemKind === 'INSUMO' ? 'Ex.: Tamanho P / M / G' : 'Ex.: 1,8 L'}
          />
        </Field>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Field label="Peso líquido (g)" htmlFor="prod-net-weight">
          <Input
            id="prod-net-weight"
            name="net_weight_grams"
            type="number"
            min={0}
            step={1}
            defaultValue={product?.net_weight_grams ? String(product.net_weight_grams) : ''}
            placeholder="Ex.: 610"
            className="tabular-nums"
          />
        </Field>

        <Field label="Peso c/ embalagem (g)" htmlFor="prod-gross-weight">
          <Input
            id="prod-gross-weight"
            name="gross_weight_grams"
            type="number"
            min={0}
            step={1}
            defaultValue={product?.gross_weight_grams ? String(product.gross_weight_grams) : ''}
            placeholder="Ex.: 816"
            className="tabular-nums"
          />
        </Field>

        <Field label="Garantia (meses)" htmlFor="prod-warranty">
          <Input
            id="prod-warranty"
            name="warranty_months"
            type="number"
            min={0}
            step={1}
            defaultValue={product?.warranty_months ? String(product.warranty_months) : ''}
            placeholder="Ex.: 3"
            className="tabular-nums"
          />
        </Field>

        <Field label="País de origem" htmlFor="prod-origin">
          <Input
            id="prod-origin"
            name="origin_country"
            defaultValue={product?.origin_country ?? ''}
            placeholder="Ex.: China"
          />
        </Field>
      </div>

      <div className="rounded-xl border bg-muted/20 p-3.5 space-y-3">
        <p className="text-xs font-medium text-muted-foreground">
          {itemKind === 'INSUMO'
            ? 'Custo unitário da sacola / embalagem (multiplicado automaticamente em cada produto que usar esta sacola)'
            : 'Custos e taxas unitárias (somados automaticamente em cima do produto quando vendido no ERP)'}
        </p>

        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          <Field
            label={
              itemKind === 'INSUMO'
                ? 'Custo unitário da sacola (R$)'
                : 'Custo unitário / CMV (R$)'
            }
            htmlFor="prod-cost"
          >
            <MoneyInput
              id="prod-cost"
              name="unit_cost"
              defaultValue={product ? String(num(product.unit_cost)) : ''}
            />
          </Field>

          <Field label="Preço de venda (R$)" htmlFor="prod-price">
            <MoneyInput
              id="prod-price"
              name="sale_price"
              defaultValue={product ? String(num(product.sale_price)) : ''}
            />
          </Field>

          <Field
            label="Frete unitário padrão (R$)"
            htmlFor="prod-shipping"
            hint="Multiplicado pela qtd. vendida no pedido"
          >
            <MoneyInput
              id="prod-shipping"
              name="shipping_cost"
              defaultValue={
                product?.shipping_cost !== undefined ? String(num(product.shipping_cost)) : ''
              }
            />
          </Field>

          <Field
            label="Embalagem extra fixa (R$)"
            htmlFor="prod-packaging"
            hint="Se 0, usa o custo da sacola vinculada"
          >
            <MoneyInput
              id="prod-packaging"
              name="packaging_cost"
              defaultValue={
                product?.packaging_cost !== undefined ? String(num(product.packaging_cost)) : ''
              }
            />
          </Field>

          <Field label="Comissão padrão (%)" htmlFor="prod-mkt-pct" hint="Ex.: 15 para 15%">
            <MoneyInput
              id="prod-mkt-pct"
              name="marketplace_percent"
              defaultValue={
                product?.marketplace_percent !== undefined
                  ? String(num(product.marketplace_percent))
                  : ''
              }
            />
          </Field>

          <Field label="Imposto NF (%)" htmlFor="prod-tax-pct" hint="Ex.: 6 para 6%">
            <MoneyInput
              id="prod-tax-pct"
              name="tax_percent"
              defaultValue={product?.tax_percent !== undefined ? String(num(product.tax_percent)) : ''}
            />
          </Field>
        </div>
      </div>

      <Field label="Descrição técnica / observações" htmlFor="prod-desc">
        <Textarea
          id="prod-desc"
          name="description"
          rows={2}
          defaultValue={product?.description ?? ''}
          placeholder="Descrição completa, diferenciais e cuidados..."
        />
      </Field>
    </FormDialog>
  )
}
