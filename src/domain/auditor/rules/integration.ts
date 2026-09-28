import { formatNumber } from '@/lib/format'
import { RESOLVE_PATHS } from '@/domain/auditor/impact'
import { finding, type AuditFinding, type IntegrationHealthInput } from '@/domain/auditor/types'

/**
 * REGRAS DE INTEGRACAO (secoes 27 e 33)
 *
 * Integracao quebrada e o alerta mais importante do sistema, e por um motivo
 * pouco obvio: quando ela para, TODOS os outros alertas ficam errados sem avisar.
 * Um estoque de ontem parece saudavel hoje.
 *
 * Por isso "Bling fora de sincronia" e CRITICO mesmo quando nada mais parece
 * errado -- o silencio e o sintoma.
 */

export type IntegrationRuleParams = {
  /** Horas sem sincronizar que caracterizam "fora de sincronia". */
  maxHoursWithoutSync: number
  /** Horas sem receber webhook, quando webhook esta ligado. */
  maxHoursWithoutWebhook: number
  /** Jobs pendentes que caracterizam fila acumulando. */
  maxPendingJobs: number
  /** Minutos de validade restante que disparam aviso de token. */
  tokenWarningMinutes: number
}

export const DEFAULT_INTEGRATION_RULE_PARAMS: IntegrationRuleParams = {
  maxHoursWithoutSync: 6,
  maxHoursWithoutWebhook: 24,
  maxPendingJobs: 100,
  tokenWarningMinutes: 60,
}

