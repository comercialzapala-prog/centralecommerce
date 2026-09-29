'use client'

import { useActionState } from 'react'
import * as React from 'react'
import { useFormStatus } from 'react-dom'
import { ArrowRight, Loader2 } from 'lucide-react'
import { toast } from 'sonner'

import { IDLE_STATE, type ActionState } from '@/lib/actions'

/**
 * O "Resolver" do cartao.
 *
 * Era um <Link>. Virou um form porque o clique agora faz DUAS coisas: leva para
 * onde se resolve o problema e marca o alerta como visto -- e visto sai da lista.
 * Era isso que faltava: o alerta que voce ja abriu continuava na tela na visita
 * seguinte, competindo com o que ainda nao tinha sido lido.
 *
 * Client Component pelo mesmo motivo do AlertStatusActions: estado de carregamento
 * e toast de erro. O caminho feliz nao tem toast -- a navegacao ja e a resposta.
 */
export function AlertResolveButton({
  alertId,
  action,
}: {
  alertId: string
  action: (prev: ActionState, formData: FormData) => Promise<ActionState>
}) {
  const [state, formAction] = useActionState(action, IDLE_STATE)
  const handledRef = React.useRef(state)

  React.useEffect(() => {
    if (state === handledRef.current || state.status !== 'error') return
    handledRef.current = state
    toast.error(state.message ?? 'Não foi possível abrir este alerta.')
  }, [state])

  return (
    <form action={formAction}>
      <input type="hidden" name="alert_id" value={alertId} />
      <SubmitButton />
    </form>
  )
}

function SubmitButton() {
  const { pending } = useFormStatus()

  return (
    <button
      type="submit"
      disabled={pending}
      title="Abrir para resolver — o alerta sai da lista"
      className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline disabled:opacity-50"
    >
      Resolver
      {pending ? (
        <Loader2 className="size-3 animate-spin" />
      ) : (
        <ArrowRight className="size-3" />
      )}
    </button>
  )
}
