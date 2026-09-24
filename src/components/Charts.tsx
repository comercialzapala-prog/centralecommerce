'use client'

import {
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'

import { formatCurrency, formatCurrencyCompact, formatNumber } from '@/lib/format'
import type { MonthlyPoint } from '@/lib/finance'

/**
 * Graficos do Control Center (secao 34).
 *
 * Regras seguidas aqui:
 *  - NUNCA dois eixos Y no mesmo grafico.
 *  - Magnitude (ranking) usa UMA cor. Barra colorida por posicao seria
 *    pintar o ranking, nao o dado.
 *  - Duas series => legenda sempre presente; cor nunca e a unica pista.
 *  - Grade fina e continua (tracejado vira ruido visual).
 *  - Nenhum valor mora so no tooltip: todo grafico tem tabela junto.
 */

const AXIS_STYLE = { fontSize: 11, fill: 'var(--viz-muted)' }
const GRID_COLOR = 'var(--viz-grid)'
const AXIS_COLOR = 'var(--viz-axis)'

type TooltipEntry = { name?: string; value?: number | string; color?: string }

function ChartTooltip({
  active,
  payload,
  label,
  formatter = formatCurrency,
}: {
  active?: boolean
  payload?: TooltipEntry[]
  label?: string | number
  formatter?: (value: unknown) => string
}) {
  if (!active || !payload?.length) return null

  return (
    <div className="rounded-lg border bg-popover px-2.5 py-1.5 text-xs shadow-md">
      <div className="mb-1 font-medium">{label}</div>
      {payload.map((entry, index) => (
        <div key={index} className="flex items-center gap-2">
          <span
            aria-hidden="true"
            className="size-2 shrink-0 rounded-[2px]"
            style={{ background: entry.color }}
          />
          <span className="text-muted-foreground">{entry.name}</span>
          <span className="ml-auto font-medium tabular-nums">{formatter(entry.value)}</span>
        </div>
      ))}
    </div>
  )
}

/** Receita x despesas por mes. Duas series categoricas: azul e laranja. */
export function RevenueExpenseChart({ data }: { data: MonthlyPoint[] }) {
  return (
    <div>
      <Legend
        items={[
          { label: 'Receita', color: 'var(--viz-series-1)' },
          { label: 'Despesa', color: 'var(--viz-series-2)' },
        ]}
      />
      <ResponsiveContainer width="100%" height={240}>
        <BarChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 0 }} barGap={2}>
          <CartesianGrid stroke={GRID_COLOR} vertical={false} />
          <XAxis dataKey="label" tick={AXIS_STYLE} tickLine={false} axisLine={{ stroke: AXIS_COLOR }} />
          <YAxis
            tick={AXIS_STYLE}
            tickLine={false}
            axisLine={false}
            width={70}
            tickFormatter={(value) => formatCurrencyCompact(value)}
          />
          <Tooltip content={<ChartTooltip />} cursor={{ fill: 'var(--viz-grid)', opacity: 0.35 }} />
          <Bar dataKey="revenue" name="Receita" fill="var(--viz-series-1)" radius={[4, 4, 0, 0]} />
          <Bar dataKey="expense" name="Despesa" fill="var(--viz-series-2)" radius={[4, 4, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}

/** Resultado acumulado. Serie unica -> sem legenda; o titulo ja nomeia. */
export function AccumulatedResultChart({ data }: { data: MonthlyPoint[] }) {
  return (
    <ResponsiveContainer width="100%" height={240}>
      <LineChart data={data} margin={{ top: 8, right: 12, bottom: 0, left: 0 }}>
        <CartesianGrid stroke={GRID_COLOR} vertical={false} />
        <XAxis dataKey="label" tick={AXIS_STYLE} tickLine={false} axisLine={{ stroke: AXIS_COLOR }} />
        <YAxis
          tick={AXIS_STYLE}
          tickLine={false}
          axisLine={false}
          width={70}
          tickFormatter={(value) => formatCurrencyCompact(value)}
        />
        {/* Zero e o break-even: acima da linha o investimento ja se pagou. */}
        <ReferenceLine
          y={0}
          stroke={AXIS_COLOR}
          label={{ value: 'break-even', position: 'insideTopRight', fontSize: 10, fill: 'var(--viz-muted)' }}
        />
        <Tooltip content={<ChartTooltip />} />
        <Line
          type="monotone"
          dataKey="cumulativeResult"
          name="Resultado acumulado"
          stroke="var(--viz-series-1)"
          strokeWidth={2}
          dot={{ r: 3, strokeWidth: 0, fill: 'var(--viz-series-1)' }}
          activeDot={{ r: 5 }}
        />
      </LineChart>
    </ResponsiveContainer>
  )
}

/** Evolucao do indicador 0/50. Escala fixa 0..50 -- e escala, nao dinheiro. */
export function Scale50Chart({ data }: { data: MonthlyPoint[] }) {
  return (
    <ResponsiveContainer width="100%" height={200}>
      <LineChart data={data} margin={{ top: 8, right: 12, bottom: 0, left: 0 }}>
        <CartesianGrid stroke={GRID_COLOR} vertical={false} />
        <XAxis dataKey="label" tick={AXIS_STYLE} tickLine={false} axisLine={{ stroke: AXIS_COLOR }} />
        <YAxis
          domain={[0, 50]}
          ticks={[0, 10, 20, 30, 40, 50]}
          tick={AXIS_STYLE}
          tickLine={false}
          axisLine={false}
          width={32}
        />
        <ReferenceLine y={50} stroke={AXIS_COLOR} />
        <Tooltip
          content={<ChartTooltip formatter={(value) => `${formatNumber(value)} / 50`} />}
        />
        <Line
          type="monotone"
          dataKey="scale"
          name="Progresso"
          stroke="var(--viz-series-1)"
          strokeWidth={2}
          dot={{ r: 3, strokeWidth: 0, fill: 'var(--viz-series-1)' }}
          activeDot={{ r: 5 }}
        />
      </LineChart>
    </ResponsiveContainer>
  )
}

export type RankedItem = { id: string | null; name: string; total: number }

/**
 * Ranking horizontal. UMA cor para toda a serie: o comprimento da barra ja
 * carrega a magnitude, colorir por posicao nao acrescenta informacao.
 */
export function RankedBarChart({
  data,
  accent = 'series-1',
  valueFormatter = formatCurrency,
}: {
  data: RankedItem[]
  accent?: 'series-1' | 'series-2'
  valueFormatter?: (value: unknown) => string
}) {
  const color = accent === 'series-2' ? 'var(--viz-series-2)' : 'var(--viz-series-1)'
  const height = Math.max(180, data.length * 34 + 30)

  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart
        data={data}
        layout="vertical"
        margin={{ top: 4, right: 76, bottom: 4, left: 0 }}
        barCategoryGap={6}
      >
        <CartesianGrid stroke={GRID_COLOR} horizontal={false} />
        <XAxis
          type="number"
          tick={AXIS_STYLE}
          tickLine={false}
          axisLine={false}
          tickFormatter={(value) => valueFormatter(value)}
        />
        <YAxis
          type="category"
          dataKey="name"
          tick={AXIS_STYLE}
          tickLine={false}
          axisLine={{ stroke: AXIS_COLOR }}
          width={150}
        />
        <Tooltip
          content={<ChartTooltip formatter={valueFormatter} />}
          cursor={{ fill: 'var(--viz-grid)', opacity: 0.35 }}
        />
        <Bar
          dataKey="total"
          name="Total"
          fill={color}
          radius={[0, 4, 4, 0]}
          label={{
            position: 'right',
            fontSize: 11,
            fill: 'var(--viz-muted)',
            formatter: (value: unknown) => valueFormatter(value),
          }}
        />
      </BarChart>
    </ResponsiveContainer>
  )
}

export function Legend({ items }: { items: { label: string; color: string }[] }) {
  return (
    <div className="mb-2 flex flex-wrap items-center gap-3">
      {items.map((item) => (
        <span key={item.label} className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <span
            aria-hidden="true"
            className="size-2.5 rounded-[3px]"
            style={{ background: item.color }}
          />
          {item.label}
        </span>
      ))}
    </div>
  )
}
