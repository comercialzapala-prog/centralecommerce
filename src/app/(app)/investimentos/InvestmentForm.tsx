'use client'

import { Pencil, Plus } from 'lucide-react'

import { CostCenterPicker } from '@/components/CostCenterPicker'
import { Field, MoneyInput } from '@/components/FormControls'
import { FormDialog } from '@/components/FormDialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { NativeSelect } from '@/components/ui/native-select'
import { Textarea } from '@/components/ui/textarea'
import { todayISO } from '@/lib/format'
import {
  TRANSACTION_STATUSES,
  type Category,
  type CostCenterNode,
  type Investment,
  type Supplier,
} from '@/lib/types'

import { createInvestment, updateInvestment } from './actions'

export function InvestmentForm({
  categories,
  costCenters,
  suppliers,
  investment,
}: {
  categories: Category[]
  costCenters: CostCenterNode[]
  suppliers: Supplier[]
  investment?: Investment
}) {
  const editing = Boolean(investment)

  return (
    <FormDialog
      trigger={
        editing ? (
          <Button variant="ghost" size="icon-sm" aria-label="Editar investimento">
            <Pencil />
          </Button>
        ) : (
          <Button size="sm">
            <Plus /> Novo investimento
          </Button>
        )
      }
      title={editing ? 'Editar investimento' : 'Novo investimento'}
      description="Dinheiro aplicado na estrutura, que a operação precisa recuperar. Não entra como despesa do mês."
      action={editing ? updateInvestment : createInvestment}
      className="sm:max-w-2xl"
    >
      {investment ? <input type="hidden" name="id" value={investment.id} /> : null}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label="Descrição" htmlFor="inv-description" className="sm:col-span-2">
          <Input
            id="inv-description"
            name="description"
            required
            autoFocus
            placeholder="Ex.: Reforma da sala"
            defaultValue={investment?.description ?? ''}
          />
        </Field>

        <Field label="Valor" htmlFor="inv-amount">
          <MoneyInput
            id="inv-amount"
            name="amount"
            required
            defaultValue={investment ? String(investment.amount) : ''}
          />
        </Field>

        <Field label="Data" htmlFor="inv-date">
          <Input
            id="inv-date"
            type="date"
            name="investment_date"
            required
            defaultValue={investment?.investment_date?.slice(0, 10) ?? todayISO()}
          />
        </Field>

        <Field label="Categoria">
          <NativeSelect name="category_id" defaultValue={investment?.category_id ?? ''}>
            <option value="">Sem categoria</option>
            {categories
              .filter((category) => category.active && category.type === 'INVESTIMENTO')
              .map((category) => (
                <option key={category.id} value={category.id}>
                  {category.name}
                </option>
              ))}
          </NativeSelect>
        </Field>

        <Field label="Fornecedor">
          <NativeSelect name="supplier_id" defaultValue={investment?.supplier_id ?? ''}>
            <option value="">Sem fornecedor</option>
            {suppliers
              .filter((supplier) => supplier.active)
              .map((supplier) => (
                <option key={supplier.id} value={supplier.id}>
                  {supplier.name}
                </option>
              ))}
          </NativeSelect>
        </Field>

        <Field label="Centro de custo" className="sm:col-span-2">
          <CostCenterPicker
            name="cost_center_id"
            nodes={costCenters}
            defaultValue={investment?.cost_center_id ?? null}
          />
        </Field>

        <Field label="Status">
          <NativeSelect name="status" defaultValue={investment?.status ?? 'PAGO'}>
            {TRANSACTION_STATUSES.map((status) => (
              <option key={status} value={status}>
                {status}
              </option>
            ))}
          </NativeSelect>
        </Field>

        <Field label="Observações" htmlFor="inv-notes" className="sm:col-span-2">
          <Textarea id="inv-notes" name="notes" rows={2} defaultValue={investment?.notes ?? ''} />
        </Field>
      </div>
    </FormDialog>
  )
}
