import Link from 'next/link'
import { notFound } from 'next/navigation'
import { CalendarClock, FolderTree, Receipt, Sigma, TrendingDown } from 'lucide-react'

import { GlobalFilterBar } from '@/components/GlobalFilterBar'
import { MetricCard } from '@/components/MetricCard'
import { PageHeader } from '@/components/PageHeader'
import { TransactionsTable } from '@/components/TransactionsTable'
import { getCategories, getPaymentMethods, getSupplierById, getTransactions } from '@/lib/data'
import { expensesByRootCostCenter } from '@/lib/finance'
import { parseFilters, type SearchParams } from '@/lib/filters'
import { formatCurrency, formatDate, formatNumber } from '@/lib/format'

import { SupplierForm } from '../SupplierForm'

export const dynamic = 'force-dynamic'

/** Pagina do fornecedor (secao 13). */
export default async function SupplierDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<SearchParams>
}) {
  const { id } = await params
  const rawParams = await searchParams
  const filters = parseFilters(rawParams)

  const [supplier, categories, paymentMethods] = await Promise.all([
    getSupplierById(id),
    getCategories(),
    getPaymentMethods(),
  ])

  if (!supplier) notFound()

  const transactions = await getTransactions({ ...filters, supplierId: id })
  const byCostCenter = expensesByRootCostCenter(transactions)

  return (
    <>
      <nav className="text-xs text-muted-foreground">
        <Link href="/fornecedores" className="hover:underline">
          Fornecedores
        </Link>
        <span className="mx-1">/</span>
        <span className="font-medium text-foreground">{supplier.name}</span>
      </nav>

      <PageHeader
        title={supplier.name}
        description={
          [supplier.document, supplier.email, supplier.phone].filter(Boolean).join(' · ') ||
          undefined
        }
        actions={<SupplierForm supplier={supplier} />}
      />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        <MetricCard
          title="Total pago"
          value={formatCurrency(supplier.total_paid)}
          hint="Histórico completo"
          tone="negative"
          icon={TrendingDown}
        />
        <MetricCard
          title="Lançamentos"
          value={formatNumber(supplier.entries_count)}
          icon={Receipt}
        />
        <MetricCard
          title="Média por lançamento"
          value={formatCurrency(supplier.average_amount)}
          icon={Sigma}
        />
        <MetricCard
          title="Último pagamento"
          value={formatDate(supplier.last_payment_date)}
          icon={CalendarClock}
        />
        <MetricCard
          title="Principal centro"
          value={supplier.top_cost_center_name ?? '--'}
          hint={supplier.top_cost_center_path ?? undefined}
          icon={FolderTree}
          href={
            supplier.top_cost_center_id
              ? `/centros-de-custo/${supplier.top_cost_center_id}`
              : undefined
          }
        />
      </div>

      {supplier.notes ? (
        <p className="rounded-xl border bg-card p-3 text-sm text-muted-foreground">
          {supplier.notes}
        </p>
      ) : null}

      <GlobalFilterBar
        fields={['busca', 'period', 'categoria', 'pagamento', 'status']}
        options={{ categories, paymentMethods }}
        searchPlaceholder="Buscar no histórico deste fornecedor..."
      />

      {byCostCenter.length > 0 ? (
        <section className="space-y-2">
          <h2 className="text-sm font-semibold">Para onde foi esse dinheiro</h2>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-4">
            {byCostCenter.map((entry) => (
              <Link
                key={entry.id ?? 'sem-centro'}
                href={entry.id ? `/centros-de-custo/${entry.id}` : '/centros-de-custo'}
                className="rounded-xl border bg-card p-3 transition-colors hover:border-foreground/20 hover:bg-muted/40"
              >
                <div className="truncate text-sm font-medium">{entry.name}</div>
                <div className="mt-1 text-lg font-semibold tabular-nums">
                  {formatCurrency(entry.total)}
                </div>
                <div className="text-[11px] text-muted-foreground">
                  {formatNumber(entry.count)} lançamento(s)
                </div>
              </Link>
            ))}
          </div>
        </section>
      ) : null}

      <section className="space-y-2">
        <h2 className="text-sm font-semibold">
          Histórico completo{' '}
          <span className="font-normal text-muted-foreground">({transactions.length})</span>
        </h2>
        <TransactionsTable
          rows={transactions}
          emptyMessage="Nenhum pagamento a este fornecedor com os filtros aplicados."
        />
      </section>
    </>
  )
}
