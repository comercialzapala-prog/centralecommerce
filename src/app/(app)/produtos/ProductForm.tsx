'use client'

import * as React from 'react'
import { PackageCheck, PackagePlus, Pencil, Plus } from 'lucide-react'

import { Field, MoneyInput, PercentInput } from '@/components/FormControls'
import { FormDialog } from '@/components/FormDialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { NativeSelect } from '@/components/ui/native-select'
import { Textarea } from '@/components/ui/textarea'
import { formatCurrency, formatNumber, num } from '@/lib/format'
import type { Product, ProductItemKind, ProductStats } from '@/lib/types'

import { createProduct, updateProduct } from './actions'
import type { LinkableProductOption } from './PackagingLinkDialog'

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
  linkableProducts = [],
  defaultItemKind = 'PRODUTO',
  triggerLabel,
}: {
  product?: Product | ProductStats
  packagingOptions?: PackagingOption[]
  linkableProducts?: LinkableProductOption[]
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

  const initiallyLinkedIds = React.useMemo(
    () =>
      id
        ? linkableProducts
            .filter((p) => p.linked_packaging_product_id === id)
            .map((p) => p.id)
        : [],
    [linkableProducts, id],
  )

  const [selectedProdIds, setSelectedProdIds] = React.useState<string[]>(initiallyLinkedIds)

  const toggleProductLink = (prodId: string) => {
    setSelectedProdIds((prev) =>
      prev.includes(prodId) ? prev.filter((item) => item !== prodId) : [...prev, prodId],
    )
  }

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
          ? 'Cadastro enxuto: informe apenas o nome, o saldo e o custo unitário da sacola. Preço de venda, peso, frete e impostos são puxados automaticamente do produto vinculado.'
          : 'O CMV, o frete unitário, as taxas padrão e a sacola vinculada são aplicados e baixados automaticamente nos pedidos de venda.'
      }
      action={isEditing ? updateProduct : createProduct}
      submitLabel={
        isEditing
          ? 'Salvar alterações'
          : itemKind === 'INSUMO'
            ? 'Cadastrar sacola'
            : 'Cadastrar produto'
      }
      className={itemKind === 'INSUMO' ? 'sm:max-w-xl' : 'sm:max-w-3xl'}
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
            <option value="INSUMO">Sacola / Embalagem</option>
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

        <Field label="SKU (código)" htmlFor="prod-sku">
          <Input
            id="prod-sku"
            name="sku"
            defaultValue={product?.sku ?? ''}
            placeholder={itemKind === 'INSUMO' ? 'Ex.: SAC-P' : 'Ex.: 78899'}
          />
        </Field>
      </div>

      {itemKind === 'INSUMO' ? (
        <>
          <input type="hidden" name="category" value={product?.category ?? 'Embalagens e Sacolas'} />

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3 rounded-xl border bg-muted/20 p-3.5">
            <Field
              label="Custo unitário da sacola (R$)"
              htmlFor="prod-cost"
              hint="Somado no produto a cada venda"
            >
              <MoneyInput
                id="prod-cost"
                name="unit_cost"
                defaultValue={product ? String(num(product.unit_cost)) : ''}
              />
            </Field>

            <Field
              label="Tamanho / Medida"
              htmlFor="prod-capacity"
              hint="Opcional (P, M, G ou medidas)"
            >
              <Input
                id="prod-capacity"
                name="capacity"
                defaultValue={product?.capacity ?? ''}
                placeholder="Ex.: Tamanho P / M / G"
              />
            </Field>

            {!isEditing ? (
              <Field
                label="Estoque inicial (un.)"
                htmlFor="prod-init-stock"
                hint="Saldo inicial p/ baixa automática"
              >
                <Input
                  id="prod-init-stock"
                  name="initial_stock"
                  type="number"
                  min={0}
                  step={1}
                  defaultValue="100"
                  placeholder="Ex.: 100"
                  className="tabular-nums"
                />
              </Field>
            ) : (
              <Field label="Observação curta" htmlFor="prod-desc" hint="Opcional">
                <Input
                  id="prod-desc"
                  name="description"
                  defaultValue={product?.description ?? ''}
                  placeholder="Ex.: Pacote c/ 100 un."
                />
              </Field>
            )}
          </div>

          {linkableProducts.length > 0 ? (
            <div className="rounded-xl border border-sky-500/25 bg-sky-500/5 p-3.5 space-y-2.5">
              <input type="hidden" name="has_linked_products_picker" value="true" />
              {initiallyLinkedIds.map((prevId) => (
                <input
                  key={`prev-${prevId}`}
                  type="hidden"
                  name="previously_linked_product_ids"
                  value={prevId}
                />
              ))}

              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="flex items-center gap-1.5 text-xs font-semibold text-sky-600 dark:text-sky-400">
                    <PackageCheck className="size-3.5" />
                    Vincular aos produtos (puxa valores e pesos automaticamente)
                  </p>
                  <p className="text-[11px] text-muted-foreground">
                    Marque os produtos que usam esta sacola. Preço, CMV, peso e frete já vêm do cadastro de cada produto.
                  </p>
                </div>
                <span className="shrink-0 rounded-full bg-sky-500/15 px-2 py-0.5 text-[11px] font-semibold text-sky-600 dark:text-sky-400 tabular-nums">
                  {selectedProdIds.length} vinculado(s)
                </span>
              </div>

              <div className="max-h-52 overflow-y-auto divide-y rounded-lg border bg-background">
                {linkableProducts.map((prod) => {
                  const checked = selectedProdIds.includes(prod.id)
                  const otherBagName =
                    prod.linked_packaging_product_id &&
                    prod.linked_packaging_product_id !== id
                      ? prod.linked_packaging_name
                      : null

                  return (
                    <label
                      key={prod.id}
                      className="flex cursor-pointer items-center justify-between gap-3 px-3 py-2 text-xs hover:bg-muted/40"
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        <input
                          type="checkbox"
                          name="linked_product_ids"
                          value={prod.id}
                          checked={checked}
                          onChange={() => toggleProductLink(prod.id)}
                          className="size-4 rounded border-input accent-sky-600"
                        />
                        <div className="min-w-0">
                          <div className="truncate font-medium text-foreground">
                            {prod.sku ? `${prod.sku} — ` : ''}
                            {prod.name}
                          </div>
                          <div className="flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground tabular-nums">
                            <span>Preço: {formatCurrency(prod.sale_price ?? 0)}</span>
                            <span>· CMV: {formatCurrency(prod.unit_cost ?? 0)}</span>
                            {prod.gross_weight_grams ? (
                              <span>· Peso: {formatNumber(prod.gross_weight_grams)}g</span>
                            ) : null}
                            {num(prod.shipping_cost) > 0 ? (
                              <span>· Frete: {formatCurrency(prod.shipping_cost ?? 0)}</span>
                            ) : null}
                          </div>
                        </div>
                      </div>
                      {otherBagName && !checked ? (
                        <span className="shrink-0 rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">
                          Usa: {otherBagName}
                        </span>
                      ) : null}
                    </label>
                  )
                })}
              </div>
            </div>
          ) : null}
        </>
      ) : (
        <>
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
                    defaultValue=""
                    placeholder="Ex.: 100"
                    className="tabular-nums"
                  />
                </Field>
                <div className="flex items-center text-xs text-muted-foreground sm:col-span-2">
                  Opcional: se informar uma quantidade maior que zero, o saldo inicial já entra automaticamente em Movimentações.
                </div>
              </div>
            </div>
          ) : null}

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

            <Field label="Tamanho / Capacidade" htmlFor="prod-capacity">
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

          <div className="rounded-xl border bg-muted/20 p-3.5 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-xs font-semibold text-foreground">
                Custos de Aquisição &amp; Margens do Produto
              </p>
              <span className="text-[11px] text-muted-foreground">
                Taxas do Mercado Livre (14% comissão + 6% imposto + R$ 6,50 fixo) são simuladas no botão <strong>Precificar ML</strong>
              </span>
            </div>

            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              <Field label="Custo unitário pago (R$)" htmlFor="prod-cost" hint="Valor de compra com IPI">
                <MoneyInput
                  id="prod-cost"
                  name="unit_cost"
                  defaultValue={product ? String(num(product.unit_cost)) : ''}
                />
              </Field>

              <Field label="Preço de venda atual (R$)" htmlFor="prod-price" hint="Preço cadastrado no ERP">
                <MoneyInput
                  id="prod-price"
                  name="sale_price"
                  defaultValue={product ? String(num(product.sale_price)) : ''}
                />
              </Field>

              <Field
                label="Frete loja extra (R$)"
                htmlFor="prod-shipping"
                hint="Deixe 0 se o envio for pelo Mercado Livre"
              >
                <MoneyInput
                  id="prod-shipping"
                  name="shipping_cost"
                  defaultValue={
                    product?.shipping_cost !== undefined && num(product.shipping_cost) > 0
                      ? String(num(product.shipping_cost))
                      : '0'
                  }
                />
              </Field>

              <Field
                label="Margem pretendida normal (%)"
                htmlFor="prod-target-margin"
                hint="Venda normal (padrão 30%)"
              >
                <PercentInput
                  id="prod-target-margin"
                  name="target_margin_percent"
                  defaultValue={
                    product?.target_margin_percent !== undefined
                      ? String(num(product.target_margin_percent))
                      : '30'
                  }
                />
              </Field>

              <Field
                label="Margem de Queima ML (%)"
                htmlFor="prod-burn-margin"
                hint="Giro rápido / ranquear (padrão 8%)"
              >
                <PercentInput
                  id="prod-burn-margin"
                  name="burn_margin_percent"
                  defaultValue={
                    product?.burn_margin_percent !== undefined
                      ? String(num(product.burn_margin_percent))
                      : '8'
                  }
                />
              </Field>

              <Field
                label="Perda / quebra no estoque (%)"
                htmlFor="prod-loss-pct"
                hint="Avarias estimadas (padrão 2%)"
              >
                <PercentInput
                  id="prod-loss-pct"
                  name="loss_percent"
                  defaultValue={product?.loss_percent !== undefined ? String(num(product.loss_percent)) : '2'}
                />
              </Field>

              <Field
                label="Embalagem extra fixa (R$)"
                htmlFor="prod-packaging"
                hint="Se 0, usa a sacola vinculada"
              >
                <MoneyInput
                  id="prod-packaging"
                  name="packaging_cost"
                  defaultValue={
                    product?.packaging_cost !== undefined ? String(num(product.packaging_cost)) : ''
                  }
                />
              </Field>

              <Field label="Comissão ML padrão (%)" htmlFor="prod-mkt-pct" hint="Padrão ML Clássico: 14%">
                <PercentInput
                  id="prod-mkt-pct"
                  name="marketplace_percent"
                  defaultValue={
                    product?.marketplace_percent !== undefined && num(product.marketplace_percent) > 0
                      ? String(num(product.marketplace_percent))
                      : '14'
                  }
                />
              </Field>

              <Field label="Imposto NF (%)" htmlFor="prod-tax-pct" hint="Padrão Sapo ML: 6%">
                <PercentInput
                  id="prod-tax-pct"
                  name="tax_percent"
                  defaultValue={
                    product?.tax_percent !== undefined && num(product.tax_percent) > 0
                      ? String(num(product.tax_percent))
                      : '6'
                  }
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
        </>
      )}
    </FormDialog>
  )
}
