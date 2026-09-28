import { ErpError, type ErpErrorKind } from '@/integrations/erp/errors'

/**
 * TRADUCAO DE RESPOSTA HTTP PARA ErpError (secoes 10 e 34)
 *
 * Um lugar so decide o que e recuperavel. `BlingApiClient` nao olha status code:
 * ele chama isto e obedece `error.retryable`.
 */

function kindFromStatus(status: number): ErpErrorKind {
  if (status === 401) return 'UNAUTHORIZED'
  if (status === 403) return 'FORBIDDEN'
  if (status === 404) return 'NOT_FOUND'
  if (status === 429) return 'RATE_LIMITED'
  if (status === 400 || status === 422) return 'INVALID_REQUEST'
  if (status >= 500) return 'SERVER_ERROR'
  return 'UNKNOWN'
}

/**
 * Le Retry-After. Aceita segundos (formato usual) e data HTTP.
 * Devolve null quando o header nao vem -- ai vale o backoff exponencial.
 */
export function parseRetryAfter(headers: Headers): number | null {
  const raw = headers.get('retry-after')
  if (!raw) return null

  const seconds = Number(raw)
  if (Number.isFinite(seconds) && seconds >= 0) return Math.round(seconds * 1000)

  const date = Date.parse(raw)
  if (!Number.isNaN(date)) return Math.max(0, date - Date.now())

  return null
}

/**
 * Monta o ErpError de uma resposta com falha.
 *
 * `bodyText` entra truncado em `details` para diagnostico. Nao ha token no corpo
 * de resposta de erro, mas o truncamento tambem evita despejar payload gigante
 * no log (secao 34).
 */
export function errorFromResponse(
  endpoint: string,
  response: Response,
  bodyText: string,
): ErpError {
  const kind = kindFromStatus(response.status)

  return new ErpError(kind, `Bling respondeu ${response.status} em ${endpoint}.`, {
    httpStatus: response.status,
    endpoint,
    retryAfterMs: parseRetryAfter(response.headers),
    details: { body: bodyText.slice(0, 1000) },
  })
}

/** Falha antes de existir resposta: DNS, TLS, socket, timeout. */
export function errorFromNetwork(endpoint: string, cause: unknown): ErpError {
  const aborted =
    cause instanceof Error && (cause.name === 'AbortError' || cause.name === 'TimeoutError')

  return new ErpError(
    'NETWORK',
    aborted ? `Timeout em ${endpoint}.` : `Falha de rede em ${endpoint}.`,
    { endpoint, cause },
  )
}
