import Link from 'next/link'
import { Trash2 } from 'lucide-react'

import { ConfirmActionButton } from '@/components/FormDialog'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import type { StockMovementRow } from '@/lib/data'
import { formatDate, formatNumber } from '@/lib/format'
import { STOCK_MOVEMENT_META } from '@/lib/types'
import { cn } from '@/lib/utils'

const TYPE_CLASS: Record<string, string> = {
  ENTRADA: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300',
  DEVOLUCAO: 'bg-sky-100 text-sky-800 dark:bg-sky-950 dark:text-sky-300',
  VENDA: 'bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300',
  PERDA: 'bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300',
  AVARIA: 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300',
  AJUSTE: 'bg-muted text-muted-foreground',
}

export function StockMovementsTable({
  rows,
  showProduct = true,
  deleteAction,
  emptyMessage = 'Nenhuma movimentação encontrada.',
}: {
  rows: StockMovementRow[]
  showProduct?: boolean
  deleteAction?: (formData: FormData) => Promise<void>
  emptyMessage?: string
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
            {showProduct ? <TableHead>Produto</TableHead> : null}
            <TableHead className="w-[110px]">Tipo</TableHead>
            <TableHead className="w-[110px] text-right">Qtd.</TableHead>
            <TableHead>Motivo</TableHead>
            <TableHead>Pedido</TableHead>
            {deleteAction ? <TableHead className="w-[50px]" /> : null}
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((row) => {
            const signed = row.signed_quantity
            const cancelled = row.order?.status === 'CANCELADO'
            const automatic = Boolean(row.order_item_id)

            return (
              <TableRow key={row.id} className={cn(cancelled && 'opacity-50')}>
                <TableCell className="whitespace-nowrap tabular-nums">
                  {formatDate(row.movement_date)}
                </TableCell>

                {showProduct ? (
                  <TableCell className="max-w-[240px]">
                    {row.product ? (
                      <Link
                        href={`/produtos/${row.product.id}`}
                        className="block truncate font-medium hover:underline"
                      >
                        {row.product.name}
                      </Link>
                    ) : (
                      <span className="text-muted-foreground">--</span>
                    )}
                    {row.product?.sku ? (
                      <div className="text-xs text-muted-foreground">{row.product.sku}</div>
                    ) : null}
                  </TableCell>
                ) : null}

                <TableCell>
                  <span
                    className={cn('rounded px-1.5 py-0.5 text-[11px] font-medium', TYPE_CLASS[row.type])}
                  >
                    {STOCK_MOVEMENT_META[row.type]?.label ?? row.type}
                  </span>
                </TableCell>

                <TableCell
                  className={cn(
                    'text-right font-medium tabular-nums',
                    signed > 0
                      ? 'text-emerald-600 dark:text-emerald-400'
                      : signed < 0
                        ? 'text-rose-600 dark:text-rose-400'
                        : 'text-muted-foreground',
                  )}
                >
                  {signed > 0 ? '+' : ''}
                  {formatNumber(signed)}
                </TableCell>

                <TableCell className="max-w-[240px] truncate text-muted-foreground">
                  {row.reason ?? row.notes ?? '--'}
                </TableCell>

                <TableCell>
                  {row.order ? (
                    <Link href={`/vendas/${row.order.id}`} className="hover:underline">
                      {row.order.order_number}
                      {cancelled ? (
                        <span className="ml-1 text-[10px] uppercase text-muted-foreground">
                          cancelado
                        </span>
                      ) : null}
                    </Link>
                  ) : (
                    <span className="text-muted-foreground">manual</span>
                  )}
                </TableCell>

                {deleteAction ? (
                  <TableCell className="text-right">
                    {automatic ? null : (
                      <ConfirmActionButton
                        action={deleteAction}
                        fields={{ id: row.id }}
                        label=""
                        size="icon-sm"
                        icon={<Trash2 />}
                        confirmMessage="Excluir esta movimentação manual? O saldo do produto será recalculado."
                      />
                    )}
                  </TableCell>
                ) : null}
              </TableRow>
            )
          })}
        </TableBody>
      </Table>
    </div>
  )
}
