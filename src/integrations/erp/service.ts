import 'server-only'

import { ErpError, sanitizeForLog } from '@/integrations/erp/errors'
import { loadIntegrationSettings } from '@/integrations/erp/settings'
import type {
  ErpEvent,
  ErpStock,
  ProductChannel,
  StockSource,
} from '@/integrations/erp/types'
import { getCurrentOrganizationId } from '@/integrations/organization'
import { createAdminClient } from '@/lib/supabase/admin'

/**
 * INTEGRATION SERVICE (secoes 4, 6, 7, 8, 11 e 17)
 *
 * Toda ESCRITA relacionada a integracao passa por aqui. E o outro lado da moeda
 * do ERPProvider: aquele fala com o ERP, este fala com o nosso banco.
 *
 *   Bling -> ERPProvider -> IntegrationService -> Supabase -> telas
 *
 * A interface nunca chama o ERP (secao 4): ela le as tabelas que este servico
 * alimenta. Por isso toda funcao daqui usa o client de service role -- as
 * tabelas de integracao nao dao escrita para anon nem authenticated (secao 36).
 *
 * PostgREST/Postgres: 23505 = unique_violation. E o codigo que sinaliza evento
 * reenviado (secao 6) e job duplicado (secao 8) -- os dois casos em que "ja
 * existe" e sucesso, nao erro.
 */

const UNIQUE_VIOLATION = '23505'

export type RecordEventResult =
  | { status: 'RECORDED'; eventRowId: string }
  /** O ERP reenviou: nao processar de novo (secao 6). */
  | { status: 'DUPLICATE' }

export class IntegrationService {
  private constructor(
    private readonly organizationId: string,
    private readonly provider: string,
  ) {}

  static async create(options: { organizationId?: string; provider?: string } = {}) {
    return new IntegrationService(
      options.organizationId ?? (await getCurrentOrganizationId()),
      options.provider ?? 'BLING',
    )
  }

  private get db() {
    return createAdminClient()
  }

  /* ======================================================================== */
  /* Eventos (secoes 6 e 8)                                                   */
  /* ======================================================================== */

  /**
   * Registra o evento recebido. Chamado pelo endpoint de webhook DEPOIS de a
   * assinatura conferir -- evento nao verificado nunca chega aqui.
   *
   * Idempotencia vem do UNIQUE(provider, external_event_id) no banco, nao de um
   * `select` antes do `insert`: entre o select e o insert cabe um segundo
   * webhook, e so a constraint fecha essa janela.
   */
  async recordEvent(event: ErpEvent): Promise<RecordEventResult> {
    const { data, error } = await this.db
      .from('integration_events')
      .insert({
        organization_id: this.organizationId,
        provider: this.provider,
        external_event_id: event.eventId,
        event_type: event.type,
        payload: event.payload,
        status: 'PENDING',
        signature_valid: true,
      })
      .select('id')
      .single()

    if (error) {
      if (error.code === UNIQUE_VIOLATION) return { status: 'DUPLICATE' }
      throw new ErpError('UNKNOWN', `Falha ao registrar evento: ${error.message}`)
    }

    await this.touchWebhookReceived()
    return { status: 'RECORDED', eventRowId: data.id as string }
  }

  /**
   * Enfileira trabalho. O webhook faz isto e responde 2xx (secao 8) -- nada de
   * processamento pesado no handler.
   *
   * Job identico ja pendente nao duplica: o indice parcial
   * ux_integration_jobs_pending garante, e a colisao e tratada como sucesso.
   */
  async enqueueJob(job: {
    jobType: string
    resourceType?: string | null
    resourceId?: string | null
    payload?: Record<string, unknown>
    priority?: number
    eventRowId?: string | null
  }): Promise<{ status: 'ENQUEUED' | 'ALREADY_QUEUED'; jobId?: string }> {
    const { data, error } = await this.db
      .from('integration_jobs')
      .insert({
        organization_id: this.organizationId,
        provider: this.provider,
        job_type: job.jobType,
        resource_type: job.resourceType ?? null,
        resource_id: job.resourceId ?? null,
        payload: job.payload ?? {},
        priority: job.priority ?? 100,
        event_id: job.eventRowId ?? null,
        status: 'PENDING',
      })
      .select('id')
      .single()

    if (error) {
      if (error.code === UNIQUE_VIOLATION) return { status: 'ALREADY_QUEUED' }
      throw new ErpError('UNKNOWN', `Falha ao enfileirar job: ${error.message}`)
    }

    return { status: 'ENQUEUED', jobId: data.id as string }
  }

