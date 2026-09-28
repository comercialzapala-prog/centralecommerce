import 'server-only'

import { num } from '@/lib/format'
import { createClient } from '@/lib/supabase/server'
import type { AutomationMode } from '@/integrations/erp/types'

/**
 * PARAMETROS DA INTEGRACAO (secoes 15, 18, 25, 26, 9 e 11)
 *
 * Tudo que e limiar vem do banco, nunca de constante no codigo (secao 18: "nao
 * hardcode"). Os defaults daqui existem apenas para o caso da linha ainda nao
 * ter sido criada -- eles empatam com os DEFAULT da migration, de proposito.
 */

export type IntegrationSettings = {
  organizationId: string
  provider: 'BLING'
  automationMode: AutomationMode

  /** Secao 18 -- faixas de variacao de preco, em %. */
  priceAutoMaxPercent: number
  priceReviewMaxPercent: number
  priceApprovalMaxPercent: number

  /** Secao 26 -- usados quando produto/fornecedor nao tem prazo proprio. */
  defaultSupplierLeadDays: number
  defaultSafetyDays: number

  /** Secao 25 -- janelas de velocidade. */
  velocityShortDays: number
  velocityMediumDays: number
  velocityLongDays: number

  /** Secoes 27 e 28 -- limiares do auditor. */
  purchaseCoverageDays: number
  targetMarginPercent: number
  minMarginPercent: number
  excessCoverageDays: number
  stagnantDays: number
  fullLowCoverageDays: number
  accelerationAlertPercent: number

  /** Secao 9. `apiDailyRequestLimit` null = limite real ainda nao informado. */
  apiRequestsPerSecond: number
  apiDailyRequestLimit: number | null

  /** Secao 11. */
  circuitBreakerThreshold: number
  circuitBreakerCooldownSeconds: number

  /** Secao 5 -- nasce desligado. */
  webhooksEnabled: boolean
}

export const DEFAULT_INTEGRATION_SETTINGS: Omit<IntegrationSettings, 'organizationId'> = {
  provider: 'BLING',
  automationMode: 'READ_ONLY',
  priceAutoMaxPercent: 2,
  priceReviewMaxPercent: 5,
  priceApprovalMaxPercent: 15,
  defaultSupplierLeadDays: 7,
  defaultSafetyDays: 5,
  velocityShortDays: 7,
  velocityMediumDays: 30,
  velocityLongDays: 60,
  purchaseCoverageDays: 15,
  targetMarginPercent: 25,
  minMarginPercent: 5,
  excessCoverageDays: 120,
  stagnantDays: 60,
  fullLowCoverageDays: 10,
  accelerationAlertPercent: 50,
  apiRequestsPerSecond: 3,
  apiDailyRequestLimit: null,
  circuitBreakerThreshold: 5,
  circuitBreakerCooldownSeconds: 300,
  webhooksEnabled: false,
}

const COLUMNS =
  'organization_id,provider,automation_mode,price_auto_max_percent,price_review_max_percent,' +
  'price_approval_max_percent,default_supplier_lead_days,default_safety_days,velocity_short_days,' +
  'velocity_medium_days,velocity_long_days,purchase_coverage_days,target_margin_percent,min_margin_percent,' +
  'excess_coverage_days,stagnant_days,full_low_coverage_days,acceleration_alert_percent,' +
  'api_requests_per_second,api_daily_request_limit,' +
  'circuit_breaker_threshold,circuit_breaker_cooldown_seconds,webhooks_enabled'

type SettingsRow = {
  organization_id: string
  provider: string
  automation_mode: AutomationMode
  price_auto_max_percent: number | string
  price_review_max_percent: number | string
  price_approval_max_percent: number | string
  default_supplier_lead_days: number
  default_safety_days: number
  velocity_short_days: number
  velocity_medium_days: number
  velocity_long_days: number
  purchase_coverage_days: number
  target_margin_percent: number | string
  min_margin_percent: number | string
  excess_coverage_days: number
  stagnant_days: number
  full_low_coverage_days: number
  acceleration_alert_percent: number | string
  api_requests_per_second: number
  api_daily_request_limit: number | null
  circuit_breaker_threshold: number
  circuit_breaker_cooldown_seconds: number
  webhooks_enabled: boolean
}

export async function loadIntegrationSettings(
  organizationId: string,
): Promise<IntegrationSettings> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('integration_settings')
    .select(COLUMNS)
    .eq('organization_id', organizationId)
    .eq('provider', 'BLING')
    .maybeSingle()

  if (error) throw new Error(`Falha ao carregar parâmetros da integração: ${error.message}`)

  if (!data) return { organizationId, ...DEFAULT_INTEGRATION_SETTINGS }

  // A lista de colunas e montada em runtime, entao o client tipado do Supabase
  // nao consegue inferir a linha -- mesmo motivo do `as never` em lib/data.ts.
  const row = data as unknown as SettingsRow

  return {
    organizationId,
    provider: 'BLING',
    automationMode: row.automation_mode,
    // `num()` porque PostgREST devolve numeric como string.
    priceAutoMaxPercent: num(row.price_auto_max_percent),
    priceReviewMaxPercent: num(row.price_review_max_percent),
    priceApprovalMaxPercent: num(row.price_approval_max_percent),
    defaultSupplierLeadDays: row.default_supplier_lead_days,
    defaultSafetyDays: row.default_safety_days,
    velocityShortDays: row.velocity_short_days,
    velocityMediumDays: row.velocity_medium_days,
    velocityLongDays: row.velocity_long_days,
    purchaseCoverageDays: row.purchase_coverage_days,
    targetMarginPercent: num(row.target_margin_percent),
    minMarginPercent: num(row.min_margin_percent),
    excessCoverageDays: row.excess_coverage_days,
    stagnantDays: row.stagnant_days,
    fullLowCoverageDays: row.full_low_coverage_days,
    accelerationAlertPercent: num(row.acceleration_alert_percent),
    apiRequestsPerSecond: row.api_requests_per_second,
    apiDailyRequestLimit: row.api_daily_request_limit,
    circuitBreakerThreshold: row.circuit_breaker_threshold,
    circuitBreakerCooldownSeconds: row.circuit_breaker_cooldown_seconds,
    webhooksEnabled: row.webhooks_enabled,
  }
}
