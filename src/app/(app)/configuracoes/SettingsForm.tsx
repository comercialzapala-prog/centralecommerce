'use client'

import { useActionState } from 'react'
import * as React from 'react'
import { toast } from 'sonner'

import { Field, MoneyInput, SubmitButton } from '@/components/FormControls'
import { Input } from '@/components/ui/input'
import { IDLE_STATE } from '@/lib/actions'
import type { Settings } from '@/lib/types'

import { updateSettings } from './actions'

export function SettingsForm({ settings }: { settings: Settings | null }) {
  const [state, formAction] = useActionState(updateSettings, IDLE_STATE)
  const handledRef = React.useRef(state)

  React.useEffect(() => {
    if (state === handledRef.current || state.status === 'idle') return
    handledRef.current = state
    if (state.status === 'success') toast.success(state.message ?? 'Salvo.')
    else toast.error(state.message ?? 'Não foi possível salvar.')
  }, [state])

  return (
    <form action={formAction} className="space-y-4 rounded-xl border bg-card p-4">
      {settings?.id ? <input type="hidden" name="id" value={settings.id} /> : null}

      <h2 className="text-sm font-semibold">Operação</h2>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label="Nome da operação" htmlFor="set-name">
          <Input
            id="set-name"
            name="operation_name"
            defaultValue={settings?.operation_name ?? 'Central E-commerce'}
          />
        </Field>

        <Field label="Início da operação" htmlFor="set-start">
          <Input
            id="set-start"
            type="date"
            name="start_date"
            defaultValue={settings?.start_date?.slice(0, 10) ?? ''}
          />
        </Field>

        <Field
          label="Saldo inicial de caixa"
          htmlFor="set-balance"
          hint="Quanto havia em caixa quando a operação começou a ser registrada aqui."
        >
          <MoneyInput
            id="set-balance"
            name="initial_balance"
            defaultValue={settings ? String(settings.initial_balance) : '0'}
          />
        </Field>

        <Field
          label="Investimento inicial (fora do sistema)"
          htmlFor="set-investment"
          hint="Dinheiro aplicado antes deste sistema existir. Soma ao total a recuperar no 0/50, mas não mexe no caixa."
        >
          <MoneyInput
            id="set-investment"
            name="initial_investment"
            defaultValue={settings ? String(settings.initial_investment) : '0'}
          />
        </Field>
      </div>

      {state.status === 'error' && state.message ? (
        <p className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {state.message}
        </p>
      ) : null}

      <SubmitButton>Salvar configurações</SubmitButton>
    </form>
  )
}
