import type { Metadata } from 'next'
import { ShieldQuestion } from 'lucide-react'

import { SubmitButton } from '@/components/FormControls'
import { requireUser } from '@/lib/auth'
import { logout } from '@/lib/auth-actions'

/**
 * Autenticado, porem sem vinculo com organizacao nenhuma.
 *
 * Este estado existe de propósito e e o coracao da decisao de seguranca: criar
 * conta NAO da acesso aos dados da empresa. Quem chega aqui tem sessao valida e
 * profile criado, e ainda assim nao ve dado nenhum -- falta a linha em
 * organization_members, que so um administrador cria.
 *
 * Usa `requireUser()` e NAO `requireMembership()`: exigir vinculo nesta pagina
 * geraria loop de redirecionamento, porque e justamente a pagina para quem nao
 * tem vinculo.
 *
 * Fica no grupo (auth) para nao exibir a navegacao do sistema: menu que leva a
 * telas sem acesso e pior do que nao ter menu.
 */

export const metadata: Metadata = {
  title: 'Acesso pendente | Control Center',
}

export const dynamic = 'force-dynamic'

export default async function PendingAccessPage() {
  const user = await requireUser()

  return (
    <div className="space-y-5 rounded-xl border bg-card p-6 text-center shadow-sm">
      <div className="mx-auto flex size-11 items-center justify-center rounded-xl bg-muted">
        <ShieldQuestion size={20} className="text-muted-foreground" />
      </div>

      <div className="space-y-2">
        <h1 className="text-base font-semibold">Acesso pendente</h1>
        <p className="text-sm text-muted-foreground">
          Sua conta existe e você está autenticado, mas ainda não foi vinculada a uma organização.
          Até que isso aconteça, nenhum dado da operação fica acessível.
        </p>
      </div>

      <p className="rounded-lg bg-muted/60 px-3 py-2 text-xs text-muted-foreground">
        Conectado como <span className="font-medium text-foreground">{user.email}</span>
      </p>

      <p className="text-xs text-muted-foreground">
        Peça ao administrador da operação para liberar seu acesso.
      </p>

      <form action={logout}>
        <SubmitButton variant="outline" className="w-full" pendingLabel="Saindo...">
          Sair
        </SubmitButton>
      </form>
    </div>
  )
}
