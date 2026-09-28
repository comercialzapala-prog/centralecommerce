'use client'

import { Plus } from 'lucide-react'

import { Field } from '@/components/FormControls'
import { FormDialog } from '@/components/FormDialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import type { ActionState } from '@/lib/actions'

/** Cadastro simples de nome (canais e formas de pagamento). */
export function SimpleListForm({
  action,
  title,
  description,
  triggerLabel,
  placeholder,
}: {
  action: (state: ActionState, formData: FormData) => Promise<ActionState>
  title: string
  description?: string
  triggerLabel: string
  placeholder?: string
}) {
  return (
    <FormDialog
      trigger={
        <Button variant="outline" size="sm">
          <Plus /> {triggerLabel}
        </Button>
      }
      title={title}
      description={description}
      action={action}
      submitLabel="Criar"
    >
      <Field label="Nome" htmlFor={`simple-${title}`}>
        <Input id={`simple-${title}`} name="name" required autoFocus placeholder={placeholder} />
      </Field>
    </FormDialog>
  )
}
