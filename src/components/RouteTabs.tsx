'use client'

import Link from 'next/link'
import { usePathname, useSearchParams } from 'next/navigation'

import { cn } from '@/lib/utils'

export type RouteTabItem = {
  href: string
  label: string
  badge?: string | number
  preserveQuery?: boolean
}

export function RouteTabs({ items }: { items: RouteTabItem[] }) {
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const queryString = searchParams.toString()

  return (
    <nav
      aria-label="Subnavegação da seção"
      className="flex flex-wrap items-center gap-1.5 rounded-xl border bg-muted/30 p-1.5"
    >
      {items.map((item) => {
        const active = pathname === item.href
        const targetHref =
          item.preserveQuery && queryString ? `${item.href}?${queryString}` : item.href

        return (
          <Link
            key={item.href}
            href={targetHref}
            className={cn(
              'inline-flex items-center gap-2 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors',
              active
                ? 'bg-background text-foreground shadow-sm border border-border/60'
                : 'text-muted-foreground hover:bg-background/50 hover:text-foreground',
            )}
          >
            <span>{item.label}</span>
            {item.badge !== undefined ? (
              <span
                className={cn(
                  'rounded-md px-1.5 py-0.5 text-[10px] font-semibold tabular-nums',
                  active
                    ? 'bg-primary/15 text-primary'
                    : 'bg-muted text-muted-foreground',
                )}
              >
                {item.badge}
              </span>
            ) : null}
          </Link>
        )
      })}
    </nav>
  )
}
