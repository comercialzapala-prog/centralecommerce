import 'server-only'

import { ErpError } from '@/integrations/erp/errors'

/**
 * RATE LIMIT, RETRY E CIRCUIT BREAKER (secoes 9, 10 e 11)
 *
 * LIMITACAO QUE PRECISA ESTAR ESCRITA: este controle e por INSTANCIA do processo.
 * Na Vercel cada funcao serverless tem a sua memoria, entao N instancias
 * simultaneas podem somar mais de 3 req/s no total.
 *
 * Por que serve assim mesmo: o consumo real da integracao e de um job
 * sequencial (a fila de integration_jobs) e do webhook, que nao chama o ERP.
 * Se a sincronizacao passar a rodar concorrente, o ponto de troca e um so --
 * trocar `TokenBucket` por um contador compartilhado (tabela de contagem no
 * Postgres ou Upstash). Nenhum modulo de negocio muda, porque todos passam por
 * BlingApiClient.
 */

/* -------------------------------------------------------------------------- */
/* Token bucket                                                                */
/* -------------------------------------------------------------------------- */

export class TokenBucket {
  private tokens: number
  private lastRefill: number

  constructor(
    private readonly capacity: number,
    private readonly refillPerSecond: number,
  ) {
    this.tokens = capacity
    this.lastRefill = Date.now()
  }

  /** Espera o tempo necessario para haver credito e consome 1. */
  async take(): Promise<void> {
    for (;;) {
      this.refill()
      if (this.tokens >= 1) {
        this.tokens -= 1
        return
      }
      const deficit = 1 - this.tokens
      await sleep(Math.ceil((deficit / this.refillPerSecond) * 1000))
    }
  }

  private refill(): void {
    const now = Date.now()
    const elapsedSeconds = (now - this.lastRefill) / 1000
    if (elapsedSeconds <= 0) return
    this.tokens = Math.min(this.capacity, this.tokens + elapsedSeconds * this.refillPerSecond)
    this.lastRefill = now
  }
}

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, Math.max(0, ms)))
}

/* -------------------------------------------------------------------------- */
/* Backoff                                                                     */
/* -------------------------------------------------------------------------- */

export type RetryPolicy = {
  maxAttempts: number
  baseDelayMs: number
  maxDelayMs: number
}

export const DEFAULT_RETRY: RetryPolicy = {
  maxAttempts: 4,
  baseDelayMs: 500,
  maxDelayMs: 15_000,
}

/**
 * Exponencial com jitter (secao 10). O jitter existe para que varias instancias
 * que falharam juntas nao voltem juntas -- sem ele o retry vira a propria
 * tempestade que a secao 11 quer evitar.
 */
export function backoffDelay(attempt: number, policy: RetryPolicy = DEFAULT_RETRY): number {
  const exponential = policy.baseDelayMs * 2 ** (attempt - 1)
  const capped = Math.min(exponential, policy.maxDelayMs)
  return Math.round(capped / 2 + Math.random() * (capped / 2))
}

/* -------------------------------------------------------------------------- */
/* Circuit breaker                                                             */
/* -------------------------------------------------------------------------- */

export type CircuitState = 'CLOSED' | 'OPEN' | 'HALF_OPEN'

export type CircuitOptions = {
  /** Falhas consecutivas de indisponibilidade que abrem o circuito. */
  threshold: number
  /** Quanto tempo fica aberto antes de deixar passar uma tentativa. */
  cooldownMs: number
}

/**
 * Impede a tempestade de requisicoes quando o ERP cai (secao 11).
 *
 * Somente falha de indisponibilidade conta (ErpError.countsAsOutage): 422 e bug
 * nosso e nao deve suspender a sincronizacao inteira.
 *
 * O estado durável de verdade -- o que o painel mostra -- e
 * erp_connections.health / consecutive_failures / degraded_until, atualizado
 * pelo IntegrationService. Esta classe e o freio dentro do processo.
 */
export class CircuitBreaker {
  private failures = 0
  private openedAt: number | null = null

  constructor(private readonly options: CircuitOptions) {}

  get state(): CircuitState {
    if (this.openedAt === null) return 'CLOSED'
    return Date.now() - this.openedAt >= this.options.cooldownMs ? 'HALF_OPEN' : 'OPEN'
  }

  get consecutiveFailures(): number {
    return this.failures
  }

  /** Quando volta a aceitar tentativa. Null quando o circuito esta fechado. */
  get retryAt(): Date | null {
    if (this.openedAt === null) return null
    return new Date(this.openedAt + this.options.cooldownMs)
  }

  /** Levanta CIRCUIT_OPEN quando nao se deve nem tentar. */
  assertCanRequest(): void {
    if (this.state === 'OPEN') {
      throw new ErpError('CIRCUIT_OPEN', 'Circuito aberto: ERP indisponivel.', {
        details: { retryAt: this.retryAt?.toISOString() ?? null, failures: this.failures },
      })
    }
  }

  recordSuccess(): void {
    this.failures = 0
    this.openedAt = null
  }

  recordFailure(error: unknown): void {
    if (error instanceof ErpError && !error.countsAsOutage) return

    this.failures += 1
    if (this.failures >= this.options.threshold) {
      this.openedAt = Date.now()
    }
  }
}
