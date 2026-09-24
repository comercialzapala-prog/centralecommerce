import { FolderTree, Receipt, TrendingDown } from 'lucide-react'

import { GlobalFilterBar } from '@/components/GlobalFilterBar'
import { MetricCard } from '@/components/MetricCard'
import { PageHeader } from '@/components/PageHeader'
import { getCategories, getCostCenterReport, getPaymentMethods, getSuppliers } from '@/lib/data'
import { describePeriod, parseFilters, type SearchParams } from '@/lib/filters'
import { formatCurrency, formatNumber, num } from '@/lib/format'

import { CostCenterTree } from './CostCenterTree'

export const dynamic = 'force-dynamic'

export default async function CostCentersPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>
}) {
  const params = await searchParams
  const filters = parseFilters(params)

  const [rows, categories, suppliers, paymentMethods] = await Promise.all([
    getCostCenterReport(filters),
    getCategories(),
    getSuppliers(),
    getPaymentMethods(),
  ])

  const roots = rows.filter((row) => row.depth === 1)
  const total = roots.reduce((sum, row) => sum + num(row.rollup_total), 0)
  const entries = roots.reduce((sum, row) => sum + num(row.rollup_count), 0)
  const biggest = [...roots].sort((a, b) => num(b.rollup_total) - num(a.rollup_total))[0]

  return (
    <>
      <PageHeader
        title="Centros de Custo"
        description="Qual área da operação consumiu o recurso. Clique em qualquer centro para abrir o drill-down."
      />

      <GlobalFilterBar
        fields={['period', 'categoria', 'fornecedor', 'pagamento', 'status']}
        options={{ categories, suppliers, paymentMethods }}
      />

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <MetricCard
          title="Gasto total"
          value={formatCurrency(total)}
          hint={describePeriod(filters)}
          tone="negative"
          icon={TrendingDown}
        />
        <MetricCard
          title="Lançamentos"
          value={formatNumber(entries)}
          hint="Saídas alocadas a algum centro"
          icon={Receipt}
        />
        <MetricCard
          title="Maior centro"
          value={biggest && num(biggest.rollup_total) > 0 ? biggest.cost_center_name : '--'}
          hint={
            biggest && num(biggest.rollup_total) > 0
              ? formatCurrency(biggest.rollup_total)
              : 'Nenhum gasto no período'
          }
          icon={FolderTree}
          href={biggest ? `/centros-de-custo/${biggest.cost_center_id}` : undefined}
        />
      </div>

      <CostCenterTree rows={rows} />

      <p className="text-xs text-muted-foreground">
        O valor de cada linha é o total da subárvore: um gasto lançado em
        &ldquo;Sacolas&rdquo; aparece somado em &ldquo;Expedição&rdquo; e em &ldquo;Operação
        Logística&rdquo;, sem duplicar o lançamento. Centros com histórico são desativados, nunca
        excluídos.
      </p>
    </>
  )
}
