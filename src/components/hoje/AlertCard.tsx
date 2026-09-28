import Link from 'next/link'
import { ArrowRight, CircleAlert, Info, TriangleAlert } from 'lucide-react'

import { AlertStatusActions } from '@/components/hoje/AlertStatusActions'
import { Badge } from '@/components/ui/badge'
import type { ActionState } from '@/lib/actions'
import { formatCurrency, formatDateTime } from '@/lib/format'
import { ALERT_STATUS_LABEL, DOMAIN_LABEL, IMPACT_KIND_LABEL } from '@/lib/hoje'
import type { AlertRow } from '@/lib/types'
import { cn } from '@/lib/utils'
import type { AuditDomain } from '@/domain/auditor'

/**
 * Cartao de um alerta (secao 29).
 *
 * Mostra os oito campos que a secao 29 exige, e nenhum deles e opcional por
 * capricho de layout: severidade, titulo, explicacao, impacto financeiro quando
 * calculavel, produto/SKU/canal, evidencia, acao recomendada e para onde ir.
 *
 * A EVIDENCIA fica num `<details>` fechado. Ela precisa estar na tela -- e o que
 * permite conferir o alerta em vez de acreditar nele -- mas aberta por padrao
 * transformaria a lista num paredao de numeros, que e exatamente o que o /hoje
 * existe para evitar.
 *
 * Nenhum numero e calculado aqui. Tudo ja veio calculado pelo auditor.
 */

const SEVERITY_STYLE = {
  CRITICO: {
    icon: CircleAlert,
    border: 'border-l-rose-500',
    text: 'text-rose-600 dark:text-rose-400',
    badge: 'destructive' as const,
    label: 'Crítico',
  },
  IMPORTANTE: {
    icon: TriangleAlert,
    border: 'border-l-amber-500',
    text: 'text-amber-600 dark:text-amber-400',
    badge: 'outline' as const,
    label: 'Atenção',
  },
  OPORTUNIDADE: {
    icon: Info,
    border: 'border-l-sky-500',
    text: 'text-sky-600 dark:text-sky-400',
    badge: 'secondary' as const,
    label: 'Informativo',
  },
}

export function AlertCard({
  alert,
  setStatus,
  showEvidence = true,
}: {
  alert: AlertRow
  setStatus: (prev: ActionState, formData: FormData) => Promise<ActionState>
  showEvidence?: boolean
}) {
  const style = SEVERITY_STYLE[alert.severity]
  const Icon = style.icon
  const impact = alert.financial_impact === null ? null : Number(alert.financial_impact)
  const resolved = alert.status === 'RESOLVED' || alert.status === 'DISMISSED'

  return (
    <article
      className={cn(
        'rounded-lg border border-l-4 bg-card p-3.5',
        style.border,
        resolved && 'opacity-65',
      )}
    >
      <div className="flex items-start gap-3">
        <Icon size={16} className={cn('mt-0.5 shrink-0', style.text)} />

        <div className="min-w-0 flex-1 space-y-2">
          {/* Cabecalho: severidade, dominio, status, identificacao do produto */}
          <div className="flex flex-wrap items-center gap-1.5">
            <Badge variant={style.badge} className="uppercase">
              {style.label}
            </Badge>
            <Badge variant="outline">{DOMAIN_LABEL[alert.domain as AuditDomain] ?? alert.domain}</Badge>
            {alert.sku ? (
              <span className="font-mono text-[11px] text-muted-foreground">{alert.sku}</span>
            ) : null}
            {alert.channel ? (
              <span className="text-[11px] text-muted-foreground">· {alert.channel}</span>
            ) : null}
            <span className="ml-auto text-[11px] uppercase tracking-wide text-muted-foreground">
              {ALERT_STATUS_LABEL[alert.status]}
            </span>
          </div>

          <h3 className="text-sm font-semibold leading-snug">{alert.title}</h3>

          {/* O QUE ACONTECEU + POR QUE IMPORTA */}
          <p className="text-sm text-muted-foreground">{alert.what_happened}</p>
          <p className="text-xs text-muted-foreground">{alert.why_it_matters}</p>

          {/* IMPACTO FINANCEIRO -- so quando calculavel. "—" seria ruido. */}
          {impact !== null ? (
            <p className="text-sm">
              <span className={cn('font-semibold tabular-nums', style.text)}>
                {formatCurrency(impact)}
              </span>
              <span className="text-xs text-muted-foreground">
                {' '}
                de {IMPACT_KIND_LABEL[alert.impact_kind ?? ''] ?? 'impacto estimado'}
              </span>
            </p>
          ) : null}

          {/* ACAO RECOMENDADA */}
          {alert.suggested_action ? (
            <p className="rounded-md bg-muted/60 px-2.5 py-1.5 text-xs">
              <span className="font-medium">Sugestão: </span>
              {alert.suggested_action}
            </p>
          ) : null}

          {/* EVIDENCIA */}
          {showEvidence && Object.keys(alert.data_points ?? {}).length > 0 ? (
            <details className="text-xs">
              <summary className="cursor-pointer text-muted-foreground hover:text-foreground">
                Evidência usada
              </summary>
              <dl className="mt-1.5 grid grid-cols-1 gap-x-4 gap-y-1 sm:grid-cols-2">
                {Object.entries(alert.data_points).map(([key, value]) => (
                  <div key={key} className="flex justify-between gap-2 border-b border-dashed py-0.5">
                    <dt className="text-muted-foreground">{key.replace(/_/g, ' ')}</dt>
                    <dd className="text-right font-mono tabular-nums">{renderValue(value)}</dd>
                  </div>
                ))}
              </dl>
              <p className="mt-1.5 text-[11px] text-muted-foreground">
                Regra <code>{alert.rule_code}</code> · visto por último em{' '}
                {formatDateTime(alert.last_seen_at)}
              </p>
            </details>
          ) : null}

          {/* PARA ONDE IR */}
          {alert.action_href ? (
            <Link
              href={alert.action_href}
              className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
            >
              Resolver
              <ArrowRight className="size-3" />
            </Link>
          ) : null}
        </div>

        <AlertStatusActions alertId={alert.id} status={alert.status} action={setStatus} />
      </div>
    </article>
  )
}

/** Valor da evidencia em texto. Null vira "—", nunca 0 nem "false". */
function renderValue(value: unknown): string {
  if (value === null || value === undefined) return '—'
  if (typeof value === 'boolean') return value ? 'sim' : 'não'
  if (typeof value === 'number') {
    return Number.isInteger(value) ? String(value) : value.toFixed(2).replace('.', ',')
  }
  if (Array.isArray(value)) return value.length === 0 ? '—' : `${value.length} item(ns)`
  if (typeof value === 'object') return '…'
  return String(value)
}
