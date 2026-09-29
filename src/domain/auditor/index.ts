import { analyzeProduct, type IntelligenceParams, type ProductInsight, type ProductSnapshot } from '@/domain/intelligence'
import { adsRules } from '@/domain/auditor/rules/ads'
import { fullRules } from '@/domain/auditor/rules/full'
import {
  DEFAULT_INTEGRATION_RULE_PARAMS,
  integrationRules,
  supplierSourceRules,
  type IntegrationRuleParams,
} from '@/domain/auditor/rules/integration'
import type { SupplierSource } from '@/domain/auditor/supplier-source'
import { pricingRules } from '@/domain/auditor/rules/pricing'
import { duplicateSkuRule, registryRules } from '@/domain/auditor/rules/registry'
import { stockRules } from '@/domain/auditor/rules/stock'
import {
  countBySeverity,
  type AuditDomain,
  type AuditFinding,
  type AuditSeverity,
  type IntegrationHealthInput,
  type ProductRule,
} from '@/domain/auditor/types'

export * from '@/domain/auditor/types'
export { DEFAULT_INTEGRATION_RULE_PARAMS } from '@/domain/auditor/rules/integration'

/**
 * OPERATIONAL AUDITOR (secoes 27, 28, 29 e 30)
 *
 * Roda o conjunto de regras deterministicas e devolve os achados prontos para
 * virar linha em `alerts` e cartao no painel /hoje.
 *
 * Funcao pura: sem banco, sem ERP, sem `new Date()` interno. Isso permite testar
 * cada cenario da secao 40 passando um snapshot e conferindo o achado -- e e o
 * que garante que o alerta de hoje e reproduzivel amanha.
 */

/** Ordem fixa: o resultado do auditor nao pode variar entre execucoes. */
const PRODUCT_RULES: ProductRule[] = [stockRules, pricingRules, registryRules, adsRules, fullRules]

export type AuditorInput = {
  products: ProductSnapshot[]
  params: IntelligenceParams
  /** `YYYY-MM-DD`. Tudo que depende de "hoje" usa isto. */
  referenceDate: string
  /** Null quando nao ha integracao a auditar (Fase A sem conexao). */
  integration?: IntegrationHealthInput | null
  /**
   * Disponibilidade da fonte de fornecedor. Quando omitida, o auditor assume
   * ABSENT -- o estado que NAO gera alerta de fornecedor ausente. O default
   * conservador e proposital: quem nao informou a fonte nao tem evidencia.
   */
  supplierSource?: SupplierSource
  integrationRuleParams?: IntegrationRuleParams
  /** Instante para as regras de integracao. Default: meia-noite UTC da referencia. */
  referenceTime?: Date
}

export type AuditorReport = {
  findings: AuditFinding[]
  /** Numeros do cabecalho do /hoje: "3 críticos, 6 importantes, 12 oportunidades". */
  counts: Record<AuditSeverity, number>
  /** Insights calculados, para a tela nao ter de recalcular. */
  insights: ProductInsight[]
  referenceDate: string
  /** Quantos produtos entraram na analise. */
  productsAnalyzed: number
}

export {
  productRequiresSupplier,
  resolveSupplierLink,
  resolveSupplierSource,
  type SupplierSource,
  type SupplierSourceReason,
  type SupplierSourceState,
} from '@/domain/auditor/supplier-source'

export function runAuditor(input: AuditorInput): AuditorReport {
  const insights = input.products.map((product) =>
    analyzeProduct(product, input.params, input.referenceDate),
  )

  const findings: AuditFinding[] = []

  for (const insight of insights) {
    const context = { insight, params: input.params, referenceDate: input.referenceDate }
    for (const rule of PRODUCT_RULES) {
      findings.push(...rule(context))
    }
  }

  // Regra global: precisa da lista inteira, nao de um produto.
  findings.push(...duplicateSkuRule(insights))

  if (input.integration) {
    findings.push(
      ...integrationRules(
        input.integration,
        input.referenceTime ?? new Date(`${input.referenceDate}T00:00:00Z`),
        input.integrationRuleParams ?? DEFAULT_INTEGRATION_RULE_PARAMS,
      ),
    )
  }

  // O contrapeso da supressao do "fornecedor ausente": quando o auditor deixa de
  // acusar porque nao sabe, ele diz que nao sabe. Ver supplierSourceRules().
  if (input.supplierSource) {
    findings.push(...supplierSourceRules(input.supplierSource))
  }

  // Prioridade documentada em prioritize(). `sortFindings` continua exportado de
  // types.ts para quem quiser apenas agrupar por severidade, sem os desempates.
  const sorted = prioritize(findings)

  return {
    findings: sorted,
    counts: countBySeverity(sorted),
    insights,
    referenceDate: input.referenceDate,
    productsAnalyzed: input.products.length,
  }
}

/**
 * Converte os limiares de integration_settings em IntelligenceParams.
 *
 * Existe para que o formato do banco fique em UM lugar: as regras recebem
 * `IntelligenceParams` e nao precisam conhecer nome de coluna.
 */
