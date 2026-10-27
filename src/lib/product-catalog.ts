import 'server-only'

import { IntegrationService } from '@/integrations/erp/service'
import { createAuthedClient as createClient } from '@/lib/auth'
import { num, round2 } from '@/lib/format'
import type { Product, ProductCatalogSpec, ProductStats } from '@/lib/types'

/**
 * FICHA TÉCNICA E PARÂMETROS UNITÁRIOS DE FRETE/TAXAS POR PRODUTO
 *
 * Persistidos em `erp_snapshots` (source='CENTRAL', resource_type='PRODUCT',
 * external_id=product.id) e mesclados com eventual snapshot do ERP ('BLING').
 *
 * Permite armazenar NCM, EAN/GTIN, ASIN, pesos (líquido e com embalagem),
 * referência do fabricante/fornecedor e parâmetros de cálculo automático de
 * venda (frete unitário, embalagem unitária, comissão % e imposto %) sem
 * exigir colunas de canal fixas em `products`.
 */

function strOrNull(v: unknown): string | null {
  if (typeof v !== 'string') return null
  const t = v.trim()
  return t ? t : null
}

function intOrNull(v: unknown): number | null {
  if (v === null || v === undefined || v === '') return null
  const n = Number(v)
  return Number.isFinite(n) && n > 0 ? Math.round(n) : null
}

export function parseCatalogSpec(raw: Record<string, unknown> | null | undefined): ProductCatalogSpec {
  if (!raw) return {}

  const weightKg = Number(raw.weightKg ?? raw.pesoBruto ?? 0)
  const grossGrams =
    intOrNull(raw.gross_weight_grams ?? raw.grossWeightGrams) ??
    (Number.isFinite(weightKg) && weightKg > 0 ? Math.round(weightKg * 1000) : null)

  return {
    asin: strOrNull(raw.asin),
    ean: strOrNull(raw.ean ?? raw.gtin),
    ncm: strOrNull(raw.ncm),
    supplier_sku: strOrNull(raw.supplier_sku ?? raw.supplierSku),
    net_weight_grams: intOrNull(raw.net_weight_grams ?? raw.netWeightGrams),
    gross_weight_grams: grossGrams,
    shipping_cost: num(raw.shipping_cost ?? raw.shippingCost),
    packaging_cost: num(raw.packaging_cost ?? raw.packagingCost),
    marketplace_percent: num(raw.marketplace_percent ?? raw.marketplacePercent),
    tax_percent: num(raw.tax_percent ?? raw.taxPercent),
    voltage: strOrNull(raw.voltage),
    capacity: strOrNull(raw.capacity),
    material_primary: strOrNull(raw.material_primary ?? raw.materialPrimary),
    material_secondary: strOrNull(raw.material_secondary ?? raw.materialSecondary),
    color: strOrNull(raw.color),
    included_items: strOrNull(raw.included_items ?? raw.includedItems),
    warranty_months: intOrNull(raw.warranty_months ?? raw.warrantyMonths),
    origin_country: strOrNull(raw.origin_country ?? raw.originCountry),
    product_type: strOrNull(raw.product_type ?? raw.productType),
    description: strOrNull(raw.description),
    differentials: strOrNull(raw.differentials),
    care_instructions: strOrNull(raw.care_instructions ?? raw.careInstructions),
    related_eans: strOrNull(raw.related_eans ?? raw.relatedEans),
  }
}

export async function loadProductCatalogSpecs(): Promise<Map<string, ProductCatalogSpec>> {
  const supabase = await createClient()
  const { data } = await supabase
    .from('erp_snapshots')
    .select('source,external_id,data')
    .eq('resource_type', 'PRODUCT')
    .is('deleted_at', null)

  const map = new Map<string, ProductCatalogSpec>()
  if (!data) return map

  // Aplica primeiro snapshots de ERP e por cima os da CENTRAL (external_id = product.id ou sku).
  const sorted = [...data].sort((a, b) => (a.source === 'CENTRAL' ? 1 : b.source === 'CENTRAL' ? -1 : 0))
  for (const row of sorted) {
    const extId = String(row.external_id ?? '')
    if (!extId) continue
    const parsed = parseCatalogSpec((row.data ?? {}) as Record<string, unknown>)
    const prev = map.get(extId) ?? {}
    const merged: ProductCatalogSpec = {
      ...prev,
      ...Object.fromEntries(
        Object.entries(parsed).filter(([, value]) => value !== null && value !== undefined),
      ),
    }
    map.set(extId, merged)
    const skuKey = typeof (row.data as Record<string, unknown>)?.sku === 'string'
      ? String((row.data as Record<string, unknown>).sku).trim()
      : ''
    if (skuKey) {
      map.set(skuKey, { ...(map.get(skuKey) ?? {}), ...merged })
    }
  }

  return map
}

