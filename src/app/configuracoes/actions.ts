'use server'

import { revalidatePath } from 'next/cache'

import {
  actionError,
  actionOk,
  describeDbError,
  readAmount,
  readBoolean,
  readRequiredText,
  readText,
  readUuid,
  runAction,
  type ActionState,
} from '@/lib/actions'
import { createClient } from '@/lib/supabase/server'

function revalidateSettings() {
  revalidatePath('/configuracoes')
  revalidatePath('/dashboard')
  revalidatePath('/investimentos')
}

/**
 * `initial_investment` e o investimento feito ANTES do sistema existir. Ele
 * entra so no break-even (secao 31); o caixa continua vindo de
 * `initial_balance` + lancamentos.
 */
export async function updateSettings(_prev: ActionState, formData: FormData): Promise<ActionState> {
  return runAction(async () => {
    const id = readUuid(formData, 'id')

    const payload = {
      operation_name: readText(formData, 'operation_name') ?? 'Central E-commerce',
      start_date: readText(formData, 'start_date'),
      initial_balance: readAmount(formData, 'initial_balance', 'Saldo inicial', false),
      initial_investment: readAmount(
        formData,
        'initial_investment',
        'Investimento inicial',
        false,
      ),
    }

    const supabase = await createClient()
    const { error } = id
      ? await supabase.from('settings').update(payload).eq('id', id)
      : await supabase.from('settings').insert(payload)

    if (error) return actionError(describeDbError(error))

    revalidateSettings()
    return actionOk('Configurações salvas.')
  })
}

/* -------------------------------------------------------------------------- */
/* Canais e formas de pagamento                                                */
/* -------------------------------------------------------------------------- */

export async function createChannel(_prev: ActionState, formData: FormData): Promise<ActionState> {
  return runAction(async () => {
    const supabase = await createClient()
    const { error } = await supabase
      .from('channels')
      .insert({ name: readRequiredText(formData, 'name', 'Nome') })

    if (error) return actionError(describeDbError(error))

    revalidatePath('/configuracoes')
    revalidatePath('/vendas', 'layout')
    return actionOk('Canal criado.')
  })
}

export async function setChannelActive(formData: FormData): Promise<void> {
  const id = readUuid(formData, 'id')
  if (!id) return

  const supabase = await createClient()
  await supabase.from('channels').update({ active: readBoolean(formData, 'active') }).eq('id', id)

  revalidatePath('/configuracoes')
  revalidatePath('/vendas', 'layout')
}

export async function createPaymentMethod(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  return runAction(async () => {
    const supabase = await createClient()
    const { error } = await supabase
      .from('payment_methods')
      .insert({ name: readRequiredText(formData, 'name', 'Nome') })

    if (error) return actionError(describeDbError(error))

    revalidatePath('/configuracoes')
    revalidatePath('/lancamentos')
    return actionOk('Forma de pagamento criada.')
  })
}

export async function setPaymentMethodActive(formData: FormData): Promise<void> {
  const id = readUuid(formData, 'id')
  if (!id) return

  const supabase = await createClient()
  await supabase
    .from('payment_methods')
    .update({ active: readBoolean(formData, 'active') })
    .eq('id', id)

  revalidatePath('/configuracoes')
  revalidatePath('/lancamentos')
}
