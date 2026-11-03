import { createHash } from 'node:crypto'

import { safeCompare } from '@/integrations/crypto'
import {
  getOlistOrder,
  getOlistPublicConfig,
  writeStoredOlistConfig,
} from '@/integrations/erp/olist/client'
import { syncSingleOlistOrder } from '@/integrations/erp/olist/sync'
import { IntegrationService } from '@/integrations/erp/service'

export const dynamic = 'force-dynamic'

export async function POST(request: Request): Promise<Response> {
  try {
    const config = await getOlistPublicConfig()
    if (!config.configured) {
      return Response.json(
        { error: 'olist_not_configured', message: 'Configure o Token da API Olist ERP primeiro.' },
        { status: 503 },
      )
    }

    const url = new URL(request.url)
    const querySecret = url.searchParams.get('secret') || request.headers.get('x-olist-secret')
    if (config.webhookSecret && querySecret && !safeCompare(querySecret, config.webhookSecret)) {
      return Response.json({ error: 'invalid_webhook_secret' }, { status: 401 })
    }

    const rawBody = await request.text()
    if (!rawBody.trim()) {
      return Response.json({ error: 'empty_body' }, { status: 400 })
    }

    let payload: Record<string, unknown> = {}
    try {
      payload = JSON.parse(rawBody) as Record<string, unknown>
    } catch {
      const params = new URLSearchParams(rawBody)
      const dadosStr = params.get('dados') || params.get('data')
      if (dadosStr) {
        payload = JSON.parse(dadosStr) as Record<string, unknown>
      }
    }

    const dados =
      payload.dados && typeof payload.dados === 'object'
        ? (payload.dados as Record<string, unknown>)
        : payload

    const tipo = String(payload.tipo || dados.tipo || 'pedido').toLowerCase()
    const externalOrderId = String(
      dados.idVendaTiny || dados.idPedido || dados.id_pedido || dados.id || '',
    ).trim()

    const service = await IntegrationService.create({ provider: 'OLIST' })
    const eventHash = createHash('sha256').update(rawBody).digest('hex').slice(0, 24)
    const eventId = `olist:${tipo}:${externalOrderId || 'event'}:${eventHash}`

    const recorded = await service.recordEvent({
      eventId,
      type: `olist.${tipo}`,
      resourceType: 'ORDER',
      resourceId: externalOrderId || 'unknown',
      occurredAt: new Date().toISOString(),
      payload,
    })

    if (recorded.status === 'DUPLICATE') {
      return Response.json({ status: 'duplicate', eventId }, { status: 200 })
    }

    if (
      config.autoSyncOrders &&
      externalOrderId &&
      (tipo.includes('pedido') || tipo.includes('venda') || tipo.includes('nota'))
    ) {
      const orderDetail = await getOlistOrder(externalOrderId)
      const syncResult = await syncSingleOlistOrder(orderDetail, {
        createMissingProducts: config.createMissingProducts,
      })

      const nowIso = new Date().toISOString()
      await writeStoredOlistConfig({
        last_order_sync_at: nowIso,
        last_sync_summary: {
          type: 'WEBHOOK',
          at: nowIso,
          imported: syncResult.action === 'IMPORTED' ? 1 : 0,
          updated: syncResult.action === 'UPDATED' ? 1 : 0,
          skipped: syncResult.action === 'SKIPPED' ? 1 : 0,
          bagsDeducted: syncResult.bagsDeducted,
          message: `Webhook Olist (#${orderDetail.numero || externalOrderId}): ${syncResult.action} (${syncResult.bagsDeducted} sacolas baixadas).`,
        },
      })
    }

    return Response.json({ status: 'processed', eventId, externalOrderId }, { status: 200 })
  } catch (err) {
    console.error('[webhook:olist] erro ao processar evento:', err)
    return Response.json(
      {
        error: 'processing_failed',
        message: err instanceof Error ? err.message : 'Erro interno no webhook Olist.',
      },
      { status: 500 },
    )
  }
}

export async function GET(): Promise<Response> {
  const config = await getOlistPublicConfig()
  return Response.json({
    endpoint: '/api/webhooks/olist',
    provider: 'OLIST',
    configured: config.configured,
    autoSyncOrders: config.autoSyncOrders,
    accepts: 'POST',
  })
}
