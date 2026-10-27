'use client'

import * as React from 'react'
import { CheckCircle2, Loader2, ShieldAlert, TriangleAlert } from 'lucide-react'
import { toast } from 'sonner'

import { BoxGrid, type BoxGridItem } from '@/components/BoxGrid'
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

function inferDefaultBoxGrid(
  confirmMessage: string,
  fields: Record<string, string>,
): {
  title: string
  confirmLabel: string
  tone: 'warning' | 'danger' | 'positive'
  items: BoxGridItem[]
} {
  const lower = confirmMessage.toLowerCase()
  const isReactivate = lower.startsWith('reativar') || fields.active === 'true'
  const isDelete = lower.startsWith('excluir') || lower.startsWith('remover')
  const isCancel = lower.startsWith('cancelar') || fields.status === 'CANCELADO'

  const quotedMatch =
    confirmMessage.match(/"([^"]+)"/) ??
    confirmMessage.match(/^(?:Desativar|Reativar|Cancelar|Excluir|Remover)\s+([^?]+)\?/i)
  const targetLabel = quotedMatch?.[1]?.trim() ?? 'Registro selecionado'

  if (isReactivate) {
    return {
      title: 'Confirmar reativação',
      confirmLabel: 'Reativar agora',
      tone: 'positive',
      items: [
        { label: 'Operação', value: 'Reativar registro', tone: 'positive' },
        { label: 'Novo status', value: 'Ativo / Concluído', tone: 'positive' },
        { label: 'Item selecionado', value: targetLabel, span: 2 },
      ],
    }
  }

  if (isDelete) {
    return {
      title: 'Confirmar remoção',
      confirmLabel: 'Confirmar remoção',
      tone: 'danger',
      items: [
        { label: 'Operação', value: 'Remover item', tone: 'danger' },
        { label: 'Impacto no saldo', value: 'Recalculado automaticamente', tone: 'warning' },
        { label: 'Item selecionado', value: targetLabel, span: 2 },
      ],
    }
  }

  if (isCancel) {
    return {
      title: 'Confirmar cancelamento',
      confirmLabel: 'Confirmar cancelamento',
      tone: 'danger',
      items: [
        { label: 'Operação', value: 'Cancelar registro', tone: 'danger' },
        { label: 'Novo status', value: 'CANCELADO', tone: 'warning' },
        { label: 'Item selecionado', value: targetLabel, span: 2 },
        { label: 'Efeito financeiro', value: 'Zerado no caixa/resultado', tone: 'neutral' },
        { label: 'Auditoria', value: 'Mantido no histórico', tone: 'positive' },
      ],
    }
  }

  return {
    title: 'Confirmar desativação',
    confirmLabel: 'Desativar registro',
    tone: 'warning',
    items: [
      { label: 'Operação', value: 'Inativar cadastro', tone: 'warning' },
      { label: 'Novo status', value: 'Inativo', tone: 'neutral' },
      { label: 'Item selecionado', value: targetLabel, span: 2 },
      { label: 'Novos lançamentos', value: 'Oculto nos formulários', tone: 'neutral' },
      { label: 'Histórico anterior', value: '100% preservado', tone: 'positive' },
    ],
  }
}

/**
 * Botao de acao com modal moderno em BoxGrid (substitui qualquer window.confirm / alert nativo).
 * O sistema trabalha com active=false e status=CANCELADO (secao 41).
 */
export function ConfirmActionButton({
  action,
  fields,
  label,
  confirmMessage,
  title,
  confirmLabel,
  tone,
  details,
  variant = 'ghost',
  size = 'sm',
  icon,
}: {
  action: (formData: FormData) => Promise<void>
  fields: Record<string, string>
  label: string
  confirmMessage: string
  title?: string
  confirmLabel?: string
  tone?: 'warning' | 'danger' | 'positive'
  details?: BoxGridItem[]
  variant?: React.ComponentProps<typeof Button>['variant']
  size?: React.ComponentProps<typeof Button>['size']
  icon?: React.ReactNode
}) {
  const [open, setOpen] = React.useState(false)
  const [pending, startTransition] = React.useTransition()

  const inferred = inferDefaultBoxGrid(confirmMessage, fields)
  const resolvedTitle = title ?? inferred.title
  const resolvedConfirmLabel = confirmLabel ?? inferred.confirmLabel
  const resolvedTone = tone ?? inferred.tone
  const boxItems = details && details.length > 0 ? details : inferred.items

  const HeaderIcon =
    resolvedTone === 'positive'
      ? CheckCircle2
      : resolvedTone === 'danger'
        ? ShieldAlert
        : TriangleAlert

  const iconToneClass =
    resolvedTone === 'positive'
      ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
      : resolvedTone === 'danger'
        ? 'border-rose-500/30 bg-rose-500/10 text-rose-600 dark:text-rose-400'
        : 'border-amber-500/30 bg-amber-500/10 text-amber-600 dark:text-amber-400'

  const handleConfirm = () => {
    const formData = new FormData()
    for (const [key, value] of Object.entries(fields)) {
      formData.set(key, value)
    }

    startTransition(async () => {
      try {
        await action(formData)
        setOpen(false)
        toast.success('Operação realizada com sucesso.')
      } catch (error) {
        toast.error(
          error instanceof Error ? error.message : 'Não foi possível concluir a operação.',
        )
      }
    })
  }

  return (
    <>
      <Button
        type="button"
        variant={variant}
        size={size}
        onClick={() => setOpen(true)}
        title={resolvedTitle}
      >
        {icon}
        {label}
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <div className="flex items-start gap-3">
              <div
                className={cn(
                  'flex size-10 shrink-0 items-center justify-center rounded-xl border',
                  iconToneClass,
                )}
              >
                <HeaderIcon className="size-5" />
              </div>
              <div className="space-y-1 text-left">
                <DialogTitle>{resolvedTitle}</DialogTitle>
                <DialogDescription>{confirmMessage}</DialogDescription>
              </div>
            </div>
          </DialogHeader>

          <BoxGrid items={boxItems} columns={2} className="my-1" />

          <DialogFooter className="gap-2 sm:gap-2">
            <Button
              type="button"
              variant="outline"
              disabled={pending}
              onClick={() => setOpen(false)}
            >
              Cancelar
            </Button>
            <Button
              type="button"
              variant={resolvedTone === 'danger' ? 'destructive' : 'default'}
              disabled={pending}
              onClick={handleConfirm}
            >
              {pending ? (
                <>
                  <Loader2 className="animate-spin" />
                  Processando...
                </>
              ) : (
                resolvedConfirmLabel
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