export function toIntelligenceParams(settings: {
  defaultSupplierLeadDays: number
  defaultSafetyDays: number
  purchaseCoverageDays: number
  velocityShortDays: number
  velocityMediumDays: number
  velocityLongDays: number
  targetMarginPercent: number
  minMarginPercent: number
  excessCoverageDays: number
  stagnantDays: number
  fullLowCoverageDays: number
  accelerationAlertPercent: number
  priceAutoMaxPercent: number
  priceReviewMaxPercent: number
  priceApprovalMaxPercent: number
}): IntelligenceParams {
  return {
    supplierLeadDays: settings.defaultSupplierLeadDays,
    safetyDays: settings.defaultSafetyDays,
    purchaseCoverageDays: settings.purchaseCoverageDays,
    velocityWindows: {
      short: settings.velocityShortDays,
      medium: settings.velocityMediumDays,
      long: settings.velocityLongDays,
    },
    targetMarginPercent: settings.targetMarginPercent,
    minMarginPercent: settings.minMarginPercent,
    excessCoverageDays: settings.excessCoverageDays,
    stagnantDays: settings.stagnantDays,
    fullLowCoverageDays: settings.fullLowCoverageDays,
    accelerationAlertPercent: settings.accelerationAlertPercent,
    priceThresholds: {
      autoMaxPercent: settings.priceAutoMaxPercent,
      reviewMaxPercent: settings.priceReviewMaxPercent,
      approvalMaxPercent: settings.priceApprovalMaxPercent,
    },
  }
}

/* ========================================================================== */
/* PRIORIDADE (secao 30 -- "o que devo fazer primeiro?")                       */
/* ========================================================================== */

/**
 * ORDEM DOS DOMINIOS, quando o desempate chega ate aqui.
 *
 * INTEGRACAO vem primeiro e NAO por ser mais grave em dinheiro -- normalmente nem
 * tem impacto calculavel. Vem primeiro porque, com a integracao quebrada, TODOS os
 * outros alertas passam a se basear em dado velho. Resolver margem com estoque de
 * tres dias atras e resolver o problema errado.
 *
 * Depois: ESTOQUE (para venda), PRECO (perde dinheiro por venda), FULL (canal),
 * ADS (verba), CADASTRO (habilita as outras analises, mas nao sangra sozinho).
 */
const DOMAIN_ORDER: AuditDomain[] = ['INTEGRACAO', 'ESTOQUE', 'PRECO', 'FULL', 'ADS', 'CADASTRO']

const SEVERITY_RANK: Record<AuditSeverity, number> = {
  CRITICO: 0,
  IMPORTANTE: 1,
  OPORTUNIDADE: 2,
}

/**
 * `a` e mais grave que `b`?
 *
 * A ordem das severidades pertence ao dominio, nao a quem desenha a tela nem a
 * quem grava no banco -- por isso a comparacao mora aqui, ao lado de
 * SEVERITY_RANK, em vez de cada chamador reinventar o ranking.
 */
export function isMoreSevere(a: AuditSeverity, b: AuditSeverity): boolean {
  return SEVERITY_RANK[a] < SEVERITY_RANK[b]
}

/**
 * Ordena os achados por prioridade.
 *
 * NAO existe score. Nenhum numero e somado, ponderado ou normalizado -- um score
 * composto ("severidade x 10 + impacto / 1000") pareceria objetivo e seria uma
 * opiniao disfarcada de calculo, impossivel de explicar para quem olha a lista.
 *
 * Em vez disso, criterios em cascata, nesta ordem exata:
 *
 *   1. SEVERIDADE. Critico antes de importante antes de oportunidade. Nada
 *      atravessa esta barreira: oportunidade de R$ 50.000 nao passa na frente de
 *      um critico de R$ 10, porque critico e "posso perder a venda ou o dinheiro
 *      agora".
 *   2. TER IMPACTO CALCULAVEL. Dentro da mesma severidade, quem sabe quanto custa
 *      vem antes de quem nao sabe. Decidir com numero e melhor do que decidir sem.
 *   3. MAIOR IMPACTO. Entre os que tem numero, o maior primeiro.
 *   4. DOMINIO. Entre os que nao tem numero, a ordem de DOMAIN_ORDER acima.
 *   5. FINGERPRINT. Desempate final estavel, para a lista nao dancar entre duas
 *      recargas com os mesmos dados.
 *
 * Cada passo e verificavel lendo a lista: se dois itens estao fora de ordem, da
 * para apontar qual criterio foi violado.
 */
/**
 * Forma minima que a ordenacao precisa conhecer.
 *
 * Generico de propósito: os mesmos criterios valem para o achado recem-calculado
 * (`AuditFinding`) e para a linha ja persistida (`AlertRow`, com nomes de coluna).
 * Uma segunda implementacao para o segundo formato divergiria da primeira no dia
 * em que alguem mudasse um critério em apenas um dos lugares.
 */
export type Prioritizable = {
  severity: AuditSeverity
  financialImpact: number | null
  domain: string
  fingerprint: string
}

export function prioritize<T extends Prioritizable>(findings: T[]): T[] {
  return [...findings].sort((a, b) => {
    // 1
    const bySeverity = SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity]
    if (bySeverity !== 0) return bySeverity

    // 2
    const aHasImpact = a.financialImpact !== null
    const bHasImpact = b.financialImpact !== null
    if (aHasImpact !== bHasImpact) return aHasImpact ? -1 : 1

    // 3
    if (aHasImpact && bHasImpact) {
      const byImpact = (b.financialImpact ?? 0) - (a.financialImpact ?? 0)
      if (byImpact !== 0) return byImpact
    }

    // 4
    const byDomain =
      DOMAIN_ORDER.indexOf(a.domain as AuditDomain) - DOMAIN_ORDER.indexOf(b.domain as AuditDomain)
    if (byDomain !== 0) return byDomain

    // 5
    return a.fingerprint.localeCompare(b.fingerprint)
  })
}

/** Explicacao da posicao de um achado, para a interface poder justificar a ordem. */
export function explainPriority(finding: AuditFinding): string {
  const parts = [`severidade ${finding.severity.toLowerCase()}`]

  if (finding.financialImpact !== null) {
    parts.push(`impacto calculado (${finding.impactKind?.toLowerCase().replace('_', ' ')})`)
  } else {
    parts.push(`sem impacto calculavel, dominio ${finding.domain.toLowerCase()}`)
  }

  return parts.join(' · ')
}
