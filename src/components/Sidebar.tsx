'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  Boxes,
  FolderTree,
  LayoutDashboard,
  Package,
  Receipt,
  Settings as SettingsIcon,
  ShoppingCart,
  Tags,
  TrendingUp,
  Truck,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'

import { cn } from '@/lib/utils'

type NavItem = { href: string; label: string; icon: LucideIcon }
type NavGroup = { title: string; items: NavItem[] }

/** Estrutura exata da secao 35. */
export const NAV_GROUPS: NavGroup[] = [
  {
    title: 'Visão geral',
    items: [{ href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard }],
  },
  {
    title: 'Financeiro',
    items: [
      { href: '/lancamentos', label: 'Lançamentos', icon: Receipt },
      { href: '/centros-de-custo', label: 'Centros de Custo', icon: FolderTree },
      { href: '/investimentos', label: 'Investimentos', icon: TrendingUp },
    ],
  },
  {
    title: 'Comercial',
    items: [
      { href: '/vendas', label: 'Vendas', icon: ShoppingCart },
      { href: '/produtos', label: 'Produtos', icon: Package },
    ],
  },
  {
    title: 'Operação',
    items: [
      { href: '/movimentacoes', label: 'Movimentações', icon: Boxes },
      { href: '/fornecedores', label: 'Fornecedores', icon: Truck },
    ],
  },
  {
    title: 'Gestão',
    items: [
      { href: '/categorias', label: 'Categorias', icon: Tags },
      { href: '/configuracoes', label: 'Configurações', icon: SettingsIcon },
    ],
  },
]

export function SidebarNav({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname()

  return (
    <nav className="flex-1 space-y-6 overflow-y-auto p-3">
      {NAV_GROUPS.map((group) => (
        <div key={group.title}>
          <div className="mb-1 px-3 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
            {group.title}
          </div>
          <div className="space-y-0.5">
            {group.items.map((item) => {
              const active = pathname === item.href || pathname.startsWith(`${item.href}/`)
              const Icon = item.icon
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={onNavigate}
                  aria-current={active ? 'page' : undefined}
                  className={cn(
                    'flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors',
                    active
                      ? 'bg-primary font-medium text-primary-foreground'
                      : 'text-foreground/80 hover:bg-muted hover:text-foreground',
                  )}
                >
                  <Icon size={17} className="shrink-0" />
                  <span className="truncate">{item.label}</span>
                </Link>
              )
            })}
          </div>
        </div>
      ))}
    </nav>
  )
}

export function Sidebar() {
  return (
    <aside className="hidden w-60 shrink-0 flex-col border-r bg-sidebar md:flex">
      <div className="flex h-14 shrink-0 items-center gap-2 border-b px-4">
        <div className="flex size-7 items-center justify-center rounded-md bg-primary text-xs font-bold text-primary-foreground">
          CC
        </div>
        <span className="text-sm font-semibold">Control Center</span>
      </div>
      <SidebarNav />
    </aside>
  )
}
