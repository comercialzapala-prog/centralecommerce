'use server'

import { revalidatePath } from 'next/cache'

import {
  actionError,
  actionOk,
  describeDbError,
  readAmount,
  readBoolean,
  readInteger,
  readRequiredText,
  readText,
  readUuid,
  runAction,
  type ActionState,
} from '@/lib/actions'
// Client COM autorizacao: valida sessao + vinculo antes de devolver a conexao.
// O alias mantem os call sites identicos -- o que muda e a garantia.
import { createAuthedClient as createClient } from '@/lib/auth'
import { todayISO } from '@/lib/format'
import { saveProductCatalogSpec } from '@/lib/product-catalog'
import type { ProductCatalogSpec, ProductItemKind } from '@/lib/types'

function revalidateProducts() {
  revalidatePath('/produtos', 'layout')
  revalidatePath('/sacolas')
  revalidatePath('/movimentacoes')
  revalidatePath('/vendas', 'layout')
  revalidatePath('/dashboard', 'layout')
  revalidatePath('/hoje', 'layout')
}

function readProduct(formData: FormData) {
  const rawKind = readText(formData, 'item_kind')
  const isInsumo = rawKind === 'INSUMO'

  return {
    name: readRequiredText(formData, 'name', 'Nome'),
    sku: readText(formData, 'sku'),
    category: readText(formData, 'category') ?? (isInsumo ? 'Embalagens e Sacolas' : null),
    unit_cost: readAmount(formData, 'unit_cost', 'Custo unitário', false),
    sale_price: isInsumo ? 0 : readAmount(formData, 'sale_price', 'Preço de venda', false),
  }
}

async function syncBagLinkedProducts(bagId: string, formData: FormData) {
  const hasPicker = readText(formData, 'has_linked_products_picker') === 'true'
  if (!hasPicker) return

  const rawSelected = formData
    .getAll('linked_product_ids')
    .map((v) => String(v).trim())
    .filter(Boolean)
  const selectedSet = new Set(rawSelected)

  const rawPreviouslyLinked = formData
    .getAll('previously_linked_product_ids')
    .map((v) => String(v).trim())
    .filter(Boolean)

  const tasks: Promise<void>[] = []

  for (const prodId of selectedSet) {
    if (prodId === bagId) continue
    tasks.push(
      saveProductCatalogSpec(prodId, null, {
        linked_packaging_product_id: bagId,
        linked_packaging_qty: 1,
      }),
    )
  }

  for (const prevProdId of rawPreviouslyLinked) {
    if (!selectedSet.has(prevProdId)) {
      tasks.push(
        saveProductCatalogSpec(prevProdId, null, {
          linked_packaging_product_id: null,
          linked_packaging_qty: null,
        }),
      )
    }
  }

  if (tasks.length > 0) {
    await Promise.all(tasks)
  }
}

function readOptionalInt(formData: FormData, key: string, label: string): number | null {
  const raw = readText(formData, key)
  if (!raw) return null
  return readInteger(formData, key, label)
}

function readCatalogSpec(formData: FormData): ProductCatalogSpec {
  const rawKind = readText(formData, 'item_kind')
  const itemKind: ProductItemKind = rawKind === 'INSUMO' ? 'INSUMO' : 'PRODUTO'
  const linkedPkgId = readUuid(formData, 'linked_packaging_product_id')
  const linkedPkgQty = readOptionalInt(
    formData,
    'linked_packaging_qty',
    'Qtd. de sacolas por unidade',
  )

  return {
    item_kind: itemKind,
    linked_packaging_product_id: itemKind === 'INSUMO' ? null : linkedPkgId,
    linked_packaging_qty: itemKind === 'INSUMO' || !linkedPkgId ? null : Math.max(1, linkedPkgQty ?? 1),
    asin: readText(formData, 'asin'),
    ean: readText(formData, 'ean'),
    ncm: readText(formData, 'ncm'),
    supplier_sku: readText(formData, 'supplier_sku'),
    net_weight_grams: readOptionalInt(formData, 'net_weight_grams', 'Peso líquido (g)'),
    gross_weight_grams: readOptionalInt(formData, 'gross_weight_grams', 'Peso com embalagem (g)'),
    shipping_cost: readAmount(formData, 'shipping_cost', 'Frete unitário padrão', false),
    packaging_cost: readAmount(formData, 'packaging_cost', 'Embalagem unitária', false),
    labor_cost: readAmount(formData, 'labor_cost', 'Hora de trabalho / mão de obra (R$)', false),
    loss_percent: readAmount(formData, 'loss_percent', 'Perda variável (%)', false),
    target_margin_percent: readAmount(
      formData,
      'target_margin_percent',
      'Margem pretendida (%)',
      false,
    ),
    marketplace_percent: readAmount(formData, 'marketplace_percent', 'Comissão padrão (%)', false),
    tax_percent: readAmount(formData, 'tax_percent', 'Imposto NF (%)', false),
    voltage: readText(formData, 'voltage'),
    capacity: readText(formData, 'capacity'),
    origin_country: readText(formData, 'origin_country'),
    warranty_months: readOptionalInt(formData, 'warranty_months', 'Garantia (meses)'),
    description: readText(formData, 'description'),
  }
}