  async markEventProcessed(eventRowId: string): Promise<void> {
    await this.db
      .from('integration_events')
      .update({ status: 'PROCESSED', processed_at: new Date().toISOString(), error: null })
      .eq('id', eventRowId)
  }

  async markEventFailed(eventRowId: string, error: unknown): Promise<void> {
    await this.db
      .from('integration_events')
      .update({ status: 'FAILED', error: describeError(error) })
      .eq('id', eventRowId)
  }

  /* ======================================================================== */
  /* Snapshot (secoes 4 e 7)                                                  */
  /* ======================================================================== */

  /**
   * Grava o payload cru do ERP.
   *
   * TOLERANCIA A ORDEM (secao 7): `sourceUpdatedAt` e comparado com o que ja
   * esta guardado e o mais ANTIGO nao sobrescreve o mais novo. E isso que
   * permite `product.updated` chegar antes de `product.created` sem estragar o
   * estado -- e por isso o upsert nao e um simples "ultimo a chegar vence".
   *
   * Quando o ERP nao informa data de alteracao, `sourceUpdatedAt` vem null e o
   * job deve buscar o estado atual pela API antes de concluir (secao 7).
   */
  async upsertSnapshot(input: {
    resourceType: 'PRODUCT' | 'STOCK' | 'ORDER' | 'SUPPLIER' | 'PRODUCT_SUPPLIER' | 'INVOICE' | 'WAREHOUSE'
    externalId: string
    data: Record<string, unknown>
    sourceUpdatedAt?: string | null
  }): Promise<{ status: 'INSERTED' | 'UPDATED' | 'SKIPPED_STALE' }> {
    const existing = await this.db
      .from('erp_snapshots')
      .select('id,last_synced_at,data')
      .eq('organization_id', this.organizationId)
      .eq('source', this.provider)
      .eq('resource_type', input.resourceType)
      .eq('external_id', input.externalId)
      .maybeSingle()

    const storedUpdatedAt = readUpdatedAt(existing.data?.data)

    if (
      existing.data &&
      input.sourceUpdatedAt &&
      storedUpdatedAt &&
      storedUpdatedAt > input.sourceUpdatedAt
    ) {
      return { status: 'SKIPPED_STALE' }
    }

    const { error } = await this.db.from('erp_snapshots').upsert(
      {
        organization_id: this.organizationId,
        source: this.provider,
        resource_type: input.resourceType,
        external_id: input.externalId,
        data: input.data,
        content_hash: null,
        last_synced_at: new Date().toISOString(),
        deleted_at: null,
      },
      { onConflict: 'organization_id,source,resource_type,external_id' },
    )

    if (error) throw new ErpError('UNKNOWN', `Falha ao gravar snapshot: ${error.message}`)

    return { status: existing.data ? 'UPDATED' : 'INSERTED' }
  }

  /** Recurso apagado no ERP: marca, nao remove -- o historico segue valendo. */
  async markSnapshotDeleted(resourceType: string, externalId: string): Promise<void> {
    await this.db
      .from('erp_snapshots')
      .update({ deleted_at: new Date().toISOString() })
      .eq('organization_id', this.organizationId)
      .eq('source', this.provider)
      .eq('resource_type', resourceType)
      .eq('external_id', externalId)
  }

  /* ======================================================================== */
  /* Estoque (secoes 20, 21 e 22)                                             */
  /* ======================================================================== */

  /**
   * Grava um saldo. Uma linha por (produto, origem, deposito).
   *
   * Nao existe funcao "setStock(produto, numero)" de proposito: ela obrigaria a
   * escolher uma origem, e misturar LOCAL com FULL e exatamente o que a secao 22
   * proibe.
   */
  async upsertInventoryBalance(input: {
    productId: string
    source: StockSource
    warehouseExternalId?: string | null
    warehouseName?: string | null
    physicalQuantity: number
    virtualQuantity: number
    reservedQuantity: number
  }): Promise<void> {
    const { error } = await this.db.from('inventory_balances').upsert(
      {
        organization_id: this.organizationId,
        product_id: input.productId,
        source: input.source,
        // '' e nao null: e a chave do UNIQUE (ver migration).
        warehouse_external_id: input.warehouseExternalId ?? '',
        warehouse_name: input.warehouseName ?? null,
        physical_quantity: input.physicalQuantity,
        virtual_quantity: input.virtualQuantity,
        reserved_quantity: input.reservedQuantity,
        updated_at: new Date().toISOString(),
        synced_at: new Date().toISOString(),
      },
      { onConflict: 'organization_id,product_id,source,warehouse_external_id' },
    )

    if (error) throw new ErpError('UNKNOWN', `Falha ao gravar saldo: ${error.message}`)
  }

