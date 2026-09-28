'use client'

import { useActionState } from 'react'
import * as React from 'react'
import { useFormStatus } from 'react-dom'
import { Check, EyeOff, Loader2, RotateCcw, Undo2 } from 'lucide-react'
import { toast } from 'sonner'

import { IDLE_STATE, type ActionState } from '@/lib/actions'
import type { AlertStatus } from '@/lib/types'
import { cn } from '@/lib/utils'

/**
 * Botoes de status de um alerta.
 *
 * Client Component porque precisa de estado de carregamento e de toast. A decisao
 * em si acontece no servidor -- aqui so se dispara a Server Action, que valida
 * sessao, vinculo e dono do alerta antes de gravar.
 */
export function AlertStatusActions({
  alertId,
  status,
  action,
}: {
  alertId: string
  status: AlertStatus
  action: (prev: ActionState, formData: FormData) => Promise<ActionState>
}) {
  const [state, formAction] = useActionState(action, IDLE_STATE)
  const handledRef = React.useRef(state)

  React.useEffect(() => {
    if (state === handledRef.current || state.status === 'idle') return
    handledRef.current = state
    if (state.status === 'success') toast.success(state.message ?? 'Pronto.')
    else toast.error(state.message ?? 'Não foi possível atualizar.')
  }, [state])

  return (
    <form action={formAction} className="flex shrink-0 items-center gap-1">
      <input type="hidden" name="alert_id" value={alertId} />

      {status === 'RESOLVED' || status === 'DISMISSED' ? (
        <StatusButton value="OPEN" label="Reabrir" icon={<RotateCcw className="size-3.5" />} />
      ) : (
        <>
          {status === 'OPEN' ? (
            <StatusButton
              value="ACKNOWLEDGED"
              label="Marcar como visto"
              icon={<Undo2 className="size-3.5" />}
            />
          ) : null}
          <StatusButton
            value="RESOLVED"
            label="Marcar como resolvido"
            icon={<Check className="size-3.5" />}
            tone="positive"
          />
          <StatusButton
            value="DISMISSED"
            label="Ignorar"
            icon={<EyeOff className="size-3.5" />}
          />
        </>
      )}
    </form>
  )
}

/**
 * Um botao por status. `name="status"` + `value` faz o proprio botao dizer para
 * qual estado ir -- sem `useState` e sem um select escondido.
 */
function StatusButton({
  value,
  label,
  icon,
  tone,
}: {
  value: AlertStatus
  label: string
  icon: React.ReactNode
  tone?: 'positive'
}) {
  const { pending } = useFormStatus()

  return (
    <button
      type="submit"
      name="status"
      value={value}
      disabled={pending}
      title={label}
      aria-label={label}
      className={cn(
        'flex size-7 items-center justify-center rounded-md border border-input text-muted-foreground transition-colors',
        'hover:bg-muted hover:text-foreground disabled:opacity-40',
        tone === 'positive' && 'hover:border-emerald-500/40 hover:text-emerald-600',
      )}
    >
      {pending ? <Loader2 className="size-3.5 animate-spin" /> : icon}
    </button>
  )
}
