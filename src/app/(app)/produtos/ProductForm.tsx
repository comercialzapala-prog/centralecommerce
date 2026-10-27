'use client'

import { Pencil, Plus } from 'lucide-react'

import { Field, MoneyInput } from '@/components/FormControls'
import { FormDialog } from '@/components/FormDialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { num } from '@/lib/format'
import type { Product, ProductStats } from '@/lib/types'

import { createProduct, updateProduct } from './actions'

export function ProductForm({ product }: { product?: Product | ProductStats }) {
  const id = product ? ('product_id' in product ? product.product_id : product.id) : null
  const isEditing = Boolean(id)

  return (
    <FormDialog
      trigger={
        isEditing ? (
          <Button variant="ghost" size="icon-sm" title="Editar produto">
            <Pencil />
          </Button>
        ) : (
          <Button size="sm">
            <Plus /> Novo produto
          </Button>
        )
      }
      title={isEditing ? 'Editar produto' : 'Novo produto'}
      description="O CMV, o frete unitário e as taxas padrão do produto são aplicados automaticamente nos pedidos de venda."
      action={isEditing ? updateProduct : createProduct}
      submitLabel={isEditing ? 'Salvar alterações' : 'Cadastrar produto'}
      className="sm:max-w-3xl"
    >
      {id ? <input type="hidden" name="id" value={id} /> : null}

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Field label="Nome do produto" htmlFor="prod-name" className="sm:col-span-2">
          <Input
            id="prod-name"
            name="name"
            required
            defaultValue={product?.name ?? ''}
            placeholder="Ex.: CHALEIRA ELETRICA INOX 1,8L - 220V"
          />
        </Field>

        <Field label="SKU (código interno)" htmlFor="prod-sku">
          <Input
            id="prod-sku"
            name="sku"
            defaultValue={product?.sku ?? ''}
            placeholder="Ex.: 78899"
          />
        </Field>
      </div>

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
            defaultValue={product?.category ?? ''}
            placeholder="Ex.: Linha Eletroportáteis Chaleira Inox"
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

        <Field label="Capacidade" htmlFor="prod-capacity">
          <Input
            id="prod-capacity"
            name="capacity"
            defaultValue={product?.capacity ?? ''}
            placeholder="Ex.: 1,8 L"
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

      <div className="rounded-md border bg-muted/20 p-3 space-y-3">
        <p className="text-xs font-medium text-muted-foreground">
          Custos e taxas unitárias (somados automaticamente em cima do produto quando vendido no ERP)
        </p>

        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          <Field label="Custo unitário / CMV (R$)" htmlFor="prod-cost">
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
              defaultValue={product?.shipping_cost !== undefined ? String(num(product.shipping_cost)) : ''}
            />
          </Field>

          <Field label="Embalagem unitária (R$)" htmlFor="prod-packaging">
            <MoneyInput
              id="prod-packaging"
              name="packaging_cost"
              defaultValue={product?.packaging_cost !== undefined ? String(num(product.packaging_cost)) : ''}
            />
          </Field>

          <Field label="Comissão padrão (%)" htmlFor="prod-mkt-pct" hint="Ex.: 15 para 15%">
            <MoneyInput
              id="prod-mkt-pct"
              name="marketplace_percent"
              defaultValue={
                product?.marketplace_percent !== undefined ? String(num(product.marketplace_percent)) : ''
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
          placeholder="Descrição completa, diferenciais e cuidados do produto..."
        />
      </Field>
    </FormDialog>
  )
}