  /** Converte o saldo lido do ERP em linha de inventory_balances. */
  async upsertFromErpStock(productId: string, balance: ErpStock): Promise<void> {
    await this.upsertInventoryBalance({
      productId,
      source: balance.source,
      warehouseExternalId: balance.warehouseExternalId,
      warehouseName: balance.warehouseName,
      physicalQuantity: balance.physicalQuantity,
      virtualQuantity: balance.virtualQuantity,
      reservedQuantity: balance.reservedQuantity,
    })
  }

  /* ======================================================================== */
  /* Identidade de produto (secao 3)                                          */
  /* ======================================================================== */

  async linkProductChannel(input: {
    productId: string
    channel: ProductChannel
    externalProductId: string
    externalVariantId?: string | null
    externalSku?: string | null
  }): Promise<void> {
    const { error } = await this.db.from('product_channels').upsert(
      {
        organization_id: this.organizationId,
        product_id: input.productId,
        channel: input.channel,
        external_product_id: input.externalProductId,
        // '' e nao null: e a chave do UNIQUE (ver migration).
        external_variant_id: input.externalVariantId ?? '',
        external_sku: input.externalSku ?? null,
        active: true,
        last_synced_at: new Date().toISOString(),
      },
      { onConflict: 'organization_id,channel,external_product_id,external_variant_id' },
    )

    if (error) throw new ErpError('UNKNOWN', `Falha ao vincular produto ao canal: ${error.message}`)
  }

  /** Resolve id externo -> uuid interno. Null quando o produto ainda nao tem vinculo. */
  async resolveProductId(channel: ProductChannel, externalProductId: string): Promise<string | null> {
    const { data, error } = await this.db
      .from('product_channels')
      .select('product_id')
      .eq('organization_id', this.organizationId)
      .eq('channel', channel)
      .eq('external_product_id', externalProductId)
      .maybeSingle()

    if (error) throw new ErpError('UNKNOWN', `Falha ao resolver produto: ${error.message}`)
    return (data?.product_id as string | undefined) ?? null
  }

  /* ======================================================================== */
  /* Escritas propostas (secoes 15, 16, 17 e 18)                              */
  /* ======================================================================== */

  /**
   * Registra uma alteracao PROPOSTA. Nunca executa.
   *
   * O modo de automacao (secao 15) decide o destino:
   *   READ_ONLY         -> a proposta nasce CANCELLED; a Central so observa.
   *   APPROVAL_REQUIRED -> nasce PROPOSED e espera aprovacao humana.
   *   AUTOMATIC         -> nasce PROPOSED tambem. Quem pode promover para
   *                        APPROVED e a regra explicitamente autorizada, nunca
   *                        este metodo -- "AUTOMATIC" nao significa "qualquer
   *                        alteracao passa" (secao 15).
   */
  async proposeAction(input: {
    actionType: string
    resourceType: string
    resourceId?: string | null
    productId?: string | null
    beforeData?: Record<string, unknown> | null
    proposedData: Record<string, unknown>
    reason: string
    impactPercent?: number | null
    riskLevel?: 'AUTO' | 'REVIEW' | 'APPROVAL' | 'DOUBLE_CONFIRM' | null
    requestedBy?: string | null
  }): Promise<{ id: string; status: string }> {
    const settings = await loadIntegrationSettings(this.organizationId)

    const status = settings.automationMode === 'READ_ONLY' ? 'CANCELLED' : 'PROPOSED'
    const reason =
      status === 'CANCELLED'
        ? `${input.reason} (registrada sem execução: integração em modo READ_ONLY)`
        : input.reason

    const { data, error } = await this.db
      .from('integration_actions')
      .insert({
        organization_id: this.organizationId,
        provider: this.provider,
        action_type: input.actionType,
        resource_type: input.resourceType,
        resource_id: input.resourceId ?? null,
        product_id: input.productId ?? null,
        status,
        before_data: input.beforeData ?? null,
        proposed_data: input.proposedData,
        reason,
        impact_percent: input.impactPercent ?? null,
        risk_level: input.riskLevel ?? null,
        requested_by: input.requestedBy ?? null,
      })
      .select('id,status')
      .single()

    if (error) throw new ErpError('UNKNOWN', `Falha ao registrar ação proposta: ${error.message}`)
    return { id: data.id as string, status: data.status as string }
  }

