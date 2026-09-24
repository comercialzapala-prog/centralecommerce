import Link from 'next/link'

import { BREAK_EVEN_SCALE, type BreakEvenStatus } from '@/lib/finance'
import { formatCurrency, formatPercent } from '@/lib/format'
import { cn } from '@/lib/utils'

/**
 * PROGRESSO PARA BREAK-EVEN -- secoes 31, 32 e 33.
 *
 * REGRA INEGOCIAVEL: "50" e a ESCALA do indicador, nunca dinheiro.
 * Por isso nao existe, em lugar nenhum deste componente, a frase
 * "R$ X de R$ 50". Os reais aparecem so em "recuperados" e "restantes".
 */

const STATE_BADGE = {
  SEM_INVESTIMENTO: { label: 'Sem investimento cadastrado', className: 'bg-muted text-muted-foreground' },
  EM_RECUPERACAO: { label: 'Em recuperação', className: 'bg-sky-100 text-sky-800 dark:bg-sky-950 dark:text-sky-300' },
  BREAK_EVEN: { label: 'Break-even atingido', className: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300' },
  LUCRATIVO: { label: 'Projeto lucrativo', className: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300' },
} as const

export function Progress50({ status }: { status: BreakEvenStatus }) {
  const badge = STATE_BADGE[status.state]

  if (status.state === 'SEM_INVESTIMENTO') {
    return (
      <div className="space-y-3">
        <Header badge={badge} />
        <p className="text-sm text-muted-foreground">
          O indicador precisa saber quanto foi investido para calcular o quanto já voltou.
          Cadastre os aportes de estrutura em{' '}
          <Link href="/investimentos" className="font-medium text-foreground underline underline-offset-4">
            Investimentos
          </Link>{' '}
          ou informe um valor inicial em{' '}
          <Link href="/configuracoes" className="font-medium text-foreground underline underline-offset-4">
            Configurações
          </Link>
          .
        </p>
        <p className="text-xs text-muted-foreground">
          Lucro operacional acumulado até aqui: {formatCurrency(status.accumulatedProfit)}
        </p>
      </div>
    )
  }

  const reached = status.state !== 'EM_RECUPERACAO'

  return (
    <div className="space-y-4">
      <Header badge={badge} />

      <div className="flex items-baseline gap-2">
        <span className="text-4xl font-semibold tabular-nums">{status.scale}</span>
        <span className="text-2xl font-medium text-muted-foreground">/ {BREAK_EVEN_SCALE}</span>
        <span className="ml-2 text-sm text-muted-foreground">
          {formatPercent(status.percent)} do caminho
        </span>
      </div>

      <div
        className="h-3 w-full overflow-hidden rounded-full bg-muted"
        role="progressbar"
        aria-valuenow={status.scale}
        aria-valuemin={0}
        aria-valuemax={BREAK_EVEN_SCALE}
        aria-label="Progresso para o break-even"
      >
        <div
          className={cn(
            'h-full rounded-full transition-all duration-500',
            reached ? 'bg-emerald-500' : 'bg-sky-500',
          )}
          style={{ width: `${status.percent}%` }}
        />
      </div>

      <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
        <Row label="Investimento total" value={formatCurrency(status.investmentTotal)} />
        <Row
          label="Recuperados"
          value={formatCurrency(status.recovered)}
          className="text-emerald-600 dark:text-emerald-400"
        />
        <Row
          label="Restantes"
          value={formatCurrency(status.remaining)}
          className={status.remaining > 0 ? 'text-rose-600 dark:text-rose-400' : undefined}
        />
        <Row
          label="Resultado acumulado"
          value={formatCurrency(status.accumulatedResult)}
          className={
            status.accumulatedResult >= 0
              ? 'text-emerald-600 dark:text-emerald-400'
              : 'text-rose-600 dark:text-rose-400'
          }
        />
      </dl>

      {status.state === 'LUCRATIVO' ? (
        <p className="rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-300">
          Investimento pago. Lucro acumulado de{' '}
          <strong>{formatCurrency(status.profitAfterBreakEven)}</strong> além do break-even.
        </p>
      ) : null}
    </div>
  )
}

function Header({ badge }: { badge: { label: string; className: string } }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-2">
      <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        Progresso para break-even
      </h2>
      <span className={cn('rounded-full px-2.5 py-1 text-xs font-medium', badge.className)}>
        {badge.label}
      </span>
    </div>
  )
}

function Row({ label, value, className }: { label: string; value: string; className?: string }) {
  return (
    <div>
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className={cn('font-medium tabular-nums', className)}>{value}</dd>
    </div>
  )
}
