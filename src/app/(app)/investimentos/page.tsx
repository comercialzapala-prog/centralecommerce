import Link from 'next/link'
import { Ban, Landmark, Target, TrendingUp } from 'lucide-react'

import { ConfirmActionButton } from '@/components/FormDialog'
import { MetricCard } from '@/components/MetricCard'
import { EmptyState, PageHeader } from '@/components/PageHeader'
import { Progress50 } from '@/components/Progress50'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  getAllTransactionsForAccumulated,
  getCategories,
  getCostCenterNodes,
  getInvestments,
  getSettings,
  getSuppliers,
} from '@/lib/data'
import { computeBreakEven, summarizeTransactions } from '@/lib/finance'
import { formatCurrency, formatDate, num } from '@/lib/format'
import { cn } from '@/lib/utils'

import { cancelInvestment } from './actions'
import { InvestmentForm } from './InvestmentForm'

export const dynamic = 'force-dynamic'

export default async function InvestmentsPage() {
  const [investments, categories, costCenters, suppliers, settings, allRows] = await Promise.all([
    getInvestments(),
    getCategories(),
    getCostCenterNodes(),
    getSuppliers(),
    getSettings(),
    getAllTransactionsForAccumulated(),
  ])

  const paid = investments
    .filter((item) => item.status === 'PAGO')
    .reduce((sum, item) => sum + num(item.amount), 0)

  const pending = investments
    .filter((item) => item.status === 'PENDENTE')
    .reduce((sum, item) => sum + num(item.amount), 0)

  const baseline = num(settings?.initial_investment)
  const lifetime = summarizeTransactions(allRows)

  const breakEven = computeBreakEven({
    accumulatedRevenue: lifetime.revenue,
    accumulatedExpense: lifetime.expense,
    investmentTotal: paid + baseline,
  })

  const categoryName = (id: string | null) =>
    categories.find((category) => category.id === id)?.name ?? '--'
  const costCenterName = (id: string | null) =>
    costCenters.find((node) => node.id === id)?.name ?? '--'
  const supplierName = (id: string | null) =>
    suppliers.find((supplier) => supplier.id === id)?.name ?? '--'

  return (
    <>
      <PageHeader
        title="Investimentos"
        description="Dinheiro aplicado na estrutura que a operação precisa recuperar."
        actions={
          <InvestmentForm
            categories={categories}
            costCenters={costCenters}
            suppliers={suppliers}
          />
        }
      />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <MetricCard
          title="Investimento total"
          value={formatCurrency(breakEven.investmentTotal)}
          hint={
            baseline > 0
              ? `Inclui ${formatCurrency(baseline)} de valor inicial das configurações`
              : 'Somente investimentos pagos'
          }
          icon={Landmark}
        />
        <MetricCard
          title="Já recuperado"
          value={formatCurrency(breakEven.recovered)}
          hint="Pelo lucro operacional acumulado"
          tone="positive"
          icon={TrendingUp}
        />
        <MetricCard
          title="A recuperar"
          value={formatCurrency(breakEven.remaining)}
          tone={breakEven.remaining > 0 ? 'negative' : 'positive'}
          icon={Target}
        />
        <MetricCard
          title="Pendentes"
          value={formatCurrency(pending)}
          hint="Ainda não pagos — não contam no 0/50"
          tone="warning"
        />
      </div>

      <section className="rounded-xl border bg-card p-4">
        <Progress50 status={breakEven} />
      </section>

      {investments.length === 0 ? (
        <EmptyState
          title="Nenhum investimento cadastrado"
          description="Reforma, móveis, equipamentos, marketing inicial — tudo o que foi aplicado na estrutura antes de a operação girar."
          action={
            <InvestmentForm
              categories={categories}
              costCenters={costCenters}
              suppliers={suppliers}
            />
          }
        />
      ) : (
        <div className="overflow-x-auto rounded-xl border bg-card">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[96px]">Data</TableHead>
                <TableHead>Descrição</TableHead>
                <TableHead>Categoria</TableHead>
                <TableHead>Centro de custo</TableHead>
                <TableHead>Fornecedor</TableHead>
                <TableHead className="w-[100px]">Status</TableHead>
                <TableHead className="text-right">Valor</TableHead>
                <TableHead className="w-[80px]" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {investments.map((investment) => {
                const cancelled = investment.status === 'CANCELADO'
                return (
                  <TableRow key={investment.id} className={cn(cancelled && 'opacity-55')}>
                    <TableCell className="whitespace-nowrap tabular-nums">
                      {formatDate(investment.investment_date)}
                    </TableCell>
                    <TableCell className="font-medium">{investment.description}</TableCell>
                    <TableCell className="text-muted-foreground">
                      {categoryName(investment.category_id)}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {investment.cost_center_id ? (
                        <Link
                          href={`/centros-de-custo/${investment.cost_center_id}`}
                          className="hover:underline"
                        >
                          {costCenterName(investment.cost_center_id)}
                        </Link>
                      ) : (
                        '--'
                      )}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {supplierName(investment.supplier_id)}
                    </TableCell>
                    <TableCell>
                      <span className="rounded bg-muted px-1.5 py-0.5 text-[11px] font-medium">
                        {investment.status}
                      </span>
                    </TableCell>
                    <TableCell className="text-right font-medium tabular-nums">
                      {formatCurrency(investment.amount)}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end">
                        <InvestmentForm
                          categories={categories}
                          costCenters={costCenters}
                          suppliers={suppliers}
                          investment={investment}
                        />
                        {!cancelled ? (
                          <ConfirmActionButton
                            action={cancelInvestment}
                            fields={{ id: investment.id }}
                            label=""
                            size="icon-sm"
                            icon={<Ban />}
                            confirmMessage={`Cancelar "${investment.description}"? Ele sai do cálculo do break-even mas continua no histórico.`}
                          />
                        ) : null}
                      </div>
                    </TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
        </div>
      )}
    </>
  )
}
