import 'server-only'

import { ErpError } from '@/integrations/erp/errors'
import type { ErpPage, ErpPageRequest, ErpProductSupplier, ErpSupplier } from '@/integrations/erp/types'
import type { BlingApiClient } from '@/integrations/erp/bling/client'
import { extractList, mapProductSupplier, mapSupplier } from '@/integrations/erp/bling/mapper'

/**
 * FORNECEDORES NO BLING (secoes 26 e 27)
 *
 * ATENCAO A UMA AMBIGUIDADE DO PROJETO: a tabela `suppliers` da Central hoje e
 * "para quem o dinheiro foi pago" (ela soma transactions em v_supplier_stats).
 * O fornecedor do Bling e "de quem compramos a mercadoria". Sao conceitos
 * diferentes com o mesmo nome.
 *
 * Por isso a sincronizacao NAO deve sobrescrever `suppliers`: o vinculo entre um
 * fornecedor do ERP e um fornecedor financeiro e uma decisao do usuario, e o
 * fornecedor do ERP entra primeiro em erp_snapshots (secao 4).
 *
 * O dado que a inteligencia realmente precisa daqui e `leadTimeDays` do vinculo
 * produto-fornecedor: e ele que alimenta o ponto de reposicao (secao 26).
 */

const DEFAULT_PAGE_SIZE = 100

export async function listSuppliers(
  client: BlingApiClient,
  request: ErpPageRequest = {},
): Promise<ErpPage<ErpSupplier>> {
  const page = request.page ?? 1
  const pageSize = request.pageSize ?? DEFAULT_PAGE_SIZE

  const payload = await client.request<unknown>({
    endpoint: 'suppliers.list',
    query: { pagina: page, limite: pageSize },
  })

  const items = extractList(payload, 'fornecedores').map(mapSupplier)

  return { items, page, pageSize, hasMore: items.length >= pageSize }
}

export async function listProductSuppliers(
  client: BlingApiClient,
  productExternalId: string,
): Promise<ErpProductSupplier[]> {
  try {
    const payload = await client.request<unknown>({
      endpoint: 'productSuppliers.listByProduct',
      params: { id: productExternalId },
    })

    return extractList(payload, 'fornecedores do produto').map(mapProductSupplier)
  } catch (error) {
    if (error instanceof ErpError && error.kind === 'NOT_FOUND') return []
    throw error
  }
}

/**
 * Prazo de entrega a usar no ponto de reposicao (secao 26).
 *
 * Preferencia: fornecedor marcado como padrao > menor prazo informado > null.
 * Devolver null e melhor do que devolver um numero inventado: o auditor sabe
 * acusar "fornecedor sem prazo" e cair no default configurado
 * (integration_settings.default_supplier_lead_days), que o usuario controla.
 */
export function resolveLeadTimeDays(suppliers: ErpProductSupplier[]): number | null {
  const withLeadTime = suppliers.filter(
    (supplier) => supplier.leadTimeDays !== null && supplier.leadTimeDays > 0,
  )
  if (withLeadTime.length === 0) return null

  const primary = withLeadTime.find((supplier) => supplier.primary)
  if (primary) return primary.leadTimeDays

  return Math.min(...withLeadTime.map((supplier) => supplier.leadTimeDays as number))
}
