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
import type { MonthlyCmvTrackEntry, ProductCatalogSpec, ProductItemKind } from '@/lib/types'

function revalidateProducts() {
  revalidatePath('/produtos', 'layout')
  revalidatePath('/precificacao')
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
    burn_margin_percent: readAmount(
      formData,
      'burn_margin_percent',
      'Margem na queima (%)',
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
  burnMarginPercent?: number
  burnPriceOverride?: number | null
  competitorAvgPrice?: number | null
  includeMlFixedFee?: boolean
  marketplacePercent: number
  taxPercent: number
  linkedPackagingProductId?: string | null
  linkedPackagingQty?: number | null
  grossWeightGrams?: number | null
  lengthCm?: number | null
  widthCm?: number | null
  heightCm?: number | null
  monthlyTrack?: MonthlyCmvTrackEntry[] | null
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
      burn_margin_percent:
        input.burnMarginPercent !== undefined ? Math.max(0, Number(input.burnMarginPercent)) : 8,
      burn_price_override:
        input.burnPriceOverride !== undefined && input.burnPriceOverride !== null && input.burnPriceOverride > 0
          ? Number(input.burnPriceOverride)
          : null,
      competitor_avg_price:
        input.competitorAvgPrice !== undefined && input.competitorAvgPrice !== null && input.competitorAvgPrice > 0
          ? Number(input.competitorAvgPrice)
          : null,
      include_ml_fixed_fee:
        input.includeMlFixedFee !== undefined ? Boolean(input.includeMlFixedFee) : true,
      marketplace_percent: Math.max(0, Number(input.marketplacePercent) || 0),
      tax_percent: Math.max(0, Number(input.taxPercent) || 0),
      linked_packaging_product_id:
        input.linkedPackagingProductId !== undefined ? input.linkedPackagingProductId : undefined,
      linked_packaging_qty:
        input.linkedPackagingQty !== undefined ? input.linkedPackagingQty : undefined,
      gross_weight_grams:
        input.grossWeightGrams !== undefined ? input.grossWeightGrams : undefined,
      length_cm: input.lengthCm !== undefined ? input.lengthCm : undefined,
      width_cm: input.widthCm !== undefined ? input.widthCm : undefined,
      height_cm: input.heightCm !== undefined ? input.heightCm : undefined,
      monthly_cmv_track: input.monthlyTrack !== undefined ? input.monthlyTrack : undefined,
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

export async function registerWeightedBatchEntryAction(input: {
  productId: string
  entryQuantity: number
  entryUnitCost: number
  newWeightedUnitCost: number
}): Promise<{ ok: boolean; message: string }> {
  try {
    const qty = Math.round(Number(input.entryQuantity) || 0)
    if (qty <= 0) {
      return { ok: false, message: 'Informe uma quantidade de entrada maior que zero.' }
    }

    const supabase = await createClient()
    const weightedCost = Number(Math.max(0, Number(input.newWeightedUnitCost) || 0).toFixed(2))

    const { error: prodError } = await supabase
      .from('products')
      .update({
        unit_cost: weightedCost,
        updated_at: new Date().toISOString(),
      })
      .eq('id', input.productId)

    if (prodError) {
      return { ok: false, message: describeDbError(prodError) }
    }

    const { error: movError } = await supabase.from('stock_movements').insert({
      product_id: input.productId,
      type: 'ENTRADA',
      quantity: qty,
      movement_date: todayISO(),
      reason: `Entrada c/ Custo Médio Ponderado (Lote a R$ ${Number(input.entryUnitCost).toFixed(2)} -> Novo CMV R$ ${weightedCost.toFixed(2)})`,
    })

    if (movError) {
      return { ok: false, message: describeDbError(movError) }
    }

    revalidateProducts()
    return {
      ok: true,
      message: `Entrada de +${qty} un. registrada e Custo Médio atualizado para R$ ${weightedCost.toFixed(2)}!`,
    }
  } catch (err) {
    return {
      ok: false,
      message: err instanceof Error ? err.message : 'Erro ao registrar entrada com custo médio.',
    }
  }
}

export async function saveProductMonthlyCmvTrackAction(input: {
  productId: string
  monthlyTrack: MonthlyCmvTrackEntry[]
  applyUnitCost?: number | null
  applySalePrice?: number | null
}): Promise<{ ok: boolean; message: string }> {
  try {
    const supabase = await createClient()

    if (
      (input.applyUnitCost !== undefined && input.applyUnitCost !== null && input.applyUnitCost > 0) ||
      (input.applySalePrice !== undefined && input.applySalePrice !== null && input.applySalePrice > 0)
    ) {
      const patch: Record<string, unknown> = {
        updated_at: new Date().toISOString(),
      }
      if (input.applyUnitCost && input.applyUnitCost > 0) {
        patch.unit_cost = Number(input.applyUnitCost.toFixed(2))
      }
      if (input.applySalePrice && input.applySalePrice > 0) {
        patch.sale_price = Number(input.applySalePrice.toFixed(2))
      }
      const { error } = await supabase.from('products').update(patch).eq('id', input.productId)
      if (error) {
        return { ok: false, message: describeDbError(error) }
      }
    }

    await saveProductCatalogSpec(input.productId, null, {
      monthly_cmv_track: input.monthlyTrack,
    })

    revalidateProducts()
    return {
      ok: true,
      message:
        input.applyUnitCost || input.applySalePrice
          ? 'Carrossel mensal salvo e Custo Médio / Preço aplicados ao produto!'
          : 'Rastreio mensal de CMV e Estoque Residual salvo com sucesso!',
    }
  } catch (err) {
    return {
      ok: false,
      message: err instanceof Error ? err.message : 'Erro ao salvar carrossel mensal.',
    }
  }
}

export type PricingSheetSaveItem = {
  productId: string
  sku?: string | null
  unitCost: number
  salePrice: number
  shippingCost: number
  packagingCost: number
  laborCost: number
  lossPercent: number
  targetMarginPercent: number
  taxPercent: number
  mlListingType: 'CLASSICO' | 'PREMIUM'
  mlClassicPercent: number
  mlPremiumPercent: number
  mlFixedFeeMode: 'AUTO_79' | 'MANUAL' | 'EXEMPT'
  mlFixedFeeAmount: number
}

export async function savePricingSheetBatchAction(
  items: PricingSheetSaveItem[],
): Promise<{ ok: boolean; savedCount: number; message: string }> {
  try {
    if (!Array.isArray(items) || items.length === 0) {
      return { ok: false, savedCount: 0, message: 'Nenhum item para salvar.' }
    }

    const supabase = await createClient()
    let savedCount = 0

    for (const item of items) {
      if (!item.productId) continue

      const unitCost = Number(Math.max(0, Number(item.unitCost) || 0).toFixed(2))
      const salePrice = Number(Math.max(0, Number(item.salePrice) || 0).toFixed(2))
      const activeMktPercent =
        item.mlListingType === 'PREMIUM'
          ? Math.max(0, Number(item.mlPremiumPercent) || 0)
          : Math.max(0, Number(item.mlClassicPercent) || 0)

      const { error } = await supabase
        .from('products')
        .update({
          unit_cost: unitCost,
          sale_price: salePrice,
          updated_at: new Date().toISOString(),
        })
        .eq('id', item.productId)

      if (error) {
        return {
          ok: false,
          savedCount,
          message: `Erro ao salvar produto: ${describeDbError(error)}`,
        }
      }

      await saveProductCatalogSpec(item.productId, item.sku ?? null, {
        shipping_cost: Math.max(0, Number(item.shippingCost) || 0),
        packaging_cost: Math.max(0, Number(item.packagingCost) || 0),
        labor_cost: Math.max(0, Number(item.laborCost) || 0),
        loss_percent: Math.max(0, Number(item.lossPercent) || 0),
        target_margin_percent: Math.max(0, Number(item.targetMarginPercent) || 20),
        tax_percent: Math.max(0, Number(item.taxPercent) || 0),
        marketplace_percent: activeMktPercent,
        ml_listing_type: item.mlListingType,
        ml_classic_percent: Math.max(0, Number(item.mlClassicPercent) || 12),
        ml_premium_percent: Math.max(0, Number(item.mlPremiumPercent) || 17),
        ml_fixed_fee_mode: item.mlFixedFeeMode,
        ml_fixed_fee: Math.max(0, Number(item.mlFixedFeeAmount) || 6),
      })

      savedCount += 1
    }

    revalidateProducts()
    return {
      ok: true,
      savedCount,
      message:
        savedCount === 1
          ? 'Precificação, custo, impostos e taxas do ML salvos no produto!'
          : `Planilha salva! ${savedCount} produtos atualizados com novos custos, taxas do ML e preços.`,
    }
  } catch (err) {
    return {
      ok: false,
      savedCount: 0,
      message: err instanceof Error ? err.message : 'Erro ao salvar planilha de precificação.',
    }
  }
}

export async function createProductFromSimulationAction(input: {
  name: string
  sku?: string
  category?: string
  unitCost: number
  salePrice: number
  shippingCost: number
  packagingCost: number
  laborCost: number
  lossPercent: number
  targetMarginPercent: number
  taxPercent: number
  mlListingType: 'CLASSICO' | 'PREMIUM'
  mlClassicPercent: number
  mlPremiumPercent: number
  mlFixedFeeMode: 'AUTO_79' | 'MANUAL' | 'EXEMPT'
  mlFixedFeeAmount: number
}): Promise<{ ok: boolean; productId?: string; message: string }> {
  try {
    const cleanName = (input.name ?? '').trim()
    if (!cleanName) {
      return { ok: false, message: 'Informe o nome do produto para cadastrar no catálogo.' }
    }

    const supabase = await createClient()
    const cleanSku = (input.sku ?? '').trim() || null
    const unitCost = Number(Math.max(0, Number(input.unitCost) || 0).toFixed(2))
    const salePrice = Number(Math.max(0, Number(input.salePrice) || 0).toFixed(2))
    const activeMktPercent =
      input.mlListingType === 'PREMIUM'
        ? Math.max(0, Number(input.mlPremiumPercent) || 0)
        : Math.max(0, Number(input.mlClassicPercent) || 0)

    const { data, error } = await supabase
      .from('products')
      .insert({
        name: cleanName,
        sku: cleanSku,
        category: (input.category ?? '').trim() || 'Simulado na Planilha',
        unit_cost: unitCost,
        sale_price: salePrice,
        active: true,
      })
      .select('id, sku')
      .single()

    if (error || !data) {
      return {
        ok: false,
        message: error ? describeDbError(error) : 'Erro ao criar produto.',
      }
    }

    await saveProductCatalogSpec(data.id as string, (data.sku as string | null) ?? cleanSku, {
      item_kind: 'PRODUTO',
      shipping_cost: Math.max(0, Number(input.shippingCost) || 0),
      packaging_cost: Math.max(0, Number(input.packagingCost) || 0),
      labor_cost: Math.max(0, Number(input.laborCost) || 0),
      loss_percent: Math.max(0, Number(input.lossPercent) || 0),
      target_margin_percent: Math.max(0, Number(input.targetMarginPercent) || 20),
      tax_percent: Math.max(0, Number(input.taxPercent) || 0),
      marketplace_percent: activeMktPercent,
      ml_listing_type: input.mlListingType,
      ml_classic_percent: Math.max(0, Number(input.mlClassicPercent) || 12),
      ml_premium_percent: Math.max(0, Number(input.mlPremiumPercent) || 17),
      ml_fixed_fee_mode: input.mlFixedFeeMode,
      ml_fixed_fee: Math.max(0, Number(input.mlFixedFeeAmount) || 6),
    })

    revalidateProducts()
    return {
      ok: true,
      productId: String(data.id),
      message: `Produto "${cleanName}" cadastrado no catálogo com toda a precificação do ML!`,
    }
  } catch (err) {
    return {
      ok: false,
      message: err instanceof Error ? err.message : 'Erro ao cadastrar produto simulado.',
    }
  }
}
