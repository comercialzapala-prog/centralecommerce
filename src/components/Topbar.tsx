'use client'

import * as React from 'react'
import { Menu } from 'lucide-react'

import { GlobalSearch } from '@/components/GlobalSearch'
import { SidebarNav } from '@/components/Sidebar'
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet'

/** Cabecalho fixo: menu no celular (secao 43) + busca global (secao 30). */
export function Topbar() {
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

      <div className="ml-auto">
        <GlobalSearch />
      </div>
    </header>
  )
}
