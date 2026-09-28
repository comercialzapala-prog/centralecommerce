'use client'

import { useActionState } from 'react'
import { AlertCircle, Clock } from 'lucide-react'

import { Field, SubmitButton } from '@/components/FormControls'
import { Input } from '@/components/ui/input'
import { IDLE_STATE } from '@/lib/actions'
import { signIn } from '@/lib/auth-actions'

/**
 * Formulario de login.
 *
 * `useActionState` + `SubmitButton` sao os mesmos do resto do projeto, entao o
 * estado de carregamento e o de erro se comportam como em qualquer outro
 * formulario da Central.
 *
 * O erro aparece NA TELA e nao num toast: toast desaparece, e num formulario de
 * login a pessoa precisa reler a mensagem enquanto corrige o campo.
 */
export function LoginForm({
  next,
  sessionExpired,
}: {
  next: string | null
  sessionExpired: boolean
}) {
  const [state, formAction] = useActionState(signIn, IDLE_STATE)

  return (
    <form action={formAction} className="space-y-4 rounded-xl border bg-card p-5 shadow-sm">
      {/* Para onde voltar depois de entrar. Validado no servidor -- ver readNextPath. */}
      {next ? <input type="hidden" name="next" value={next} /> : null}

      {sessionExpired && state.status === 'idle' ? (
        <div className="flex items-start gap-2 rounded-lg border border-amber-500/40 bg-amber-500/5 p-3 text-sm">
          <Clock size={15} className="mt-0.5 shrink-0 text-amber-600 dark:text-amber-400" />
          <p className="text-muted-foreground">
            Sua sessão expirou. Entre novamente para continuar.
          </p>
        </div>
      ) : null}

      {state.status === 'error' ? (
        <div
          role="alert"
          className="flex items-start gap-2 rounded-lg border border-destructive/40 bg-destructive/5 p-3 text-sm"
        >
          <AlertCircle size={15} className="mt-0.5 shrink-0 text-destructive" />
          <p className="text-destructive">{state.message ?? 'Não foi possível entrar.'}</p>
        </div>
      ) : null}

      <Field label="E-mail" htmlFor="login-email">
        <Input
          id="login-email"
          name="email"
          type="email"
          autoComplete="username"
          autoFocus
          required
          placeholder="voce@empresa.com.br"
          aria-invalid={state.status === 'error' || undefined}
        />
      </Field>

      <Field label="Senha" htmlFor="login-password">
        <Input
          id="login-password"
          name="password"
          type="password"
          autoComplete="current-password"
          required
          aria-invalid={state.status === 'error' || undefined}
        />
      </Field>

      <SubmitButton className="w-full" pendingLabel="Entrando...">
        Entrar
      </SubmitButton>
    </form>
  )
}
