'use client'

import { useFormStatus } from 'react-dom'
import { Loader2 } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'

/** Botao de submit que se desabilita sozinho enquanto a Server Action roda. */
export function SubmitButton({
  children,
  className,
  variant,
  pendingLabel = 'Salvando...',
}: {
  children: React.ReactNode
  className?: string
  variant?: React.ComponentProps<typeof Button>['variant']
  pendingLabel?: string
}) {
  const { pending } = useFormStatus()

  return (
    <Button type="submit" disabled={pending} className={className} variant={variant}>
      {pending ? (
        <>
          <Loader2 className="animate-spin" />
          {pendingLabel}
        </>
      ) : (
        children
      )}
    </Button>
  )
}

/**
 * Campo de dinheiro. Aceita virgula ou ponto -- quem normaliza e
 * `parseAmount` do lado do servidor, entao nao ha como salvar valor torto.
 */
export function MoneyInput({
  name,
  defaultValue,
  value,
  onChange,
  required,
  id,
  className,
  placeholder = '0,00',
}: {
  name: string
  defaultValue?: string | number | null
  /** Passe `value` + `onChange` quando a tela precisar reagir ao que foi digitado. */
  value?: string
  onChange?: (value: string) => void
  required?: boolean
  id?: string
  className?: string
  placeholder?: string
}) {
  const controlled = value !== undefined

  return (
    <div className="relative">
      <span className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">
        R$
      </span>
      <Input
        id={id}
        name={name}
        inputMode="decimal"
        autoComplete="off"
        required={required}
        placeholder={placeholder}
        {...(controlled
          ? { value, onChange: (event) => onChange?.(event.target.value) }
          : { defaultValue: defaultValue ?? '' })}
        className={cn('pl-9 tabular-nums', className)}
      />
    </div>
  )
}

/** Rotulo + campo, com o espacamento padrao dos formularios. */
export function Field({
  label,
  htmlFor,
  hint,
  children,
  className,
}: {
  label: string
  htmlFor?: string
  hint?: string
  children: React.ReactNode
  className?: string
}) {
  return (
    <div className={cn('space-y-1.5', className)}>
      <label htmlFor={htmlFor} className="text-sm font-medium">
        {label}
      </label>
      {children}
      {hint ? <p className="text-xs text-muted-foreground">{hint}</p> : null}
    </div>
  )
}
