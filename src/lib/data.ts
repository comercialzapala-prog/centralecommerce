import 'server-only'

import { createClient } from '@/lib/supabase/server'
import type { GlobalFilters } from '@/lib/filters'
import type {
  Category,
  Channel,
  CostCenterNode,
  CostCenterReportRow,
  Investment,
  OrderItem,
  OrderRow,
  PaymentMethod,
  Product,
  ProductStats,
  Settings,
  StockMovement,
  Supplier,
  SupplierStats,
  TransactionRow,
} from '@/lib/types'

/**
 * Camada de leitura. Todas as paginas sao Server Components e passam por aqui
 * -- nenhuma tela inventa dado (secao 47).
 *
 * TETO DE LINHAS: as listas usam LIST_LIMIT e os totais sao somados em
 * TypeScript (src/lib/finance.ts) para existir UMA unica fonte da verdade do
 * calculo. Se a operacao passar desse volume, o ponto de troca e transformar
 * `summarizeTransactions` num RPC de agregacao -- as telas nao mudam.
 */
const LIST_LIMIT = 20_000

/** Colunas minimas para somatorios acumulados (payload enxuto). */
const SUMMARY_COLUMNS =
  'id,transaction_date,type,status,amount,signed_amount,operational_revenue,operational_expense,contribution_amount'

function unwrap<T>(result: { data: T[] | null; error: { message: string } | null }, label: string): T[] {
  if (result.error) {
    throw new Error(`Falha ao carregar ${label}: ${result.error.message}`)
  }
  return result.data ?? []
}

/* -------------------------------------------------------------------------- */
/* Cadastros de apoio                                                          */
/* -------------------------------------------------------------------------- */

export async function getCostCenterNodes(): Promise<CostCenterNode[]> {
  const supabase = await createClient()
  const result = await supabase
    .from('v_cost_center_hierarchy')
    .select('*')
    .order('path', { ascending: true })
  return unwrap<CostCenterNode>(result, 'centros de custo')
}

export async function getCategories(): Promise<Category[]> {
  const supabase = await createClient()
  const result = await supabase.from('categories').select('*').order('name')
  return unwrap<Category>(result, 'categorias')
}

export async function getSuppliers(): Promise<Supplier[]> {
  const supabase = await createClient()
  const result = await supabase.from('suppliers').select('*').order('name')
  return unwrap<Supplier>(result, 'fornecedores')
}

export async function getSupplierStats(): Promise<SupplierStats[]> {
  const supabase = await createClient()
  const result = await supabase.from('v_supplier_stats').select('*').order('total_paid', {
    ascending: false,
  })
  return unwrap<SupplierStats>(result, 'fornecedores')
}

export async function getChannels(): Promise<Channel[]> {
  const supabase = await createClient()
  const result = await supabase.from('channels').select('*').order('name')
  return unwrap<Channel>(result, 'canais')
}

export async function getPaymentMethods(): Promise<PaymentMethod[]> {
  const supabase = await createClient()
  const result = await supabase.from('payment_methods').select('*').order('name')
  return unwrap<PaymentMethod>(result, 'formas de pagamento')
}

export async function getProducts(): Promise<Product[]> {
  const supabase = await createClient()
  const result = await supabase.from('products').select('*').order('name')
  return unwrap<Product>(result, 'produtos')
}

export async function getProductStats(): Promise<ProductStats[]> {
  const supabase = await createClient()
  const result = await supabase.from('v_product_stats').select('*').order('name')
  return unwrap<ProductStats>(result, 'produtos')
}

export async function getSettings(): Promise<Settings | null> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('settings')
    .select('*')
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (error) throw new Error(`Falha ao carregar configurações: ${error.message}`)
  return data as Settings | null
}

/**
 * Cadastros usados pelos formularios e pela barra de filtros.
 * Uma unica chamada paralela em vez de seis sequenciais.
 */
export async function getReferenceData() {
  const [costCenters, categories, suppliers, channels, paymentMethods, products] =
    await Promise.all([
      getCostCenterNodes(),
      getCategories(),
      getSuppliers(),
      getChannels(),
      getPaymentMethods(),
      getProducts(),
    ])

  return { costCenters, categories, suppliers, channels, paymentMethods, products }
}

