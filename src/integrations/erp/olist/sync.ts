import 'server-only'

import {
  getOlistOrder,
  getOlistProduct,
  getOlistProductStock,
  getOlistPublicConfig,
  type OlistOrderDetail,
  searchOlistOrders,
  searchOlistProducts,
  writeStoredOlistConfig,
} from '@/integrations/erp/olist/client'
import { IntegrationService } from '@/integrations/erp/service'
import { calculateOrderProductCosts } from '@/lib/finance'
import { num, round2 } from '@/lib/format'
import {
  loadProductCatalogSpecs,
  saveProductCatalogSpec,
} from '@/lib/product-catalog'
import { createAdminClient } from '@/lib/supabase/admin'

export type OlistSyncOrdersResult = {
  ok: boolean
  imported: number
  updated: number
  skipped: number
  bagsDeducted: number
  productsAutoCreated: number
  message: string
  error?: string
}

export type OlistSyncProductsResult = {
  ok: boolean
  created: number
  updated: number
  stockAdjusted: number
  message: string
  error?: string
}

function parseBrDateToIso(brDate: string | undefined): string {
  if (!brDate) return new Date().toISOString().slice(0, 10)
  const trimmed = brDate.trim()
  if (/^\d{2}\/\d{2}\/\d{4}$/.test(trimmed)) {
    const [dd, mm, yyyy] = trimmed.split('/')
    return `${yyyy}-${mm}-${dd}`
  }
  if (/^\d{4}-\d{2}-\d{2}/.test(trimmed)) {
    return trimmed.slice(0, 10)
  }
  return new Date().toISOString().slice(0, 10)
}

function formatDateBr(date: Date): string {
  const dd = String(date.getDate()).padStart(2, '0')
  const mm = String(date.getMonth() + 1).padStart(2, '0')
  const yyyy = date.getFullYear()
  return `${dd}/${mm}/${yyyy}`
}

export function mapOlistStatusToCentral(situacao: string | undefined): 'PENDENTE' | 'CONCLUIDO' | 'CANCELADO' {
  const norm = (situacao ?? '').trim().toLowerCase()
  if (norm.includes('cancelad') || norm.includes('recusad') || norm.includes('devolvid')) {
    return 'CANCELADO'
  }
  if (norm === 'aberto' || norm === 'em aberto' || norm.includes('incompleto')) {
    return 'PENDENTE'
  }
  return 'CONCLUIDO'
}

function normalizeChannelName(order: OlistOrderDetail): string {
  const raw =
    order.ecommerce?.nomeEcommerce ||
    order.ecommerce?.canalVenda ||
    ''
  const clean = raw.trim()
  if (!clean) return 'Olist ERP'
  const lower = clean.toLowerCase()
  if (lower.includes('mercado') || lower.includes('meli')) return 'Mercado Livre'
  if (lower.includes('shopee')) return 'Shopee'
  if (lower.includes('amazon')) return 'Amazon'
  if (lower.includes('magalu') || lower.includes('magazine')) return 'Magalu'
  if (lower.includes('shein')) return 'Shein'
  if (lower.includes('tiktok')) return 'TikTok Shop'
  if (lower.includes('nuvem')) return 'Nuvemshop'
  if (lower.includes('olist')) return 'Olist Store'
  return clean
}

async function resolveOrCreateChannelId(channelName: string): Promise<string | null> {
  const admin = createAdminClient()
  const { data: existing } = await admin
    .from('channels')
    .select('id, name')
    .ilike('name', channelName)
    .maybeSingle()

  if (existing?.id) return existing.id

  const { data: inserted } = await admin
    .from('channels')
    .insert({ name: channelName, active: true })
    .select('id')
    .maybeSingle()

  return inserted?.id ?? null
}

