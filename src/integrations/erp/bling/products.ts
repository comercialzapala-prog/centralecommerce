import 'server-only'

import { ErpError } from '@/integrations/erp/errors'
import type {
  ErpPage,
  ErpPageRequest,
  ErpPriceUpdate,
  ErpProduct,
  ErpProductUpdate,
  ErpWriteResult,
} from '@/integrations/erp/types'
import type { BlingApiClient } from '@/integrations/erp/bling/client'
import { extractList, extractOne, mapProduct } from '@/integrations/erp/bling/mapper'

/**
 * PRODUTOS NO BLING (secoes 1 e 37)
 *
 * Modulo de recurso: sabe QUAL endpoint logico chamar e como virar tipo da
 * Central. Nao sabe de rate limit, retry, token nem log -- isso e do client, que
 * e o unico caminho de saida (secao 9).
 */

const DEFAULT_PAGE_SIZE = 100

export async function listProducts(
  client: BlingApiClient,
  request: ErpPageRequest = {},
): Promise<ErpPage<ErpProduct>> {
  const page = request.page ?? 1
  const pageSize = request.pageSize ?? DEFAULT_PAGE_SIZE

  const payload = await client.request<unknown>({
    endpoint: 'products.list',
    query: {
      pagina: page,
      limite: pageSize,
      dataAlteracaoInicial: request.updatedSince ?? undefined,
    },
  })

  const items = extractList(payload, 'produtos').map(mapProduct)

  return {
    items,
    page,
    pageSize,
    // O ERP nao garante total; pagina cheia significa "provavelmente tem mais".
    hasMore: items.length >= pageSize,
  }
}

export async function getProduct(
  client: BlingApiClient,
  externalId: string,
): Promise<ErpProduct | null> {
  try {
    const payload = await client.request<unknown>({
      endpoint: 'products.get',
      params: { id: externalId },
    })

    const one = extractOne(payload)
    return one ? mapProduct(one) : null
  } catch (error) {
    // Produto apagado no ERP nao e falha de integracao: e ausencia (secao 40).
    if (error instanceof ErpError && error.kind === 'NOT_FOUND') return null
    throw error
  }
}

/**
 * Altera o preco (secoes 16, 17 e 18).
 *
 * Confere o preco atual antes de gravar. Se o ERP mudou entre a proposta e a
 * aprovacao, a escrita e abortada: aplicar em cima de um valor que o usuario nao
 * viu seria exatamente a alteracao silenciosa que a secao 16 proibe.
 */
export async function updateProductPrice(
  client: BlingApiClient,
  update: ErpPriceUpdate,
): Promise<ErpWriteResult> {
  const current = await getProduct(client, update.productExternalId)

  if (!current) {
    return {
      ok: false,
      productExternalId: update.productExternalId,
      applied: null,
      error: 'Produto não existe mais no ERP.',
    }
  }

  if (current.price !== null && !almostEqual(current.price, update.currentPrice)) {
    return {
      ok: false,
      productExternalId: update.productExternalId,
      applied: null,
      error:
        `O preço no ERP mudou (${current.price}) desde a proposta (${update.currentPrice}). ` +
        'Recalcule antes de aplicar.',
    }
  }

  const payload = await client.request<unknown>({
    endpoint: 'products.updatePrice',
    method: 'PATCH',
    params: { id: update.productExternalId },
    body: { preco: update.newPrice },
  })

  return {
    ok: true,
    productExternalId: update.productExternalId,
    applied: { preco: update.newPrice, response: payload as Record<string, unknown> | null },
    error: null,
  }
}

export async function updateProduct(
  client: BlingApiClient,
  update: ErpProductUpdate,
): Promise<ErpWriteResult> {
  if (Object.keys(update.patch).length === 0) {
    return {
      ok: false,
      productExternalId: update.productExternalId,
      applied: null,
      error: 'Nada a alterar.',
    }
  }

  const payload = await client.request<unknown>({
    endpoint: 'products.update',
    method: 'PATCH',
    params: { id: update.productExternalId },
    body: update.patch,
  })

  return {
    ok: true,
    productExternalId: update.productExternalId,
    applied: { patch: update.patch, response: payload as Record<string, unknown> | null },
    error: null,
  }
}

/** Centavo e a menor unidade que importa: comparar float direto gera falso negativo. */
function almostEqual(a: number, b: number): boolean {
  return Math.abs(a - b) < 0.005
}
