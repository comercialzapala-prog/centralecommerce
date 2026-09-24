import Link from 'next/link'
import type { LucideIcon } from 'lucide-react'

import { cn } from '@/lib/utils'

export type MetricTone = 'positive' | 'negative' | 'warning' | 'neutral' | 'accent'

const TONE_CLASS: Record<MetricTone, string> = {
  positive: 'text-emerald-600 dark:text-emerald-400',
  negative: 'text-rose-600 dark:text-rose-400',
  warning: 'text-amber-600 dark:text-amber-400',
  accent: 'text-sky-600 dark:text-sky-400',
  neutral: 'text-foreground',
}

type MetricCardProps = {
  title: string
  value: string
  hint?: string
  tone?: MetricTone
  icon?: LucideIcon
  /** Quando presente o card inteiro vira link (secao 26). */
  href?: string
  footer?: React.ReactNode
}

export function MetricCard({
  title,
  value,
  hint,
  tone = 'neutral',
  icon: Icon,
  href,
  footer,
}: MetricCardProps) {
  const body = (
    <>
      <div className="flex items-start justify-between gap-2">
        <h3 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          {title}
        </h3>
        {Icon ? <Icon size={16} className="shrink-0 text-muted-foreground" /> : null}
      </div>
      <p className={cn('mt-2 text-2xl font-semibold tabular-nums', TONE_CLASS[tone])}>{value}</p>
      {hint ? <p className="mt-1 text-xs leading-snug text-muted-foreground">{hint}</p> : null}
      {footer}
    </>
  )

  const className = cn(
    'block rounded-xl border bg-card p-4 text-card-foreground shadow-sm transition-colors',
    href && 'hover:border-foreground/20 hover:bg-muted/40',
  )

  if (href) {
    return (
      <Link href={href} className={className}>
        {body}
      </Link>
    )
  }

  return <div className={className}>{body}</div>
}
