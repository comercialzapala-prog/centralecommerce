/**
 * TAXONOMIA DE ERRO DA INTEGRACAO (secoes 10, 11 e 34)
 *
 * A decisao de repetir ou nao NAO pode ficar espalhada em `if (status === 429)`
 * pelo codigo. Ela vive aqui: quem levanta o erro classifica, e o client de
 * retry so pergunta `error.retryable`.
 *
 * Secao 10: repetir 429 e 5xx. NAO repetir 400/403/422 -- erro de contrato
 * nosso nao melhora na segunda tentativa, so queima cota.
 */

export type ErpErrorKind =
  /** Integracao nao configurada: sem client_id/secret ou sem conexao ativa. */
  | 'NOT_CONFIGURED'
  /** Previsto para a Fase B e ainda nao implementado de proposito. */
  | 'NOT_IMPLEMENTED'
  /** 401/invalid_token: token expirou ou foi revogado. */
  | 'UNAUTHORIZED'
  /** 403: token valido, escopo insuficiente (secao 14). */
  | 'FORBIDDEN'
  /** 404: recurso nao existe mais no ERP. */
  | 'NOT_FOUND'
  /** 400/422: payload recusado. Erro nosso -- nao repetir sem investigar. */
  | 'INVALID_REQUEST'
  /** 429: estourou o rate limit. */
  | 'RATE_LIMITED'
  /** 5xx. */
  | 'SERVER_ERROR'
  /** Timeout ou falha de rede. */
  | 'NETWORK'
  /** Circuit breaker aberto: nem tentamos (secao 11). */
  | 'CIRCUIT_OPEN'
  /** Assinatura de webhook invalida (secao 6). */
  | 'INVALID_SIGNATURE'
  /** Qualquer coisa que o mapper nao soube classificar. */
  | 'UNKNOWN'

const RETRYABLE: ReadonlySet<ErpErrorKind> = new Set<ErpErrorKind>([
  'RATE_LIMITED',
  'SERVER_ERROR',
  'NETWORK',
])

export class ErpError extends Error {
  readonly kind: ErpErrorKind
  readonly httpStatus: number | null
  /** Endpoint LOGICO ("products.list"), nunca a URL com query (secao 34). */
  readonly endpoint: string | null
  /** Quanto esperar antes de tentar de novo, quando o ERP informa. */
  readonly retryAfterMs: number | null
  readonly details: Record<string, unknown> | null

  constructor(
    kind: ErpErrorKind,
    message: string,
    options: {
      httpStatus?: number | null
      endpoint?: string | null
      retryAfterMs?: number | null
      details?: Record<string, unknown> | null
      cause?: unknown
    } = {},
  ) {
    super(message, { cause: options.cause })
    this.name = 'ErpError'
    this.kind = kind
    this.httpStatus = options.httpStatus ?? null
    this.endpoint = options.endpoint ?? null
    this.retryAfterMs = options.retryAfterMs ?? null
    this.details = options.details ?? null
  }

  /** Unica fonte da verdade do "vale repetir?" (secao 10). */
  get retryable(): boolean {
    return RETRYABLE.has(this.kind)
  }

  /**
   * Falha que conta para o circuit breaker (secao 11). Erro de contrato nosso
   * (400/422) nao significa que o ERP caiu -- abrir o breaker por causa dele
   * derrubaria a sincronizacao inteira por um bug de payload.
   */
  get countsAsOutage(): boolean {
    return this.kind === 'SERVER_ERROR' || this.kind === 'NETWORK' || this.kind === 'RATE_LIMITED'
  }

  /** Mensagem para a interface: sem token, sem header, sem URL (secao 34). */
  toSafeMessage(): string {
    switch (this.kind) {
      case 'NOT_CONFIGURED':
        return 'Integração não configurada.'
      case 'NOT_IMPLEMENTED':
        return 'Esta etapa da integração ainda não foi implementada.'
      case 'UNAUTHORIZED':
        return 'A autorização com o ERP expirou. Reconecte a integração.'
      case 'FORBIDDEN':
        return 'O ERP recusou o acesso: escopo insuficiente para esta operação.'
      case 'NOT_FOUND':
        return 'O registro não existe mais no ERP.'
      case 'INVALID_REQUEST':
        return 'O ERP recusou os dados enviados.'
      case 'RATE_LIMITED':
        return 'Limite de requisições do ERP atingido. A sincronização continua em seguida.'
      case 'SERVER_ERROR':
      case 'NETWORK':
        return 'ERP temporariamente indisponível.'
      case 'CIRCUIT_OPEN':
        return 'Sincronização suspensa: o ERP falhou várias vezes seguidas.'
      case 'INVALID_SIGNATURE':
        return 'Assinatura do webhook inválida.'
      default:
        return 'Falha na integração com o ERP.'
    }
  }
}

export function notConfigured(what: string): ErpError {
  return new ErpError('NOT_CONFIGURED', `${what} nao configurado.`)
}

export function notImplemented(what: string): ErpError {
  return new ErpError(
    'NOT_IMPLEMENTED',
    `${what} entra na Fase B, quando a conta do ERP existir.`,
  )
}

export function isErpError(error: unknown): error is ErpError {
  return error instanceof ErpError
}

/**
 * Sanitiza o que vai para log (secao 34). Mantem a forma do objeto e substitui
 * qualquer chave que pareca segredo -- inclusive em objetos aninhados.
 */
const SECRET_KEY_PATTERN =
  /(authorization|cookie|token|secret|password|senha|client_id|clientid|signature|apikey|api_key)/i

export function sanitizeForLog(value: unknown, depth = 0): unknown {
  if (depth > 4) return '[deep]'
  if (value === null || typeof value !== 'object') return value

  if (Array.isArray(value)) return value.map((item) => sanitizeForLog(item, depth + 1))

  const out: Record<string, unknown> = {}
  for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
    out[key] = SECRET_KEY_PATTERN.test(key) ? '[redacted]' : sanitizeForLog(item, depth + 1)
  }
  return out
}
