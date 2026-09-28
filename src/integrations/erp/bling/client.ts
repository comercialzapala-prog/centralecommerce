import 'server-only'

import { ErpError, sanitizeForLog } from '@/integrations/erp/errors'
import {
  CircuitBreaker,
  DEFAULT_RETRY,
  TokenBucket,
  backoffDelay,
  sleep,
  type RetryPolicy,
} from '@/integrations/erp/rate-limit'
import {
  requireBlingCredentials,
  requireEndpoint,
  type BlingCredentials,
  type BlingEndpointName,
} from '@/integrations/erp/bling/config'
import { errorFromNetwork, errorFromResponse } from '@/integrations/erp/bling/errors'

/**
 * WRAPPER UNICO DE HTTP DO BLING (secoes 9, 10, 11, 34)
 *
 * REGRA: nenhum modulo de negocio chama `fetch`. Products, stock, orders e
 * suppliers chamam `client.request(...)`. Isso existe porque rate limit, retry,
 * timeout, refresh de token, breaker e log sanitizado precisam valer para TODA
 * requisicao -- e a unica forma de garantir isso e nao haver outro caminho.
 *
 * Ordem de cada tentativa:
 *   breaker -> token bucket -> fetch com timeout -> classifica -> retry/refresh
 */

/* -------------------------------------------------------------------------- */
/* Token                                                                       */
/* -------------------------------------------------------------------------- */

/**
 * De onde sai o access token. O client nao sabe (e nao deve saber) que existe
 * tabela, criptografia ou OAuth -- so pede o token e pede a renovacao.
 * Implementacao real: src/integrations/erp/bling/auth.ts.
 */
export interface BlingTokenProvider {
  getAccessToken(): Promise<string>
  /** Renova e devolve o novo token. Levanta UNAUTHORIZED se nao for possivel. */
  refreshAccessToken(): Promise<string>
}

/* -------------------------------------------------------------------------- */
/* Requisicao                                                                  */
/* -------------------------------------------------------------------------- */

export type BlingRequestOptions = {
  endpoint: BlingEndpointName
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'
  /** Substitui `{chave}` no caminho do endpoint. */
  params?: Record<string, string | number>
  query?: Record<string, string | number | boolean | null | undefined>
  body?: unknown
}

export type BlingClientOptions = {
  credentials?: BlingCredentials
  tokenProvider: BlingTokenProvider
  requestsPerSecond?: number
  timeoutMs?: number
  retry?: RetryPolicy
  circuit?: { threshold: number; cooldownMs: number }
  /** Chamado a cada tentativa concluida. Usado para contar requisicoes (secao 33). */
  onRequest?: (log: BlingRequestLog) => void
}

export type BlingRequestLog = {
  /** Endpoint LOGICO. Nunca a URL montada (secao 34). */
  endpoint: BlingEndpointName
  method: string
  status: number | null
  durationMs: number
  attempt: number
  ok: boolean
  errorKind: string | null
  errorMessage: string | null
}

const DEFAULT_TIMEOUT_MS = 20_000

export class BlingApiClient {
  private readonly credentials: BlingCredentials
  private readonly tokenProvider: BlingTokenProvider
  private readonly bucket: TokenBucket
  private readonly breaker: CircuitBreaker
  private readonly retry: RetryPolicy
  private readonly timeoutMs: number
  private readonly onRequest?: (log: BlingRequestLog) => void

  /** Contagem desta instancia. Ver nota de instancia em rate-limit.ts. */
  private requestCount = 0

  constructor(options: BlingClientOptions) {
    this.credentials = options.credentials ?? requireBlingCredentials()
    this.tokenProvider = options.tokenProvider
    this.retry = options.retry ?? DEFAULT_RETRY
    this.timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS
    this.onRequest = options.onRequest

    // Secao 9: 3 req/s. Capacidade = taxa, para nao permitir rajada acima do teto.
    const rps = options.requestsPerSecond ?? 3
    this.bucket = new TokenBucket(rps, rps)

    this.breaker = new CircuitBreaker({
      threshold: options.circuit?.threshold ?? 5,
      cooldownMs: options.circuit?.cooldownMs ?? 300_000,
    })
  }

  get stats() {
    return {
      requestCount: this.requestCount,
      circuitState: this.breaker.state,
      consecutiveFailures: this.breaker.consecutiveFailures,
      circuitRetryAt: this.breaker.retryAt,
    }
  }