export function integrationRules(
  health: IntegrationHealthInput,
  referenceTime: Date,
  params: IntegrationRuleParams = DEFAULT_INTEGRATION_RULE_PARAMS,
): AuditFinding[] {
  const findings: AuditFinding[] = []

  const base = {
    domain: 'INTEGRACAO' as const,
    productId: null,
    resourceType: 'erp_connection',
    resourceId: 'BLING',
    // Integracao nao tem impacto financeiro direto calculavel, mas tem algo pior:
    // quando ela quebra, TODO numero das outras regras fica desatualizado sem
    // aviso. Por isso ela vem primeiro na ordenacao (ver DOMAIN_ORDER).
    actionHref: RESOLVE_PATHS.integracao(),
    sku: null,
  }

  // Integracao que nunca foi configurada nao esta com defeito: esse e o estado
  // esperado da Fase A. Alertar aqui seria ruido permanente no painel.
  if (health.status === 'NOT_CONFIGURED') return findings

  if (health.status === 'DISCONNECTED') {
    findings.push(
      finding({
        ...base,
        ruleCode: 'INTEGRATION_DISCONNECTED',
        severity: 'CRITICO',
        title: 'Integração com o Bling desconectada',
        whatHappened: 'A conexão com o Bling está marcada como desconectada.',
        whyItMatters:
          'Sem sincronização, estoque, preço e pedido exibidos aqui são uma foto antiga. Os alertas continuam aparecendo, mas baseados em dados parados.',
        dataPoints: { status: health.status, ultima_sincronizacao: health.lastSuccessfulSync },
        suggestedAction: 'Reconectar a integração em Configurações → Integrações → Bling.',
      }),
    )
    return findings
  }

  if (health.status === 'TOKEN_EXPIRED') {
    findings.push(
      finding({
        ...base,
        ruleCode: 'INTEGRATION_TOKEN_EXPIRED',
        severity: 'CRITICO',
        title: 'Autorização do Bling expirada',
        whatHappened: 'O token de acesso ao Bling expirou e a renovação não foi concluída.',
        whyItMatters: 'Nenhuma leitura nova chega enquanto a autorização não for renovada.',
        dataPoints: { status: health.status },
        suggestedAction: 'Reautorizar a Central no Bling.',
      }),
    )
  } else if (
    health.tokenExpiresInMinutes !== null &&
    health.tokenExpiresInMinutes <= params.tokenWarningMinutes
  ) {
    findings.push(
      finding({
        ...base,
        ruleCode: 'INTEGRATION_TOKEN_EXPIRING',
        severity: 'IMPORTANTE',
        title: 'Token do Bling perto de expirar',
        whatHappened:
          health.tokenExpiresInMinutes <= 0
            ? 'O token de acesso ao Bling já passou da validade.'
            : `O token de acesso ao Bling expira em ${formatNumber(health.tokenExpiresInMinutes)} minutos.`,
        whyItMatters:
          'Se a renovação automática falhar, a sincronização para sem aviso e os dados congelam.',
        dataPoints: { minutos_restantes: health.tokenExpiresInMinutes },
        suggestedAction: 'Confirmar que a renovação automática está funcionando.',
      }),
    )
  }

  if (health.health === 'DEGRADED' || health.health === 'DOWN') {
    findings.push(
      finding({
        ...base,
        ruleCode: 'INTEGRATION_DEGRADED',
        severity: 'CRITICO',
        title: 'Bling temporariamente indisponível',
        whatHappened:
          'A integração acumulou falhas consecutivas e as sincronizações não críticas foram suspensas.',
        whyItMatters:
          'A suspensão é intencional: continuar tentando durante a indisponibilidade só queima a cota de requisições e atrasa a recuperação.',
        dataPoints: { health: health.health, falhas_consecutivas: health.jobsFailed },
        suggestedAction: 'Aguardar a janela de recuperação e verificar a fila depois.',
      }),
    )
  }

  const hoursSinceSync = hoursSince(health.lastSuccessfulSync, referenceTime)
  if (hoursSinceSync === null || hoursSinceSync > params.maxHoursWithoutSync) {
    findings.push(
      finding({
        ...base,
        ruleCode: 'INTEGRATION_OUT_OF_SYNC',
        severity: 'CRITICO',
        title: 'Bling fora de sincronia',
        whatHappened:
          hoursSinceSync === null
            ? 'Nenhuma sincronização bem-sucedida foi registrada.'
            : `A última sincronização bem-sucedida foi há ${formatNumber(hoursSinceSync)} horas.`,
        whyItMatters:
          `O limite configurado é ${formatNumber(params.maxHoursWithoutSync)} horas. ` +
          'Acima disso, estoque e preço mostrados aqui podem não ser os do ERP — e os alertas de ruptura e margem passam a se basear em dado velho.',
        dataPoints: {
          ultima_sincronizacao: health.lastSuccessfulSync,
          horas_sem_sincronizar: hoursSinceSync,
          limite_horas: params.maxHoursWithoutSync,
        },
        suggestedAction: 'Rodar a reconciliação e verificar os erros da fila.',
      }),
    )
  }

  // So faz sentido cobrar webhook quando ele esta ligado (secao 5: nasce desligado).
  if (health.webhooksEnabled) {
    const hoursSinceWebhook = hoursSince(health.lastWebhookAt, referenceTime)
    if (hoursSinceWebhook === null || hoursSinceWebhook > params.maxHoursWithoutWebhook) {
      findings.push(
        finding({
          ...base,
          ruleCode: 'INTEGRATION_WEBHOOK_SILENT',
          severity: 'IMPORTANTE',
          title: 'Nenhum webhook recebido',
          whatHappened:
            hoursSinceWebhook === null
              ? 'Os webhooks estão habilitados, mas nenhum evento foi recebido até agora.'
              : `O último webhook chegou há ${formatNumber(hoursSinceWebhook)} horas.`,
          whyItMatters:
            'Webhook silencioso costuma significar assinatura recusada ou endpoint inacessível. A reconciliação diária cobre a lacuna, mas as atualizações deixam de ser em tempo real.',
          dataPoints: {
            ultimo_webhook: health.lastWebhookAt,
            horas_sem_webhook: hoursSinceWebhook,
            eventos_com_falha: health.eventsFailed,
          },
          suggestedAction: 'Conferir a URL registrada no Bling e o segredo de assinatura.',
        }),
      )
    }
  }

  if (health.jobsPending + health.jobsRetrying > params.maxPendingJobs) {
    findings.push(
      finding({
        ...base,
        ruleCode: 'INTEGRATION_QUEUE_BACKLOG',
        severity: 'IMPORTANTE',
        title: 'Fila de integração acumulando',
        whatHappened:
          `Há ${formatNumber(health.jobsPending)} jobs pendentes e ` +
          `${formatNumber(health.jobsRetrying)} em nova tentativa.`,
        whyItMatters:
          `O limite configurado é ${formatNumber(params.maxPendingJobs)}. ` +
          'Fila crescendo significa que os eventos chegam mais rápido do que são processados: os dados atrasam em silêncio.',
        dataPoints: {
          pendentes: health.jobsPending,
          em_retentativa: health.jobsRetrying,
          com_falha: health.jobsFailed,
          mais_antigo_em: health.oldestPendingAt,
        },
        suggestedAction: 'Verificar o processador da fila e o erro dos jobs que falharam.',
      }),
    )
  }

  if (health.jobsFailed > 0 || health.eventsFailed > 0) {
    findings.push(
      finding({
        ...base,
        ruleCode: 'INTEGRATION_FAILED_ITEMS',
        severity: 'IMPORTANTE',
        title: 'Itens com falha na integração',
        whatHappened:
          `${formatNumber(health.jobsFailed)} jobs e ${formatNumber(health.eventsFailed)} eventos ` +
          'terminaram com erro.',
        whyItMatters:
          'Cada item com falha é uma atualização que não chegou ao banco. O dado fica inconsistente sem nada na tela indicar isso.',
        dataPoints: { jobs_com_falha: health.jobsFailed, eventos_com_falha: health.eventsFailed },
        suggestedAction: 'Revisar os erros registrados e reprocessar os itens.',
      }),
    )
  }

  return findings
}

/** Horas desde um timestamp ISO. Null quando o valor nao existe ou e invalido. */
function hoursSince(timestamp: string | null, referenceTime: Date): number | null {
  if (!timestamp) return null
  const parsed = Date.parse(timestamp)
  if (Number.isNaN(parsed)) return null
  return Math.round(((referenceTime.getTime() - parsed) / 3_600_000) * 10) / 10
}
