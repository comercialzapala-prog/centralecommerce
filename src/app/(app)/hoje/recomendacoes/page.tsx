import Link from 'next/link'
import type { Metadata } from 'next'
import { EyeOff, Lightbulb, Sparkles } from 'lucide-react'

import { BoxGrid } from '@/components/BoxGrid'
import { AlertCard } from '@/components/hoje/AlertCard'
import { HojeToolbar } from '@/components/hoje/HojeToolbar'
import { EmptyState, PageHeader } from '@/components/PageHeader'
import { RouteTabs } from '@/components/RouteTabs'
import { Badge } from '@/components/ui/badge'
import { requireMembership } from '@/lib/auth'
import {
  getAlerts,
  getHojeSummary,
  getLastReviewedAt,
  getOpenRecommendations,
  getRecommendationOutcomes,
  getResolvedAlerts,
} from '@/lib/data'
import { formatDateTime, formatNumber, num } from '@/lib/format'
import { ACTIVE_STATUSES, SEEN_STATUSES, prioritizeAlerts } from '@/lib/hoje'

import { markReviewed, openAlert, runAnalysis, setAlertStatus } from '../actions'

export const metadata: Metadata = {
  title: 'Recomendações & Histórico | Control Center',
}

export const dynamic = 'force-dynamic'

export default async function HojeRecomendacoesPage() {
  const { user, membership } = await requireMembership()
  const organizationId = membership.organizationId

  const [
    summary,
    activeAlerts,
    seenAlerts,
    resolvedAlerts,
    recommendations,
    outcomes,
    lastReviewedAt,
  ] = await Promise.all([
    getHojeSummary(organizationId),
    getAlerts(organizationId, { statuses: ACTIVE_STATUSES }),
    getAlerts(organizationId, { statuses: SEEN_STATUSES }),
    getResolvedAlerts(organizationId, 15),
    getOpenRecommendations(organizationId, 20),
    getRecommendationOutcomes(organizationId, 10),
    getLastReviewedAt(organizationId, user.id),
  ])

  const hasAnyContent =
    recommendations.length > 0 ||
    outcomes.length > 0 ||
    seenAlerts.length > 0 ||
    resolvedAlerts.length > 0

  return (
    <>
      <PageHeader
        title="Hoje — Recomendações & Histórico"
        description="Sugestões determinísticas do auditor, avaliação de resultados, alertas já vistos e histórico de resolvidos."
        actions={
          <HojeToolbar
            runAnalysis={runAnalysis}
            markReviewed={markReviewed}
            hasReviewState={Boolean(lastReviewedAt)}
          />
        }
      />

      <RouteTabs
        items={[
          { href: '/hoje', label: 'Alertas & Prioridades', badge: activeAlerts.length },
          {
            href: '/hoje/recomendacoes',
            label: 'Recomendações & Histórico',
            badge: seenAlerts.length + resolvedAlerts.length,
          },
        ]}
      />

      {!hasAnyContent ? (
        <EmptyState
          title="Nenhuma recomendação ou histórico disponível"
          description="Conforme a operação rodar análises e resolver alertas, as recomendações e o histórico aparecerão aqui."
        />
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
      {seenAlerts.length > 0 ? (
        <section className="space-y-2.5 rounded-xl border bg-card p-4">
          <div className="flex flex-wrap items-center gap-2">
            <EyeOff size={14} className="text-muted-foreground" />
            <h2 className="text-sm font-semibold">Já vistos</h2>
            <Badge variant="outline">{formatNumber(seenAlerts.length)}</Badge>
          </div>
          <p className="text-xs text-muted-foreground">
            Saíram da lista principal porque você já leu — não porque deixaram de existir. Se um
            deles piorar, a próxima análise devolve ele para a lista principal sozinho.
          </p>
          <div className="space-y-2">
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
        </section>
      ) : null}

      {/* ----------------- Resolvidos recentemente ----------------- */}
      {resolvedAlerts.length > 0 ? (
        <section className="space-y-2.5">
          <div className="flex flex-wrap items-baseline gap-2">
            <Lightbulb size={14} className="text-emerald-600 dark:text-emerald-400" />
            <h2 className="text-sm font-semibold">Resolvidos recentemente</h2>
            <Badge variant="outline">{num(summary?.resolved_7d)} nos últimos 7 dias</Badge>
            <p className="w-full text-xs text-muted-foreground">
              Fechados por você ou pelo próprio auditor, quando o problema deixou de existir.
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
    </>
  )
}
