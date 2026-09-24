'use server'

import { revalidatePath } from 'next/cache'

import {
  actionError,
  actionOk,
  describeDbError,
  readBoolean,
  readRequiredText,
  readUuid,
  runAction,
  type ActionState,
} from '@/lib/actions'
import { createClient } from '@/lib/supabase/server'

function revalidateCostCenters() {
  revalidatePath('/centros-de-custo', 'layout')
  revalidatePath('/dashboard')
  revalidatePath('/lancamentos')
}

export async function createCostCenter(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  return runAction(async () => {
    const name = readRequiredText(formData, 'name', 'Nome')
    const parentId = readUuid(formData, 'parent_id')

    const supabase = await createClient()
    const { error } = await supabase.from('cost_centers').insert({ name, parent_id: parentId })

    if (error) return actionError(describeDbError(error))

    revalidateCostCenters()
    return actionOk(
      parentId ? `Subcentro "${name}" criado.` : `Centro de custo "${name}" criado.`,
    )
  })
}

export async function updateCostCenter(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  return runAction(async () => {
    const id = readUuid(formData, 'id')
    if (!id) return actionError('Centro de custo não identificado.')

    const name = readRequiredText(formData, 'name', 'Nome')
    const parentId = readUuid(formData, 'parent_id')

    if (parentId === id) {
      return actionError('Um centro de custo não pode ser pai de si mesmo.')
    }

    const supabase = await createClient()
    const { error } = await supabase
      .from('cost_centers')
      .update({ name, parent_id: parentId })
      .eq('id', id)

    if (error) return actionError(describeDbError(error))

    revalidateCostCenters()
    return actionOk('Centro de custo atualizado.')
  })
}

/**
 * Secao 5: centro com historico NUNCA e apagado -- so vira active = false.
 *
 * Desativar derruba a subarvore inteira (nao sobra filho ativo pendurado num
 * pai invisivel). Reativar sobe pelos ancestrais, para o centro realmente
 * voltar a aparecer, sem ressuscitar irmaos que foram desativados de proposito.
 */
export async function setCostCenterActive(formData: FormData): Promise<void> {
  const id = readUuid(formData, 'id')
  const active = readBoolean(formData, 'active')
  if (!id) return

  const supabase = await createClient()
  let ids: string[] = [id]

  if (active) {
    const { data } = await supabase
      .from('v_cost_center_hierarchy')
      .select('ancestor_ids')
      .eq('id', id)
      .maybeSingle()
    if (data?.ancestor_ids?.length) ids = data.ancestor_ids
  } else {
    const { data } = await supabase
      .from('v_cost_center_hierarchy')
      .select('id')
      .contains('ancestor_ids', [id])
    if (data?.length) ids = data.map((row) => row.id)
  }

  await supabase.from('cost_centers').update({ active }).in('id', ids)

  revalidateCostCenters()
}
