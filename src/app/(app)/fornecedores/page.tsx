import Link from 'next/link'
import { Eye, EyeOff, Receipt, TrendingDown, Truck } from 'lucide-react'

import { ConfirmActionButton } from '@/components/FormDialog'
import { MetricCard } from '@/components/MetricCard'
import { EmptyState, PageHeader } from '@/components/PageHeader'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { getSupplierStats } from '@/lib/data'
import { formatCurrency, formatDate, formatNumber, num } from '@/lib/format'
import { cn } from '@/lib/utils'

import { setSupplierActive } from './actions'
import { SupplierForm } from './SupplierForm'

export const dynamic = 'force-dynamic'

export default async function SuppliersPage() {
  const suppliers = await getSupplierStats()

  const totalPaid = suppliers.reduce((sum, supplier) => sum + num(supplier.total_paid), 0)
  const totalEntries = suppliers.reduce((sum, supplier) => sum + num(supplier.entries_count), 0)
  const active = suppliers.filter((supplier) => supplier.active).length

  return (
    <>
      <PageHeader
        title="Fornecedores"
        description="Para quem o dinheiro foi pago."
        actions={<SupplierForm />}
      />

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <MetricCard
          title="Total pago"
          value={formatCurrency(totalPaid)}
          hint="Todas as saídas com fornecedor"
          tone="negative"
          icon={TrendingDown}
        />
        <MetricCard
          title="Lançamentos"
          value={formatNumber(totalEntries)}
          icon={Receipt}
        />
        <MetricCard
          title="Fornecedores ativos"
          value={`${active} de ${suppliers.length}`}
          icon={Truck}
        />
      </div>

      {suppliers.length === 0 ? (
        <EmptyState
          title="Nenhum fornecedor cadastrado"
          description="Cadastre Jadlog, Correios, Meta, fornecedor de caixas... e os pagamentos passam a ser rastreáveis por quem recebeu."
          action={<SupplierForm />}
        />
      ) : (
        <div className="overflow-x-auto rounded-xl border bg-card">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Fornecedor</TableHead>
                <TableHead>Documento</TableHead>
                <TableHead className="text-right">Total pago</TableHead>
                <TableHead className="text-right">Lanç.</TableHead>
                <TableHead className="text-right">Média</TableHead>
                <TableHead>Último pagamento</TableHead>
                <TableHead>Principal centro</TableHead>
                <TableHead className="w-[60px]" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {suppliers.map((supplier) => (
                <TableRow
                  key={supplier.supplier_id}
                  className={cn(!supplier.active && 'opacity-55')}
                >
                  <TableCell>
                    <Link
                      href={`/fornecedores/${supplier.supplier_id}`}
                      className="font-medium hover:underline"
                    >
                      {supplier.name}
                    </Link>
                    {!supplier.active ? (
                      <span className="ml-2 rounded bg-muted px-1.5 py-0.5 text-[10px] uppercase text-muted-foreground">
                        inativo
                      </span>
                    ) : null}
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {supplier.document ?? '--'}
                  </TableCell>
                  <TableCell className="text-right font-medium tabular-nums">
                    {formatCurrency(supplier.total_paid)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {formatNumber(supplier.entries_count)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums text-muted-foreground">
                    {formatCurrency(supplier.average_amount)}
                  </TableCell>
                  <TableCell className="tabular-nums">
                    {formatDate(supplier.last_payment_date)}
                  </TableCell>
                  <TableCell className="max-w-[200px]">
                    {supplier.top_cost_center_id ? (
                      <Link
                        href={`/centros-de-custo/${supplier.top_cost_center_id}`}
                        className="block truncate text-muted-foreground hover:underline"
                        title={supplier.top_cost_center_path ?? undefined}
                      >
                        {supplier.top_cost_center_name}
                      </Link>
                    ) : (
                      <span className="text-muted-foreground">--</span>
                    )}
                  </TableCell>
                  <TableCell className="text-right">
                    <ConfirmActionButton
                      action={setSupplierActive}
                      fields={{
                        id: supplier.supplier_id,
                        active: supplier.active ? 'false' : 'true',
                      }}
                      label=""
                      size="icon-sm"
                      icon={supplier.active ? <EyeOff /> : <Eye />}
                      confirmMessage={
                        supplier.active
                          ? `Desativar ${supplier.name}? O histórico de pagamentos é preservado.`
                          : `Reativar ${supplier.name}?`
                      }
                    />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </>
  )
}
