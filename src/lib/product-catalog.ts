import 'server-only'

import { IntegrationService } from '@/integrations/erp/service'
import { createAuthedClient as createClient } from '@/lib/auth'
import { num, round2 } from '@/lib/format'
import type {
  PackagingConsumptionByProduct,
  Product,
  ProductCatalogSpec,
  ProductItemKind,
  ProductStats,
} from '@/lib/types'

/**
 * FICHA TÉCNICA, VÍNCULO DE SACOLAS/EMBALAGENS E PARÂMETROS UNITÁRIOS POR PRODUTO
 *
 * Persistidos em `erp_snapshots` (source='CENTRAL', resource_type='PRODUCT',
 * external_id=product.id) e mesclados com eventual snapshot do ERP ('BLING').
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

function parseItemKind(v: unknown, name?: unknown, category?: unknown): ProductItemKind {
  if (v === 'INSUMO' || v === 'PRODUTO') return v
  const nameStr = typeof name === 'string' ? name.toUpperCase() : ''
  const catStr = typeof category === 'string' ? category.toUpperCase() : ''
  if (nameStr.startsWith('SACOLA ') || catStr.includes('SACOLA') || catStr.includes('EMBALAGEN')) {
    return 'INSUMO'
  }
  return 'PRODUTO'
}

export function parseCatalogSpec(raw: Record<string, unknown> | null | undefined): ProductCatalogSpec {
  if (!raw) return {}

  const weightKg = Number(raw.weightKg ?? raw.pesoBruto ?? 0)
  const grossGrams =
    intOrNull(raw.gross_weight_grams ?? raw.grossWeightGrams) ??
    (Number.isFinite(weightKg) && weightKg > 0 ? Math.round(weightKg * 1000) : null)

  const linkedPkgId = strOrNull(raw.linked_packaging_product_id ?? raw.linkedPackagingProductId)
  const linkedPkgQty = intOrNull(raw.linked_packaging_qty ?? raw.linkedPackagingQty) ?? (linkedPkgId ? 1 : null)

  return {
    item_kind:
      raw.item_kind === 'INSUMO' || raw.item_kind === 'PRODUTO'
        ? (raw.item_kind as ProductItemKind)
        : undefined,
    linked_packaging_product_id: linkedPkgId,
    linked_packaging_qty: linkedPkgQty,
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

  const sorted = [...data].sort((a, b) => (a.source === 'CENTRAL' ? 1 : b.source === 'CENTRAL' ? -1 : 0))
  for (const row of sorted) {
    const extId = String(row.external_id ?? '')
    if (!extId) continue
    const parsed = parseCatalogSpec((row.data ?? {}) as Record<string, unknown>)
    const prev = map.get(extId) ?? {}
    const merged: ProductCatalogSpec = {
      ...prev,
      ...Object.fromEntries(
        Object.entries(parsed).filter(([, value]) => value !== undefined),
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

  const baseEnriched = products.map((product) => {
    const bySku = product.sku ? specs.get(product.sku.trim()) : undefined
    const byId = specs.get(product.id)
    const mergedSpec: ProductCatalogSpec = { ...(bySku ?? {}), ...(byId ?? {}) }
    const itemKind = parseItemKind(mergedSpec.item_kind, product.name, product.category)
    return {
      ...product,
      ...mergedSpec,
      item_kind: itemKind,
    }
  })

  const byIdMap = new Map(baseEnriched.map((p) => [p.id, p]))

  return baseEnriched.map((product) => {
    const pkgId = product.linked_packaging_product_id
    const pkgProd = pkgId ? byIdMap.get(pkgId) : undefined
    const pkgQty = Math.max(1, num(product.linked_packaging_qty ?? 1))
    const linkedUnitCost = pkgProd ? num(pkgProd.unit_cost) : 0
    const effectivePackagingCost =
      num(product.packaging_cost) > 0
        ? num(product.packaging_cost)
        : pkgProd
          ? round2(linkedUnitCost * pkgQty)
          : 0

    return {
      ...product,
      packaging_cost: effectivePackagingCost,
      linked_packaging_name: pkgProd?.name ?? null,
      linked_packaging_sku: pkgProd?.sku ?? null,
      linked_packaging_unit_cost: linkedUnitCost,
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

type PackagingMovementRow = {
  product_id: string
  quantity: number
  notes: string | null
  order: { status: string } | { status: string }[] | null
}

function parsePackagingMovementNote(notes: string | null): {
  orderItemId: string | null
  parentProductId: string | null
} {
  if (!notes || !notes.startsWith('PACKAGING_LINK|')) {
    return { orderItemId: null, parentProductId: null }
  }
  let orderItemId: string | null = null
  let parentProductId: string | null = null
  for (const part of notes.split('|')) {
    if (part.startsWith('order_item_id:')) {
      orderItemId = part.slice('order_item_id:'.length).trim() || null
    } else if (part.startsWith('parent_product_id:')) {
      parentProductId = part.slice('parent_product_id:'.length).trim() || null
    }
  }
  return { orderItemId, parentProductId }
}

export async function enrichProductStats(rows: ProductStats[]): Promise<ProductStats[]> {
  if (rows.length === 0) return rows

  const supabase = await createClient()
  const [specs, salesRes, allStatsRes, pkgMovementsRes] = await Promise.all([
    loadProductCatalogSpecs(),
    supabase
      .from('v_sales_fact')
      .select('product_id,quantity,gross_revenue,shipping_cost,fees,tax,packaging,ads_attributed,other_costs'),
    rows.length === 1
      ? supabase.from('v_product_stats').select('*')
      : Promise.resolve({ data: rows }),
    supabase
      .from('stock_movements')
      .select('product_id,quantity,notes,order:orders(status)')
      .like('notes', 'PACKAGING_LINK|%'),
  ])

  const allStats = ((allStatsRes.data ?? rows) as ProductStats[]).map((row) => {
    const bySku = row.sku ? specs.get(row.sku.trim()) : undefined
    const byId = specs.get(row.product_id)
    const spec: ProductCatalogSpec = { ...(bySku ?? {}), ...(byId ?? {}) }
    const itemKind = parseItemKind(spec.item_kind, row.name, row.category)
    return {
      ...row,
      ...spec,
      item_kind: itemKind,
    }
  })

  const statsById = new Map<string, ProductStats>(allStats.map((r) => [r.product_id, r]))

  // Soma movimentos reais de baixa automática de sacolas por (parentProductId, packagingProductId)
  const recordedPkgByPair = new Map<string, number>()
  for (const mov of (pkgMovementsRes.data ?? []) as PackagingMovementRow[]) {
    const ord = Array.isArray(mov.order) ? mov.order[0] : mov.order
    if (ord?.status === 'CANCELADO') continue
    const { parentProductId } = parsePackagingMovementNote(mov.notes)
    if (!parentProductId) continue
    const key = `${parentProductId}::${mov.product_id}`
    recordedPkgByPair.set(key, (recordedPkgByPair.get(key) ?? 0) + Math.abs(num(mov.quantity)))
  }

  // Monta a matriz de consumo de sacolas por produto (tanto pelo vínculo atual quanto pelo histórico)
  const consumptionByPackagingId = new Map<string, PackagingConsumptionByProduct[]>()
  const consumptionByProductId = new Map<string, PackagingConsumptionByProduct>()

  for (const prod of allStats) {
    if (prod.item_kind === 'INSUMO') continue
    const pkgId = prod.linked_packaging_product_id
    if (!pkgId) continue
    const pkgStat = statsById.get(pkgId)
    if (!pkgStat) continue

    const qtyPerUnit = Math.max(1, num(prod.linked_packaging_qty ?? 1))
    const unitsSold = Math.max(0, num(prod.qty_sold))
    const pairKey = `${prod.product_id}::${pkgId}`
    const recordedQty = recordedPkgByPair.get(pairKey) ?? 0
    const qtyConsumed = Math.max(recordedQty, unitsSold * qtyPerUnit)
    const unitCost = num(pkgStat.unit_cost)
    const totalCost = round2(qtyConsumed * unitCost)

    const entry: PackagingConsumptionByProduct = {
      product_id: prod.product_id,
      product_name: prod.name,
      product_sku: prod.sku,
      packaging_product_id: pkgId,
      packaging_name: pkgStat.name,
      packaging_sku: pkgStat.sku,
      qty_per_unit: qtyPerUnit,
      units_sold: unitsSold,
      qty_consumed: qtyConsumed,
      unit_cost: unitCost,
      total_cost: totalCost,
    }

    consumptionByProductId.set(prod.product_id, entry)
    const list = consumptionByPackagingId.get(pkgId) ?? []
    list.push(entry)
    consumptionByPackagingId.set(pkgId, list)
  }

  const salesByProduct = new Map<string, SalesFactRow[]>()
  for (const sale of (salesRes.data ?? []) as SalesFactRow[]) {
    if (!sale.product_id) continue
    const list = salesByProduct.get(sale.product_id) ?? []
    list.push(sale)
    salesByProduct.set(sale.product_id, list)
  }

  return rows.map((rawRow) => {
    const row = statsById.get(rawRow.product_id) ?? rawRow
    const pkgId = row.linked_packaging_product_id
    const pkgStat = pkgId ? statsById.get(pkgId) : undefined
    const pkgQtyPerUnit = Math.max(1, num(row.linked_packaging_qty ?? 1))
    const linkedPkgUnitCost = pkgStat ? num(pkgStat.unit_cost) : 0

    const unitShipping = num(row.shipping_cost)
    const unitPackaging =
      num(row.packaging_cost) > 0
        ? num(row.packaging_cost)
        : pkgStat
          ? round2(linkedPkgUnitCost * pkgQtyPerUnit)
          : 0
    const mktPercent = num(row.marketplace_percent)
    const taxPercent = num(row.tax_percent)

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

      shippingAmount += recordedShipping > 0 ? recordedShipping : qty * unitShipping
      packagingAmount += recordedPackaging > 0 ? recordedPackaging : qty * unitPackaging
      feesAmount += recordedFees > 0 ? recordedFees : gross * (mktPercent / 100)
      taxAmount += recordedTax > 0 ? recordedTax : gross * (taxPercent / 100)
      otherAmount += num(s.ads_attributed) + num(s.other_costs)
    }

    const prodConsumption = consumptionByProductId.get(row.product_id)
    const insumoConsumptions = consumptionByPackagingId.get(row.product_id) ?? []

    if (prodConsumption && prodConsumption.total_cost > packagingAmount) {
      packagingAmount = prodConsumption.total_cost
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

    const isInsumo = row.item_kind === 'INSUMO'
    const insumoQtyConsumed = Math.max(
      num(row.qty_sold),
      insumoConsumptions.reduce((sum, item) => sum + item.qty_consumed, 0),
    )
    const insumoTotalCost = round2(insumoQtyConsumed * num(row.unit_cost))

    return {
      ...row,
      packaging_cost: unitPackaging,
      shipping_amount: shippingAmount,
      fees_amount: feesAmount,
      tax_amount: taxAmount,
      packaging_amount: packagingAmount,
      extra_costs_amount: extraCostsAmount,
      net_margin_amount: netMarginAmount,
      net_margin_percent: netMarginPercent,
      linked_packaging_name: pkgStat?.name ?? null,
      linked_packaging_sku: pkgStat?.sku ?? null,
      linked_packaging_unit_cost: linkedPkgUnitCost,
      linked_packaging_stock: pkgStat ? num(pkgStat.stock_balance) : undefined,
      packaging_qty_consumed: isInsumo
        ? insumoQtyConsumed
        : (prodConsumption?.qty_consumed ?? 0),
      packaging_linked_cost_total: isInsumo
        ? insumoTotalCost
        : (prodConsumption?.total_cost ?? 0),
      consumption_by_product: isInsumo
        ? insumoConsumptions
        : prodConsumption
          ? [prodConsumption]
          : [],
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

  const linkedPkgId =
    spec.linked_packaging_product_id !== undefined
      ? spec.linked_packaging_product_id
      : strOrNull(prevData.linked_packaging_product_id)

  const linkedPkgQty =
    spec.linked_packaging_qty !== undefined
      ? spec.linked_packaging_qty
      : intOrNull(prevData.linked_packaging_qty) ?? (linkedPkgId ? 1 : null)

  const mergedData: Record<string, unknown> = {
    ...prevData,
    productId,
    sku: sku !== null ? sku : (prevData.sku ?? null),
    item_kind:
      spec.item_kind !== undefined ? spec.item_kind : (prevData.item_kind ?? 'PRODUTO'),
    linked_packaging_product_id: linkedPkgId ?? null,
    linked_packaging_qty: linkedPkgId ? (linkedPkgQty ?? 1) : null,
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
