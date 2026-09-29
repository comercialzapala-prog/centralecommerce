import { prioritize, type AuditDomain, type AuditSeverity } from '@/domain/auditor'
import type { SearchParams } from '@/lib/filters'
import type { AlertRow } from '@/lib/types'

/**
 * APRESENTACAO DO /hoje (secao 30)
 *
 * Arquivo PURO: sem banco, sem fetch, sem `new Date()`. Só transforma a lista de
 * alertas no que a tela desenha. Isso mantem a pagina fina e deixa o agrupamento
 * e a ordenacao testaveis sem subir servidor.
 *
 * Nenhuma regra de negocio nova mora aqui. Severidade, impacto e prioridade vem
 * do auditor; este arquivo apenas agrupa e rotula.
 */

/* -------------------------------------------------------------------------- */
/* Status                                                                     */
/* -------------------------------------------------------------------------- */

/**
 * O banco guarda OPEN/ACKNOWLEDGED/RESOLVED/DISMISSED; a interface fala
 * novo/visto/resolvido/ignorado. O mapa vive aqui para a tela nunca precisar
 * conhecer o nome da coluna.
 */
export const ALERT_STATUS_LABEL: Record<AlertRow['status'], string> = {
  OPEN: 'novo',
  ACKNOWLEDGED: 'visto',
  RESOLVED: 'resolvido',
  DISMISSED: 'ignorado',
}

export const ALERT_STATUS_ORDER: AlertRow['status'][] = [
  'OPEN',
  'ACKNOWLEDGED',
  'RESOLVED',
  'DISMISSED',
]

/**
 * Status que a LISTA PRINCIPAL mostra.
 *
 * Só OPEN. "Visto" sai da lista de propósito: uma página que existe para
 * responder "o que exige atenção agora" perde a função quando repete o que você
 * já leu -- o alerta visto vira ruído e empurra para baixo o que ainda é novo.
 *
 * Esconder aqui não é apagar. O que sai continua em três lugares: na seção
 * "Já vistos" (recolhida, no fim da página), no filtro de status, e na
 * reconciliação -- que REABRE sozinho o alerta visto que piorou, severidade
 * maior ou impacto maior (ver `worsened()` em auditor-service.ts). Marcar como
 * visto diz "já sei disso", não "nunca mais me avise"; para isso existe
 * "Ignorar".
 */
export const ACTIVE_STATUSES: AlertRow['status'][] = ['OPEN']

/** O que saiu da lista por já ter sido visto. */
export const SEEN_STATUSES: AlertRow['status'][] = ['ACKNOWLEDGED']

export const SEVERITY_LABEL: Record<AuditSeverity, string> = {
  CRITICO: 'Crítico',
  IMPORTANTE: 'Atenção',
  OPORTUNIDADE: 'Informativo',
}

export const DOMAIN_LABEL: Record<AuditDomain, string> = {
  ESTOQUE: 'Estoque',
  PRECO: 'Margem e preço',
  CADASTRO: 'Cadastro',
  ADS: 'Mídia',
  FULL: 'Full',
  INTEGRACAO: 'Integração',
}

export const IMPACT_KIND_LABEL: Record<string, string> = {
  RISCO_RECEITA: 'receita em risco',
  PERDA_MARGEM: 'margem perdida por mês',
  CAPITAL_PARADO: 'capital parado',
  DESEMBOLSO: 'gasto sem retorno',
}

/* -------------------------------------------------------------------------- */
/* Filtros                                                                    */
/* -------------------------------------------------------------------------- */

export type HojePeriod = 'tudo' | '24h' | '7d' | '30d'

export type HojeFilters = {
  severity: AuditSeverity | null
  domain: AuditDomain | null
  channel: string | null
  status: AlertRow['status'] | null
  period: HojePeriod
}

export const EMPTY_HOJE_FILTERS: HojeFilters = {
  severity: null,
  domain: null,
  channel: null,
  status: null,
  period: 'tudo',
}

export const HOJE_PERIODS: { value: HojePeriod; label: string }[] = [
  { value: 'tudo', label: 'Todo o período' },
  { value: '24h', label: 'Últimas 24h' },
  { value: '7d', label: 'Últimos 7 dias' },
  { value: '30d', label: 'Últimos 30 dias' },
]

/** Nome de cada filtro na URL, para o estado ser compartilhavel por link. */
export const HOJE_PARAM = {
  severity: 'severidade',
  domain: 'dominio',
  channel: 'canal',
  status: 'status',
  period: 'periodo',
} as const

