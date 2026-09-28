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
import { formatCurrency, todayISO } from '@/lib/format'
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
  const [installments, setInstallments] = React.useState(1)
  const [totalAmount, setTotalAmount] = React.useState<number | null>(null)

  // Categoria responde "o que e esse gasto" e nao se mistura com centro de
  // custo (secao 2). A lista acompanha o tipo escolhido.
  const categoriesForType = options.categories.filter(
    (category) => category.active && category.type === type,
  )

  const meta = TRANSACTION_TYPE_META[type]

  // Parcelamento só faz sentido em ENTRADA e SAIDA, nunca em edição
  const canInstall = !editing && (type === 'ENTRADA' || type === 'SAIDA')
  const isInstalled = canInstall && installments > 1
  const perInstallment =
    isInstalled && totalAmount && totalAmount > 0 ? totalAmount / installments : null

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
      submitLabel={editing ? 'Salvar' : isInstalled ? `Lançar ${installments}x` : 'Lançar'}
      className="sm:max-w-2xl"
    >
      {transaction ? <input type="hidden" name="id" value={transaction.id} /> : null}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label="Tipo" hint={meta.hint}>
          <NativeSelect
            name="type"
            value={type}
            onChange={(event) => {
              setType(event.target.value as TransactionType)
              setInstallments(1)
            }}
          >
            {TRANSACTION_TYPES.map((item) => (
              <option key={item} value={item}>
                {TRANSACTION_TYPE_META[item].label}
              </option>
            ))}
          </NativeSelect>
        </Field>

        <Field
          label="Valor total"
          htmlFor="tx-amount"
          hint={perInstallment ? `${formatCurrency(perInstallment)} por parcela` : undefined}
        >
          <MoneyInput
            id="tx-amount"
            name="amount"
            required
            defaultValue={transaction ? String(transaction.amount) : ''}
            onChange={(raw) => {
              // MoneyInput devolve a string formatada; converte para número
              const parsed = parseFloat(raw.replace(/\./g, '').replace(',', '.'))
              setTotalAmount(Number.isFinite(parsed) ? parsed : null)
            }}
          />
        </Field>

        {/* Parcelamento — só em novos lançamentos de ENTRADA ou SAIDA */}
        {canInstall && (
          <Field
            label="Parcelado?"
            hint={
              isInstalled
                ? `Serão criados ${installments} lançamentos, 1 por mês, com status Pendente.`
                : 'Marque para dividir em várias parcelas mensais.'
            }
            className="sm:col-span-2"
          >
            <div className="flex items-center gap-4">
              <label className="flex cursor-pointer items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  className="h-4 w-4 rounded border"
                  checked={installments > 1}
                  onChange={(event) => setInstallments(event.target.checked ? 2 : 1)}
                />
                Parcelar
              </label>

              {installments > 1 && (
                <div className="flex items-center gap-2">
                  <NativeSelect
                    name="installments"
                    value={String(installments)}
                    onChange={(event) => setInstallments(Number(event.target.value))}
                    className="w-28"
                  >
                    {Array.from({ length: 35 }, (_, i) => i + 2).map((n) => (
                      <option key={n} value={String(n)}>
                        {n}x
                      </option>
                    ))}
                  </NativeSelect>
                  {perInstallment && (
                    <span className="text-sm text-muted-foreground">
                      = {formatCurrency(perInstallment)}/mês
                    </span>
                  )}
                </div>
              )}

              {/* Garante que installments=1 vai no FormData quando nao parcelado */}
              {installments <= 1 && <input type="hidden" name="installments" value="1" />}
            </div>
          </Field>
        )}

        {/* Sem parcelamento (edicao ou APORTE/ESTORNO): garante installments=1 */}
        {!canInstall && <input type="hidden" name="installments" value="1" />}

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
            placeholder={
              isInstalled
                ? 'Ex.: Aluguel  →  será "Aluguel (1/3)", "Aluguel (2/3)"...'
                : 'Ex.: 500 sacolas'
            }
            defaultValue={transaction?.description ?? ''}
          />
        </Field>

        <Field
          label="Data"
          htmlFor="tx-date"
          hint={isInstalled ? '1ª parcela — demais serão mês a mês' : undefined}
        >
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

        {/* Status: parcelado sempre começa PENDENTE; lancamento unico pode ser qualquer status */}
        {isInstalled ? (
          <>
            <input type="hidden" name="status" value="PENDENTE" />
            <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-300 sm:col-span-2">
              Parcelas criadas com status <strong>Pendente</strong>. Marque cada mês como Pago
              conforme for pagando.
            </div>
          </>
        ) : (
          <Field label="Status">
            <NativeSelect name="status" defaultValue={transaction?.status ?? 'PAGO'}>
              {TRANSACTION_STATUSES.map((status) => (
                <option key={status} value={status}>
                  {status}
                </option>
              ))}
            </NativeSelect>
          </Field>
        )}

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
