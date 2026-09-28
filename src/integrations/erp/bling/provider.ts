import 'server-only'

import { getCurrentOrganizationId } from '@/integrations/organization'
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
import { StoredTokenProvider, loadConnection } from '@/integrations/erp/bling/auth'
import { BlingApiClient } from '@/integrations/erp/bling/client'
import { getBlingCredentials, isBlingReady } from '@/integrations/erp/bling/config'
import * as orders from '@/integrations/erp/bling/orders'
import * as products from '@/integrations/erp/bling/products'
import * as stock from '@/integrations/erp/bling/stock'
import * as suppliers from '@/integrations/erp/bling/suppliers'
import { parseBlingWebhook } from '@/integrations/erp/bling/webhooks'

/**
 * ADAPTER DO BLING (secoes 1 e 39)
 *
 * Junta client + token + modulos de recurso e entrega o contrato ERPProvider.
 * Nao tem logica de negocio propria: negocio esta em src/domain/*, e transporte
 * esta no client. Este arquivo so liga as pontas.
 *
 * ESTADO NA FASE A: sem BLING_CLIENT_ID / BLING_CLIENT_SECRET /
 * BLING_API_BASE_URL e sem os caminhos de endpoint preenchidos em config.ts,
 * `isConfigured()` devolve false e qualquer leitura levanta NOT_CONFIGURED ou
 * NOT_IMPLEMENTED. Nenhuma requisicao de rede sai daqui hoje.
 */
export class BlingProvider implements ERPProvider {
  readonly name: ErpProviderName = 'BLING'

  private client: BlingApiClient | null = null
  private organizationId: string | null

  constructor(organizationId?: string) {
    this.organizationId = organizationId ?? null
  }

  async isConfigured(): Promise<boolean> {
    if (!isBlingReady()) return false

    const connection = await loadConnection(await this.orgId())
    return connection?.status === 'CONNECTED'
  }

  /* ---- Leitura ----------------------------------------------------------- */

  async getProducts(request: ErpPageRequest = {}): Promise<ErpPage<ErpProduct>> {
    return products.listProducts(await this.apiClient(), request)
  }

  async getProduct(externalId: string): Promise<ErpProduct | null> {
    return products.getProduct(await this.apiClient(), externalId)
  }

  async getStocks(request: ErpPageRequest = {}): Promise<ErpPage<ErpStock>> {
    return stock.listStocks(await this.apiClient(), request)
  }

  async getStock(productExternalId: string): Promise<ErpStock[]> {
    return stock.getStockByProduct(await this.apiClient(), productExternalId)
  }

  async getOrders(request: ErpPageRequest = {}): Promise<ErpPage<ErpOrder>> {
    return orders.listOrders(await this.apiClient(), request)
  }

  async getOrder(externalId: string): Promise<ErpOrder | null> {
    return orders.getOrder(await this.apiClient(), externalId)
  }

  async getSuppliers(request: ErpPageRequest = {}): Promise<ErpPage<ErpSupplier>> {
    return suppliers.listSuppliers(await this.apiClient(), request)
  }

  async getProductSuppliers(productExternalId: string): Promise<ErpProductSupplier[]> {
    return suppliers.listProductSuppliers(await this.apiClient(), productExternalId)
  }

  async getWarehouses(): Promise<ErpWarehouse[]> {
    return stock.listWarehouses(await this.apiClient())
  }

  /* ---- Escrita ----------------------------------------------------------- */

  async updateProductPrice(update: ErpPriceUpdate): Promise<ErpWriteResult> {
    return products.updateProductPrice(await this.apiClient(), update)
  }

  async updateProduct(update: ErpProductUpdate): Promise<ErpWriteResult> {
    return products.updateProduct(await this.apiClient(), update)
  }

  /* ---- Webhook ----------------------------------------------------------- */

  parseWebhook(rawBody: string, headers: Headers): ErpEvent {
    return parseBlingWebhook(rawBody, headers)
  }

  /* ---- Interno ----------------------------------------------------------- */

  private async orgId(): Promise<string> {
    this.organizationId ??= await getCurrentOrganizationId()
    return this.organizationId
  }

  /**
   * Client preguicoso: montar so quando alguem realmente for chamar o ERP evita
   * levantar NOT_CONFIGURED em telas que apenas exibem status.
   */
  private async apiClient(): Promise<BlingApiClient> {
    if (this.client) return this.client

    const organizationId = await this.orgId()
    const { loadIntegrationSettings } = await import('@/integrations/erp/settings')
    const settings = await loadIntegrationSettings(organizationId)

    this.client = new BlingApiClient({
      credentials: getBlingCredentials() ?? undefined,
      tokenProvider: new StoredTokenProvider(organizationId),
      requestsPerSecond: settings.apiRequestsPerSecond,
      circuit: {
        threshold: settings.circuitBreakerThreshold,
        cooldownMs: settings.circuitBreakerCooldownSeconds * 1000,
      },
    })

    return this.client
  }
}
