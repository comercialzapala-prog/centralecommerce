import { ArrowDownRight, ArrowUpRight, PiggyBank, Wallet } from 'lucide-react'

import { ConfirmActionButton } from '@/components/FormDialog'
import { GlobalFilterBar } from '@/components/GlobalFilterBar'
import { MetricCard } from '@/components/MetricCard'
import { PageHeader } from '@/components/PageHeader'
import { TransactionsTable } from '@/components/TransactionsTable'
import { getReferenceData, getTransactions, subtreeIds } from '@/lib/data'
import { summarizeTransactions } from '@/lib/finance'
import { describePeriod, parseFilters, type SearchParams } from '@/lib/filters'
import { formatCurrency } from '@/lib/format'

import { cancelTransaction, restoreTransaction } from './actions'
import { TransactionForm } from './TransactionForm'

export const dynamic = 'force-dynamic'

export default async function TransactionsPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>
}) {
  const params = await searchParams
  const filters = parseFilters(params)

  const reference = await getReferenceData()

  // Filtrar por um centro traz junto os descendentes: quem filtra por
  // "Expedicao" quer ver tambem o que caiu em "Sacolas".
  const costCenterIds = filters.costCenterId
    ? subtreeIds(reference.costCenters, filters.costCenterId)
    : null

  const rows = await getTransactions(filters, { costCenterIds })
  const summary = summarizeTransactions(rows)

  const options = {
    costCenters: reference.costCenters,
    categories: reference.categories,
    suppliers: reference.suppliers,
    channels: reference.channels,
    paymentMethods: reference.paymentMethods,
  }

  return (
    <>
      <PageHeader
        title="Lançamentos"
        description="Todo o dinheiro que entrou e saiu da operação."
        actions={<TransactionForm options={options} />}
      />

      <GlobalFilterBar
        fields={[
          'busca',
          'period',
          'tipo',
          'centro',
          'categoria',
          'fornecedor',
          'canal',
          'pagamento',
          'status',
        ]}
        options={options}
        searchPlaceholder="Descrição, observação, fornecedor, categoria ou centro..."
      />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <MetricCard
          title="Receita"
          value={formatCurrency(summary.revenue)}
          hint={describePeriod(filters)}
          tone="positive"
          icon={ArrowUpRight}
        />
        <MetricCard
          title="Despesa"
          value={formatCurrency(summary.expense)}
          hint={
            summary.refunds > 0
              ? `Já abatido ${formatCurrency(summary.refunds)} de estornos`
              : 'Saídas do período'
          }
          tone="negative"
          icon={ArrowDownRight}
        />
        <MetricCard
          title="Resultado"
          value={formatCurrency(summary.operatingResult)}
          hint="Receita menos despesa. Aporte não entra aqui."
          tone={summary.operatingResult >= 0 ? 'positive' : 'negative'}
          icon={Wallet}
        />
        <MetricCard
          title="Aportes"
          value={formatCurrency(summary.contributions)}
          hint="Entram no caixa, não na receita."
          tone="accent"
          icon={PiggyBank}
        />
      </div>

      <TransactionsTable
        rows={rows}
        actions={(row) => (
          <div className="flex items-center justify-end">
            <TransactionForm options={options} transaction={row} />
            {row.status === 'CANCELADO' ? (
              <ConfirmActionButton
                action={restoreTransaction}
                fields={{ id: row.id }}
                label="Reativar"
                confirmMessage={`Reativar "${row.description}" como PAGO?`}
              />
            ) : (
              <ConfirmActionButton
                action={cancelTransaction}
                fields={{ id: row.id }}
                label="Cancelar"
                confirmMessage={`Cancelar "${row.description}"? O lançamento fica no histórico, mas deixa de contar no caixa e no resultado.`}
              />
            )}
          </div>
        )}
      />

      <p className="text-xs text-muted-foreground">
        Lançamentos não são excluídos: cancelar mantém a trilha de auditoria e zera o efeito
        financeiro. Mostrando {rows.length} lançamento(s).
      </p>
    </>
  )
}
