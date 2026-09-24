'use server'

import { revalidatePath } from 'next/cache'

import {
  actionError,
  actionOk,
  describeDbError,
  readAmount,
  readDate,
  readOneOf,
  readRequiredText,
  readText,
  readUuid,
  runAction,
  type ActionState,
} from '@/lib/actions'
import { createClient } from '@/lib/supabase/server'
import { TRANSACTION_STATUSES } from '@/lib/types'

function revalidateInvestments() {
  revalidatePath('/investimentos')
  revalidatePath('/dashboard')
}

function readInvestment(formData: FormData) {
  return {
    investment_date: readDate(formData, 'investment_date', 'Data'),
    description: readRequiredText(formData, 'description', 'Descrição'),
    amount: readAmount(formData, 'amount', 'Valor'),
    status: readOneOf(formData, 'status', TRANSACTION_STATUSES, 'Status'),
    category_id: readUuid(formData, 'category_id'),
    cost_center_id: readUuid(formData, 'cost_center_id'),
    supplier_id: readUuid(formData, 'supplier_id'),
    notes: readText(formData, 'notes'),
  }
}

/**
 * Investimento e dinheiro que a operacao precisa devolver, nao despesa do mes.
 * Ele fica fora do resultado operacional e alimenta o indicador 0/50
 * (secoes 31 e 32).
 */
export async function createInvestment(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  return runAction(async () => {
    const payload = readInvestment(formData)
    if (payload.amount <= 0) {
      return actionError('O valor precisa ser maior que zero.', { amount: 'Valor inválido' })
    }

    const supabase = await createClient()
    const { error } = await supabase.from('investments').insert(payload)

    if (error) return actionError(describeDbError(error))

    revalidateInvestments()
    return actionOk('Investimento registrado.')
  })
}

export async function updateInvestment(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  return runAction(async () => {
    const id = readUuid(formData, 'id')
    if (!id) return actionError('Investimento não identificado.')

    const payload = readInvestment(formData)
    if (payload.amount <= 0) {
      return actionError('O valor precisa ser maior que zero.', { amount: 'Valor inválido' })
    }

    const supabase = await createClient()
    const { error } = await supabase.from('investments').update(payload).eq('id', id)

    if (error) return actionError(describeDbError(error))

    revalidateInvestments()
    return actionOk('Investimento atualizado.')
  })
}

export async function cancelInvestment(formData: FormData): Promise<void> {
  const id = readUuid(formData, 'id')
  if (!id) return

  const supabase = await createClient()
  await supabase.from('investments').update({ status: 'CANCELADO' }).eq('id', id)

  revalidateInvestments()
}
