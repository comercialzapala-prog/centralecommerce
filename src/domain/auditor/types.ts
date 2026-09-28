import type { IntelligenceParams, ProductInsight } from '@/domain/intelligence'
import type { FinancialImpact, ImpactKind } from '@/domain/auditor/impact'

/**
 * AUDITOR OPERACIONAL (secoes 27, 28, 29 e 30)
 *
 * REGRA DE OURO (secao 28): alerta NAO e IA. Tudo aqui e `if` sobre numero que a
 * inteligencia calculou. Nenhuma chamada de modelo decide estoque ou margem --
 * LLM pode, no futuro, EXPLICAR um alerta em texto mais gentil; nunca produzi-lo.
 *
 * Todo achado responde as quatro perguntas da secao 29:
 *   whatHappened    -- o que aconteceu
 *   whyItMatters    -- por que importa
 *   dataPoints      -- os numeros que sustentam
 *   suggestedAction -- o que fazer
 *
 * Um alerta sem esses quatro campos e proibido pelo tipo, nao por convencao.
 */

export const AUDIT_DOMAINS = ['ESTOQUE', 'PRECO', 'CADASTRO', 'ADS', 'FULL', 'INTEGRACAO'] as const
export type AuditDomain = (typeof AUDIT_DOMAINS)[number]

/** Severidade na linguagem do painel /hoje (secao 30). */
export const AUDIT_SEVERITIES = ['CRITICO', 'IMPORTANTE', 'OPORTUNIDADE'] as const
export type AuditSeverity = (typeof AUDIT_SEVERITIES)[number]

export type AuditFinding = {
  ruleCode: string
  domain: AuditDomain
  severity: AuditSeverity
  productId: string | null
  resourceType: string | null
  resourceId: string | null
  title: string
  whatHappened: string
  whyItMatters: string
  dataPoints: Record<string, unknown>
  suggestedAction: string | null
  /**
   * Dinheiro em jogo. NULL quando a regra nao tem base para calcular -- e nao
   * zero, que afirmaria "custa nada". Ver src/domain/auditor/impact.ts.
   */
  financialImpact: number | null
  impactKind: ImpactKind | null
  /** Tela onde o problema se resolve. */
  actionHref: string | null
  /** SKU e canal desnormalizados: a lista do /hoje mostra os dois. */
  sku: string | null
  channel: string | null
  /**
   * Identidade estavel do achado. Enquanto o problema persiste, a mesma regra no
   * mesmo recurso produz o MESMO fingerprint -- e isso que faz o UNIQUE de
   * alerts atualizar `last_seen_at` em vez de criar alerta novo a cada execucao.
   */
  fingerprint: string
}

export function buildFingerprint(parts: {
  ruleCode: string
  productId?: string | null
  resourceType?: string | null
  resourceId?: string | null
}): string {
  const target = parts.productId ?? parts.resourceId ?? 'global'
  const scope = parts.resourceType ?? (parts.productId ? 'product' : 'system')
  return `${parts.ruleCode}:${scope}:${target}`
}

/**
 * Construtor unico das regras.
 *
 * Garante fingerprint consistente e faz os campos opcionais cairem em `null` em
 * vez de `undefined` -- o que importa porque `null` vai direto para a coluna e
 * significa "sem valor", enquanto `undefined` viraria "campo ausente" no upsert.
 *
 * `impact` entra como objeto para que valor e natureza andem juntos: um numero
 * sem saber se e risco de receita ou capital parado nao diz nada.
 */
export function finding(
  input: Omit<
    AuditFinding,
    'fingerprint' | 'financialImpact' | 'impactKind' | 'sku' | 'channel'
  > & {
    impact?: FinancialImpact | null
    sku?: string | null
    channel?: string | null
  },
): AuditFinding {
  const { impact, sku, channel, ...rest } = input

  return {
    ...rest,
    financialImpact: impact?.amount ?? null,
    impactKind: impact?.kind ?? null,
    sku: sku ?? null,
    channel: channel ?? null,
    fingerprint: buildFingerprint({
      ruleCode: input.ruleCode,
      productId: input.productId,
      resourceType: input.resourceType,
      resourceId: input.resourceId,
    }),
  }
}

/** Contexto que as regras de produto recebem. */
export type ProductRuleContext = {
  insight: ProductInsight
  params: IntelligenceParams
  referenceDate: string
}

/** Uma regra de produto: recebe o contexto, devolve zero ou mais achados. */
export type ProductRule = (context: ProductRuleContext) => AuditFinding[]

/** Saude da integracao, para as regras do dominio INTEGRACAO (secao 27). */
export type IntegrationHealthInput = {
  status: string
  health: string
  lastSuccessfulSync: string | null
  lastWebhookAt: string | null
  tokenExpiresInMinutes: number | null
  jobsPending: number
  jobsFailed: number
  jobsRetrying: number
  eventsFailed: number
  oldestPendingAt: string | null
  webhooksEnabled: boolean
}

/** Ordem de exibicao: critico primeiro (secao 30). */
const SEVERITY_ORDER: Record<AuditSeverity, number> = {
  CRITICO: 0,
  IMPORTANTE: 1,
  OPORTUNIDADE: 2,
}

export function sortFindings(findings: AuditFinding[]): AuditFinding[] {
  return [...findings].sort((a, b) => {
    const bySeverity = SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity]
    if (bySeverity !== 0) return bySeverity
    return a.ruleCode.localeCompare(b.ruleCode)
  })
}

export function countBySeverity(findings: AuditFinding[]): Record<AuditSeverity, number> {
  const counts: Record<AuditSeverity, number> = { CRITICO: 0, IMPORTANTE: 0, OPORTUNIDADE: 0 }
  for (const item of findings) counts[item.severity] += 1
  return counts
}

/** Rotulo do produto nas mensagens: SKU quando existe, senao o nome. */
export function productLabel(insight: ProductInsight): string {
  return insight.sku ?? insight.name
}
