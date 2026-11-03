'use server'

import { revalidatePath } from 'next/cache'

import {
  saveOlistTokenAndOptions,
  testOlistConnection,
} from '@/integrations/erp/olist/client'
import {
  type OlistSyncOrdersResult,
  type OlistSyncProductsResult,
  syncOlistOrders,
  syncOlistProducts,
} from '@/integrations/erp/olist/sync'

export type ActionResult<T> =
  | { ok: true; data?: T }
  | { ok: false; error: string }

function ok<T>(data?: T): ActionResult<T> {
  return { ok: true, data }
}

function fail<T = never>(error: string): ActionResult<T> {
  return { ok: false, error }
}

function revalidateOlistViews() {
  revalidatePath('/configuracoes/integracoes/olist')
  revalidatePath('/vendas')
  revalidatePath('/produtos')
  revalidatePath('/sacolas')
  revalidatePath('/estoque')
  revalidatePath('/hoje')
  revalidatePath('/')
}

export async function saveOlistConfigurationAction(input: {
  apiToken?: string
  autoSyncOrders: boolean
  createMissingProducts: boolean
}): Promise<ActionResult<{ accountName?: string | null; accountCnpj?: string | null }>> {
  try {
    const res = await saveOlistTokenAndOptions({
      apiToken: input.apiToken,
      autoSyncOrders: input.autoSyncOrders,
      createMissingProducts: input.createMissingProducts,
    })

    if (!res.ok) {
      return fail(res.error ?? 'Não foi possível validar o Token no Olist ERP.')
    }

    revalidateOlistViews()
    return ok({
      accountName: res.accountName,
      accountCnpj: res.accountCnpj,
    })
  } catch (err) {
    return fail(err instanceof Error ? err.message : 'Erro ao salvar configuração do Olist ERP.')
  }
}

export async function testOlistConnectionAction(): Promise<
  ActionResult<{ accountName?: string; accountCnpj?: string }>
> {
  try {
    const res = await testOlistConnection()
    if (!res.ok) {
      return fail(res.error ?? 'Falha ao conectar com a API do Olist ERP.')
    }
    revalidatePath('/configuracoes/integracoes/olist')
    return ok({
      accountName: res.accountName,
      accountCnpj: res.accountCnpj,
    })
  } catch (err) {
    return fail(err instanceof Error ? err.message : 'Erro ao testar conexão com o Olist ERP.')
  }
}

export async function syncOlistOrdersNowAction(
  days = 7,
): Promise<ActionResult<OlistSyncOrdersResult>> {
  try {
    const res = await syncOlistOrders({ days, maxOrders: 50 })
    if (!res.ok) {
      return fail(res.error ?? res.message)
    }
    revalidateOlistViews()
    return ok(res)
  } catch (err) {
    return fail(err instanceof Error ? err.message : 'Erro ao sincronizar pedidos do Olist ERP.')
  }
}

export async function syncOlistProductsNowAction(
  syncStock = true,
): Promise<ActionResult<OlistSyncProductsResult>> {
  try {
    const res = await syncOlistProducts({ maxPages: 10, maxItems: 500, syncStock })
    if (!res.ok) {
      return fail(res.error ?? res.message)
    }
    revalidateOlistViews()
    return ok(res)
  } catch (err) {
    return fail(err instanceof Error ? err.message : 'Erro ao sincronizar produtos do Olist ERP.')
  }
}
