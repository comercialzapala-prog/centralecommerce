import 'server-only'

import { notConfigured } from '@/integrations/erp/errors'
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

/**
 * CONTRATO UNICO DE ERP (secao 1)
 *
 * Toda leitura e toda escrita no ERP passa por esta interface. Consequencias
 * praticas, e sao o ponto do arquivo:
 *
 *  - nenhuma page, component, hook ou server action importa `bling/*`;
 *  - trocar de ERP e escrever outra implementacao desta interface;
 *  - o mock de desenvolvimento implementa o MESMO contrato, entao o codigo que
 *    consome nao sabe (nem precisa saber) se ha Bling do outro lado.
 *
 * `server-only`: importar isso de um Client Component quebra o build de
 * proposito -- e a garantia de que token nenhum chega ao navegador (secao 36).
 */
export interface ERPProvider {
  readonly name: ErpProviderName

  /** Verdadeiro quando existe credencial e conexao utilizavel. */
  isConfigured(): Promise<boolean>

  /* ---- Leitura (secao 39, Fase A) ---------------------------------------- */

  getProducts(request?: ErpPageRequest): Promise<ErpPage<ErpProduct>>
  getProduct(externalId: string): Promise<ErpProduct | null>

  /**
   * Saldos. Cada linha vem com `source` e deposito proprios -- o provider NUNCA
   * devolve um numero unico de estoque (secoes 20, 21 e 22).
   */
  getStocks(request?: ErpPageRequest): Promise<ErpPage<ErpStock>>
  getStock(productExternalId: string): Promise<ErpStock[]>

  getOrders(request?: ErpPageRequest): Promise<ErpPage<ErpOrder>>
  getOrder(externalId: string): Promise<ErpOrder | null>

  getSuppliers(request?: ErpPageRequest): Promise<ErpPage<ErpSupplier>>
  getProductSuppliers(productExternalId: string): Promise<ErpProductSupplier[]>

  getWarehouses(): Promise<ErpWarehouse[]>

  /* ---- Escrita (secao 39, Fase C -- so depois de leitura estavel) -------- */

  /**
   * Preco. Recebe tambem o preco atual lido na proposta: a implementacao deve
   * recusar se o ERP tiver mudado no meio (secao 16 -- nada silencioso).
   */
  updateProductPrice(update: ErpPriceUpdate): Promise<ErpWriteResult>
  updateProduct(update: ErpProductUpdate): Promise<ErpWriteResult>

  /* ---- Webhooks (secoes 5 e 6) ------------------------------------------ */

  /**
   * Valida a assinatura sobre o corpo CRU e devolve o evento normalizado.
   * Levanta ErpError('INVALID_SIGNATURE') quando nao confere -- nunca devolve
   * evento de origem nao verificada.
   */
  parseWebhook(rawBody: string, headers: Headers): ErpEvent
}

/* -------------------------------------------------------------------------- */
/* Resolucao do provider                                                       */
/* -------------------------------------------------------------------------- */

/**
 * Qual adapter usar.
 *
 * ERP_PROVIDER=mock  -> MockErpProvider (desenvolvimento; ver mock/provider.ts)
 * ERP_PROVIDER=bling -> BlingProvider   (exige credencial; hoje devolve
 *                                        NOT_CONFIGURED porque nao temos conta)
 *
 * Sem a variavel: 'mock' em desenvolvimento, 'bling' em producao. Assim um
 * deploy nunca serve dado falso sem alguem ter pedido explicitamente.
 */
export function resolveProviderName(): ErpProviderName {
  const raw = process.env.ERP_PROVIDER?.trim().toLowerCase()
  if (raw === 'mock') return 'MOCK'
  if (raw === 'bling') return 'BLING'
  return process.env.NODE_ENV === 'production' ? 'BLING' : 'MOCK'
}

/**
 * Fabrica o provider. Import dinamico para que o bundle de producao nao carregue
 * as fixtures do mock e vice-versa.
 */
export async function getErpProvider(): Promise<ERPProvider> {
  const name = resolveProviderName()

  if (name === 'MOCK') {
    if (process.env.NODE_ENV === 'production' && process.env.ERP_PROVIDER?.toLowerCase() !== 'mock') {
      throw notConfigured('ERP em producao com provider mock')
    }
    const { MockErpProvider } = await import('@/integrations/erp/mock/provider')
    return new MockErpProvider()
  }

  const { BlingProvider } = await import('@/integrations/erp/bling/provider')
  return new BlingProvider()
}
