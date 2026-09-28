import { isErpError } from '@/integrations/erp/errors'
import { getErpProvider } from '@/integrations/erp/provider'
import { IntegrationService } from '@/integrations/erp/service'
import { loadIntegrationSettings } from '@/integrations/erp/settings'
import { getCurrentOrganizationId } from '@/integrations/organization'

/**
 * WEBHOOK DO BLING (secoes 5, 6, 7 e 8)
 *
 * ESTE ENDPOINT NASCE DESLIGADO.
 * `integration_settings.webhooks_enabled` tem default false, e enquanto estiver
 * false a resposta e 503. E o que a secao 5 pede: "criar endpoint futuro, mas NAO
 * ativar ainda".
 *
 * Para ligar na Fase B: confirmar a assinatura com um evento real, preencher
 * BLING_WEBHOOK_SECRET e mudar a flag no banco. Nenhum codigo daqui muda.
 *
 * O handler faz exatamente as quatro coisas da secao 8 e nada mais:
 *   1. valida a assinatura sobre o corpo CRU;
 *   2. registra o evento (UNIQUE no eventId mata o reenvio);
 *   3. enfileira o trabalho;
 *   4. responde 2xx rapido.
 *
 * Processamento pesado NAO acontece aqui. O Bling reenvia o que demora, e cada
 * reenvio viraria trabalho duplicado.
 */

// Webhook nunca pode ser cacheado nem pre-renderizado: cada corpo e unico.
export const dynamic = 'force-dynamic'

export async function POST(request: Request): Promise<Response> {
  let organizationId: string

  try {
    organizationId = await getCurrentOrganizationId()
  } catch {
    // Sem organizacao, nao ha onde registrar. 503 para o Bling tentar de novo.
    return json(503, { error: 'integration_unavailable' })
  }

  const settings = await loadIntegrationSettings(organizationId)

  if (!settings.webhooksEnabled) {
    // 503 e nao 404 de proposito: o endpoint existe e volta a funcionar quando
    // for habilitado. 404 faria o Bling desativar a assinatura do lado dele.
    return json(503, {
      error: 'webhooks_disabled',
      message: 'Webhooks desabilitados. Habilite em integration_settings.webhooks_enabled.',
    })
  }

  // CORPO CRU. Nao troque por request.json(): a assinatura e calculada sobre
  // estes bytes, e reserializar o objeto invalida o HMAC para sempre.
  const rawBody = await request.text()

  try {
    const provider = await getErpProvider()
    const event = provider.parseWebhook(rawBody, request.headers)

    const service = await IntegrationService.create({ organizationId })
    const recorded = await service.recordEvent(event)

    // Reenvio do mesmo evento: 200 para o Bling parar de tentar, sem reprocessar.
    if (recorded.status === 'DUPLICATE') {
      return json(200, { status: 'duplicate', eventId: event.eventId })
    }

    await service.enqueueJob({
      jobType: 'PROCESS_EVENT',
      resourceType: event.resourceType,
      resourceId: event.resourceId,
      payload: { eventType: event.type },
      eventRowId: recorded.eventRowId,
    })

    return json(202, { status: 'accepted', eventId: event.eventId })
  } catch (error) {
    if (isErpError(error)) {
      // Assinatura invalida: 401 e nenhum registro. Evento nao verificado nao
      // entra no banco (secao 6).
      if (error.kind === 'INVALID_SIGNATURE') return json(401, { error: 'invalid_signature' })

      // Payload que nunca vai ser aceito: 400, para o Bling nao reenviar em loop.
      if (error.kind === 'INVALID_REQUEST') {
        return json(400, { error: 'invalid_payload', message: error.toSafeMessage() })
      }

      if (error.kind === 'NOT_CONFIGURED') {
        return json(503, { error: 'not_configured', message: error.toSafeMessage() })
      }
    }

    // Falha nossa: 500 para o Bling reenviar. Melhor reprocessar um evento
    // duplicado (o UNIQUE resolve) do que perde-lo.
    console.error('[webhook:bling] falha ao processar', {
      message: error instanceof Error ? error.message : String(error),
    })
    return json(500, { error: 'processing_failed' })
  }
}

/** GET existe apenas para diagnostico do painel. Nao aceita evento. */
export async function GET(): Promise<Response> {
  try {
    const organizationId = await getCurrentOrganizationId()
    const settings = await loadIntegrationSettings(organizationId)

    return json(200, {
      endpoint: '/api/webhooks/bling',
      enabled: settings.webhooksEnabled,
      accepts: 'POST',
    })
  } catch {
    return json(503, { error: 'integration_unavailable' })
  }
}

function json(status: number, body: Record<string, unknown>): Response {
  return Response.json(body, { status })
}
