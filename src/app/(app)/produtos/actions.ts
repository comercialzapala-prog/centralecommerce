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
// Client COM autorizacao: valida sessao + vinculo antes de devolver a conexao.
// O alias mantem os call sites identicos -- o que muda e a garantia.
import { createAuthedClient as createClient } from '@/lib/auth'

function revalidateProducts() {
  revalidatePath('/produtos', 'layout')
  revalidatePath('/movimentacoes')
  revalidatePath('/vendas', 'layout')
  revalidatePath('/dashboard')
}

function readProduct(formData: FormData) {
  return {
    name: readRequiredText(formData, 'name', 'Nome'),
    sku: readText(formData, 'sku'),
    category: readText(formData, 'category'),
    unit_cost: readAmount(formData, 'unit_cost', 'Custo unitário', false),
    sale_price: readAmount(formData, 'sale_price', 'Preço de venda', false),
  }
}

export async function createProduct(_prev: ActionState, formData: FormData): Promise<ActionState> {
  return runAction(async () => {
    const supabase = await createClient()
    const { error } = await supabase.from('products').insert(readProduct(formData))

    if (error) return actionError(describeDbError(error))

    revalidateProducts()
    return actionOk('Produto cadastrado.')
  })
}

export async function updateProduct(_prev: ActionState, formData: FormData): Promise<ActionState> {
  return runAction(async () => {
    const id = readUuid(formData, 'id')
    if (!id) return actionError('Produto não identificado.')

    const supabase = await createClient()
    const { error } = await supabase.from('products').update(readProduct(formData)).eq('id', id)

    if (error) return actionError(describeDbError(error))

    revalidateProducts()
    return actionOk('Produto atualizado.')
  })
}

/**
 * Produto com movimentacao nao e apagado -- vira inativo (secao 41).
 * O estoque e o historico continuam somando no relatorio.
 */
export async function setProductActive(formData: FormData): Promise<void> {
  const id = readUuid(formData, 'id')
  if (!id) return

  const supabase = await createClient()
  await supabase.from('products').update({ active: readBoolean(formData, 'active') }).eq('id', id)

  revalidateProducts()
}