export async function syncSingleOlistOrder(
  orderDetail: OlistOrderDetail,
  options?: { createMissingProducts?: boolean },
): Promise<{
  action: 'IMPORTED' | 'UPDATED' | 'SKIPPED'
  bagsDeducted: number
  productsAutoCreated: number
}> {
  const admin = createAdminClient()
  const service = await IntegrationService.create({ provider: 'OLIST' })
  const createMissing = options?.createMissingProducts ?? true

  const orderNumber = `OLIST-${orderDetail.numero || orderDetail.id}`
  const orderDate = parseBrDateToIso(orderDetail.data_pedido)
  const centralStatus = mapOlistStatusToCentral(orderDetail.situacao)
  const channelName = normalizeChannelName(orderDetail)
  const channelId = await resolveOrCreateChannelId(channelName)

  await service.upsertSnapshot({
    resourceType: 'ORDER',
    externalId: String(orderDetail.id || orderDetail.numero),
    data: orderDetail as unknown as Record<string, unknown>,
  })

  const { data: existingOrder } = await admin
    .from('orders')
    .select('id, status')
    .eq('order_number', orderNumber)
    .maybeSingle()

  if (existingOrder?.id) {
    if (existingOrder.status !== centralStatus) {
      await admin
        .from('orders')
        .update({
          status: centralStatus,
          updated_at: new Date().toISOString(),
        })
        .eq('id', existingOrder.id)
      return { action: 'UPDATED', bagsDeducted: 0, productsAutoCreated: 0 }
    }
    return { action: 'SKIPPED', bagsDeducted: 0, productsAutoCreated: 0 }
  }

  const rawItems = (orderDetail.itens ?? []).map((entry) => entry.item).filter(Boolean)
  if (rawItems.length === 0) {
    return { action: 'SKIPPED', bagsDeducted: 0, productsAutoCreated: 0 }
  }

  const { data: allProducts } = await admin
    .from('products')
    .select('id, sku, name, unit_cost, sale_price')

  const bySku = new Map<string, { id: string; unit_cost: number }>()
  const byName = new Map<string, { id: string; unit_cost: number }>()
  for (const p of allProducts ?? []) {
    if (p.sku) bySku.set(String(p.sku).trim().toLowerCase(), { id: p.id, unit_cost: Number(p.unit_cost ?? 0) })
    if (p.name) byName.set(String(p.name).trim().toLowerCase(), { id: p.id, unit_cost: Number(p.unit_cost ?? 0) })
  }

  let productsAutoCreated = 0
  const resolvedItems: Array<{
    product_id: string
    quantity: number
    unit_price: number
    unit_cost: number
  }> = []

  for (const raw of rawItems) {
    const qty = Math.max(1, Math.round(Number(raw.quantidade ?? 1)))
    const unitPrice = Math.max(0, Number(raw.valor_unitario ?? 0))
    const skuKey = (raw.codigo ?? '').trim().toLowerCase()
    const nameKey = (raw.descricao ?? '').trim().toLowerCase()

    let matched = (skuKey ? bySku.get(skuKey) : undefined) ?? (nameKey ? byName.get(nameKey) : undefined)

    if (!matched && createMissing) {
      const newSku = (raw.codigo ?? '').trim() || `OLIST-${raw.id_produto || Date.now()}`
      const newName = (raw.descricao ?? '').trim() || `Produto Olist ${newSku}`
      const { data: createdProd } = await admin
        .from('products')
        .insert({
          sku: newSku,
          name: newName,
          category: 'Importado Olist',
          unit_cost: 0,
          sale_price: unitPrice,
          active: true,
        })
        .select('id, unit_cost')
        .single()

      if (createdProd?.id) {
        matched = { id: createdProd.id, unit_cost: Number(createdProd.unit_cost ?? 0) }
        bySku.set(newSku.toLowerCase(), matched)
        byName.set(newName.toLowerCase(), matched)
        productsAutoCreated += 1
      }
    }

    if (matched) {
      resolvedItems.push({
        product_id: matched.id,
        quantity: qty,
        unit_price: unitPrice,
        unit_cost: matched.unit_cost,
      })
    }
  }

  if (resolvedItems.length === 0) {
    return { action: 'SKIPPED', bagsDeducted: 0, productsAutoCreated }
  }

  const grossAmount = resolvedItems.reduce((sum, item) => sum + item.quantity * item.unit_price, 0)
  const discountAmount = Math.max(0, Number(orderDetail.valor_desconto ?? 0))
  const shippingCharged = Math.max(0, Number(orderDetail.valor_frete ?? 0))
  const otherCosts = Math.max(0, Number(orderDetail.outras_despesas ?? 0))
  const totalAmount = Math.max(0, grossAmount - discountAmount + shippingCharged)

  const [specsMap, productCostRows] = await Promise.all([
    loadProductCatalogSpecs(),
    admin.from('products').select('id, unit_cost'),
  ])

  const unitCostById = new Map<string, number>()
  for (const row of productCostRows.data ?? []) {
    unitCostById.set(row.id, Number(row.unit_cost ?? 0))
  }

  const autoCosts = calculateOrderProductCosts(
    resolvedItems.map((item) => {
      const spec = specsMap.get(item.product_id)
      const linkedPkgId = spec?.linked_packaging_product_id
      const linkedPkgUnitCost = linkedPkgId ? (unitCostById.get(linkedPkgId) ?? 0) : 0
      const linkedPkgQty = Math.max(1, num(spec?.linked_packaging_qty ?? 1))
      const unitPackaging =
        num(spec?.packaging_cost) > 0
          ? num(spec?.packaging_cost)
          : linkedPkgId
            ? round2(linkedPkgUnitCost * linkedPkgQty)
            : 0

      return {
        quantity: item.quantity,
        unitPrice: item.unit_price,
        shippingPerUnit: num(spec?.shipping_cost),
        packagingPerUnit: unitPackaging,
        marketplacePercent: num(spec?.marketplace_percent),
        taxPercent: num(spec?.tax_percent),
      }
    }),
  )

  const ecomOrderNum =
    orderDetail.ecommerce?.numeroPedidoEcommerce ||
    orderDetail.numero_ecommerce ||
    null

  const noteParts = [
    `Sincronizado via Olist ERP (Pedido #${orderDetail.numero || orderDetail.id} • Situação: ${orderDetail.situacao})`,
    ecomOrderNum ? `Pedido Canal: ${ecomOrderNum}` : null,
    orderDetail.obs ? orderDetail.obs : null,
  ].filter(Boolean)

  const { data: insertedOrder, error: orderError } = await admin
    .from('orders')
    .insert({
      order_number: orderNumber,
      order_date: orderDate,
      channel_id: channelId,
      customer_name: orderDetail.cliente?.nome || 'Cliente Olist',
      status: centralStatus,
      gross_amount: grossAmount,
      discount_amount: discountAmount,
      shipping_charged: shippingCharged,
      total_amount: totalAmount,
      marketplace_fee: autoCosts.marketplaceFee,
      gateway_fee: 0,
      tax_amount: autoCosts.taxAmount,
      shipping_cost: autoCosts.shippingCost,
      packaging_cost: autoCosts.packagingCost,
      marketing_cost: 0,
      other_costs: otherCosts,
      notes: noteParts.join(' | '),
    })
    .select('id')
    .single()

  if (orderError || !insertedOrder) {
    throw new Error(orderError?.message ?? `Erro ao gravar pedido ${orderNumber}`)
  }

  const orderItemsPayload = resolvedItems.map((item) => ({
    order_id: insertedOrder.id,
    product_id: item.product_id,
    quantity: item.quantity,
    unit_price: item.unit_price,
    unit_cost: item.unit_cost,
    gross_total: item.quantity * item.unit_price,
    cost_total: item.quantity * item.unit_cost,
  }))

  const { data: insertedItems, error: itemsError } = await admin
    .from('order_items')
    .insert(orderItemsPayload)
    .select('id, product_id, quantity')

  if (itemsError) {
    await admin.from('orders').delete().eq('id', insertedOrder.id)
    throw new Error(`Erro nos itens do pedido ${orderNumber}: ${itemsError.message}`)
  }

  // Baixa automática de sacolas / embalagens vinculadas aos produtos vendidos
  const packagingMovements = (insertedItems ?? [])
    .map((item) => {
      const spec = specsMap.get(String(item.product_id))
      const pkgProductId = spec?.linked_packaging_product_id
      const pkgQtyPerUnit = Math.max(1, Number(spec?.linked_packaging_qty ?? 1))
      if (!pkgProductId) return null
      const totalPkgQty = Math.max(1, Math.round(Number(item.quantity) * pkgQtyPerUnit))
      return {
        product_id: pkgProductId,
        type: 'VENDA' as const,
        quantity: totalPkgQty,
        movement_date: orderDate,
        order_id: insertedOrder.id,
        reason: `Baixa automática de sacola/embalagem (${orderNumber})`,
        notes: `PACKAGING_LINK|order_item_id:${item.id}|parent_product_id:${item.product_id}`,
      }
    })
    .filter((row): row is NonNullable<typeof row> => Boolean(row))

  let bagsDeducted = 0
  if (packagingMovements.length > 0) {
    await admin.from('stock_movements').insert(packagingMovements)
    bagsDeducted = packagingMovements.reduce((acc, m) => acc + m.quantity, 0)
  }

  return {
    action: 'IMPORTED',
    bagsDeducted,
    productsAutoCreated,
  }
}

