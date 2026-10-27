import { CircleAlert, Info, TriangleAlert } from 'lucide-react'

import { BoxGrid } from '@/components/BoxGrid'
import { AlertResolveButton } from '@/components/hoje/AlertResolveButton'
import { AlertStatusActions } from '@/components/hoje/AlertStatusActions'
import { Badge } from '@/components/ui/badge'
import type { ActionState } from '@/lib/actions'
import { formatCurrency, formatDateTime } from '@/lib/format'
import { ALERT_STATUS_LABEL, DOMAIN_LABEL, IMPACT_KIND_LABEL } from '@/lib/hoje'
import type { AlertRow } from '@/lib/types'
import { cn } from '@/lib/utils'
import type { AuditDomain } from '@/domain/auditor'

const SEVERITY_STYLE = {
  CRITICO: {
    icon: CircleAlert,
    border: 'border-rose-500/30 bg-rose-500/[0.03]',
    text: 'text-rose-600 dark:text-rose-400',
    badge: 'destructive' as const,
    tone: 'danger' as const,
    label: 'Crítico',
  },
  IMPORTANTE: {
    icon: TriangleAlert,
    border: 'border-amber-500/30 bg-amber-500/[0.03]',
    text: 'text-amber-600 dark:text-amber-400',
    badge: 'outline' as const,
    tone: 'warning' as const,
    label: 'Atenção',
  },
  OPORTUNIDADE: {
    icon: Info,
    border: 'border-sky-500/30 bg-sky-500/[0.03]',
    text: 'text-sky-600 dark:text-sky-400',
    badge: 'secondary' as const,
    tone: 'accent' as const,
    label: 'Informativo',
  },
}

export function AlertCard({
  alert,
  setStatus,
  openTarget,
  showEvidence = true,
}: {
  alert: AlertRow
  setStatus: (prev: ActionState, formData: FormData) => Promise<ActionState>
  openTarget: (prev: ActionState, formData: FormData) => Promise<ActionState>
  showEvidence?: boolean
}) {
  const style = SEVERITY_STYLE[alert.severity]
  const Icon = style.icon
  const impact = alert.financial_impact === null ? null : Number(alert.financial_impact)
  const resolved = alert.status === 'RESOLVED' || alert.status === 'DISMISSED'
  const evidenceEntries = Object.entries(alert.data_points ?? {})

  return (
    <article
      className={cn(
        'rounded-xl border bg-card p-4 shadow-sm transition-colors',
        style.border,
        resolved && 'opacity-65',
      )}
    >
      <div className="flex items-start gap-3">
        <div
          className={cn(
            'flex size-9 shrink-0 items-center justify-center rounded-xl border bg-background',
            style.text,
          )}
        >
          <Icon size={16} />
        </div>

        <div className="min-w-0 flex-1 space-y-3">
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

          <div>
            <h3 className="text-sm font-semibold leading-snug">{alert.title}</h3>
            <p className="mt-1 text-sm text-muted-foreground">{alert.what_happened}</p>
            <p className="mt-0.5 text-xs text-muted-foreground">{alert.why_it_matters}</p>
          </div>

          <BoxGrid
            columns={3}
            items={[
              ...(impact !== null
                ? [
                    {
                      label: IMPACT_KIND_LABEL[alert.impact_kind ?? ''] ?? 'Impacto estimado',
                      value: formatCurrency(impact),
                      tone: style.tone,
                    },
                  ]
                : []),
              ...(alert.suggested_action
                ? [
                    {
                      label: 'Ação recomendada',
                      value: alert.suggested_action,
                      span: (impact !== null ? 2 : 2) as 1 | 2,
                    },
                  ]
                : []),
            ]}
          />

          {/* EVIDENCIA EM BOXGRID */}
          {showEvidence && evidenceEntries.length > 0 ? (
            <div className="space-y-1.5">
              <BoxGrid
                columns={3}
                items={evidenceEntries.map(([key, value]) => ({
                  label: key.replace(/_/g, ' '),
                  value: renderValue(value),
                  mono: true,
                }))}
              />
              <p className="text-[11px] text-muted-foreground">
                Regra <code>{alert.rule_code}</code> · visto por último em{' '}
                {formatDateTime(alert.last_seen_at)}
              </p>
            </div>
          ) : null}

          {alert.action_href ? (
            <AlertResolveButton alertId={alert.id} action={openTarget} />
          ) : null}
        </div>

        <AlertStatusActions alertId={alert.id} status={alert.status} action={setStatus} />
      </div>
    </article>
  )
}

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
