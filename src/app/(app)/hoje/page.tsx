import Link from 'next/link'
import type { Metadata } from 'next'
import {
  CircleAlert,
  Clock,
  EyeOff,
  Lightbulb,
  PackageSearch,
  PlugZap,
  Receipt,
  ShoppingCart,
  Sparkles,
  TrendingUp,
} from 'lucide-react'

import { BoxGrid } from '@/components/BoxGrid'
import { AlertCard } from '@/components/hoje/AlertCard'
import { HojeFilterBar } from '@/components/hoje/HojeFilterBar'
import { HojeToolbar } from '@/components/hoje/HojeToolbar'
import { MetricCard, type MetricTone } from '@/components/MetricCard'
import { EmptyState, PageHeader } from '@/components/PageHeader'
import { Badge } from '@/components/ui/badge'
import { requireMembership } from '@/lib/auth'
import {
  getAlertChannels,
  getAlerts,
  getHojeSummary,
  getLastAuditorRun,
  getLastReviewedAt,
  getOpenRecommendations,
  getRecommendationOutcomes,
  getResolvedAlerts,
  getOrders,
  getTransactions,
} from '@/lib/data'
import { EMPTY_FILTERS, resolvePeriod, type SearchParams } from '@/lib/filters'
import { summarizeByStatus, summarizeOrders } from '@/lib/finance'
import { formatCurrency, formatDateTime, formatNumber, formatPercent, num } from '@/lib/format'
import {
  ACTIVE_STATUSES,
  SEEN_STATUSES,
  buildHojeBlocks,
  discountSeen,
  parseHojeFilters,
  periodCutoff,
  prioritizeAlerts,
  splitSinceLastReview,
  sumFinancialImpact,
} from '@/lib/hoje'

import { markReviewed, openAlert, runAnalysis, setAlertStatus } from './actions'

/**
 * /hoje -- A CENTRAL OPERACIONAL DIARIA (secao 30)
 */

export const metadata: Metadata = {
  title: 'Hoje | Control Center',
}

export const dynamic = 'force-dynamic'

