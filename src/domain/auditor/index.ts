import { analyzeProduct, type IntelligenceParams, type ProductInsight, type ProductSnapshot } from '@/domain/intelligence'
import { adsRules } from '@/domain/auditor/rules/ads'
import { fullRules } from '@/domain/auditor/rules/full'
import {
  DEFAULT_INTEGRATION_RULE_PARAMS,
  integrationRules,
  type IntegrationRuleParams,
} from '@/domain/auditor/rules/integration'
import { pricingRules } from '@/domain/auditor/rules/pricing'
import { duplicateSkuRule, registryRules } from '@/domain/auditor/rules/registry'
import { stockRules } from '@/domain/auditor/rules/stock'
import {
  countBySeverity,
  sortFindings,
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

  const sorted = sortFindings(findings)

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
