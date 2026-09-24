import * as React from 'react'

import { cn } from '@/lib/utils'

/**
 * Select nativo com a aparencia do shadcn.
 *
 * Nos formularios o nativo ganha do custom: envia FormData de verdade para a
 * Server Action, funciona antes da hidratacao e abre o seletor nativo no
 * celular (secao 43).
 */
export function NativeSelect({
  className,
  children,
  ...props
}: React.ComponentProps<'select'>) {
  return (
    <div className="relative">
      <select
        data-slot="native-select"
        className={cn(
          'h-9 w-full appearance-none rounded-lg border border-input bg-transparent py-1.5 pl-2.5 pr-8 text-sm outline-none transition-colors',
          'focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50',
          'disabled:cursor-not-allowed disabled:opacity-50',
          'dark:bg-input/30',
          className,
        )}
        {...props}
      >
        {children}
      </select>
      <svg
        aria-hidden="true"
        viewBox="0 0 16 16"
        className="pointer-events-none absolute right-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="m4 6 4 4 4-4" />
      </svg>
    </div>
  )
}