export default async function HojePage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>
}) {
  const { user, membership } = await requireMembership()
  const organizationId = membership.organizationId

  const params = await searchParams
  const filters = parseHojeFilters(params)

  const now = new Date()
  const since = periodCutoff(filters.period, now)

  const todayFilters = {
    ...EMPTY_FILTERS,
    period: 'hoje' as const,
    ...resolvePeriod('hoje', null, null, now),
  }

  const [
    summary,
    rawAlerts,
    seenAlerts,
    resolvedAlerts,
    recommendations,
    outcomes,
    lastRun,
    lastReviewedAt,
    channels,
    todayOrders,
    pendingTransactions,
  ] = await Promise.all([
    getHojeSummary(organizationId),
    getAlerts(organizationId, {
      statuses: filters.status ? [filters.status] : ACTIVE_STATUSES,
      severity: filters.severity,
      domain: filters.domain,
      channel: filters.channel,
      since,
    }),
    getAlerts(organizationId, { statuses: SEEN_STATUSES }),
    getResolvedAlerts(organizationId, 8),
    getOpenRecommendations(organizationId, 12),
    getRecommendationOutcomes(organizationId, 5),
    getLastAuditorRun(organizationId),
    getLastReviewedAt(organizationId, user.id),
    getAlertChannels(organizationId),
    getOrders(todayFilters),
    getTransactions({ ...EMPTY_FILTERS, status: 'PENDENTE' }),
  ])

  const alerts = prioritizeAlerts(rawAlerts)
  const blocks = buildHojeBlocks(alerts)
  const priorities = alerts.slice(0, 5)

  const salesToday = summarizeOrders(todayOrders)
  const commitments = summarizeByStatus(pendingTransactions)

  const review = splitSinceLastReview(alerts, resolvedAlerts, lastReviewedAt)

  const kpis = discountSeen(
    {
      critical: num(summary?.critical_open),
      important: num(summary?.important_open),
      opportunity: num(summary?.opportunity_open),
      impactAtRisk: num(summary?.impact_at_risk),
    },
    seenAlerts,
  )

  const criticalCount = kpis.critical
  const importantCount = kpis.important
  const opportunityCount = kpis.opportunity
  const neverRan = !lastRun

  return (
    <>
      <PageHeader
        title="Hoje"
        description={
          neverRan
            ? 'A análise ainda não foi executada nesta operação.'
            : `Última análise ${formatDateTime(lastRun?.started_at)} · ${formatNumber(lastRun?.products_analyzed ?? 0)} produto(s) analisado(s).`
        }
        actions={
          <HojeToolbar
            runAnalysis={runAnalysis}
            markReviewed={markReviewed}
            hasReviewState={Boolean(lastReviewedAt)}
          />
        }
      />

      {lastRun?.status === 'FAILED' ? (
        <BoxGrid
          columns={2}
          items={[
            {
              label: 'Status da última execução',
              value: 'A última análise falhou',
              hint: formatDateTime(lastRun.started_at),
              tone: 'negative',
            },
            {
              label: 'Detalhe técnico',
              value: lastRun.error ?? 'Erro não especificado durante a execução do auditor.',
              tone: 'warning',
            },
          ]}
        />
      ) : null}

      {/* ----------------- KPIs: poucos e uteis (secao 30) ----------------- */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-6">
        <MetricCard
          title="Críticos"
          value={formatNumber(criticalCount)}
          tone={criticalCount > 0 ? 'negative' : 'positive'}
          icon={CircleAlert}
          hint={criticalCount > 0 ? 'Resolver hoje' : 'Nada crítico agora'}
          href={criticalCount > 0 ? '/hoje?severidade=CRITICO' : undefined}
        />
        <MetricCard
          title="Receita hoje"
          value={formatCurrency(salesToday.revenue)}
          icon={ShoppingCart}
          hint={`${formatNumber(salesToday.ordersCount)} pedido(s)`}
        />
        <MetricCard
          title="Margem hoje"
          value={salesToday.revenue > 0 ? formatPercent(salesToday.marginPercent) : '—'}
          tone={marginTone(salesToday.revenue, salesToday.marginPercent)}
          icon={TrendingUp}
          hint={
            salesToday.revenue > 0
              ? `${formatCurrency(salesToday.commercialResult)} de resultado`
              : 'Sem venda registrada hoje'
          }
        />
        <MetricCard
          title="Risco de ruptura"
          value={formatNumber(num(summary?.stockout_products))}
          tone={num(summary?.stockout_products) > 0 ? 'warning' : 'positive'}
          icon={PackageSearch}
          hint="Produtos sem cobertura até a reposição"
          href={num(summary?.stockout_products) > 0 ? '/hoje?dominio=ESTOQUE' : undefined}
        />
        <MetricCard
          title="Dinheiro em risco"
          value={kpis.impactAtRisk > 0 ? formatCurrency(kpis.impactAtRisk) : '—'}
          tone={kpis.impactAtRisk > 0 ? 'negative' : 'neutral'}
          icon={Receipt}
          hint="Soma dos alertas com impacto calculável"
        />
        <MetricCard
          title="Integrações"
          value={integrationLabel(blocks)}
          tone={hasIntegrationProblem(alerts) ? 'negative' : 'positive'}
          icon={PlugZap}
          hint="Bling e canais"
          href="/configuracoes/integracoes/bling"
        />
      </div>

      <HojeFilterBar filters={filters} channels={channels} />

      {/* ----------------- Primeira execucao ----------------- */}
      {neverRan ? (
        <EmptyState
          title="Nenhuma análise executada ainda"
          description="Clique em “Atualizar análise” para o auditor avaliar estoque, margem, cadastro e integração com as regras configuradas. Nada é escrito no Bling — a análise só lê."
        />
      ) : null}

      {/* ----------------- Desde a ultima revisao ----------------- */}
      {!neverRan && !review.isFirstReview && (review.newAlerts.length > 0 || review.resolvedSince.length > 0) ? (
        <section className="space-y-2.5 rounded-xl border bg-card p-4">
          <div className="flex items-center gap-2">
            <Clock size={15} className="text-muted-foreground" />
            <h2 className="text-sm font-semibold">Desde a sua última revisão</h2>
            <span className="text-xs text-muted-foreground">
              {formatDateTime(lastReviewedAt)}
            </span>
          </div>
          <BoxGrid
            columns={2}
            items={[
              {
                label: 'Novos alertas',
                value:
                  review.newAlerts.length > 0
                    ? `${formatNumber(review.newAlerts.length)} alerta(s) novo(s)`
                    : 'Nenhum alerta novo',
                tone: review.newAlerts.length > 0 ? 'warning' : 'positive',
              },
              {
                label: 'Resolvidos desde então',
                value:
                  review.resolvedSince.length > 0
                    ? `${formatNumber(review.resolvedSince.length)} resolvido(s)`
                    : 'Nenhum resolvido',
                tone: review.resolvedSince.length > 0 ? 'positive' : 'neutral',
              },
            ]}
          />
        </section>
      ) : null}

      {/* ----------------- Prioridades de hoje ----------------- */}
      {priorities.length > 0 ? (
        <section className="space-y-3">
          <div>
            <h2 className="text-sm font-semibold">Prioridades de hoje</h2>
            <p className="text-xs text-muted-foreground">
              Ordem por severidade, depois por impacto financeiro calculado, depois por domínio —
              sem pontuação arbitrária. Os critérios completos estão em{' '}
              <code>src/domain/auditor/index.ts</code>.
            </p>
          </div>
          <div className="space-y-2">
            {priorities.map((alert, index) => (
              <div key={alert.id} className="flex items-start gap-2">
                <span className="mt-4 w-4 shrink-0 text-right text-xs font-semibold tabular-nums text-muted-foreground">
                  {index + 1}
                </span>
                <div className="min-w-0 flex-1">
                  <AlertCard
                    alert={alert}
                    setStatus={setAlertStatus}
                    openTarget={openAlert}
                    showEvidence={false}
                  />
                </div>
              </div>
            ))}
          </div>
        </section>
      ) : null}

      {/* ----------------- Blocos por dominio ----------------- */}
      {alerts.length === 0 && !neverRan ? (
        <EmptyState
          title="Nada exige atenção agora"
          description={
            kpis.hidden > 0
              ? `${formatNumber(kpis.hidden)} alerta(s) que você já viu estão fora da lista. Eles continuam em “Já vistos”, no fim da página.`
              : lastRun?.findings_total === 0
                ? 'A última análise não encontrou problema nas regras configuradas. Quando algo mudar, aparece aqui.'
                : 'Nenhum alerta corresponde aos filtros aplicados. Limpe os filtros para ver tudo.'
          }
        />
      ) : null}

      {blocks
        .filter((block) => block.alerts.length > 0)
        .map((block) => (
          <section key={block.id} className="space-y-2.5">
            <div className="flex flex-wrap items-baseline gap-2">
              <h2 className="text-sm font-semibold">{block.title}</h2>
              <Badge variant="outline">{block.alerts.length}</Badge>
              {sumFinancialImpact(block.alerts) > 0 ? (
                <span className="text-xs text-muted-foreground">
                  {formatCurrency(sumFinancialImpact(block.alerts))} em jogo
                </span>
              ) : null}
              <p className="w-full text-xs text-muted-foreground">{block.purpose}</p>
            </div>
            <div className="space-y-2">
              {block.alerts.map((alert) => (
                <AlertCard
                  key={alert.id}
                  alert={alert}
                  setStatus={setAlertStatus}
                  openTarget={openAlert}
                />
              ))}
            </div>
          </section>
        ))}

      {/* ----------------- Financeiro ----------------- */}
      {commitments.pending.count > 0 ? (
        <section className="space-y-2.5">
          <div>
            <h2 className="text-sm font-semibold">Financeiro</h2>
            <p className="text-xs text-muted-foreground">
              Compromissos já assumidos e ainda não pagos. Não são alertas do auditor: são fatos do
              seu financeiro, somados por <code>finance.ts</code>.
            </p>
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <MetricCard
              title="A pagar"
              value={formatCurrency(commitments.pending.expense)}
              tone={commitments.pending.expense > 0 ? 'warning' : 'neutral'}
              hint={`${formatNumber(commitments.pending.count)} lançamento(s) pendente(s)`}
              href="/lancamentos?status=PENDENTE"
            />
            <MetricCard
              title="A receber"
              value={formatCurrency(commitments.pending.revenue)}
              tone="accent"
              hint="Entradas pendentes"
              href="/lancamentos?status=PENDENTE"
            />
            <MetricCard
              title="Resultado projetado"
              value={formatCurrency(commitments.combined.operatingResult)}
              tone={commitments.combined.operatingResult >= 0 ? 'positive' : 'negative'}
              hint="Pago + pendente"
              href="/dashboard"
            />
          </div>
        </section>
      ) : null}

      {/* ----------------- Recomendacoes ----------------- */}
      {recommendations.length > 0 ? (
        <section className="space-y-2.5">
          <div className="flex flex-wrap items-baseline gap-2">
            <h2 className="text-sm font-semibold">Recomendações</h2>
            <Badge variant="outline">{recommendations.length}</Badge>
            <p className="w-full text-xs text-muted-foreground">
              Sugestões calculadas pelas regras. Nenhuma é aplicada automaticamente e nada é escrito
              no Bling — a integração está em modo somente leitura.
            </p>
          </div>
          <div className="grid grid-cols-1 gap-2 lg:grid-cols-2">
            {recommendations.map((item) => (
              <article key={item.id} className="space-y-2.5 rounded-xl border bg-card p-4">
                <div className="flex items-center gap-2">
                  <Sparkles size={14} className="shrink-0 text-sky-600 dark:text-sky-400" />
                  <Badge variant="secondary">{item.kind}</Badge>
                  <h3 className="text-sm font-medium leading-snug">{item.title}</h3>
                </div>
                <BoxGrid
                  columns={2}
                  items={[
                    {
                      label: 'Motivo da recomendação',
                      value: item.reason,
                      span: item.current_value !== null && item.proposed_value !== null ? 1 : 2,
                    },
                    ...(item.current_value !== null && item.proposed_value !== null
                      ? [
                          {
                            label: 'Ajuste sugerido',
                            value: `${formatNumber(item.current_value)} → ${formatNumber(item.proposed_value)}`,
                            tone: 'accent' as const,
                          },
                        ]
                      : []),
                  ]}
                />
                {item.product_id ? (
                  <Link
                    href={`/produtos/${item.product_id}`}
                    className="inline-block text-xs font-medium text-primary hover:underline"
                  >
                    Ver produto
                  </Link>
                ) : null}
              </article>
            ))}
          </div>
        </section>
      ) : null}

      {/* ----------------- Resultado das recomendacoes (secao 31) ----------------- */}
      {outcomes.length > 0 ? (
        <section className="space-y-2.5">
          <h2 className="text-sm font-semibold">A recomendação foi boa?</h2>
          <div className="grid grid-cols-1 gap-2 lg:grid-cols-2">
            {outcomes.map((outcome) => (
              <BoxGrid
                key={outcome.id}
                columns={2}
                items={[
                  {
                    label: 'Veredito',
                    value: outcome.verdict ?? 'SEM VEREDITO',
                    hint: `Medido ${formatDateTime(outcome.measured_at)} · janela de ${outcome.window_days} dias`,
                    tone: outcome.verdict === 'POSITIVE' ? 'positive' : 'neutral',
                  },
                  {
                    label: 'Observações',
                    value: outcome.notes ?? 'Sem observações adicionais',
                  },
                ]}
              />
            ))}
          </div>
        </section>
      ) : null}

      {/* ----------------- Ja vistos ----------------- */}
      {!filters.status && seenAlerts.length > 0 ? (
        <details className="rounded-xl border bg-card p-4">
          <summary className="cursor-pointer text-sm font-semibold">
            <span className="inline-flex flex-wrap items-center gap-2">
              <EyeOff size={14} className="text-muted-foreground" />
              Já vistos
              <Badge variant="outline">{formatNumber(seenAlerts.length)}</Badge>
            </span>
          </summary>
          <p className="mt-1.5 text-xs text-muted-foreground">
            Saíram da lista porque você já leu — não porque deixaram de existir. Se um deles
            piorar, severidade ou impacto maior, a próxima análise devolve ele para a lista
            sozinho. Para nunca mais ver um alerta, use “Ignorar”.
          </p>
          <div className="mt-3 space-y-2">
            {prioritizeAlerts(seenAlerts).map((alert) => (
              <AlertCard
                key={alert.id}
                alert={alert}
                setStatus={setAlertStatus}
                openTarget={openAlert}
                showEvidence={false}
              />
            ))}
          </div>
        </details>
      ) : null}

      {/* ----------------- Resolvidos recentemente ----------------- */}
      {resolvedAlerts.length > 0 ? (
        <section className="space-y-2.5">
          <div className="flex flex-wrap items-baseline gap-2">
            <Lightbulb size={14} className="text-emerald-600 dark:text-emerald-400" />
            <h2 className="text-sm font-semibold">Resolvidos recentemente</h2>
            <Badge variant="outline">{num(summary?.resolved_7d)} nos últimos 7 dias</Badge>
            <p className="w-full text-xs text-muted-foreground">
              Fechados por você ou pelo próprio auditor, quando o problema deixou de existir. É o que
              impede esta página de ser só uma lista que cresce.
            </p>
          </div>
          <div className="space-y-2">
            {resolvedAlerts.map((alert) => (
              <AlertCard
                key={alert.id}
                alert={alert}
                setStatus={setAlertStatus}
                openTarget={openAlert}
                showEvidence={false}
              />
            ))}
          </div>
        </section>
      ) : null}

      <p className="border-t pt-3 text-xs text-muted-foreground">
        {formatNumber(criticalCount)} crítico(s) · {formatNumber(importantCount)} de atenção ·{' '}
        {formatNumber(opportunityCount)} informativo(s). Todas as regras são determinísticas: nenhum
        número desta tela vem de IA.
      </p>
    </>
  )
}

/** Tom da margem do dia. Sem venda nao ha margem a colorir. */
function marginTone(revenue: number, marginPercent: number): MetricTone {
  if (revenue <= 0) return 'neutral'
  if (marginPercent < 0) return 'negative'
  if (marginPercent < 5) return 'warning'
  return 'positive'
}

function hasIntegrationProblem(alerts: { domain: string }[]): boolean {
  return alerts.some((alert) => alert.domain === 'INTEGRACAO')
}

function integrationLabel(blocks: { id: string; alerts: unknown[] }[]): string {
  const block = blocks.find((item) => item.id === 'integracoes')
  const count = block?.alerts.length ?? 0
  return count === 0 ? 'OK' : `${count} problema${count > 1 ? 's' : ''}`
}
