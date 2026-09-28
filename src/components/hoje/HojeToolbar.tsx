'use client'

import { useActionState } from 'react'
import * as React from 'react'
import { useFormStatus } from 'react-dom'
import { CheckCheck, Loader2, RefreshCw } from 'lucide-react'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import { IDLE_STATE, type ActionState } from '@/lib/actions'

/**
 * Barra de acoes do /hoje.
 *
 * Dois botoes, dois significados diferentes:
 *
 *   "Atualizar análise"     roda o auditor e reconcilia os alertas.
 *   "Marcar como revisado"  carimba o momento, para a proxima visita saber o que
 *                           e novidade.
 *
 * A analise NAO roda ao abrir a pagina. Server Component nao deve ter efeito
 * colateral, e uma pagina que grava no banco a cada F5 tambem gravaria a cada
 * prefetch do Next -- entao a execucao e explicita.
 */
export function HojeToolbar({
  runAnalysis,
  markReviewed,
  hasReviewState,
}: {
  runAnalysis: (prev: ActionState, formData: FormData) => Promise<ActionState>
  markReviewed: (prev: ActionState, formData: FormData) => Promise<ActionState>
  hasReviewState: boolean
}) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <ActionForm action={runAnalysis} idleLabel="Atualizar análise" pendingLabel="Analisando...">
        <RefreshCw className="size-3.5" />
      </ActionForm>

      <ActionForm
        action={markReviewed}
        idleLabel={hasReviewState ? 'Marcar como revisado' : 'Iniciar acompanhamento'}
        pendingLabel="Registrando..."
        variant="outline"
      >
        <CheckCheck className="size-3.5" />
      </ActionForm>
    </div>
  )
}

function ActionForm({
  action,
  idleLabel,
  pendingLabel,
  variant,
  children,
}: {
  action: (prev: ActionState, formData: FormData) => Promise<ActionState>
  idleLabel: string
  pendingLabel: string
  variant?: React.ComponentProps<typeof Button>['variant']
  children: React.ReactNode
}) {
  const [state, formAction] = useActionState(action, IDLE_STATE)
  const handledRef = React.useRef(state)

  React.useEffect(() => {
    if (state === handledRef.current || state.status === 'idle') return
    handledRef.current = state
    if (state.status === 'success') toast.success(state.message ?? 'Pronto.')
    else toast.error(state.message ?? 'Não foi possível concluir.')
  }, [state])

  return (
    <form action={formAction}>
      <PendingButton idleLabel={idleLabel} pendingLabel={pendingLabel} variant={variant}>
        {children}
      </PendingButton>
    </form>
  )
}

function PendingButton({
  idleLabel,
  pendingLabel,
  variant,
  children,
}: {
  idleLabel: string
  pendingLabel: string
  variant?: React.ComponentProps<typeof Button>['variant']
  children: React.ReactNode
}) {
  const { pending } = useFormStatus()

  return (
    <Button type="submit" size="sm" variant={variant} disabled={pending}>
      {pending ? <Loader2 className="size-3.5 animate-spin" /> : children}
      {pending ? pendingLabel : idleLabel}
    </Button>
  )
}
