import { createHmac } from 'node:crypto'

import { safeCompare } from '@/integrations/crypto'
import { ErpError } from '@/integrations/erp/errors'
import type { ERPProvider } from '@/integrations/erp/provider'
import type {
  ErpEvent,
  ErpOrder,
  ErpPage,
  ErpPageRequest,
  ErpPriceUpdate,
  ErpProduct,
  ErpProductSupplier,
  ErpProductUpdate,
  ErpProviderName,
  ErpStock,
  ErpSupplier,
  ErpWarehouse,
  ErpWriteResult,
} from '@/integrations/erp/types'
import {
  MOCK_ORDERS,
  MOCK_PRODUCTS,
  MOCK_PRODUCT_SUPPLIERS,
  MOCK_STOCKS,
  MOCK_SUPPLIERS,
  MOCK_WAREHOUSES,
} from '@/integrations/erp/mock/fixtures'

/**
 * PROVIDER DE DESENVOLVIMENTO (secao 1)
 *
 * Implementa o MESMO contrato ERPProvider. E esse o ponto: o IntegrationService,
 * a inteligencia, o auditor e as telas rodam identicos com mock ou com Bling --
 * entao a Fase A ja exercita o caminho real do codigo, nao um desvio.
 *
 * As escritas NAO mudam as fixtures. Elas so validam e devolvem o resultado, de
 * propósito: um mock que "aplica" cria a falsa sensacao de que a integracao de
 * escrita esta pronta. O que precisa ser testado aqui e a proposta e a guarda
 * contra preco desatualizado (secao 16), e isso funciona.
 */
export class MockErpProvider implements ERPProvider {
  readonly name: ErpProviderName = 'MOCK'

  /** Simula latencia para que a interface seja desenvolvida com carregamento real. */
  constructor(private readonly latencyMs = 0) {}

  async isConfigured(): Promise<boolean> {
    return true
  }

  /* ---- Leitura ----------------------------------------------------------- */

  async getProducts(request: ErpPageRequest = {}): Promise<ErpPage<ErpProduct>> {
    return this.paginate(this.filterByUpdatedSince(MOCK_PRODUCTS, request), request)
  }

  async getProduct(externalId: string): Promise<ErpProduct | null> {
    await this.delay()
    return MOCK_PRODUCTS.find((item) => item.externalId === externalId) ?? null
  }

  async getStocks(request: ErpPageRequest = {}): Promise<ErpPage<ErpStock>> {
    return this.paginate(MOCK_STOCKS, request)
  }

  async getStock(productExternalId: string): Promise<ErpStock[]> {
    await this.delay()
    return MOCK_STOCKS.filter((item) => item.productExternalId === productExternalId)
  }

  async getOrders(request: ErpPageRequest = {}): Promise<ErpPage<ErpOrder>> {
    const ordered = [...MOCK_ORDERS].sort((a, b) => b.date.localeCompare(a.date))
    return this.paginate(this.filterByUpdatedSince(ordered, request), request)
  }

  async getOrder(externalId: string): Promise<ErpOrder | null> {
    await this.delay()
    return MOCK_ORDERS.find((item) => item.externalId === externalId) ?? null
  }

  async getSuppliers(request: ErpPageRequest = {}): Promise<ErpPage<ErpSupplier>> {
    return this.paginate(MOCK_SUPPLIERS, request)
  }

  async getProductSuppliers(productExternalId: string): Promise<ErpProductSupplier[]> {
    await this.delay()
    return MOCK_PRODUCT_SUPPLIERS.filter((item) => item.productExternalId === productExternalId)
  }

  async getWarehouses(): Promise<ErpWarehouse[]> {
    await this.delay()
    return MOCK_WAREHOUSES
  }

  /* ---- Escrita ----------------------------------------------------------- */

