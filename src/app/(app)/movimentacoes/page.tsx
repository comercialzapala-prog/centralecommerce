import { ArrowDownCircle, ArrowUpCircle, Boxes } from 'lucide-react'

import { GlobalFilterBar } from '@/components/GlobalFilterBar'
import { MetricCard } from '@/components/MetricCard'
import { PageHeader } from '@/components/PageHeader'
import { StockMovementsTable } from '@/components/StockMovementsTable'
import { getProducts, getStockMovements } from '@/lib/data'
import { describePeriod, parseFilters, type SearchParams } from '@/lib/filters'
import { formatNumber } from '@/lib/format'
import { STOCK_MOVEMENT_TYPES } from '@/lib/types'

import { deleteStockMovement } from './actions'
import { StockMovementForm } from './StockMovementForm'

export const dynamic = 'force-dynamic'

export default async function StockMovementsPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>
}) {
  const params = await searchParams
  const filters = parseFilters(params)

  const [products, movements] = await Promise.all([
    getProducts(),
    getStockMovements(filters),
  ])

  // Movimento de pedido cancelado nao conta em lugar nenhum.
  const valid = movements.filter((row) => row.order?.status !== 'CANCELADO')
  const inQty = valid.reduce((sum, row) => sum + Math.max(row.signed_quantity, 0), 0)
  const outQty = valid.reduce((sum, row) => sum + Math.min(row.signed_quantity, 0), 0)

  return (
    <>
      <PageHeader
        title="Movimentações"
        description="Saída de mercadoria — quantidade, não dinheiro. Pagamento de energia é lançamento financeiro; venda de 3 produtos é movimentação."
        actions={<StockMovementForm products={products} />}
      />

      <GlobalFilterBar
        fields={['period', 'produto', 'tipoMovimento']}
        options={{ products, movementTypes: STOCK_MOVEMENT_TYPES }}
      />

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <MetricCard
          title="Entraram"
          value={formatNumber(inQty)}
          hint={describePeriod(filters)}
          tone="positive"
          icon={ArrowUpCircle}
        />
        <MetricCard
          title="Saíram"
          value={formatNumber(Math.abs(outQty))}
          hint="Vendas, perdas e avarias"
          tone="negative"
          icon={ArrowDownCircle}
        />
        <MetricCard
          title="Saldo do período"
          value={formatNumber(inQty + outQty)}
          hint="Entradas menos saídas"
          tone={inQty + outQty >= 0 ? 'neutral' : 'negative'}
          icon={Boxes}
        />
      </div>

      <StockMovementsTable
        rows={movements}
        deleteAction={deleteStockMovement}
        emptyMessage="Nenhuma movimentação com os filtros aplicados."
      />

      <p className="text-xs text-muted-foreground">
        Movimentações marcadas com um pedido são geradas automaticamente ao lançar a venda e só
        mudam pelo próprio pedido. Apenas as manuais podem ser excluídas.
      </p>
    </>
  )
}