export async function syncOlistOrders(options?: {
  days?: number
  maxOrders?: number
}): Promise<OlistSyncOrdersResult> {
  try {
    const config = await getOlistPublicConfig()
    if (!config.configured) {
      return {
        ok: false,
        imported: 0,
        updated: 0,
        skipped: 0,
        bagsDeducted: 0,
        productsAutoCreated: 0,
        message: 'Token do Olist ERP não configurado.',
        error: 'Configure o Token da API do Olist ERP antes de sincronizar.',
      }
    }

    const days = Math.min(Math.max(options?.days ?? 7, 1), 90)
    const maxOrders = Math.min(Math.max(options?.maxOrders ?? 40, 1), 150)

    const endDate = new Date()
    const startDate = new Date()
    startDate.setDate(endDate.getDate() - days)

    const searchRes = await searchOlistOrders({
      dataInicial: formatDateBr(startDate),
      dataFinal: formatDateBr(endDate),
      pagina: 1,
    })

    const targetOrders = searchRes.orders.slice(0, maxOrders)
    let imported = 0
    let updated = 0
    let skipped = 0
    let bagsDeducted = 0
    let productsAutoCreated = 0

    for (const summary of targetOrders) {
      const detail = await getOlistOrder(summary.id)
      const res = await syncSingleOlistOrder(detail, {
        createMissingProducts: config.createMissingProducts,
      })
      if (res.action === 'IMPORTED') imported += 1
      else if (res.action === 'UPDATED') updated += 1
      else skipped += 1
      bagsDeducted += res.bagsDeducted
      productsAutoCreated += res.productsAutoCreated
    }

    const nowIso = new Date().toISOString()
    const message = `Sincronização concluída: ${imported} novos pedidos importados, ${updated} atualizados, ${skipped} já existentes (${bagsDeducted} sacolas baixadas).`

    await writeStoredOlistConfig({
      last_order_sync_at: nowIso,
      last_sync_summary: {
        type: 'ORDERS',
        at: nowIso,
        imported,
        updated,
        skipped,
        bagsDeducted,
        message,
      },
    })

    return {
      ok: true,
      imported,
      updated,
      skipped,
      bagsDeducted,
      productsAutoCreated,
      message,
    }
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : 'Erro ao sincronizar pedidos do Olist.'
    return {
      ok: false,
      imported: 0,
      updated: 0,
      skipped: 0,
      bagsDeducted: 0,
      productsAutoCreated: 0,
      message: errorMsg,
      error: errorMsg,
    }
  }
}

