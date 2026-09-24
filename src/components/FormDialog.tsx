'use client'

import * as React from 'react'
import { toast } from 'sonner'

import { SubmitButton } from '@/components/FormControls'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { IDLE_STATE, type ActionState } from '@/lib/actions'
import { cn } from '@/lib/utils'

type ServerAction = (state: ActionState, formData: FormData) => Promise<ActionState>

/**
 * Dialogo + formulario + Server Action, com o ciclo completo:
 * envia, mostra erro no lugar, fecha no sucesso e avisa por toast.
 *
 * Toda escrita do sistema passa por aqui, entao nao existe botao decorativo
 * (secao 47).
 */
export function FormDialog({
  trigger,
  title,
  description,
  action,
  children,
  submitLabel = 'Salvar',
  className,
  onSuccess,
}: {
  trigger: React.ReactElement
  title: string
  description?: string
  action: ServerAction
  children: React.ReactNode | ((state: ActionState) => React.ReactNode)
  submitLabel?: string
  className?: string
  onSuccess?: () => void
}) {
  const [open, setOpen] = React.useState(false)
  const [state, setState] = React.useState<ActionState>(IDLE_STATE)
  // Trocar a key remonta o formulario -- campos limpos a cada abertura/sucesso.
  const [formKey, setFormKey] = React.useState(0)

  /**
   * O resultado e tratado aqui dentro, no proprio callback da transicao, em
   * vez de num useEffect que observa o estado: fechar o dialogo e avisar por
   * toast sao consequencias DESTE envio, nao de uma mudanca de estado.
   */
  const submit = (formData: FormData) =>
    React.startTransition(async () => {
      const result = await action(IDLE_STATE, formData)
      setState(result)

      if (result.status === 'success') {
        toast.success(result.message ?? 'Salvo com sucesso.')
        setOpen(false)
        setFormKey((value) => value + 1)
        onSuccess?.()
      } else if (result.status === 'error') {
        toast.error(result.message ?? 'Não foi possível salvar.')
      }
    })

  return (
    <>
      {React.cloneElement(trigger as React.ReactElement<{ onClick?: () => void }>, {
        onClick: () => {
          setState(IDLE_STATE)
          setFormKey((value) => value + 1)
          setOpen(true)
        },
      })}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className={cn('max-h-[90dvh] overflow-y-auto sm:max-w-lg', className)}>
          <DialogHeader>
            <DialogTitle>{title}</DialogTitle>
            {description ? <DialogDescription>{description}</DialogDescription> : null}
          </DialogHeader>

          <form key={formKey} action={submit} className="space-y-4">
            {typeof children === 'function' ? children(state) : children}

            {state.status === 'error' && state.message ? (
              <p className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">
                {state.message}
              </p>
            ) : null}

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setOpen(false)}>
                Cancelar
              </Button>
              <SubmitButton>{submitLabel}</SubmitButton>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  )
}

/**
 * Botao de acao destrutiva-leve (desativar/cancelar). Nunca apaga de verdade:
 * o sistema trabalha com active=false e status=CANCELADO (secao 41).
 */
export function ConfirmActionButton({
  action,
  fields,
  label,
  confirmMessage,
  variant = 'ghost',
  size = 'sm',
  icon,
}: {
  action: (formData: FormData) => Promise<void>
  fields: Record<string, string>
  label: string
  confirmMessage: string
  variant?: React.ComponentProps<typeof Button>['variant']
  size?: React.ComponentProps<typeof Button>['size']
  icon?: React.ReactNode
}) {
  return (
    <form
      action={action}
      onSubmit={(event) => {
        if (!window.confirm(confirmMessage)) event.preventDefault()
      }}
      className="inline"
    >
      {Object.entries(fields).map(([key, value]) => (
        <input key={key} type="hidden" name={key} value={value} />
      ))}
      <Button type="submit" variant={variant} size={size}>
        {icon}
        {label}
      </Button>
    </form>
  )
}