function first(value: string | string[] | undefined): string | null {
  const raw = Array.isArray(value) ? value[0] : value
  if (!raw) return null
  const trimmed = raw.trim()
  return trimmed === '' ? null : trimmed
}

function oneOf<T extends string>(value: string | null, allowed: readonly T[]): T | null {
  return value && (allowed as readonly string[]).includes(value) ? (value as T) : null
}

export function parseHojeFilters(searchParams: SearchParams): HojeFilters {
  const period = oneOf(first(searchParams[HOJE_PARAM.period]), ['tudo', '24h', '7d', '30d'] as const)

  return {
    severity: oneOf(first(searchParams[HOJE_PARAM.severity]), [
      'CRITICO',
      'IMPORTANTE',
      'OPORTUNIDADE',
    ] as const),
    domain: oneOf(first(searchParams[HOJE_PARAM.domain]), [
      'ESTOQUE',
      'PRECO',
      'CADASTRO',
      'ADS',
      'FULL',
      'INTEGRACAO',
    ] as const),
    channel: first(searchParams[HOJE_PARAM.channel]),
    status: oneOf(first(searchParams[HOJE_PARAM.status]), [
      'OPEN',
      'ACKNOWLEDGED',
      'RESOLVED',
      'DISMISSED',
    ] as const),
    period: period ?? 'tudo',
  }
}

/** Corte de data do periodo, em ISO. Null = sem corte. */
export function periodCutoff(period: HojePeriod, now: Date): string | null {
  const hours = period === '24h' ? 24 : period === '7d' ? 24 * 7 : period === '30d' ? 24 * 30 : null
  if (hours === null) return null
  return new Date(now.getTime() - hours * 3_600_000).toISOString()
}

export function countActiveHojeFilters(filters: HojeFilters): number {
  let count = 0
  if (filters.severity) count += 1
  if (filters.domain) count += 1
  if (filters.channel) count += 1
  if (filters.status) count += 1
  if (filters.period !== 'tudo') count += 1
  return count
}

/* -------------------------------------------------------------------------- */
/* Blocos                                                                     */
/* -------------------------------------------------------------------------- */

export type HojeBlockId =
  | 'criticos'
  | 'estoque'
  | 'preco'
  | 'vendas'
  | 'cadastro'
  | 'integracoes'
  | 'oportunidades'

export type HojeBlock = {
  id: HojeBlockId
  title: string
  /** Frase que explica o que o bloco responde. */
  purpose: string
  alerts: AlertRow[]
}

/**
 * Distribui os alertas nos blocos da tela.
 *
 * DUAS REGRAS QUE EVITAM DUPLICATA:
 *
 * 1. "Críticos" e transversal: ele recebe TODO alerta CRITICO, de qualquer
 *    dominio, porque a pergunta "o que pode me fazer perder dinheiro agora" nao
 *    respeita fronteira de dominio.
 * 2. Os blocos de dominio recebem apenas o que NAO e critico. Sem isso o mesmo
 *    alerta apareceria duas vezes e a contagem da tela mentiria.
 *
 * "Oportunidades" recebe tudo que e OPORTUNIDADE, tambem transversal.
 */
export function buildHojeBlocks(alerts: AlertRow[]): HojeBlock[] {
  const critical = alerts.filter((a) => a.severity === 'CRITICO')
  const opportunity = alerts.filter((a) => a.severity === 'OPORTUNIDADE')
  const attention = alerts.filter((a) => a.severity === 'IMPORTANTE')

  const byDomain = (domains: AuditDomain[]) =>
    attention.filter((a) => domains.includes(a.domain as AuditDomain))

  return [
    {
      id: 'criticos',
      title: 'Críticos',
      purpose: 'Risco de perder venda ou dinheiro agora. Resolver hoje.',
      alerts: critical,
    },
    {
      id: 'estoque',
      title: 'Estoque',
      purpose: 'Cobertura, ruptura próxima, capital parado e o que está no Full.',
      alerts: byDomain(['ESTOQUE', 'FULL']),
    },
    {
      id: 'preco',
      title: 'Margem e preço',
      purpose: 'Onde o preço atual não sustenta a margem que a operação precisa.',
      alerts: byDomain(['PRECO']),
    },
    {
      id: 'vendas',
      title: 'Vendas e mídia',
      purpose: 'Desempenho de anúncio e verba investida sem retorno.',
      alerts: byDomain(['ADS']),
    },
    {
      id: 'cadastro',
      title: 'Cadastro',
      purpose: 'Dado faltando que impede calcular margem, frete ou emitir nota.',
      alerts: byDomain(['CADASTRO']),
    },
    {
      id: 'integracoes',
      title: 'Integrações',
      purpose: 'Quando isto falha, todos os outros números ficam velhos sem avisar.',
      alerts: byDomain(['INTEGRACAO']),
    },
    {
      id: 'oportunidades',
      title: 'Oportunidades',
      purpose: 'Nada está errado — há espaço para ganhar mais.',
      alerts: opportunity,
    },
  ]
}