export async function syncOlistProducts(options?: {
  maxItems?: number
  maxPages?: number
  syncStock?: boolean
}): Promise<OlistSyncProductsResult> {
  try {
    const config = await getOlistPublicConfig()
    if (!config.configured) {
      return {
        ok: false,
        created: 0,
        updated: 0,
        stockAdjusted: 0,
        message: 'Token do Olist ERP não configurado.',
        error: 'Configure o Token da API do Olist ERP em Integrações antes de puxar o catálogo.',
      }
    }

    const maxPages = Math.min(Math.max(options?.maxPages ?? 10, 1), 25)
    const maxItems = Math.min(Math.max(options?.maxItems ?? 500, 1), 1000)
    const syncStock = options?.syncStock ?? true

    const allSummaries: Awaited<ReturnType<typeof searchOlistProducts>>['products'] = []
    let currentPage = 1
    let totalPages = 1

    do {
      const pageRes = await searchOlistProducts({ pagina: currentPage })
      allSummaries.push(...pageRes.products)
      totalPages = Math.min(pageRes.totalPages, maxPages)
      currentPage += 1
    } while (currentPage <= totalPages && allSummaries.length < maxItems)

    const items = allSummaries.slice(0, maxItems)

    const admin = createAdminClient()
    const [existingProductsRes, specsMap] = await Promise.all([
      admin.from('v_product_stats').select('product_id, sku, name, stock_balance'),
      loadProductCatalogSpecs(),
    ])

    const bySku = new Map<string, { id: string; current_stock: number }>()
    const byName = new Map<string, { id: string; current_stock: number }>()
    for (const p of existingProductsRes.data ?? []) {
      const pid = String(p.product_id)
      const stock = Number(p.stock_balance ?? 0)
      if (p.sku) {
        bySku.set(String(p.sku).trim().toLowerCase(), { id: pid, current_stock: stock })
      }
      if (p.name) {
        byName.set(String(p.name).trim().toLowerCase(), { id: pid, current_stock: stock })
      }
    }

    let created = 0
    let updated = 0
    let stockAdjusted = 0
    const todayIso = new Date().toISOString().slice(0, 10)

    const toGrams = (val: unknown): number | null => {
      const n = Number(val ?? 0)
      if (!Number.isFinite(n) || n <= 0) return null
      // No Olist/Tiny o peso costuma vir em kg (ex: 0.610), mas se já vier > 50 assumimos gramas
      return n <= 50 ? Math.round(n * 1000) : Math.round(n)
    }

    for (const summary of items) {
      const sku = (summary.codigo || `OLIST-${summary.id}`).trim()
      const nameSummary = (summary.nome || sku).trim()
      const existing =
        bySku.get(sku.toLowerCase()) ?? byName.get(nameSummary.toLowerCase())

      // Não sobrescrever insumos / sacolas internas da Central
      if (existing && specsMap.get(existing.id)?.item_kind === 'INSUMO') {
        continue
      }

      let detail: Awaited<ReturnType<typeof getOlistProduct>> | null = null
      try {
        detail = await getOlistProduct(summary.id)
      } catch {
        detail = null
      }

      const salePrice = Number(detail?.preco ?? summary.preco ?? 0)
      const unitCost = Number(
        detail?.preco_custo || detail?.preco_custo_medio || summary.preco_custo || 0,
      )
      const name = (detail?.nome || summary.nome || sku).trim()
      const category = detail?.categoria?.trim() || detail?.marca?.trim() || 'Catálogo Olist'
      const isActive = (detail?.situacao ?? summary.situacao ?? 'A') !== 'I'

      let productId = existing?.id
      if (productId) {
        await admin
          .from('products')
          .update({
            sku,
            name,
            category,
            ...(unitCost > 0 ? { unit_cost: unitCost } : {}),
            ...(salePrice > 0 ? { sale_price: salePrice } : {}),
            active: isActive,
            updated_at: new Date().toISOString(),
          })
          .eq('id', productId)
        updated += 1
      } else {
        const { data: inserted } = await admin
          .from('products')
          .insert({
            sku,
            name,
            category,
            unit_cost: unitCost,
            sale_price: salePrice,
            active: isActive,
          })
          .select('id')
          .single()

        if (inserted?.id) {
          productId = inserted.id
          bySku.set(sku.toLowerCase(), { id: productId, current_stock: 0 })
          created += 1
        }
      }

      if (productId) {
        const currentSpec = specsMap.get(productId)
        const netGrams = toGrams(detail?.peso_liquido) ?? currentSpec?.net_weight_grams ?? null
        const grossGrams = toGrams(detail?.peso_bruto) ?? currentSpec?.gross_weight_grams ?? null

        await saveProductCatalogSpec(productId, sku, {
          ...currentSpec,
          item_kind: 'PRODUTO',
          ean: detail?.gtin || summary.gtin || currentSpec?.ean || null,
          ncm: detail?.ncm || currentSpec?.ncm || null,
          net_weight_grams: netGrams,
          gross_weight_grams: grossGrams,
          description:
            detail?.descricao_complementar || detail?.obs || currentSpec?.description || null,
        })

        if (syncStock) {
          try {
            const olistBalance = Math.round(await getOlistProductStock(summary.id))
            const currentStock = existing?.current_stock ?? 0
            const delta = olistBalance - currentStock
            if (delta !== 0) {
              await admin.from('stock_movements').insert({
                product_id: productId,
                type: currentStock === 0 && delta > 0 ? 'ENTRADA' : 'AJUSTE',
                quantity: delta,
                movement_date: todayIso,
                reason: 'Saldo sincronizado do Olist ERP',
                notes: `OLIST_STOCK_SYNC|external_id:${summary.id}`,
              })
              stockAdjusted += 1
            }
          } catch {
            // Continua se o endpoint de estoque falhar para um item específico
          }
        }
      }
    }

    const nowIso = new Date().toISOString()
    const message = `Catálogo sincronizado: ${created} produtos criados, ${updated} atualizados e ${stockAdjusted} saldos de estoque ajustados.`

    await writeStoredOlistConfig({
      last_product_sync_at: nowIso,
      last_sync_summary: {
        type: 'PRODUCTS',
        at: nowIso,
        imported: created,
        updated,
        skipped: 0,
        bagsDeducted: 0,
        message,
      },
    })

    return {
      ok: true,
      created,
      updated,
      stockAdjusted,
      message,
    }
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : 'Erro ao sincronizar produtos do Olist.'
    return {
      ok: false,
      created: 0,
      updated: 0,
      stockAdjusted: 0,
      message: errorMsg,
      error: errorMsg,
    }
  }
}