  /**
   * Executa a requisicao com todas as protecoes.
   *
   * Retry: somente para erro recuperavel (secao 10). 400/403/422 sobem na hora.
   * 401: uma tentativa de refresh e uma repeticao -- se falhar de novo, o token
   * nao e o problema e insistir so gasta cota.
   */
  async request<T>(options: BlingRequestOptions): Promise<T> {
    const method = options.method ?? 'GET'
    let refreshed = false

    for (let attempt = 1; ; attempt += 1) {
      this.breaker.assertCanRequest()

      const started = Date.now()
      let status: number | null = null

      try {
        await this.bucket.take()

        const response = await this.send(options, method)
        status = response.status
        this.requestCount += 1

        if (response.ok) {
          this.breaker.recordSuccess()
          this.log({
            endpoint: options.endpoint,
            method,
            status,
            durationMs: Date.now() - started,
            attempt,
            ok: true,
            errorKind: null,
            errorMessage: null,
          })
          return (await this.readBody(response)) as T
        }

        const bodyText = await response.text().catch(() => '')
        throw errorFromResponse(options.endpoint, response, bodyText)
      } catch (rawError) {
        const error =
          rawError instanceof ErpError
            ? rawError
            : errorFromNetwork(options.endpoint, rawError)

        this.breaker.recordFailure(error)
        this.log({
          endpoint: options.endpoint,
          method,
          status,
          durationMs: Date.now() - started,
          attempt,
          ok: false,
          errorKind: error.kind,
          errorMessage: error.message,
        })

        // Token expirado: renova UMA vez e repete sem gastar tentativa de retry.
        if (error.kind === 'UNAUTHORIZED' && !refreshed) {
          refreshed = true
          await this.tokenProvider.refreshAccessToken()
          continue
        }

        if (!error.retryable || attempt >= this.retry.maxAttempts) throw error

        // O ERP sabe melhor do que nosso backoff quando ele informa Retry-After.
        await sleep(error.retryAfterMs ?? backoffDelay(attempt, this.retry))
      }
    }
  }

  private async send(options: BlingRequestOptions, method: string): Promise<Response> {
    const token = await this.tokenProvider.getAccessToken()
    const url = this.buildUrl(options)

    const headers: Record<string, string> = {
      Authorization: `Bearer ${token}`,
      Accept: 'application/json',
    }
    if (options.body !== undefined) headers['Content-Type'] = 'application/json'

    return fetch(url, {
      method,
      headers,
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
      signal: AbortSignal.timeout(this.timeoutMs),
      // Integracao nunca le de cache: estoque de 5 minutos atras e dado errado.
      cache: 'no-store',
    })
  }

  private buildUrl(options: BlingRequestOptions): string {
    let path = requireEndpoint(options.endpoint)

    for (const [key, value] of Object.entries(options.params ?? {})) {
      path = path.replace(`{${key}}`, encodeURIComponent(String(value)))
    }

    const remaining = path.match(/\{[^}]+\}/)
    if (remaining) {
      throw new ErpError(
        'INVALID_REQUEST',
        `Parametro ${remaining[0]} nao informado para ${options.endpoint}.`,
        { endpoint: options.endpoint },
      )
    }

    const url = new URL(
      path.startsWith('http') ? path : `${this.credentials.apiBaseUrl}/${path.replace(/^\/+/, '')}`,
    )

    for (const [key, value] of Object.entries(options.query ?? {})) {
      if (value === null || value === undefined || value === '') continue
      url.searchParams.set(key, String(value))
    }

    return url.toString()
  }

  private async readBody(response: Response): Promise<unknown> {
    if (response.status === 204) return null
    const text = await response.text()
    if (!text) return null

    try {
      return JSON.parse(text)
    } catch (error) {
      throw new ErpError('UNKNOWN', 'Resposta do Bling nao e JSON valido.', {
        httpStatus: response.status,
        details: { body: text.slice(0, 500) },
        cause: error,
      })
    }
  }

  /**
   * Log estruturado. Passa por sanitizeForLog por disciplina: nunca deve haver
   * segredo aqui, e se um dia alguem adicionar um campo novo, ele ja nasce
   * filtrado (secao 34).
   */
  private log(entry: BlingRequestLog): void {
    this.onRequest?.(entry)

    if (entry.ok) {
      console.info('[bling]', sanitizeForLog(entry))
    } else {
      console.warn('[bling]', sanitizeForLog(entry))
    }
  }
}