  async updateProductPrice(update: ErpPriceUpdate): Promise<ErpWriteResult> {
    await this.delay()

    const product = MOCK_PRODUCTS.find((item) => item.externalId === update.productExternalId)
    if (!product) {
      return {
        ok: false,
        productExternalId: update.productExternalId,
        applied: null,
        error: 'Produto não existe no ERP (mock).',
      }
    }

    if (update.newPrice <= 0) {
      return {
        ok: false,
        productExternalId: update.productExternalId,
        applied: null,
        error: 'Preço precisa ser maior que zero.',
      }
    }

    // Mesma guarda do provider real (secao 16): proposta velha nao se aplica.
    if (product.price !== null && Math.abs(product.price - update.currentPrice) >= 0.005) {
      return {
        ok: false,
        productExternalId: update.productExternalId,
        applied: null,
        error: `O preço no ERP (${product.price}) não é mais o da proposta (${update.currentPrice}).`,
      }
    }

    return {
      ok: true,
      productExternalId: update.productExternalId,
      applied: { preco: update.newPrice, mock: true },
      error: null,
    }
  }

  async updateProduct(update: ErpProductUpdate): Promise<ErpWriteResult> {
    await this.delay()

    if (Object.keys(update.patch).length === 0) {
      return {
        ok: false,
        productExternalId: update.productExternalId,
        applied: null,
        error: 'Nada a alterar.',
      }
    }

    return {
      ok: true,
      productExternalId: update.productExternalId,
      applied: { patch: update.patch, mock: true },
      error: null,
    }
  }

  /* ---- Webhook ----------------------------------------------------------- */

  /**
   * Valida assinatura de verdade, com o segredo MOCK_WEBHOOK_SECRET. Assim os
   * testes de assinatura invalida e de evento duplicado (secao 40) rodam sem
   * nenhuma credencial de Bling.
   */
  parseWebhook(rawBody: string, headers: Headers): ErpEvent {
    const secret = process.env.MOCK_WEBHOOK_SECRET ?? 'mock-secret'
    const expected = createHmac('sha256', secret).update(rawBody, 'utf8').digest('hex')
    const received = (headers.get('x-bling-signature-256') ?? '').replace(/^sha256=/i, '').toLowerCase()

    if (!/^[0-9a-f]{64}$/.test(received) || !safeCompare(received, expected)) {
      throw new ErpError('INVALID_SIGNATURE', 'Assinatura do webhook mock nao confere.')
    }

    let parsed: Record<string, unknown>
    try {
      parsed = JSON.parse(rawBody) as Record<string, unknown>
    } catch (error) {
      throw new ErpError('INVALID_REQUEST', 'Corpo do webhook mock nao e JSON.', { cause: error })
    }

    const eventId = typeof parsed.eventId === 'string' ? parsed.eventId : null
    if (!eventId) throw new ErpError('INVALID_REQUEST', 'Webhook mock sem eventId.')

    const type = typeof parsed.event === 'string' ? parsed.event : 'unknown'
    const data = parsed.data as Record<string, unknown> | undefined

    return {
      eventId,
      type,
      resourceType: type.includes('.') ? type.split('.')[0] : null,
      resourceId: typeof data?.id === 'string' ? data.id : null,
      occurredAt: typeof parsed.date === 'string' ? parsed.date : null,
      payload: parsed,
    }
  }

  /* ---- Interno ----------------------------------------------------------- */

  private async delay(): Promise<void> {
    if (this.latencyMs > 0) {
      await new Promise((resolve) => setTimeout(resolve, this.latencyMs))
    }
  }

  private filterByUpdatedSince<T extends { updatedAt: string | null }>(
    items: T[],
    request: ErpPageRequest,
  ): T[] {
    if (!request.updatedSince) return items
    const since = request.updatedSince
    return items.filter((item) => item.updatedAt !== null && item.updatedAt >= since)
  }

  private async paginate<T>(items: T[], request: ErpPageRequest): Promise<ErpPage<T>> {
    await this.delay()

    const page = Math.max(1, request.page ?? 1)
    const pageSize = Math.max(1, request.pageSize ?? 100)
    const start = (page - 1) * pageSize
    const slice = items.slice(start, start + pageSize)

    return { items: slice, page, pageSize, hasMore: start + pageSize < items.length }
  }
}
