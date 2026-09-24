/** Tipos do dominio, espelhando o schema do Supabase. */

export const TRANSACTION_TYPES = ['ENTRADA', 'SAIDA', 'APORTE', 'ESTORNO'] as const
export type TransactionType = (typeof TRANSACTION_TYPES)[number]

export const TRANSACTION_STATUSES = ['PAGO', 'PENDENTE', 'CANCELADO'] as const
export type TransactionStatus = (typeof TRANSACTION_STATUSES)[number]

export const ORDER_STATUSES = ['PENDENTE', 'CONCLUIDO', 'CANCELADO'] as const
export type OrderStatus = (typeof ORDER_STATUSES)[number]

export const STOCK_MOVEMENT_TYPES = [
  'ENTRADA',
  'VENDA',
  'DEVOLUCAO',
  'PERDA',
  'AVARIA',
  'AJUSTE',
] as const
export type StockMovementType = (typeof STOCK_MOVEMENT_TYPES)[number]

export const CATEGORY_TYPES = ['ENTRADA', 'SAIDA', 'APORTE', 'ESTORNO', 'INVESTIMENTO'] as const
export type CategoryType = (typeof CATEGORY_TYPES)[number]

/** Rotulos e semantica de cada tipo de movimentacao (secoes 10 e 11). */
export const TRANSACTION_TYPE_META: Record<
  TransactionType,
  { label: string; hint: string; cash: 'in' | 'out'; affectsResult: boolean }
> = {
  ENTRADA: {
    label: 'Entrada',
    hint: 'Receita operacional. Entra no caixa e no resultado.',
    cash: 'in',
    affectsResult: true,
  },
  SAIDA: {
    label: 'Saída',
    hint: 'Despesa operacional. Sai do caixa e do resultado.',
    cash: 'out',
    affectsResult: true,
  },
  APORTE: {
    label: 'Aporte',
    hint: 'Dinheiro do sócio. Entra no caixa mas NÃO é receita nem resultado.',
    cash: 'in',
    affectsResult: false,
  },
  ESTORNO: {
    label: 'Estorno',
    hint: 'Dinheiro devolvido para a operação. Entra no caixa e abate a despesa do centro.',
    cash: 'in',
    affectsResult: true,
  },
}

export const STOCK_MOVEMENT_META: Record<
  StockMovementType,
  { label: string; direction: 'in' | 'out' | 'both' }
> = {
  ENTRADA: { label: 'Entrada', direction: 'in' },
  VENDA: { label: 'Venda', direction: 'out' },
  DEVOLUCAO: { label: 'Devolução', direction: 'in' },
  PERDA: { label: 'Perda', direction: 'out' },
  AVARIA: { label: 'Avaria', direction: 'out' },
  AJUSTE: { label: 'Ajuste', direction: 'both' },
}

export type Category = {
  id: string
  name: string
  type: CategoryType
  active: boolean
  created_at: string
  updated_at: string | null
}

export type CostCenter = {
  id: string
  name: string
  parent_id: string | null
  active: boolean
  created_at: string
  updated_at: string | null
}

/** Linha da view `v_cost_center_hierarchy`. */
export type CostCenterNode = {
  id: string
  name: string
  parent_id: string | null
  active: boolean
  path_active: boolean
  depth: number
  path: string
  ancestor_ids: string[]
  root_id: string
  root_name: string
}

/** Linha do RPC `cost_center_report`. */
export type CostCenterReportRow = {
  cost_center_id: string
  cost_center_name: string
  parent_id: string | null
  depth: number
  path: string
  active: boolean
  direct_total: number | string
  direct_count: number | string
  rollup_total: number | string
  rollup_count: number | string
}

export type Supplier = {
  id: string
  name: string
  document: string | null
  email: string | null
  phone: string | null
  active: boolean
  notes: string | null
  created_at: string
  updated_at: string | null
}

/** Linha da view `v_supplier_stats`. */
export type SupplierStats = Omit<Supplier, 'id' | 'created_at' | 'updated_at'> & {
  supplier_id: string
  total_paid: number | string
  entries_count: number | string
  average_amount: number | string
  last_payment_date: string | null
  top_cost_center_id: string | null
  top_cost_center_name: string | null
  top_cost_center_path: string | null
}

export type Channel = { id: string; name: string; active: boolean }
export type PaymentMethod = { id: string; name: string; active: boolean }

/** Linha da view `v_transaction_full`. */
export type TransactionRow = {
  id: string
  transaction_date: string
  type: TransactionType
  amount: number | string
  signed_amount: number | string
  operational_revenue: number | string
  operational_expense: number | string
  contribution_amount: number | string
  description: string
  notes: string | null
  status: TransactionStatus
  payment_method: string | null
  category_id: string | null
  category_name: string | null
  cost_center_id: string | null
  cost_center_name: string | null
  cost_center_path: string | null
  cost_center_root_id: string | null
  cost_center_root_name: string | null
  cost_center_ancestor_ids: string[] | null
  supplier_id: string | null
  supplier_name: string | null
  channel_id: string | null
  channel_name: string | null
  payment_method_id: string | null
  payment_method_name: string | null
  responsible_id: string | null
  responsible_name: string | null
  created_at: string
  updated_at: string | null
}

export type Investment = {
  id: string
  investment_date: string
  category_id: string | null
  cost_center_id: string | null
  supplier_id: string | null
  description: string
  amount: number | string
  status: TransactionStatus
  notes: string | null
  created_at: string
  updated_at: string | null
}

export type Product = {
  id: string
  sku: string | null
  name: string
  category: string | null
  unit_cost: number | string
  sale_price: number | string
  active: boolean
  created_at: string
  updated_at: string | null
}

/** Linha da view `v_product_stats`. */
export type ProductStats = {
  product_id: string
  sku: string | null
  name: string
  category: string | null
  unit_cost: number | string
  sale_price: number | string
  active: boolean
  stock_balance: number | string
  qty_in: number | string
  qty_sold: number | string
  qty_returned: number | string
  qty_lost: number | string
  qty_damaged: number | string
  qty_adjusted: number | string
  revenue_amount: number | string
  cogs_amount: number | string
  margin_amount: number | string
  margin_percent: number | string
  orders_count: number | string
}

/** Linha da view `v_order_result`. */
export type OrderRow = {
  id: string
  order_number: string
  order_date: string
  customer_name: string | null
  status: OrderStatus
  channel_id: string | null
  channel_name: string | null
  gross_amount: number | string
  discount_amount: number | string
  shipping_charged: number | string
  total_amount: number | string
  cogs_amount: number | string
  items_quantity: number | string
  marketplace_fee: number | string
  gateway_fee: number | string
  tax_amount: number | string
  shipping_cost: number | string
  packaging_cost: number | string
  marketing_cost: number | string
  other_costs: number | string
  extra_costs: number | string
  result_amount: number | string
  result_percent: number | string
  notes: string | null
  created_at: string
  updated_at: string | null
}

export type OrderItem = {
  id: string
  order_id: string
  product_id: string
  quantity: number
  unit_price: number | string
  unit_cost: number | string
  gross_total: number | string
  cost_total: number | string
}

export type StockMovement = {
  id: string
  product_id: string
  type: StockMovementType
  quantity: number
  signed_quantity: number
  movement_date: string
  order_id: string | null
  order_item_id: string | null
  reason: string | null
  notes: string | null
  created_at: string
}

export type Settings = {
  id: string
  operation_name: string | null
  currency: string | null
  start_date: string | null
  initial_balance: number | string
  break_even_target: number | string
  initial_investment: number | string
  updated_at: string | null
}
