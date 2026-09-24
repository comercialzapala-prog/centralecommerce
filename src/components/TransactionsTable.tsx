import Link from 'next/link'

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { formatCurrency, formatDate, num } from '@/lib/format'
import { TRANSACTION_TYPE_META, type TransactionRow } from '@/lib/types'
import { cn } from '@/lib/utils'

const TYPE_CLASS: Record<string, string> = {
  ENTRADA: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300',
  SAIDA: 'bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300',
  APORTE: 'bg-sky-100 text-sky-800 dark:bg-sky-950 dark:text-sky-300',
  ESTORNO: 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300',
}

const STATUS_CLASS: Record<string, string> = {
  PAGO: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300',
  PENDENTE: 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300',
  CANCELADO: 'bg-muted text-muted-foreground line-through',
}

export function TransactionsTable({
  rows,
  emptyMessage = 'Nenhum lançamento encontrado com esses filtros.',
  showCostCenter = true,
  actions,
}: {
  rows: TransactionRow[]
  emptyMessage?: string
  showCostCenter?: boolean
  actions?: (row: TransactionRow) => React.ReactNode
}) {
  if (rows.length === 0) {
    return (
      <div className="rounded-xl border border-dashed p-10 text-center text-sm text-muted-foreground">
        {emptyMessage}
      </div>
    )
  }

  return (
    <div className="overflow-x-auto rounded-xl border bg-card">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-[96px]">Data</TableHead>
            <TableHead>Descrição</TableHead>
            <TableHead className="w-[92px]">Tipo</TableHead>
            <TableHead>Categoria</TableHead>
            {showCostCenter ? <TableHead>Centro de custo</TableHead> : null}
            <TableHead>Fornecedor</TableHead>
            <TableHead className="w-[110px]">Pagamento</TableHead>
            <TableHead className="w-[100px]">Status</TableHead>
            <TableHead className="w-[130px] text-right">Valor</TableHead>
            {actions ? <TableHead className="w-[70px]" /> : null}
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((row) => {
            const meta = TRANSACTION_TYPE_META[row.type]
            const isOut = row.type === 'SAIDA'
            const cancelled = row.status === 'CANCELADO'

            return (
              <TableRow key={row.id} className={cn(cancelled && 'opacity-60')}>
                <TableCell className="whitespace-nowrap tabular-nums">
                  {formatDate(row.transaction_date)}
                </TableCell>

                <TableCell className="max-w-[280px]">
                  <div className="truncate font-medium">{row.description}</div>
                  {row.notes ? (
                    <div className="truncate text-xs text-muted-foreground">{row.notes}</div>
                  ) : null}
                </TableCell>

                <TableCell>
                  <span
                    className={cn(
                      'rounded px-1.5 py-0.5 text-[11px] font-medium',
                      TYPE_CLASS[row.type],
                    )}
                    title={meta?.hint}
                  >
                    {meta?.label ?? row.type}
                  </span>
                </TableCell>

                <TableCell className="text-muted-foreground">
                  {row.category_name ?? '--'}
                </TableCell>

                {showCostCenter ? (
                  <TableCell className="max-w-[220px]">
                    {row.cost_center_id ? (
                      <Link
                        href={`/centros-de-custo/${row.cost_center_id}`}
                        className="block truncate hover:underline"
                        title={row.cost_center_path ?? undefined}
                      >
                        {row.cost_center_name}
                      </Link>
                    ) : (
                      <span className="text-muted-foreground">--</span>
                    )}
                  </TableCell>
                ) : null}

                <TableCell className="max-w-[160px]">
                  {row.supplier_id ? (
                    <Link
                      href={`/fornecedores/${row.supplier_id}`}
                      className="block truncate hover:underline"
                    >
                      {row.supplier_name}
                    </Link>
                  ) : (
                    <span className="text-muted-foreground">--</span>
                  )}
                </TableCell>

                <TableCell className="text-muted-foreground">
                  {row.payment_method_name ?? row.payment_method ?? '--'}
                </TableCell>

                <TableCell>
                  <span
                    className={cn(
                      'rounded px-1.5 py-0.5 text-[11px] font-medium',
                      STATUS_CLASS[row.status],
                    )}
                  >
                    {row.status}
                  </span>
                </TableCell>

                <TableCell
                  className={cn(
                    'text-right font-medium tabular-nums',
                    cancelled
                      ? 'text-muted-foreground'
                      : isOut
                        ? 'text-rose-600 dark:text-rose-400'
                        : 'text-emerald-600 dark:text-emerald-400',
                  )}
                >
                  {isOut ? '-' : '+'}
                  {formatCurrency(num(row.amount))}
                </TableCell>

                {actions ? <TableCell className="text-right">{actions(row)}</TableCell> : null}
              </TableRow>
            )
          })}
        </TableBody>
      </Table>
    </div>
  )
}
