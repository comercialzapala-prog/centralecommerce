'use server'

import { revalidatePath } from 'next/cache'

import {
  actionError,
  actionOk,
  describeDbError,
  readDate,
  readInteger,
  readOneOf,
  readText,
  readUuid,
  runAction,
  type ActionState,
} from '@/lib/actions'
import { createClient } from '@/lib/supabase/server'
import { STOCK_MOVEMENT_TYPES } from '@/lib/types'

function revalidateStock() {
  revalidatePath('/movimentacoes')
  revalidatePath('/produtos', 'layout')
  revalidatePath('/dashboard')
}

/**
 * Movimentacao manual de estoque (secao 22).
 *
 * O SINAL vem do tipo, nao do que o usuario digitar: ENTRADA e DEVOLUCAO
 * somam, VENDA/PERDA/AVARIA subtraem. So AJUSTE aceita numero negativo, que
 * e justamente o caso de acerto de inventario.
 */
export async function createStockMovement(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  return runAction(async () => {
    const productId = readUuid(formData, 'product_id')
    if (!productId) return actionError('Escolha o produto.', { product_id: 'Obrigatório' })

    const type = readOneOf(formData, 'type', STOCK_MOVEMENT_TYPES, 'Tipo')
    const quantity = readInteger(formData, 'quantity', 'Quantidade')

    if (quantity === 0) {
      return actionError('A quantidade não pode ser zero.', { quantity: 'Quantidade inválida' })
    }
    if (quantity < 0 && type !== 'AJUSTE') {
      return actionError(
        'Só o tipo AJUSTE aceita quantidade negativa — os outros tipos já definem o sinal.',
        { quantity: 'Use um número positivo' },
      )
    }

    const supabase = await createClient()
    const { error } = await supabase.from('stock_movements').insert({
      product_id: productId,
      type,
      quantity,
      movement_date: readDate(formData, 'movement_date', 'Data'),
      reason: readText(formData, 'reason'),
      notes: readText(formData, 'notes'),
    })

    if (error) return actionError(describeDbError(error))

    revalidateStock()
    return actionOk('Movimentação registrada.')
  })
}

/**
 * Movimento gerado por pedido NAO pode ser apagado aqui -- ele pertence ao
 * item do pedido e some junto com ele. So o manual e removivel.
 */
export async function deleteStockMovement(formData: FormData): Promise<void> {
  const id = readUuid(formData, 'id')
  if (!id) return

  const supabase = await createClient()
  await supabase.from('stock_movements').delete().eq('id', id).is('order_item_id', null)

  revalidateStock()
}
