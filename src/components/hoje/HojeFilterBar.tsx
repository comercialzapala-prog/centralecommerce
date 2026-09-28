'use client'

import * as React from 'react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { FilterX } from 'lucide-react'

import { NativeSelect } from '@/components/ui/native-select'
import {
  ALERT_STATUS_LABEL,
  ALERT_STATUS_ORDER,
  DOMAIN_LABEL,
  HOJE_PARAM,
  HOJE_PERIODS,
  SEVERITY_LABEL,
  countActiveHojeFilters,
  type HojeFilters,
} from '@/lib/hoje'

/**
 * Barra de filtros do /hoje.
 *
 * O estado vive na URL, nao em `useState`. Isso e o que permite mandar por link
 * "olha os criticos de estoque" e o que faz o botao voltar do navegador funcionar
 * como a pessoa espera. A pagina e Server Component e le os mesmos parametros.
 */
export function HojeFilterBar({
  filters,
  channels,
}: {
  filters: HojeFilters
  channels: string[]
}) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const [pending, startTransition] = React.useTransition()

  const apply = React.useCallback(
    (key: string, value: string) => {
      const params = new URLSearchParams(searchParams.toString())
      if (value === '') params.delete(key)
      else params.set(key, value)

      const query = params.toString()
      startTransition(() => router.replace(query ? `${pathname}?${query}` : pathname))
    },
    [pathname, router, searchParams],
  )

  const active = countActiveHojeFilters(filters)

  return (
    <div
      data-pending={pending ? '' : undefined}
      className="flex flex-wrap items-center gap-2 rounded-xl border bg-card p-3 data-pending:opacity-60"
    >
      <NativeSelect
        aria-label="Severidade"
        value={filters.severity ?? ''}
        onChange={(event) => apply(HOJE_PARAM.severity, event.target.value)}
        className="w-auto min-w-[9rem]"
      >
        <option value="">Toda severidade</option>
        {(['CRITICO', 'IMPORTANTE', 'OPORTUNIDADE'] as const).map((value) => (
          <option key={value} value={value}>
            {SEVERITY_LABEL[value]}
          </option>
        ))}
      </NativeSelect>

      <NativeSelect
        aria-label="Domínio"
        value={filters.domain ?? ''}
        onChange={(event) => apply(HOJE_PARAM.domain, event.target.value)}
        className="w-auto min-w-[9rem]"
      >
        <option value="">Todo domínio</option>
        {(Object.keys(DOMAIN_LABEL) as (keyof typeof DOMAIN_LABEL)[]).map((value) => (
          <option key={value} value={value}>
            {DOMAIN_LABEL[value]}
          </option>
        ))}
      </NativeSelect>

      {/* O filtro de canal só aparece quando existe canal nos alertas: um select
          com uma opção só ocuparia espaço sem oferecer escolha. */}
      {channels.length > 0 ? (
        <NativeSelect
          aria-label="Canal"
          value={filters.channel ?? ''}
          onChange={(event) => apply(HOJE_PARAM.channel, event.target.value)}
          className="w-auto min-w-[9rem]"
        >
          <option value="">Todo canal</option>
          {channels.map((channel) => (
            <option key={channel} value={channel}>
              {channel}
            </option>
          ))}
        </NativeSelect>
      ) : null}

      <NativeSelect
        aria-label="Status"
        value={filters.status ?? ''}
        onChange={(event) => apply(HOJE_PARAM.status, event.target.value)}
        className="w-auto min-w-[9rem]"
      >
        <option value="">Em aberto (novo e visto)</option>
        {ALERT_STATUS_ORDER.map((value) => (
          <option key={value} value={value}>
            Somente {ALERT_STATUS_LABEL[value]}
          </option>
        ))}
      </NativeSelect>

      <NativeSelect
        aria-label="Período"
        value={filters.period}
        onChange={(event) => apply(HOJE_PARAM.period, event.target.value)}
        className="w-auto min-w-[9rem]"
      >
        {HOJE_PERIODS.map((period) => (
          <option key={period.value} value={period.value}>
            {period.label}
          </option>
        ))}
      </NativeSelect>

      {active > 0 ? (
        <button
          type="button"
          onClick={() => startTransition(() => router.replace(pathname))}
          className="ml-auto inline-flex items-center gap-1.5 rounded-md border border-input px-2.5 py-1.5 text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        >
          <FilterX className="size-3.5" />
          Limpar {active} filtro{active > 1 ? 's' : ''}
        </button>
      ) : null}
    </div>
  )
}
