import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ChevronRight, Layers, Receipt, TrendingDown } from 'lucide-react'

import { GlobalFilterBar } from '@/components/GlobalFilterBar'
import { MetricCard } from '@/components/MetricCard'
import { PageHeader } from '@/components/PageHeader'
import { TransactionsTable } from '@/components/TransactionsTable'
import {
  getCategories,
  getCostCenterNodes,
  getCostCenterReport,
  getPaymentMethods,
  getSuppliers,
  getTransactions,
  subtreeIds,
} from '@/lib/data'
import { describePeriod, parseFilters, type SearchParams } from '@/lib/filters'
import { formatCurrency, formatNumber, formatPercent, num } from '@/lib/format'
import { splitPath } from '@/lib/cost-centers'

export const dynamic = 'force-dynamic'

/**
 * Drill-down do centro de custo (secoes 7 e 8).
 *
 * Mostra o TOTAL da subarvore, a quebra por subcentro (clicavel, para descer
 * mais um nivel) e todos os lancamentos relacionados -- inclusive os dos
 * descendentes, porque quem olha "Operacao Logistica" quer ver o dinheiro
 * inteiro que passou por ali.
 */
export default async function CostCenterDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<SearchParams>
}) {
  const { id } = await params
  const rawParams = await searchParams
  const filters = parseFilters(rawParams)

  const [nodes, report, categories, suppliers, paymentMethods] = await Promise.all([
    getCostCenterNodes(),
    getCostCenterReport(filters),
    getCategories(),
    getSuppliers(),
    getPaymentMethods(),
  ])

  const node = nodes.find((item) => item.id === id)
  if (!node) notFound()

  const current = report.find((row) => row.cost_center_id === id)
  const total = num(current?.rollup_total)
  const direct = num(current?.direct_total)
  const entries = num(current?.rollup_count)

  // Subcentros diretos, com o total de cada subarvore.
  const children = report
    .filter((row) => row.parent_id === id)
    .sort((a, b) => num(b.rollup_total) - num(a.rollup_total))

  // Lancamentos: o centro + todos os descendentes. O filtro "subcentro" da
  // barra restringe ainda mais, sem sair desta subarvore.
  const descendants = subtreeIds(nodes, id)
  const scoped = filters.costCenterId
    ? subtreeIds(nodes, filters.costCenterId).filter((item) => descendants.includes(item))
    : descendants

  const transactions = await getTransactions(
    { ...filters, costCenterId: null },
    { costCenterIds: scoped },
  )

  const crumbs = splitPath(node.path)
  const ancestors = node.ancestor_ids ?? []
  const subtreeNodes = nodes.filter((item) => item.ancestor_ids?.includes(id))

  return (
    <>
      <nav className="flex flex-wrap items-center gap-1 text-xs text-muted-foreground">
        <Link href="/centros-de-custo" className="hover:underline">
          Centros de Custo
        </Link>
        {crumbs.map((crumb, index) => {
          const crumbId = ancestors[index]
          const isLast = index === crumbs.length - 1
          return (
            <span key={`${crumb}-${index}`} className="flex items-center gap-1">
              <ChevronRight className="size-3" />
              {isLast || !crumbId ? (
                <span className="font-medium text-foreground">{crumb}</span>
              ) : (
                <Link href={`/centros-de-custo/${crumbId}`} className="hover:underline">
                  {crumb}
                </Link>
              )}
            </span>
          )
        })}
      </nav>

      <PageHeader
        title={node.name}
        description={
          node.depth > 1 ? node.path : 'Centro raiz — soma todos os subcentros abaixo.'
        }
      />

      <GlobalFilterBar
        fields={['busca', 'period', 'centro', 'categoria', 'fornecedor', 'pagamento', 'status']}
        options={{ costCenters: subtreeNodes, categories, suppliers, paymentMethods }}
        searchPlaceholder="Buscar na descrição, observação ou fornecedor..."
      />

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <MetricCard
          title="Total do centro"
          value={formatCurrency(total)}
          hint={`${describePeriod(filters)} · inclui todos os subcentros`}
          tone="negative"
          icon={TrendingDown}
        />
        <MetricCard
          title="Lançado direto aqui"
          value={formatCurrency(direct)}
          hint="Sem contar os subcentros"
          icon={Layers}
        />
        <MetricCard
          title="Lançamentos"
          value={formatNumber(entries)}
          hint="Na subárvore inteira"
          icon={Receipt}
        />
      </div>

      {children.length > 0 ? (
        <section className="space-y-2">
          <h2 className="text-sm font-semibold">Subcentros</h2>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-4">
            {children.map((child) => {
              const childTotal = num(child.rollup_total)
              const share = total > 0 ? (childTotal / total) * 100 : 0
              return (
                <Link
                  key={child.cost_center_id}
                  href={`/centros-de-custo/${child.cost_center_id}`}
                  className="rounded-xl border bg-card p-3 transition-colors hover:border-foreground/20 hover:bg-muted/40"
                >
                  <div className="truncate text-sm font-medium">{child.cost_center_name}</div>
                  <div className="mt-1 text-lg font-semibold tabular-nums">
                    {formatCurrency(childTotal)}
                  </div>
                  <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-muted">
                    <div
                      className="h-full rounded-full bg-sky-500"
                      style={{ width: `${Math.min(share, 100)}%` }}
                    />
                  </div>
                  <div className="mt-1 text-[11px] text-muted-foreground">
                    {formatPercent(share)} do centro · {formatNumber(child.rollup_count)} lanç.
                  </div>
                </Link>
              )
            })}
          </div>
        </section>
      ) : null}

      <section className="space-y-2">
        <h2 className="text-sm font-semibold">
          Lançamentos relacionados{' '}
          <span className="font-normal text-muted-foreground">({transactions.length})</span>
        </h2>
        <TransactionsTable
          rows={transactions}
          emptyMessage="Nenhum lançamento neste centro com os filtros aplicados."
        />
      </section>
    </>
  )
}
