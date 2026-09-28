import 'server-only'

import { ErpError } from '@/integrations/erp/errors'
import type { ErpPage, ErpPageRequest, ErpStock, ErpWarehouse } from '@/integrations/erp/types'
import type { BlingApiClient } from '@/integrations/erp/bling/client'
import { extractList, mapStock, mapWarehouse } from '@/integrations/erp/bling/mapper'

/**
 * ESTOQUE NO BLING (secoes 20, 21 e 22)
 *
 * O Bling e a fonte do estoque LOCAL. Este modulo nunca produz linha com origem
 * FULL_MERCADO_LIVRE -- o mapper fixa `source: 'LOCAL'` e isso e intencional:
 * atribuir Full ao saldo do ERP faria a Central prometer estoque que nao esta no
 * nosso deposito (secao 22).
 *
 * Tambem nunca devolve "um numero de estoque". Devolve saldo por deposito, com
 * fisico, virtual e reservado separados (secao 21).
 */

const DEFAULT_PAGE_SIZE = 100

export async function listStocks(
  client: BlingApiClient,
  request: ErpPageRequest = {},
): Promise<ErpPage<ErpStock>> {
  const page = request.page ?? 1
  const pageSize = request.pageSize ?? DEFAULT_PAGE_SIZE

  const payload = await client.request<unknown>({
    endpoint: 'stock.list',
    query: {
      pagina: page,
      limite: pageSize,
      dataAlteracaoInicial: request.updatedSince ?? undefined,
    },
  })

  const items = extractList(payload, 'saldos de estoque').map(mapStock)

  return { items, page, pageSize, hasMore: items.length >= pageSize }
}

/** Todos os saldos de um produto -- um por deposito. */
export async function getStockByProduct(
  client: BlingApiClient,
  productExternalId: string,
): Promise<ErpStock[]> {
  try {
    const payload = await client.request<unknown>({
      endpoint: 'stock.getByProduct',
      params: { id: productExternalId },
    })

    return extractList(payload, 'saldos do produto').map(mapStock)
  } catch (error) {
    if (error instanceof ErpError && error.kind === 'NOT_FOUND') return []
    throw error
  }
}

export async function listWarehouses(client: BlingApiClient): Promise<ErpWarehouse[]> {
  const payload = await client.request<unknown>({ endpoint: 'warehouses.list' })
  return extractList(payload, 'depositos').map(mapWarehouse)
}

/**
 * Consolida os saldos LOCAIS de um produto em uma linha por origem.
 *
 * Somar depositos locais e legitimo -- todos sao nossos. Somar origens diferentes
 * nao e, e por isso a funcao agrupa por `source` em vez de devolver um total.
 */
export function consolidateBySource(balances: ErpStock[]): ErpStock[] {
  const groups = new Map<string, ErpStock>()

  for (const balance of balances) {
    const current = groups.get(balance.source)

    if (!current) {
      groups.set(balance.source, {
        ...balance,
        warehouseExternalId: null,
        warehouseName: null,
      })
      continue
    }

    current.physicalQuantity += balance.physicalQuantity
    current.virtualQuantity += balance.virtualQuantity
    current.reservedQuantity += balance.reservedQuantity

    // Mantem a atualizacao mais recente do grupo.
    if (
      balance.updatedAt &&
      (!current.updatedAt || balance.updatedAt > current.updatedAt)
    ) {
      current.updatedAt = balance.updatedAt
    }
  }

  return [...groups.values()]
}