/* -------------------------------------------------------------------------- */
/* Centros de custo -- drill-down                                              */
/* -------------------------------------------------------------------------- */

/** Ids do centro + todos os descendentes (o drill-down soma a subarvore). */
export function subtreeIds(nodes: CostCenterNode[], rootId: string): string[] {
  return nodes.filter((node) => node.ancestor_ids?.includes(rootId)).map((node) => node.id)
}

export async function getCostCenterReport(
  filters: GlobalFilters,
  rootId: string | null = null,
): Promise<CostCenterReportRow[]> {
  const supabase = await createClient()
  const { data, error } = await supabase.rpc('cost_center_report', {
    p_start: filters.from,
    p_end: filters.to,
    p_root: rootId,
    p_category: filters.categoryId,
    p_supplier: filters.supplierId,
    p_channel: filters.channelId,
    p_status: filters.status,
    p_payment_method: filters.paymentMethodId,
    p_search: filters.q,
  })

  if (error) throw new Error(`Falha ao calcular centros de custo: ${error.message}`)
  return (data ?? []) as CostCenterReportRow[]
}

/* -------------------------------------------------------------------------- */
/* Lancamentos financeiros                                                     */
/* -------------------------------------------------------------------------- */

type TransactionQueryOptions = {
  /** Restringe a estes centros (ja expandidos com os descendentes). */
  costCenterIds?: string[] | null
  limit?: number
}

export async function getTransactions(
  filters: GlobalFilters,
  options: TransactionQueryOptions = {},
): Promise<TransactionRow[]> {
  const supabase = await createClient()
  let query = supabase
    .from('v_transaction_full')
    .select('*')
    .order('transaction_date', { ascending: false })
    .order('created_at', { ascending: false })
    .limit(options.limit ?? LIST_LIMIT)

  if (filters.from) query = query.gte('transaction_date', filters.from)
  if (filters.to) query = query.lte('transaction_date', filters.to)
  if (filters.categoryId) query = query.eq('category_id', filters.categoryId)
  if (filters.supplierId) query = query.eq('supplier_id', filters.supplierId)
  if (filters.channelId) query = query.eq('channel_id', filters.channelId)
  if (filters.paymentMethodId) query = query.eq('payment_method_id', filters.paymentMethodId)
  if (filters.status) query = query.eq('status', filters.status)
  if (filters.type) query = query.eq('type', filters.type)

  if (options.costCenterIds) {
    if (options.costCenterIds.length === 0) return []
    query = query.in('cost_center_id', options.costCenterIds)
  }

  if (filters.q) {
    const term = filters.q.replace(/[%,()]/g, ' ').trim()
    if (term) {
      query = query.or(
        [
          `description.ilike.*${term}*`,
          `notes.ilike.*${term}*`,
          `supplier_name.ilike.*${term}*`,
          `category_name.ilike.*${term}*`,
          `cost_center_path.ilike.*${term}*`,
        ].join(','),
      )
    }
  }

  const result = await query
  return unwrap<TransactionRow>(result, 'lançamentos')
}

/**
 * Serie completa, sem filtro de periodo: o resultado acumulado, o caixa e o
 * 0/50 sao numeros de vida inteira do projeto (secoes 25 e 32).
 */
export async function getAllTransactionsForAccumulated(): Promise<TransactionRow[]> {
  const supabase = await createClient()
  const result = await supabase
    .from('v_transaction_full')
    .select(SUMMARY_COLUMNS)
    .order('transaction_date', { ascending: true })
    .limit(LIST_LIMIT)
  return unwrap<TransactionRow>(result as never, 'histórico financeiro')
}

export async function getTransactionById(id: string): Promise<TransactionRow | null> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('v_transaction_full')
    .select('*')
    .eq('id', id)
    .maybeSingle()
  if (error) throw new Error(`Falha ao carregar lançamento: ${error.message}`)
  return data as TransactionRow | null
}

/* -------------------------------------------------------------------------- */
/* Investimentos                                                               */
/* -------------------------------------------------------------------------- */