  /* ======================================================================== */
  /* Saude da integracao (secoes 11 e 33)                                     */
  /* ======================================================================== */

  async recordSyncSuccess(): Promise<void> {
    await this.db
      .from('erp_connections')
      .update({
        health: 'HEALTHY',
        consecutive_failures: 0,
        degraded_until: null,
        last_successful_sync: new Date().toISOString(),
        last_error: null,
      })
      .eq('organization_id', this.organizationId)
      .eq('provider', this.provider)
  }

  /**
   * Conta a falha e, no limite configurado, marca DEGRADED com janela de
   * suspensao (secao 11). Erro de contrato nosso (422, por exemplo) nao entra na
   * contagem: nao e o ERP que caiu, e derrubar a sincronizacao por isso seria
   * confundir bug com indisponibilidade.
   */
  async recordSyncFailure(error: unknown): Promise<{ health: string; failures: number }> {
    const settings = await loadIntegrationSettings(this.organizationId)

    const countsAsOutage = error instanceof ErpError ? error.countsAsOutage : true

    const { data } = await this.db
      .from('erp_connections')
      .select('consecutive_failures')
      .eq('organization_id', this.organizationId)
      .eq('provider', this.provider)
      .maybeSingle()

    const failures = (data?.consecutive_failures ?? 0) + (countsAsOutage ? 1 : 0)
    const degraded = failures >= settings.circuitBreakerThreshold

    await this.db
      .from('erp_connections')
      .update({
        consecutive_failures: failures,
        health: degraded ? 'DEGRADED' : 'HEALTHY',
        degraded_until: degraded
          ? new Date(Date.now() + settings.circuitBreakerCooldownSeconds * 1000).toISOString()
          : null,
        last_error: describeError(error),
      })
      .eq('organization_id', this.organizationId)
      .eq('provider', this.provider)

    if (degraded) {
      console.warn('[integration] degraded', sanitizeForLog({ failures, error: describeError(error) }))
    }

    return { health: degraded ? 'DEGRADED' : 'HEALTHY', failures }
  }

  /** Sincronizacao nao critica deve parar enquanto o ERP estiver degradado. */
  async isSyncSuspended(): Promise<boolean> {
    const { data } = await this.db
      .from('erp_connections')
      .select('degraded_until')
      .eq('organization_id', this.organizationId)
      .eq('provider', this.provider)
      .maybeSingle()

    const until = data?.degraded_until as string | null | undefined
    return Boolean(until && Date.parse(until) > Date.now())
  }

  async touchWebhookReceived(): Promise<void> {
    await this.db
      .from('erp_connections')
      .update({ last_webhook_at: new Date().toISOString() })
      .eq('organization_id', this.organizationId)
      .eq('provider', this.provider)
  }

  async touchReconciliation(): Promise<void> {
    await this.db
      .from('erp_connections')
      .update({ last_reconciliation_at: new Date().toISOString() })
      .eq('organization_id', this.organizationId)
      .eq('provider', this.provider)
  }
}

/* -------------------------------------------------------------------------- */
/* Auxiliares                                                                  */
/* -------------------------------------------------------------------------- */

/** Mensagem curta e sem segredo para a coluna de erro (secao 34). */
function describeError(error: unknown): string {
  if (error instanceof ErpError) return `${error.kind}: ${error.message}`.slice(0, 500)
  if (error instanceof Error) return error.message.slice(0, 500)
  return String(error).slice(0, 500)
}

/** Data de alteracao dentro do payload guardado, quando existir. */
function readUpdatedAt(data: unknown): string | null {
  if (data === null || typeof data !== 'object') return null
  const record = data as Record<string, unknown>
  for (const key of ['updatedAt', 'dataAlteracao', 'updated_at']) {
    const value = record[key]
    if (typeof value === 'string' && value.trim() !== '') return value
  }
  return null
}
