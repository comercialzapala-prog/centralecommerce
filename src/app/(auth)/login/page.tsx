import type { Metadata } from 'next'

import type { SearchParams } from '@/lib/filters'

import { LoginForm } from './LoginForm'

/**
 * Tela de login.
 *
 * Nao existe cadastro publico aqui, e isso e decisao de arquitetura, nao falta:
 * conta na Central e criada por quem administra, e ter conta nao da acesso a dado
 * nenhum -- quem da acesso e o vinculo em organization_members.
 */

export const metadata: Metadata = {
  title: 'Entrar | Control Center',
}

// A pagina le search params e decide a mensagem: nunca deve ser pre-renderizada.
export const dynamic = 'force-dynamic'

function first(value: string | string[] | undefined): string | null {
  const raw = Array.isArray(value) ? value[0] : value
  return raw && raw.trim() !== '' ? raw : null
}

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>
}) {
  const params = await searchParams

  return (
    <div className="space-y-6">
      <div className="flex flex-col items-center gap-3 text-center">
        <div className="flex size-11 items-center justify-center rounded-xl bg-primary text-sm font-bold text-primary-foreground">
          CC
        </div>
        <div>
          <h1 className="text-lg font-semibold tracking-tight">Control Center</h1>
          <p className="text-sm text-muted-foreground">Central E-commerce</p>
        </div>
      </div>

      <LoginForm
        next={first(params.next)}
        sessionExpired={first(params.expirou) === '1'}
      />

      <p className="text-center text-xs text-muted-foreground">
        O acesso é concedido pelo administrador da operação.
      </p>
    </div>
  )
}