export async function createProduct(_prev: ActionState, formData: FormData): Promise<ActionState> {
  return runAction(async () => {
    const supabase = await createClient()
    const base = readProduct(formData)
    const spec = readCatalogSpec(formData)
    const initialStock = readOptionalInt(formData, 'initial_stock', 'Estoque inicial') ?? 0

    if (spec.item_kind === 'INSUMO' && !base.category) {
      base.category = 'Embalagens e Sacolas'
    }

    const { data, error } = await supabase
      .from('products')
      .insert(base)
      .select('id,sku')
      .single()

    if (error) return actionError(describeDbError(error))

    await saveProductCatalogSpec(data.id as string, data.sku as string | null, spec)

    if (spec.item_kind === 'INSUMO') {
      await syncBagLinkedProducts(data.id as string, formData)
    }

    if (initialStock > 0) {
      await supabase.from('stock_movements').insert({
        product_id: data.id,
        type: 'ENTRADA',
        quantity: initialStock,
        movement_date: todayISO(),
        reason:
          spec.item_kind === 'INSUMO'
            ? 'Estoque inicial de sacola / embalagem'
            : 'Estoque inicial no cadastro do produto',
      })
    }

    revalidateProducts()
    return actionOk(
      spec.item_kind === 'INSUMO'
        ? `Sacola / insumo "${base.name}" cadastrado.`
        : 'Produto cadastrado.',
    )
  })
}

export async function updateProduct(_prev: ActionState, formData: FormData): Promise<ActionState> {
  return runAction(async () => {
    const id = readUuid(formData, 'id')
    if (!id) return actionError('Produto não identificado.')

    const supabase = await createClient()
    const base = readProduct(formData)
    const spec = readCatalogSpec(formData)

    const { error } = await supabase.from('products').update(base).eq('id', id)

    if (error) return actionError(describeDbError(error))

    await saveProductCatalogSpec(id, base.sku, spec)

    if (spec.item_kind === 'INSUMO') {
      await syncBagLinkedProducts(id, formData)
    }

    revalidateProducts()
    return actionOk(
      spec.item_kind === 'INSUMO' ? 'Sacola / embalagem atualizada.' : 'Produto atualizado.',
    )
  })
}

/**
 * Vincula ou troca rapidamente qual sacola/embalagem um produto consome a cada venda.
 */
export async function linkProductPackaging(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  return runAction(async () => {
    const productId = readUuid(formData, 'product_id')
    if (!productId) return actionError('Escolha o produto que usará a sacola.')

    const packagingProductId = readUuid(formData, 'linked_packaging_product_id')
    if (packagingProductId && packagingProductId === productId) {
      return actionError('Um produto não pode ser vinculado a ele mesmo.')
    }

    const qty = readOptionalInt(formData, 'linked_packaging_qty', 'Quantidade por venda') ?? 1

    await saveProductCatalogSpec(productId, null, {
      linked_packaging_product_id: packagingProductId,
      linked_packaging_qty: packagingProductId ? Math.max(1, qty) : null,
    })

    revalidateProducts()
    return actionOk(
      packagingProductId
        ? 'Vínculo de sacola/embalagem salvo. As próximas vendas já darão baixa automática!'
        : 'Vínculo de sacola removido do produto.',
    )
  })
}

/**
 * Produto com movimentacao nao e apagado -- vira inativo (secao 41).
 * O estoque e o historico continuam somando no relatorio.
 */
export async function setProductActive(formData: FormData): Promise<void> {
  const id = readUuid(formData, 'id')
  if (!id) return

  const supabase = await createClient()
  await supabase.from('products').update({ active: readBoolean(formData, 'active') }).eq('id', id)

  revalidateProducts()
}

export async function saveProductPricingAction(input: {
  productId: string
  unitCost: number
  shippingCost: number
  packagingCost: number
  laborCost: number
  lossPercent: number
  targetMarginPercent: number
  marketplacePercent: number
  taxPercent: number
  applySalePrice?: number | null
}): Promise<{ ok: boolean; message: string }> {
  try {
    const supabase = await createClient()
    const updateData: Record<string, unknown> = {
      unit_cost: Math.max(0, Number(input.unitCost) || 0),
      updated_at: new Date().toISOString(),
    }
    if (input.applySalePrice !== undefined && input.applySalePrice !== null && input.applySalePrice > 0) {
      updateData.sale_price = Number(input.applySalePrice.toFixed(2))
    }

    const { error } = await supabase
      .from('products')
      .update(updateData)
      .eq('id', input.productId)

    if (error) {
      return { ok: false, message: describeDbError(error) }
    }

    await saveProductCatalogSpec(input.productId, null, {
      shipping_cost: Math.max(0, Number(input.shippingCost) || 0),
      packaging_cost: Math.max(0, Number(input.packagingCost) || 0),
      labor_cost: Math.max(0, Number(input.laborCost) || 0),
      loss_percent: Math.max(0, Number(input.lossPercent) || 0),
      target_margin_percent: Math.max(0, Number(input.targetMarginPercent) || 30),
      marketplace_percent: Math.max(0, Number(input.marketplacePercent) || 0),
      tax_percent: Math.max(0, Number(input.taxPercent) || 0),
    })

    revalidateProducts()
    return {
      ok: true,
      message:
        input.applySalePrice && input.applySalePrice > 0
          ? 'Margem pretendida, custos e novo Preço de Venda aplicados ao produto!'
          : 'Margem pretendida e parâmetros de custo salvos com sucesso!',
    }
  } catch (err) {
    return {
      ok: false,
      message: err instanceof Error ? err.message : 'Erro ao salvar precificação do produto.',
    }
  }
}