/**
 * "O que aconteceu desde a minha ultima analise?"
 *
 * Sem `lastReviewedAt` gravado, NAO inventa recorte: devolve listas vazias e a
 * tela diz que a primeira revisao ainda nao foi marcada. Chutar "ultimas 24h"
 * faria a pagina afirmar algo que ela nao sabe.
 */
export function splitSinceLastReview(
  alerts: AlertRow[],
  resolved: AlertRow[],
  lastReviewedAt: string | null,
): { isFirstReview: boolean; newAlerts: AlertRow[]; resolvedSince: AlertRow[] } {
  if (!lastReviewedAt) {
    return { isFirstReview: true, newAlerts: [], resolvedSince: [] }
  }

  return {
    isFirstReview: false,
    newAlerts: alerts.filter((a) => a.first_seen_at > lastReviewedAt),
    resolvedSince: resolved.filter((a) => (a.resolved_at ?? '') > lastReviewedAt),
  }
}

/** Soma do impacto financeiro dos alertas que sabem calcular. */
export function sumFinancialImpact(alerts: AlertRow[]): number {
  return alerts.reduce((total, alert) => total + Number(alert.financial_impact ?? 0), 0)
}

/**
 * Desconta dos KPIs o que já foi visto.
 *
 * `v_hoje_summary` conta OPEN + ACKNOWLEDGED, e está certa: o problema continua
 * existindo depois de visto. Mas a lista mostra só OPEN, e KPI que não bate com
 * a lista embaixo dele é pior do que KPI nenhum -- você clicaria em "3 críticos"
 * e cairia numa tela vazia.
 *
 * O desconto acontece aqui, e não numa segunda consulta, porque a página já
 * carrega os vistos para desenhar a seção "Já vistos": subtrair o que já está na
 * memória é mais barato do que manter duas definições do mesmo KPI, uma na view
 * e outra numa query paralela que divergiria no primeiro dia em que alguém
 * mudasse uma das duas.
 *
 * `hidden` é devolvido junto porque a tela precisa DIZER que escondeu algo.
 * Esconder em silêncio seria a versão ruim desta funcionalidade.
 */
export function discountSeen(
  counts: { critical: number; important: number; opportunity: number; impactAtRisk: number },
  seen: AlertRow[],
): {
  critical: number
  important: number
  opportunity: number
  impactAtRisk: number
  hidden: number
} {
  const count = (severity: AuditSeverity) =>
    seen.filter((alert) => alert.severity === severity).length

  return {
    critical: Math.max(0, counts.critical - count('CRITICO')),
    important: Math.max(0, counts.important - count('IMPORTANTE')),
    opportunity: Math.max(0, counts.opportunity - count('OPORTUNIDADE')),
    impactAtRisk: Math.max(0, counts.impactAtRisk - sumFinancialImpact(seen)),
    hidden: seen.length,
  }
}

/* -------------------------------------------------------------------------- */
/* Prioridade                                                                 */
/* -------------------------------------------------------------------------- */

/**
 * Ordena linhas de `alerts` com os MESMOS criterios do auditor.
 *
 * Adapta `AlertRow` para a forma que `prioritize()` espera e delega. Nao ha
 * segunda implementacao: os cinco critérios documentados em
 * src/domain/auditor/index.ts valem para a tela tambem, e e isso que garante que
 * a ordem exibida e a ordem que o auditor decidiu.
 */
export function prioritizeAlerts(alerts: AlertRow[]): AlertRow[] {
  const adapted = alerts.map((alert) => ({
    alert,
    severity: alert.severity,
    financialImpact: alert.financial_impact === null ? null : Number(alert.financial_impact),
    domain: alert.domain,
    fingerprint: alert.fingerprint,
  }))

  return prioritize(adapted).map((item) => item.alert)
}
