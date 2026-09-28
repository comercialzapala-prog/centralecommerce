'use server'

import { revalidatePath } from 'next/cache'

import {
  actionError,
  actionOk,
  describeDbError,
  readBoolean,
  readRequiredText,
  readText,
  readUuid,
  runAction,
  type ActionState,
} from '@/lib/actions'
// Client COM autorizacao: valida sessao + vinculo antes de devolver a conexao.
// O alias mantem os call sites identicos -- o que muda e a garantia.
import { createAuthedClient as createClient } from '@/lib/auth'

function revalidateSuppliers() {
  revalidatePath('/fornecedores', 'layout')
  revalidatePath('/lancamentos')
  revalidatePath('/dashboard')
}

function readSupplier(formData: FormData) {
  return {
    name: readRequiredText(formData, 'name', 'Nome'),
    document: readText(formData, 'document'),
    email: readText(formData, 'email'),
    phone: readText(formData, 'phone'),
    notes: readText(formData, 'notes'),
  }
}

export async function createSupplier(_prev: ActionState, formData: FormData): Promise<ActionState> {
  return runAction(async () => {
    const supabase = await createClient()
    const { error } = await supabase.from('suppliers').insert(readSupplier(formData))

    if (error) return actionError(describeDbError(error))

    revalidateSuppliers()
    return actionOk('Fornecedor cadastrado.')
  })
}

export async function updateSupplier(_prev: ActionState, formData: FormData): Promise<ActionState> {
  return runAction(async () => {
    const id = readUuid(formData, 'id')
    if (!id) return actionError('Fornecedor não identificado.')

    const supabase = await createClient()
    const { error } = await supabase.from('suppliers').update(readSupplier(formData)).eq('id', id)

    if (error) return actionError(describeDbError(error))

    revalidateSuppliers()
    return actionOk('Fornecedor atualizado.')
  })
}

/** Secao 41: fornecedor com historico e desativado, nunca apagado. */
export async function setSupplierActive(formData: FormData): Promise<void> {
  const id = readUuid(formData, 'id')
  if (!id) return

  const supabase = await createClient()
  await supabase.from('suppliers').update({ active: readBoolean(formData, 'active') }).eq('id', id)

  revalidateSuppliers()
}
