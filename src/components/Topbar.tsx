'use client'

import * as React from 'react'
import { useFormStatus } from 'react-dom'
import { Loader2, LogOut, Menu } from 'lucide-react'

import { GlobalSearch } from '@/components/GlobalSearch'
import { SidebarNav } from '@/components/Sidebar'
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet'
import { logout } from '@/lib/auth-actions'

/** Cabecalho fixo: menu no celular (secao 43), busca global (secao 30) e sessao. */
export function Topbar({ userEmail }: { userEmail: string | null }) {
  const [open, setOpen] = React.useState(false)

  return (
    <header className="sticky top-0 z-30 flex h-14 shrink-0 items-center gap-3 border-b bg-background/95 px-4 backdrop-blur supports-[backdrop-filter]:bg-background/80">
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetTrigger
          aria-label="Abrir menu"
          className="flex size-8 items-center justify-center rounded-lg border border-input md:hidden"
        >
          <Menu className="size-4" />
        </SheetTrigger>
        <SheetContent side="left" className="w-64 p-0">
          <SheetHeader className="h-14 justify-center border-b px-4">
            <SheetTitle className="text-sm">Control Center</SheetTitle>
          </SheetHeader>
          <SidebarNav onNavigate={() => setOpen(false)} />
        </SheetContent>
      </Sheet>

      <span className="text-sm font-semibold md:hidden">Control Center</span>

      <div className="ml-auto flex items-center gap-2">
        <GlobalSearch />

        {userEmail ? (
          <>
            {/* O e-mail some em tela pequena: ali o espaco pertence a busca. */}
            <span
              className="hidden max-w-[200px] truncate text-xs text-muted-foreground lg:inline"
              title={userEmail}
            >
              {userEmail}
            </span>

            {/*
              Form + Server Action, nao onClick: sair exige apagar um cookie
              httpOnly, o que so o servidor faz. Botao que limpasse estado no
              cliente deixaria a sessao viva.
            */}
            <form action={logout}>
              <LogoutButton />
            </form>
          </>
        ) : null}
      </div>
    </header>
  )
}

/**
 * Nao reaproveita `SubmitButton` porque aqui o rotulo e um icone: trocar por
 * "Saindo..." empurraria o layout do cabecalho inteiro.
 */
function LogoutButton() {
  const { pending } = useFormStatus()

  return (
    <button
      type="submit"
      disabled={pending}
      aria-label="Sair"
      title="Sair"
      className="flex size-8 items-center justify-center rounded-lg border border-input text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:opacity-50"
    >
      {pending ? <Loader2 className="size-4 animate-spin" /> : <LogOut className="size-4" />}
    </button>
  )
}
