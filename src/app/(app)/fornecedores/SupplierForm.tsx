'use client'

import { Pencil, Plus } from 'lucide-react'

import { Field } from '@/components/FormControls'
import { FormDialog } from '@/components/FormDialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import type { SupplierStats } from '@/lib/types'

import { createSupplier, updateSupplier } from './actions'

export function SupplierForm({ supplier }: { supplier?: SupplierStats }) {
  const editing = Boolean(supplier)

  return (
    <FormDialog
      trigger={
        editing ? (
          <Button variant="outline" size="sm">
            <Pencil /> Editar
          </Button>
        ) : (
          <Button size="sm">
            <Plus /> Novo fornecedor
          </Button>
        )
      }
      title={editing ? `Editar ${supplier?.name}` : 'Novo fornecedor'}
      description="Para quem o dinheiro foi pago."
      action={editing ? updateSupplier : createSupplier}
    >
      {supplier ? <input type="hidden" name="id" value={supplier.supplier_id} /> : null}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label="Nome" htmlFor="sup-name" className="sm:col-span-2">
          <Input
            id="sup-name"
            name="name"
            required
            autoFocus
            placeholder="Ex.: Jadlog"
            defaultValue={supplier?.name ?? ''}
          />
        </Field>

        <Field label="CNPJ / CPF" htmlFor="sup-doc">
          <Input id="sup-doc" name="document" defaultValue={supplier?.document ?? ''} />
        </Field>

        <Field label="Telefone" htmlFor="sup-phone">
          <Input id="sup-phone" name="phone" defaultValue={supplier?.phone ?? ''} />
        </Field>

        <Field label="E-mail" htmlFor="sup-email" className="sm:col-span-2">
          <Input id="sup-email" name="email" type="email" defaultValue={supplier?.email ?? ''} />
        </Field>

        <Field label="Observações" htmlFor="sup-notes" className="sm:col-span-2">
          <Textarea id="sup-notes" name="notes" rows={2} defaultValue={supplier?.notes ?? ''} />
        </Field>
      </div>
    </FormDialog>
  )
}
