'use server'

import { revalidatePath } from 'next/cache'

import {
  actionError,
  actionOk,
  describeDbError,
  readBoolean,
  readOneOf,
  readRequiredText,
  readUuid,
  runAction,
  type ActionState,
} from '@/lib/actions'
import { createClient } from '@/lib/supabase/server'
import { CATEGORY_TYPES } from '@/lib/types'

function revalidateCategories() {
  revalidatePath('/categorias')
  revalidatePath('/lancamentos')
  revalidatePath('/dashboard')
}

export async function createCategory(_prev: ActionState, formData: FormData): Promise<ActionState> {
  return runAction(async () => {
    const supabase = await createClient()
    const { error } = await supabase.from('categories').insert({
      name: readRequiredText(formData, 'name', 'Nome'),
      type: readOneOf(formData, 'type', CATEGORY_TYPES, 'Tipo'),
    })

    if (error) return actionError(describeDbError(error))

    revalidateCategories()
    return actionOk('Categoria criada.')
  })
}

export async function updateCategory(_prev: ActionState, formData: FormData): Promise<ActionState> {
  return runAction(async () => {
    const id = readUuid(formData, 'id')
    if (!id) return actionError('Categoria não identificada.')

    const supabase = await createClient()
    const { error } = await supabase
      .from('categories')
      .update({
        name: readRequiredText(formData, 'name', 'Nome'),
        type: readOneOf(formData, 'type', CATEGORY_TYPES, 'Tipo'),
      })
      .eq('id', id)

    if (error) return actionError(describeDbError(error))

    revalidateCategories()
    return actionOk('Categoria atualizada.')
  })
}

/** Categoria usada em lancamento e desativada, nunca apagada (secao 41). */
export async function setCategoryActive(formData: FormData): Promise<void> {
  const id = readUuid(formData, 'id')
  if (!id) return

  const supabase = await createClient()
  await supabase.from('categories').update({ active: readBoolean(formData, 'active') }).eq('id', id)

  revalidateCategories()
}