export async function getInvestments(): Promise<Investment[]> {
  const supabase = await createClient()
  const result = await supabase
    .from('investments')
    .select('*')
    .order('investment_date', { ascending: false })
    .limit(LIST_LIMIT)
  return unwrap<Investment>(result, 'investimentos')
}

/* -------------------------------------------------------------------------- */
/* Comercial                                                                   */
/* -------------------------------------------------------------------------- */

export async function getOrders(filters: GlobalFilters): Promise<OrderRow[]> {
  const supabase = await createClient()
  let query = supabase
    .from('v_order_result')
    .select('*')
    .order('order_date', { ascending: false })
    .limit(LIST_LIMIT)

  if (filters.from) query = query.gte('order_date', filters.from)
  if (filters.to) query = query.lte('order_date', filters.to)
  if (filters.channelId) query = query.eq('channel_id', filters.channelId)
  if (filters.status) query = query.eq('status', filters.status)
  if (filters.q) {
    const term = filters.q.replace(/[%,()]/g, ' ').trim()
    if (term) {
      query = query.or([`order_number.ilike.*${term}*`, `customer_name.ilike.*${term}*`].join(','))
    }
  }

  const result = await query
  return unwrap<OrderRow>(result, 'pedidos')
}

export async function getOrderById(id: string): Promise<OrderRow | null> {
  const supabase = await createClient()
  const { data, error } = await supabase.from('v_order_result').select('*').eq('id', id).maybeSingle()
  if (error) throw new Error(`Falha ao carregar pedido: ${error.message}`)
  return data as OrderRow | null
}

export type OrderItemRow = OrderItem & { product: { id: string; name: string; sku: string | null } | null }

export async function getOrderItems(orderId: string): Promise<OrderItemRow[]> {
  const supabase = await createClient()
  const result = await supabase
    .from('order_items')
    .select('*, product:products(id,name,sku)')
    .eq('order_id', orderId)
    .order('created_at')
  return unwrap<OrderItemRow>(result as never, 'itens do pedido')
}

/** Pedidos no periodo restritos aos que contem um produto (filtro global). */
export async function getOrderIdsByProduct(productId: string): Promise<string[]> {
  const supabase = await createClient()
  const result = await supabase.from('order_items').select('order_id').eq('product_id', productId)
  const rows = unwrap<{ order_id: string }>(result as never, 'itens do pedido')
  return [...new Set(rows.map((row) => row.order_id))]
}

/* -------------------------------------------------------------------------- */
/* Estoque                                                                     */
/* -------------------------------------------------------------------------- */

export type StockMovementRow = StockMovement & {
  product: { id: string; name: string; sku: string | null } | null
  order: { id: string; order_number: string; status: string } | null
}

export async function getStockMovements(
  filters: GlobalFilters,
  productId?: string,
): Promise<StockMovementRow[]> {
  const supabase = await createClient()
  let query = supabase
    .from('stock_movements')
    .select('*, product:products(id,name,sku), order:orders(id,order_number,status)')
    .order('movement_date', { ascending: false })
    .order('created_at', { ascending: false })
    .limit(LIST_LIMIT)

  if (filters.from) query = query.gte('movement_date', filters.from)
  if (filters.to) query = query.lte('movement_date', filters.to)

  const targetProduct = productId ?? filters.productId
  if (targetProduct) query = query.eq('product_id', targetProduct)
  if (filters.type) query = query.eq('type', filters.type)

  const result = await query
  return unwrap<StockMovementRow>(result as never, 'movimentações de estoque')
}

export async function getProductById(id: string): Promise<ProductStats | null> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('v_product_stats')
    .select('*')
    .eq('product_id', id)
    .maybeSingle()
  if (error) throw new Error(`Falha ao carregar produto: ${error.message}`)
  return data as ProductStats | null
}

export async function getSupplierById(id: string): Promise<SupplierStats | null> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('v_supplier_stats')
    .select('*')
    .eq('supplier_id', id)
    .maybeSingle()
  if (error) throw new Error(`Falha ao carregar fornecedor: ${error.message}`)
  return data as SupplierStats | null
}