export async function enrichProducts(products: Product[]): Promise<Product[]> {
  if (products.length === 0) return products
  const specs = await loadProductCatalogSpecs()
  return products.map((product) => {
    const bySku = product.sku ? specs.get(product.sku.trim()) : undefined
    const byId = specs.get(product.id)
    return {
      ...product,
      ...(bySku ?? {}),
      ...(byId ?? {}),
    }
  })
}

type SalesFactRow = {
  product_id: string | null
  quantity: number | string
  gross_revenue: number | string
  shipping_cost: number | string
  fees: number | string
  tax: number | string
  packaging: number | string
  ads_attributed: number | string
  other_costs: number | string
}

export async function enrichProductStats(rows: ProductStats[]): Promise<ProductStats[]> {
  if (rows.length === 0) return rows

  const supabase = await createClient()
  const [specs, salesRes] = await Promise.all([
    loadProductCatalogSpecs(),
    supabase
      .from('v_sales_fact')
      .select('product_id,quantity,gross_revenue,shipping_cost,fees,tax,packaging,ads_attributed,other_costs'),
  ])

  const salesByProduct = new Map<string, SalesFactRow[]>()
  for (const sale of (salesRes.data ?? []) as SalesFactRow[]) {
    if (!sale.product_id) continue
    const list = salesByProduct.get(sale.product_id) ?? []
    list.push(sale)
    salesByProduct.set(sale.product_id, list)
  }

  return rows.map((row) => {
    const bySku = row.sku ? specs.get(row.sku.trim()) : undefined
    const byId = specs.get(row.product_id)
    const spec: ProductCatalogSpec = { ...(bySku ?? {}), ...(byId ?? {}) }

    const unitShipping = num(spec.shipping_cost)
    const unitPackaging = num(spec.packaging_cost)
    const mktPercent = num(spec.marketplace_percent)
    const taxPercent = num(spec.tax_percent)

    const sales = salesByProduct.get(row.product_id) ?? []
    let shippingAmount = 0
    let feesAmount = 0
    let taxAmount = 0
    let packagingAmount = 0
    let otherAmount = 0

    for (const s of sales) {
      const qty = Math.max(0, num(s.quantity))
      const gross = Math.max(0, num(s.gross_revenue))
      const recordedShipping = num(s.shipping_cost)
      const recordedPackaging = num(s.packaging)
      const recordedFees = num(s.fees)
      const recordedTax = num(s.tax)

      // Se o pedido do ERP veio sem frete/taxas preenchidos no cabeçalho,
      // aplica automaticamente o frete/taxa unitário cadastrado no nosso produto.
      shippingAmount += recordedShipping > 0 ? recordedShipping : qty * unitShipping
      packagingAmount += recordedPackaging > 0 ? recordedPackaging : qty * unitPackaging
      feesAmount += recordedFees > 0 ? recordedFees : gross * (mktPercent / 100)
      taxAmount += recordedTax > 0 ? recordedTax : gross * (taxPercent / 100)
      otherAmount += num(s.ads_attributed) + num(s.other_costs)
    }

    shippingAmount = round2(shippingAmount)
    packagingAmount = round2(packagingAmount)
    feesAmount = round2(feesAmount)
    taxAmount = round2(taxAmount)
    const extraCostsAmount = round2(shippingAmount + packagingAmount + feesAmount + taxAmount + otherAmount)

    const revenue = num(row.revenue_amount)
    const cogs = num(row.cogs_amount)
    const netMarginAmount = round2(revenue - cogs - extraCostsAmount)
    const netMarginPercent = revenue > 0 ? round2((netMarginAmount / revenue) * 100) : 0

    return {
      ...row,
      ...spec,
      shipping_amount: shippingAmount,
      fees_amount: feesAmount,
      tax_amount: taxAmount,
      packaging_amount: packagingAmount,
      extra_costs_amount: extraCostsAmount,
      net_margin_amount: netMarginAmount,
      net_margin_percent: netMarginPercent,
    }
  })
}

