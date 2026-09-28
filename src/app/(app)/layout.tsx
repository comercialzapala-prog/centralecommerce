import { Sidebar } from '@/components/Sidebar'
import { Topbar } from '@/components/Topbar'
import { getSessionUser } from '@/lib/auth'

/**
 * Moldura da aplicacao.
 *
 * Ele BUSCA o usuario (para o cabecalho mostrar quem esta logado), mas NAO e
 * quem autoriza. A doc do Next 16 e explicita sobre por que:
 *
 *   - layout nao re-renderiza em navegacao client-side, entao a sessao nao seria
 *     reavaliada a cada troca de rota;
 *   - layout nao controla se o resto da rota renderiza -- esconder a UI aqui nao
 *     impediria a pagina de rodar nem de aparecer no RSC payload.
 *
 * A autorizacao acontece em `@/lib/auth` (`createAuthedClient`), na hora de tocar
 * o dado. Se a sessao nao existir, a propria leitura redireciona.
 *
 * Por isso aqui se usa `getSessionUser()` (que devolve null) e nao
 * `requireUser()`: quem chega sem sessao ja foi barrado pelo proxy, e barrar de
 * novo aqui apenas trocaria a ordem do redirecionamento.
 */
export default async function AppLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  const user = await getSessionUser()

  return (
    <div className="flex h-dvh overflow-hidden">
      <Sidebar />
      <div className="flex min-w-0 flex-1 flex-col">
        <Topbar userEmail={user?.email ?? null} />
        <main className="flex-1 overflow-y-auto p-4 md:p-6">
          <div className="mx-auto w-full max-w-[1400px] space-y-5">{children}</div>
        </main>
      </div>
    </div>
  )
}
