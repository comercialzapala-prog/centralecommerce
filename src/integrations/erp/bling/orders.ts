import 'server-only'

import { ErpError } from '@/integrations/erp/errors'
import type { ErpOrder, ErpPage, ErpPageRequest } from '@/integrations/erp/types'
import type { BlingApiClient } from '@/integrations/erp/bling/client'
import { extractList, extractOne, mapOrder } from '@/integrations/erp/bling/mapper'

/**
 * PEDIDOS NO BLING (secoes 23 e 37)
 *
 * A Central LE pedido para alimentar o dataset analitico de vendas. Ela nao
 * cria, nao fatura e nao muda status: isso e operacao, e operacao e do ERP
 * (secao 37). Por isso este modulo nao tem nenhuma funcao de escrita.
 */

const DEFAULT_PAGE_SIZE = 100

export async function listOrders(
  client: BlingApiClient,
  request: ErpPageRequest = {},
): Promise<ErpPage<ErpOrder>> {
  const page = request.page ?? 1
  const pageSize = request.pageSize ?? DEFAULT_PAGE_SIZE

  const payload = await client.request<unknown>({
    endpoint: 'orders.list',
    query: {
      pagina: page,
      limite: pageSize,
      dataAlteracaoInicial: request.updatedSince ?? undefined,
    },
  })

  const items = extractList(payload, 'pedidos').map(mapOrder)

  return { items, page, pageSize, hasMore: items.length >= pageSize }
}

/**
 * Pedido completo.
 *
 * A listagem de pedido costuma vir sem itens; e o detalhe que traz. Como o
 * dataset de vendas precisa do item para ratear custo por produto (secao 23), a
 * sincronizacao busca o detalhe de cada pedido novo -- e por isso que a fila
 * (secao 8) e o rate limit (secao 9) existem.
 */
export async function getOrder(
  client: BlingApiClient,
  externalId: string,
): Promise<ErpOrder | null> {
  try {
    const payload = await client.request<unknown>({
      endpoint: 'orders.get',
      params: { id: externalId },
    })

    const one = extractOne(payload)
    return one ? mapOrder(one) : null
  } catch (error) {
    if (error instanceof ErpError && error.kind === 'NOT_FOUND') return null
    throw error
  }
}
