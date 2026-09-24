/** Filtros globais (secoes 8 e 29). Vivem na URL para serem compartilhaveis. */

export type SearchParams = Record<string, string | string[] | undefined>

export type PeriodPreset =
  | 'tudo'
  | 'hoje'
  | '7d'
  | '30d'
  | 'mes'
  | 'mes-passado'
  | 'ano'
  | 'custom'

export const PERIOD_PRESETS: { value: PeriodPreset; label: string }[] = [
  { value: 'tudo', label: 'Todo o período' },
  { value: 'hoje', label: 'Hoje' },
  { value: '7d', label: 'Últimos 7 dias' },
  { value: '30d', label: 'Últimos 30 dias' },
  { value: 'mes', label: 'Este mês' },
  { value: 'mes-passado', label: 'Mês passado' },
  { value: 'ano', label: 'Este ano' },
  { value: 'custom', label: 'Personalizado' },
]

export type GlobalFilters = {
  period: PeriodPreset
  from: string | null
  to: string | null
  costCenterId: string | null
  categoryId: string | null
  supplierId: string | null
  channelId: string | null
  productId: string | null
  paymentMethodId: string | null
  status: string | null
  type: string | null
  q: string | null
}

export const EMPTY_FILTERS: GlobalFilters = {
  period: 'tudo',
  from: null,
  to: null,
  costCenterId: null,
  categoryId: null,
  supplierId: null,
  channelId: null,
  productId: null,
  paymentMethodId: null,
  status: null,
  type: null,
  q: null,
}

function first(value: string | string[] | undefined): string | null {
  const raw = Array.isArray(value) ? value[0] : value
  if (raw === undefined || raw === null) return null
  const trimmed = raw.trim()
  return trimmed === '' ? null : trimmed
}

function toISO(date: Date): string {
  const offset = date.getTimezoneOffset() * 60_000
  return new Date(date.getTime() - offset).toISOString().slice(0, 10)
}

/** Converte o preset em intervalo concreto. `custom` usa o que veio na URL. */
export function resolvePeriod(
  preset: PeriodPreset,
  from: string | null,
  to: string | null,
  now = new Date(),
): { from: string | null; to: string | null } {
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate())

  switch (preset) {
    case 'hoje':
      return { from: toISO(startOfToday), to: toISO(startOfToday) }
    case '7d': {
      const start = new Date(startOfToday)
      start.setDate(start.getDate() - 6)
      return { from: toISO(start), to: toISO(startOfToday) }
    }
    case '30d': {
      const start = new Date(startOfToday)
      start.setDate(start.getDate() - 29)
      return { from: toISO(start), to: toISO(startOfToday) }
    }
    case 'mes':
      return {
        from: toISO(new Date(now.getFullYear(), now.getMonth(), 1)),
        to: toISO(new Date(now.getFullYear(), now.getMonth() + 1, 0)),
      }
    case 'mes-passado':
      return {
        from: toISO(new Date(now.getFullYear(), now.getMonth() - 1, 1)),
        to: toISO(new Date(now.getFullYear(), now.getMonth(), 0)),
      }
    case 'ano':
      return {
        from: toISO(new Date(now.getFullYear(), 0, 1)),
        to: toISO(new Date(now.getFullYear(), 11, 31)),
      }
    case 'custom':
      return { from, to }
    case 'tudo':
    default:
      return { from: null, to: null }
  }
}

export function parseFilters(searchParams: SearchParams): GlobalFilters {
  const rawPeriod = first(searchParams.period) as PeriodPreset | null
  const from = first(searchParams.from)
  const to = first(searchParams.to)

  // Datas na URL sem preset explicito significam intervalo manual.
  const period: PeriodPreset =
    rawPeriod && PERIOD_PRESETS.some((preset) => preset.value === rawPeriod)
      ? rawPeriod
      : from || to
        ? 'custom'
        : 'tudo'

  const resolved = resolvePeriod(period, from, to)

  return {
    period,
    from: resolved.from,
    to: resolved.to,
    costCenterId: first(searchParams.centro),
    categoryId: first(searchParams.categoria),
    supplierId: first(searchParams.fornecedor),
    channelId: first(searchParams.canal),
    productId: first(searchParams.produto),
    paymentMethodId: first(searchParams.pagamento),
    status: first(searchParams.status),
    type: first(searchParams.tipo),
    q: first(searchParams.q),
  }
}

/** Nome do parametro na URL para cada campo de filtro. */
export const FILTER_PARAM: Record<keyof Omit<GlobalFilters, 'from' | 'to' | 'period'>, string> = {
  costCenterId: 'centro',
  categoryId: 'categoria',
  supplierId: 'fornecedor',
  channelId: 'canal',
  productId: 'produto',
  paymentMethodId: 'pagamento',
  status: 'status',
  type: 'tipo',
  q: 'q',
}

/** Monta a query string preservando o que ja estava aplicado. */
export function buildQuery(
  current: SearchParams,
  overrides: Record<string, string | null | undefined>,
): string {
  const params = new URLSearchParams()

  for (const [key, value] of Object.entries(current)) {
    const single = first(value)
    if (single !== null) params.set(key, single)
  }

  for (const [key, value] of Object.entries(overrides)) {
    if (value === null || value === undefined || value === '') params.delete(key)
    else params.set(key, value)
  }

  const query = params.toString()
  return query ? `?${query}` : ''
}

export function countActiveFilters(filters: GlobalFilters): number {
  let count = 0
  if (filters.period !== 'tudo') count += 1
  for (const key of Object.keys(FILTER_PARAM) as (keyof typeof FILTER_PARAM)[]) {
    if (filters[key]) count += 1
  }
  return count
}

/** Descricao curta do periodo, para o cabecalho das telas. */
export function describePeriod(filters: GlobalFilters): string {
  if (filters.period === 'tudo' || (!filters.from && !filters.to)) return 'Todo o período'
  const preset = PERIOD_PRESETS.find((item) => item.value === filters.period)
  if (preset && preset.value !== 'custom') return preset.label

  const format = (value: string | null) => {
    if (!value) return '...'
    const [year, month, day] = value.split('-')
    return `${day}/${month}/${year}`
  }
  return `${format(filters.from)} a ${format(filters.to)}`
}