export async function saveProductCatalogSpec(
  productId: string,
  sku: string | null,
  spec: ProductCatalogSpec,
): Promise<void> {
  const supabase = await createClient()
  const existing = await supabase
    .from('erp_snapshots')
    .select('data')
    .eq('source', 'CENTRAL')
    .eq('resource_type', 'PRODUCT')
    .eq('external_id', productId)
    .maybeSingle()

  const prevData = ((existing.data?.data ?? {}) as Record<string, unknown>) || {}
  const grossGrams = spec.gross_weight_grams ?? intOrNull(prevData.gross_weight_grams)
  const netGrams = spec.net_weight_grams ?? intOrNull(prevData.net_weight_grams)

  const mergedData: Record<string, unknown> = {
    ...prevData,
    productId,
    sku,
    asin: spec.asin !== undefined ? spec.asin : (prevData.asin ?? null),
    ean: spec.ean !== undefined ? spec.ean : (prevData.ean ?? null),
    gtin: spec.ean !== undefined ? spec.ean : (prevData.gtin ?? null),
    ncm: spec.ncm !== undefined ? spec.ncm : (prevData.ncm ?? null),
    supplier_sku: spec.supplier_sku !== undefined ? spec.supplier_sku : (prevData.supplier_sku ?? null),
    net_weight_grams: netGrams ?? null,
    gross_weight_grams: grossGrams ?? null,
    weightKg: grossGrams
      ? Number((grossGrams / 1000).toFixed(3))
      : netGrams
        ? Number((netGrams / 1000).toFixed(3))
        : null,
    shipping_cost: spec.shipping_cost !== undefined ? num(spec.shipping_cost) : num(prevData.shipping_cost),
    packaging_cost: spec.packaging_cost !== undefined ? num(spec.packaging_cost) : num(prevData.packaging_cost),
    marketplace_percent:
      spec.marketplace_percent !== undefined ? num(spec.marketplace_percent) : num(prevData.marketplace_percent),
    tax_percent: spec.tax_percent !== undefined ? num(spec.tax_percent) : num(prevData.tax_percent),
    voltage: spec.voltage !== undefined ? spec.voltage : (prevData.voltage ?? null),
    capacity: spec.capacity !== undefined ? spec.capacity : (prevData.capacity ?? null),
    material_primary:
      spec.material_primary !== undefined ? spec.material_primary : (prevData.material_primary ?? null),
    material_secondary:
      spec.material_secondary !== undefined ? spec.material_secondary : (prevData.material_secondary ?? null),
    color: spec.color !== undefined ? spec.color : (prevData.color ?? null),
    included_items:
      spec.included_items !== undefined ? spec.included_items : (prevData.included_items ?? null),
    warranty_months:
      spec.warranty_months !== undefined ? spec.warranty_months : (prevData.warranty_months ?? null),
    origin_country:
      spec.origin_country !== undefined ? spec.origin_country : (prevData.origin_country ?? null),
    product_type: spec.product_type !== undefined ? spec.product_type : (prevData.product_type ?? null),
    description: spec.description !== undefined ? spec.description : (prevData.description ?? null),
    differentials: spec.differentials !== undefined ? spec.differentials : (prevData.differentials ?? null),
    care_instructions:
      spec.care_instructions !== undefined ? spec.care_instructions : (prevData.care_instructions ?? null),
    related_eans: spec.related_eans !== undefined ? spec.related_eans : (prevData.related_eans ?? null),
    updatedAt: new Date().toISOString(),
  }

  const service = await IntegrationService.create({ provider: 'CENTRAL' })
  await service.upsertSnapshot({
    resourceType: 'PRODUCT',
    externalId: productId,
    data: mergedData,
    sourceUpdatedAt: String(mergedData.updatedAt),
  })
}
