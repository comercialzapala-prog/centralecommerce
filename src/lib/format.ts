/** Formatacao padrao do sistema (secao 42): R$ 1.234,56 e DD/MM/YYYY. */

const currencyFormatter = new Intl.NumberFormat('pt-BR', {
  style: 'currency',
  currency: 'BRL',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
})

const compactFormatter = new Intl.NumberFormat('pt-BR', {
  notation: 'compact',
  maximumFractionDigits: 1,
})

const integerFormatter = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 0 })

/**
 * PostgREST pode devolver `numeric` como string. Tudo que for dinheiro passa
 * por aqui antes de entrar em qualquer conta.
 */
export function num(value: unknown): number {
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0
  if (typeof value === 'string') {
    const parsed = Number(value)
    return Number.isFinite(parsed) ? parsed : 0
  }
  return 0
}

export function formatCurrency(value: unknown): string {
  return currencyFormatter.format(num(value))
}

/** Versao curta para eixos de grafico: R$ 12,5 mil. */
export function formatCurrencyCompact(value: unknown): string {
  return `R$ ${compactFormatter.format(num(value))}`
}

export function formatNumber(value: unknown): string {
  return integerFormatter.format(num(value))
}

export function formatPercent(value: unknown, digits = 1): string {
  return `${num(value).toLocaleString('pt-BR', {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  })}%`
}

/**
 * Datas vindas do Postgres sao `YYYY-MM-DD` puro. Converter com `new Date()`
 * as interpreta como UTC e joga o dia para tras no fuso do Brasil -- por isso
 * a formatacao e feita na string, sem passar por Date.
 */
export function formatDate(value: string | null | undefined): string {
  if (!value) return '--'
  const isoDate = value.slice(0, 10)
  const [year, month, day] = isoDate.split('-')
  if (!year || !month || !day) return '--'
  return `${day}/${month}/${year}`
}

export function formatDateTime(value: string | null | undefined): string {
  if (!value) return '--'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '--'
  return date.toLocaleString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

/** `YYYY-MM-DD` do dia de hoje no fuso local (default dos formularios). */
export function todayISO(): string {
  const now = new Date()
  const offset = now.getTimezoneOffset() * 60_000
  return new Date(now.getTime() - offset).toISOString().slice(0, 10)
}

/**
 * Aceita o que o usuario digitar num campo de dinheiro: "1.234,56", "1234.56",
 * "R$ 420" -- e devolve number. Retorna null quando nao da para interpretar.
 */
export function parseAmount(input: unknown): number | null {
  if (typeof input === 'number') return Number.isFinite(input) ? input : null
  if (typeof input !== 'string') return null

  const cleaned = input.replace(/[^\d,.-]/g, '').trim()
  if (!cleaned) return null

  const lastComma = cleaned.lastIndexOf(',')
  const lastDot = cleaned.lastIndexOf('.')

  let normalized: string
  if (lastComma > lastDot) {
    // formato pt-BR: 1.234,56
    normalized = cleaned.replace(/\./g, '').replace(',', '.')
  } else {
    // formato en-US ou sem separador decimal: 1234.56 / 1,234.56
    normalized = cleaned.replace(/,/g, '')
  }

  const parsed = Number(normalized)
  return Number.isFinite(parsed) ? parsed : null
}

/** Arredonda para 2 casas evitando o erro classico de ponto flutuante. */
export function round2(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100
}
