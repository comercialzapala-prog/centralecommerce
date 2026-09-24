'use server'

import { revalidatePath } from 'next/cache'

import {
  actionError,
  actionOk,
  describeDbError,
  readAmount,
  readDate,
  readInteger,
  readOneOf,
  readRequiredText,
  readText,
  readUuid,
  runAction,
  ValidationError,
  type ActionState,
} from '@/lib/actions'
import { parseAmount } from '@/lib/format'
import { createClient } from '@/lib/supabase/server'
import { ORDER_STATUSES } from '@/lib/types'

function revalidateSales() {
  revalidatePath('/vendas', 'layout')
  revalidatePath('/produtos', 'layout')
  revalidatePath('/movimentacoes')
  revalidatePath('/dashboard')
}

/** Cabecalho do pedido. gross_amount e total_amount sao calculados no banco. */
function readOrderHeader(formData: FormData) {
  return {
    order_number: readRequiredText(formData, 'order_number', 'Número do pedido'),
    order_date: readDate(formData, 'order_date', 'Data'),
    channel_id: readUuid(formData, 'channel_id'),
    customer_name: readText(formData, 'customer_name'),
    status: readOneOf(formData, 'status', ORDER_STATUSES, 'Status'),
    discount_amount: readAmount(formData, 'discount_amount', 'Desconto', false),
    shipping_charged: readAmount(formData, 'shipping_charged', 'Frete cobrado', false),
    marketplace_fee: readAmount(formData, 'marketplace_fee', 'Taxa do marketplace', false),
    gateway_fee: readAmount(formData, 'gateway_fee', 'Taxa do gateway', false),
    tax_amount: readAmount(formData, 'tax_amount', 'Imposto', false),
    shipping_cost: readAmount(formData, 'shipping_cost', 'Frete pago pela empresa', false),
    packaging_cost: readAmount(formData, 'packaging_cost', 'Embalagem', false),
    marketing_cost: readAmount(formData, 'marketing_cost', 'Marketing atribuído', false),
    other_costs: readAmount(formData, 'other_costs', 'Outros custos', false),
    notes: readText(formData, 'notes'),
  }
}

type IncomingItem = {
  product_id: string
  quantity: number
  unit_price: number
  unit_cost: number
}

/** Os itens viajam como JSON porque a quantidade de linhas e dinamica. */
function readItems(formData: FormData): IncomingItem[] {
  const raw = formData.get('items_json')
  if (typeof raw !== 'string' || !raw.trim()) return []

  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    throw new ValidationError('Não foi possível ler os itens do pedido.')
  }

  if (!Array.isArray(parsed)) return []

  return parsed.flatMap((entry): IncomingItem[] => {
    if (typeof entry !== 'object' || entry === null) return []
    const item = entry as Record<string, unknown>

    const productId = typeof item.product_id === 'string' ? item.product_id : ''
    if (!productId) return []

    const quantity = Number(item.quantity)
    if (!Number.isInteger(quantity) || quantity <= 0) {
      throw new ValidationError('Cada item precisa de uma quantidade inteira maior que zero.')
    }

    const unitPrice = parseAmount(item.unit_price as string | number) ?? 0
    const unitCost = parseAmount(item.unit_cost as string | number) ?? 0

    if (unitPrice < 0 || unitCost < 0) {
      throw new ValidationError('Preço e custo do item não podem ser negativos.')
    }

    return [{ product_id: productId, quantity, unit_price: unitPrice, unit_cost: unitCost }]
  })
}

/**
 * Secao 23: a venda cria o PEDIDO e os ITENS. A saida de mercadoria vem de
 * brinde -- o trigger `order_items_sync_stock` cria um stock_movement do tipo
 * VENDA para cada item, entao o estoque baixa sozinho e nunca fica divergente.
 */
export async function createOrder(_prev: ActionState, formData: FormData): Promise<ActionState> {
  return runAction(async () => {
    const header = readOrderHeader(formData)
    const items = readItems(formData)

    if (items.length === 0) {
      return actionError('Adicione pelo menos um produto ao pedido.')
    }

    const supabase = await createClient()
    const { data: order, error } = await supabase
      .from('orders')
      .insert(header)
      .select('id')
      .single()

    if (error) return actionError(describeDbError(error))

    const { error: itemsError } = await supabase.from('order_items').insert(
      items.map((item) => ({
        order_id: order.id,
        product_id: item.product_id,
        quantity: item.quantity,
        unit_price: item.unit_price,
        unit_cost: item.unit_cost,
        // Recalculados pelo trigger; enviados porque as colunas sao NOT NULL.
        gross_total: item.quantity * item.unit_price,
        cost_total: item.quantity * item.unit_cost,
      })),
    )

    if (itemsError) {
      // Pedido sem item nenhum e lixo: desfaz para nao sujar o relatorio.
      await supabase.from('orders').delete().eq('id', order.id)
      return actionError(describeDbError(itemsError))
    }

    revalidateSales()
    return actionOk(`Pedido ${header.order_number} registrado.`)
  })
}

export async function updateOrder(_prev: ActionState, formData: FormData): Promise<ActionState> {
  return runAction(async () => {
    const id = readUuid(formData, 'id')
    if (!id) return actionError('Pedido não identificado.')

    const supabase = await createClient()
    const { error } = await supabase.from('orders').update(readOrderHeader(formData)).eq('id', id)

    if (error) return actionError(describeDbError(error))

    revalidateSales()
    return actionOk('Pedido atualizado.')
  })
}

export async function addOrderItem(_prev: ActionState, formData: FormData): Promise<ActionState> {
  return runAction(async () => {
    const orderId = readUuid(formData, 'order_id')
    const productId = readUuid(formData, 'product_id')
    if (!orderId) return actionError('Pedido não identificado.')
    if (!productId) return actionError('Escolha o produto.', { product_id: 'Obrigatório' })

    const quantity = readInteger(formData, 'quantity', 'Quantidade')
    if (quantity <= 0) {
      return actionError('A quantidade precisa ser maior que zero.', { quantity: 'Inválida' })
    }

    const unitPrice = readAmount(formData, 'unit_price', 'Preço unitário', false)
    const unitCost = readAmount(formData, 'unit_cost', 'Custo unitário', false)

    const supabase = await createClient()
    const { error } = await supabase.from('order_items').insert({
      order_id: orderId,
      product_id: productId,
      quantity,
      unit_price: unitPrice,
      unit_cost: unitCost,
      gross_total: quantity * unitPrice,
      cost_total: quantity * unitCost,
    })

    if (error) return actionError(describeDbError(error))

    revalidateSales()
    return actionOk('Item adicionado.')
  })
}

/** Remover o item remove junto a baixa de estoque (FK on delete cascade). */
export async function removeOrderItem(formData: FormData): Promise<void> {
  const id = readUuid(formData, 'id')
  if (!id) return

  const supabase = await createClient()
  await supabase.from('order_items').delete().eq('id', id)

  revalidateSales()
}

/**
 * Cancelar nao apaga: o pedido continua na lista, mas sai de faturamento,
 * resultado e estoque (v_product_stats ignora movimento de pedido cancelado).
 */
export async function setOrderStatus(formData: FormData): Promise<void> {
  const id = readUuid(formData, 'id')
  const status = readText(formData, 'status')
  if (!id || !status || !ORDER_STATUSES.includes(status as (typeof ORDER_STATUSES)[number])) return

  const supabase = await createClient()
  await supabase.from('orders').update({ status }).eq('id', id)

  revalidateSales()
}
