import * as React from 'react'

import { cn } from '@/lib/utils'

export type BoxGridTone = 'neutral' | 'positive' | 'warning' | 'danger' | 'negative' | 'accent'

export type BoxGridItem = {
  label: string
  value: React.ReactNode
  hint?: string
  tone?: BoxGridTone
  mono?: boolean
  span?: 1 | 2
}

const VALUE_TONE_CLASS: Record<BoxGridTone, string> = {
  neutral: 'text-foreground',
  positive: 'text-emerald-600 dark:text-emerald-400',
  warning: 'text-amber-600 dark:text-amber-400',
  danger: 'text-rose-600 dark:text-rose-400',
  negative: 'text-rose-600 dark:text-rose-400',
  accent: 'text-sky-600 dark:text-sky-400',
}

const CARD_TONE_CLASS: Record<BoxGridTone, string> = {
  neutral: 'border-border/80 bg-muted/30',
  positive: 'border-emerald-500/25 bg-emerald-500/5',
  warning: 'border-amber-500/25 bg-amber-500/5',
  danger: 'border-rose-500/25 bg-rose-500/5',
  negative: 'border-rose-500/25 bg-rose-500/5',
  accent: 'border-sky-500/25 bg-sky-500/5',
}

export function BoxGrid({
  items,
  columns = 2,
  className,
}: {
  items: BoxGridItem[]
  columns?: 1 | 2 | 3 | 4
  className?: string
}) {
  if (items.length === 0) return null

  const gridCols =
    columns === 1
      ? 'grid-cols-1'
      : columns === 4
        ? 'grid-cols-2 sm:grid-cols-4'
        : columns === 3
          ? 'grid-cols-1 sm:grid-cols-3'
          : 'grid-cols-1 sm:grid-cols-2'

  return (
    <div className={cn('grid gap-2.5', gridCols, className)}>
      {items.map((item, index) => {
        const tone = item.tone ?? 'neutral'
        return (
          <div
            key={`${item.label}-${index}`}
            className={cn(
              'rounded-xl border p-3 transition-colors',
              CARD_TONE_CLASS[tone],
              item.span === 2 && columns > 1 && 'sm:col-span-2',
            )}
          >
            <div className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
              {item.label}
            </div>
            <div
              className={cn(
                'mt-1 truncate text-sm font-semibold tabular-nums',
                VALUE_TONE_CLASS[tone],
                item.mono && 'font-mono text-xs',
              )}
              title={typeof item.value === 'string' ? item.value : undefined}
            >
              {item.value}
            </div>
            {item.hint ? (
              <div className="mt-0.5 text-[11px] leading-snug text-muted-foreground">
                {item.hint}
              </div>
            ) : null}
          </div>
        )
      })}
    </div>
  )
}
