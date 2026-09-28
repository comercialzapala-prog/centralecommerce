import 'server-only'

import { createHmac } from 'node:crypto'

import { safeCompare } from '@/integrations/crypto'
import { ErpError, notConfigured } from '@/integrations/erp/errors'
import type { ErpEvent } from '@/integrations/erp/types'
import { getBlingWebhookSecret } from '@/integrations/erp/bling/config'

/**
 * WEBHOOK DO BLING (secoes 5, 6 e 7)
 *
 * Duas regras absolutas:
 *
 * 1. A assinatura e calculada sobre o CORPO CRU, byte a byte. Se alguem fizer
 *    `await request.json()` e depois `JSON.stringify` para validar, a assinatura
 *    passa a nunca conferir -- reserializar muda espacos e ordem de chaves. Por
 *    isso a funcao recebe `rawBody: string` e nao um objeto.
 *
 * 2. Evento sem assinatura valida nao vira evento. Nao registra, nao enfileira,
 *    nao processa (secao 6).
 *
 * `eventId` e obrigatorio: e a chave UNIQUE de integration_events e a unica
 * defesa contra o reenvio do mesmo evento. Sem ele, recusamos o payload em vez
 * de inventar um id -- id gerado por nos nao deduplica nada.
 */

export const BLING_SIGNATURE_HEADER = 'x-bling-signature-256'

/**
 * HMAC SHA-256 do corpo cru, em hex.
 *
 * O header pode vir como "sha256=<hex>" ou so "<hex>" dependendo do provedor;
 * ambos sao aceitos e o prefixo e removido antes da comparacao. Confirmar o
 * formato exato na Fase B -- a comparacao em si nao muda.
 */
export function computeSignature(rawBody: string, secret: string): string {
  return createHmac('sha256', secret).update(rawBody, 'utf8').digest('hex')
}

export function verifySignature(rawBody: string, headerValue: string | null, secret: string): boolean {
  if (!headerValue) return false

  const received = headerValue.trim().replace(/^sha256=/i, '').toLowerCase()
  if (!/^[0-9a-f]{64}$/.test(received)) return false

  return safeCompare(received, computeSignature(rawBody, secret))
}

/* -------------------------------------------------------------------------- */
/* Parsing                                                                     */
/* -------------------------------------------------------------------------- */

type Raw = Record<string, unknown>

const EVENT_ID_KEYS = ['eventId', 'event_id', 'id'] as const
const EVENT_TYPE_KEYS = ['event', 'eventType', 'type', 'topic'] as const
const OCCURRED_AT_KEYS = ['date', 'dateTime', 'occurredAt', 'timestamp'] as const

function firstString(raw: Raw, keys: readonly string[]): string | null {
  for (const key of keys) {
    const value = raw[key]
    if (typeof value === 'string' && value.trim() !== '') return value.trim()
    if (typeof value === 'number' && Number.isFinite(value)) return String(value)
  }
  return null
}

/**
 * Valida a assinatura e normaliza o evento.
 *
 * Levanta:
 *   NOT_CONFIGURED    -- BLING_WEBHOOK_SECRET ausente (nao validamos sem segredo)
 *   INVALID_SIGNATURE -- assinatura ausente ou incorreta
 *   INVALID_REQUEST   -- corpo nao e JSON ou nao tem eventId
 */
export function parseBlingWebhook(rawBody: string, headers: Headers): ErpEvent {
  const secret = getBlingWebhookSecret()
  if (!secret) throw notConfigured('BLING_WEBHOOK_SECRET')

  if (!verifySignature(rawBody, headers.get(BLING_SIGNATURE_HEADER), secret)) {
    throw new ErpError('INVALID_SIGNATURE', 'Assinatura do webhook nao confere.')
  }

  let parsed: unknown
  try {
    parsed = JSON.parse(rawBody)
  } catch (error) {
    throw new ErpError('INVALID_REQUEST', 'Corpo do webhook nao e JSON valido.', { cause: error })
  }

  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new ErpError('INVALID_REQUEST', 'Corpo do webhook nao e um objeto.')
  }

  const raw = parsed as Raw
  const eventId = firstString(raw, EVENT_ID_KEYS)

  if (!eventId) {
    throw new ErpError(
      'INVALID_REQUEST',
      'Webhook sem eventId: sem ele nao ha como impedir processamento duplicado.',
      { details: { availableKeys: Object.keys(raw) } },
    )
  }

  const type = firstString(raw, EVENT_TYPE_KEYS) ?? 'unknown'
  const data = (raw.data ?? raw.payload) as Raw | undefined

  return {
    eventId,
    type,
    resourceType: resourceTypeFromEvent(type),
    resourceId:
      firstString(raw, ['resourceId', 'entityId']) ??
      (data ? firstString(data, ['id', 'idProduto', 'idPedido']) : null),
    occurredAt: firstString(raw, OCCURRED_AT_KEYS),
    payload: raw,
  }
}

/**
 * "product.updated" -> "product". So a parte antes do ponto.
 * Nao tenta adivinhar quando o formato e outro: devolve null e o job decide.
 */
export function resourceTypeFromEvent(eventType: string): string | null {
  const [resource] = eventType.split('.')
  return resource && resource !== eventType ? resource : null
}
