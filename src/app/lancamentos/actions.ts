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
import { TRANSACTION_STATUSES, TRANSACTION_TYPES } from '@/lib/types'

function revalidateFinance() {
  revalidatePath('/lancamentos')
  revalidatePath('/dashboard')
  revalidatePath('/centros-de-custo', 'layout')
  revalidatePath('/fornecedores', 'layout')
}

/** Campos comuns a criacao e edicao de um lancamento. */
function readTransaction(formData: FormData) {
  const type = readOneOf(formData, 'type', TRANSACTION_TYPES, 'Tipo')
  const status = readOneOf(formData, 'status', TRANSACTION_STATUSES, 'Status')
  const costCenterId = readUuid(formData, 'cost_center_id')

  // Secao 2: centro de custo responde "qual area consumiu". Saida sem centro
  // vira dinheiro invisivel no drill-down, entao e obrigatorio.
  if (type === 'SAIDA' && !costCenterId) {
    throw new Error('Toda saída precisa de um centro de custo, senão ela some do drill-down.')
  }

  return {
    transaction_date: readDate(formData, 'transaction_date', 'Data'),
    type,
    status,
    description: readRequiredText(formData, 'description', 'Descrição'),
    amount: readAmount(formData, 'amount', 'Valor'),
    category_id: readUuid(formData, 'category_id'),
    cost_center_id: costCenterId,
    supplier_id: readUuid(formData, 'supplier_id'),
    channel_id: readUuid(formData, 'channel_id'),
    payment_method_id: readUuid(formData, 'payment_method_id'),
    notes: readText(formData, 'notes'),
  }
}

export async function createTransaction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  return runAction(async () => {
    const payload = readTransaction(formData)

    if (payload.amount <= 0) {
      return actionError('O valor precisa ser maior que zero.', { amount: 'Valor inválido' })
    }

    // Lê o número de parcelas — padrão 1 (lançamento único)
    const installmentsRaw = Number(formData.get('installments') ?? '1')
    const installments =
      Number.isInteger(installmentsRaw) && installmentsRaw >= 2 && installmentsRaw <= 36
        ? installmentsRaw
        : 1

    const supabase = await createClient()

    if (installments === 1) {
      // Caminho normal: um único lançamento
      const { error } = await supabase.from('transactions').insert(payload)
      if (error) return actionError(describeDbError(error))
    } else {
      // Parcelado: cria N lançamentos, um por mês
      const totalAmount = payload.amount
      const baseAmount = Math.floor((totalAmount / installments) * 100) / 100
      // A última parcela absorve os centavos de arredondamento
      const lastAmount = Math.round((totalAmount - baseAmount * (installments - 1)) * 100) / 100

      const [year, month, day] = payload.transaction_date.split('-').map(Number)

      const rows = Array.from({ length: installments }, (_, i) => {
        // Avança i meses a partir da data da 1ª parcela
        const date = new Date(Date.UTC(year, month - 1 + i, day))
        const dateStr = date.toISOString().slice(0, 10)

        return {
          ...payload,
          amount: i === installments - 1 ? lastAmount : baseAmount,
          transaction_date: dateStr,
          status: 'PENDENTE' as const,
          description: `${payload.description} (${i + 1}/${installments})`,
        }
      })

      const { error } = await supabase.from('transactions').insert(rows)
      if (error) return actionError(describeDbError(error))
    }

    revalidateFinance()
    return actionOk(
      installments > 1
        ? `${installments} parcelas lançadas com sucesso.`
        : 'Lançamento registrado.',
    )
  })
}


export async function updateTransaction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  return runAction(async () => {
    const id = readUuid(formData, 'id')
    if (!id) return actionError('Lançamento não identificado.')

    const payload = readTransaction(formData)

    if (payload.amount <= 0) {
      return actionError('O valor precisa ser maior que zero.', { amount: 'Valor inválido' })
    }

    const supabase = await createClient()
    const { error } = await supabase.from('transactions').update(payload).eq('id', id)

    if (error) return actionError(describeDbError(error))

    revalidateFinance()
    return actionOk('Lançamento atualizado.')
  })
}

/**
 * Secao 41: nada de DELETE fisico em registro financeiro.
 * Cancelar zera o efeito do lancamento em caixa, receita e despesa
 * (a view v_transaction_full ja trata CANCELADO como zero) e mantem a trilha.
 */
export async function cancelTransaction(formData: FormData): Promise<void> {
  const id = readUuid(formData, 'id')
  if (!id) return

  const supabase = await createClient()
  await supabase.from('transactions').update({ status: 'CANCELADO' }).eq('id', id)

  revalidateFinance()
}

export async function restoreTransaction(formData: FormData): Promise<void> {
  const id = readUuid(formData, 'id')
  if (!id) return

  const supabase = await createClient()
  await supabase.from('transactions').update({ status: 'PAGO' }).eq('id', id)

  revalidateFinance()
}
