'use client'

import * as React from 'react'
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
  TRANSACTION_TYPE_META,
  TRANSACTION_TYPES,
  type Category,
  type Channel,
  type CostCenterNode,
  type PaymentMethod,
  type Supplier,
  type TransactionRow,
  type TransactionType,
} from '@/lib/types'

import { createTransaction, updateTransaction } from './actions'

export type TransactionFormOptions = {
  costCenters: CostCenterNode[]
  categories: Category[]
  suppliers: Supplier[]
  channels: Channel[]
  paymentMethods: PaymentMethod[]
}

/**
 * Formulario de lancamento (secao 36): dar entrada num gasto tem que levar
 * segundos. Tipo, centro, categoria, fornecedor, descricao, valor -- salvar.
 */
export function TransactionForm({
  options,
  transaction,
  defaultCostCenterId,
}: {
  options: TransactionFormOptions
  transaction?: TransactionRow
  defaultCostCenterId?: string
}) {
  const editing = Boolean(transaction)
  const [type, setType] = React.useState<TransactionType>(transaction?.type ?? 'SAIDA')

  // Categoria responde "o que e esse gasto" e nao se mistura com centro de
  // custo (secao 2). A lista acompanha o tipo escolhido.
  const categoriesForType = options.categories.filter(
    (category) => category.active && category.type === type,
  )

  const meta = TRANSACTION_TYPE_META[type]

  return (
    <FormDialog
      trigger={
        editing ? (
          <Button variant="ghost" size="icon-sm" aria-label="Editar lançamento">
            <Pencil />
          </Button>
        ) : (
          <Button size="sm">
            <Plus /> Novo lançamento
          </Button>
        )
      }
      title={editing ? 'Editar lançamento' : 'Novo lançamento'}
      action={editing ? updateTransaction : createTransaction}
      submitLabel={editing ? 'Salvar' : 'Lançar'}
      className="sm:max-w-2xl"
    >
      {transaction ? <input type="hidden" name="id" value={transaction.id} /> : null}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label="Tipo" hint={meta.hint}>
          <NativeSelect
            name="type"
            value={type}
            onChange={(event) => setType(event.target.value as TransactionType)}
          >
            {TRANSACTION_TYPES.map((item) => (
              <option key={item} value={item}>
                {TRANSACTION_TYPE_META[item].label}
              </option>
            ))}
          </NativeSelect>
        </Field>

        <Field label="Valor" htmlFor="tx-amount">
          <MoneyInput
            id="tx-amount"
            name="amount"
            required
            defaultValue={transaction ? String(transaction.amount) : ''}
          />
        </Field>

        <Field
          label={type === 'SAIDA' ? 'Centro de custo *' : 'Centro de custo'}
          hint={
            type === 'SAIDA'
              ? 'Clique direto no subcentro final (ex.: Sacolas).'
              : 'Opcional para entradas e aportes.'
          }
          className="sm:col-span-2"
        >
          <CostCenterPicker
            name="cost_center_id"
            nodes={options.costCenters}
            defaultValue={transaction?.cost_center_id ?? defaultCostCenterId ?? null}
          />
        </Field>

        <Field label="Categoria">
          <NativeSelect name="category_id" defaultValue={transaction?.category_id ?? ''}>
            <option value="">Sem categoria</option>
            {categoriesForType.map((category) => (
              <option key={category.id} value={category.id}>
                {category.name}
              </option>
            ))}
          </NativeSelect>
        </Field>

        <Field label="Fornecedor">
          <NativeSelect name="supplier_id" defaultValue={transaction?.supplier_id ?? ''}>
            <option value="">Sem fornecedor</option>
            {options.suppliers
              .filter((supplier) => supplier.active)
              .map((supplier) => (
                <option key={supplier.id} value={supplier.id}>
                  {supplier.name}
                </option>
              ))}
          </NativeSelect>
        </Field>

        <Field label="Descrição" htmlFor="tx-description" className="sm:col-span-2">
          <Input
            id="tx-description"
            name="description"
            required
            autoComplete="off"
            placeholder="Ex.: 500 sacolas"
            defaultValue={transaction?.description ?? ''}
          />
        </Field>

        <Field label="Data" htmlFor="tx-date">
          <Input
            id="tx-date"
            type="date"
            name="transaction_date"
            required
            defaultValue={transaction?.transaction_date?.slice(0, 10) ?? todayISO()}
          />
        </Field>

        <Field label="Forma de pagamento">
          <NativeSelect
            name="payment_method_id"
            defaultValue={transaction?.payment_method_id ?? ''}
          >
            <option value="">Não informada</option>
            {options.paymentMethods
              .filter((method) => method.active)
              .map((method) => (
                <option key={method.id} value={method.id}>
                  {method.name}
                </option>
              ))}
          </NativeSelect>
        </Field>

        <Field label="Canal" hint="Onde essa operação aconteceu.">
          <NativeSelect name="channel_id" defaultValue={transaction?.channel_id ?? ''}>
            <option value="">Sem canal</option>
            {options.channels
              .filter((channel) => channel.active)
              .map((channel) => (
                <option key={channel.id} value={channel.id}>
                  {channel.name}
                </option>
              ))}
          </NativeSelect>
        </Field>

        <Field label="Status">
          <NativeSelect name="status" defaultValue={transaction?.status ?? 'PAGO'}>
            {TRANSACTION_STATUSES.map((status) => (
              <option key={status} value={status}>
                {status}
              </option>
            ))}
          </NativeSelect>
        </Field>

        <Field label="Observações" htmlFor="tx-notes" className="sm:col-span-2">
          <Textarea
            id="tx-notes"
            name="notes"
            rows={2}
            defaultValue={transaction?.notes ?? ''}
            placeholder="Opcional"
          />
        </Field>
      </div>
    </FormDialog>
  )
}
