'use client'

import * as React from 'react'
import { useRouter } from 'next/navigation'
import { FolderTree, Package, Receipt, Search, ShoppingCart, Truck } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'

import {
  Command,
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command'
import { createClient } from '@/lib/supabase/client'
import { formatCurrency, formatDate } from '@/lib/format'

type Hit = {
  id: string
  group: string
  icon: LucideIcon
  label: string
  detail: string
  href: string
}

const GROUP_ORDER = ['Fornecedores', 'Centros de custo', 'Produtos', 'Pedidos', 'Lançamentos']

/**
 * Busca global (secao 30). Procurar "Jadlog" tem que trazer o fornecedor, os
 * lancamentos pagos a ele e os centros onde esse dinheiro caiu.
 */
export function GlobalSearch() {
  const router = useRouter()
  const [open, setOpen] = React.useState(false)
  const [term, setTerm] = React.useState('')
  // O resultado carrega junto o termo que o produziu, para a tela nunca
  // mostrar os hits de uma busca anterior.
  const [result, setResult] = React.useState<{ term: string; hits: Hit[] }>({
    term: '',
    hits: [],
  })
  const [loading, setLoading] = React.useState(false)

  React.useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'k' && (event.metaKey || event.ctrlKey)) {
        event.preventDefault()
        setOpen((value) => !value)
      }
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [])

  React.useEffect(() => {
    const query = term.trim()
    // Sem setState aqui no corpo do efeito: o que aparece na tela e derivado
    // de `result` mais abaixo, entao termo curto simplesmente nao busca.
    if (query.length < 2) return

    let cancelled = false

    const timeout = setTimeout(async () => {
      if (cancelled) return
      setLoading(true)
      const supabase = createClient()
      const pattern = `%${query.replace(/[%_]/g, ' ')}%`

      const [suppliers, costCenters, products, orders, transactions] = await Promise.all([
        supabase.from('v_supplier_stats').select('supplier_id,name,total_paid,entries_count').ilike('name', pattern).limit(5),
        supabase.from('v_cost_center_hierarchy').select('id,name,path').ilike('path', pattern).limit(5),
        supabase.from('v_product_stats').select('product_id,name,sku,stock_balance').ilike('name', pattern).limit(5),
        supabase.from('v_order_result').select('id,order_number,customer_name,order_date,total_amount').or(`order_number.ilike.${pattern},customer_name.ilike.${pattern}`).limit(5),
        supabase.from('v_transaction_full').select('id,description,transaction_date,amount,type,supplier_name').or(`description.ilike.${pattern},supplier_name.ilike.${pattern}`).order('transaction_date', { ascending: false }).limit(6),
      ])

      if (cancelled) return

      const results: Hit[] = []

      for (const row of suppliers.data ?? []) {
        results.push({
          id: `supplier-${row.supplier_id}`,
          group: 'Fornecedores',
          icon: Truck,
          label: row.name,
          detail: `${formatCurrency(row.total_paid)} pagos · ${row.entries_count} lançamentos`,
          href: `/fornecedores/${row.supplier_id}`,
        })
      }

      for (const row of costCenters.data ?? []) {
        results.push({
          id: `cc-${row.id}`,
          group: 'Centros de custo',
          icon: FolderTree,
          label: row.name,
          detail: row.path,
          href: `/centros-de-custo/${row.id}`,
        })
      }

      for (const row of products.data ?? []) {
        results.push({
          id: `product-${row.product_id}`,
          group: 'Produtos',
          icon: Package,
          label: row.name,
          detail: `${row.sku ? `SKU ${row.sku} · ` : ''}estoque ${row.stock_balance}`,
          href: `/produtos/${row.product_id}`,
        })
      }

      for (const row of orders.data ?? []) {
        results.push({
          id: `order-${row.id}`,
          group: 'Pedidos',
          icon: ShoppingCart,
          label: `Pedido ${row.order_number}`,
          detail: `${formatDate(row.order_date)} · ${formatCurrency(row.total_amount)}${row.customer_name ? ` · ${row.customer_name}` : ''}`,
          href: `/vendas/${row.id}`,
        })
      }

      for (const row of transactions.data ?? []) {
        results.push({
          id: `tx-${row.id}`,
          group: 'Lançamentos',
          icon: Receipt,
          label: row.description,
          detail: `${formatDate(row.transaction_date)} · ${row.type} · ${formatCurrency(row.amount)}${row.supplier_name ? ` · ${row.supplier_name}` : ''}`,
          href: `/lancamentos?q=${encodeURIComponent(row.description)}`,
        })
      }

      setResult({ term: query, hits: results })
      setLoading(false)
    }, 250)

    return () => {
      cancelled = true
      clearTimeout(timeout)
    }
  }, [term])

  const query = term.trim()
  const tooShort = query.length < 2
  const fresh = result.term === query
  const hits = tooShort || !fresh ? [] : result.hits
  const searching = !tooShort && (loading || !fresh)

  const grouped = GROUP_ORDER.map((group) => ({
    group,
    items: hits.filter((hit) => hit.group === group),
  })).filter((entry) => entry.items.length > 0)

  const go = (href: string) => {
    setOpen(false)
    setTerm('')
    router.push(href)
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex h-8 items-center gap-2 rounded-lg border border-input bg-transparent px-2.5 text-sm text-muted-foreground transition-colors hover:bg-muted sm:w-64"
      >
        <Search className="size-3.5 shrink-0" />
        <span className="hidden flex-1 text-left sm:inline">Buscar em tudo...</span>
        <kbd className="hidden rounded border bg-muted px-1 text-[10px] sm:inline">Ctrl K</kbd>
      </button>

      <CommandDialog
        open={open}
        onOpenChange={setOpen}
        title="Busca global"
        description="Procure fornecedores, centros de custo, produtos, pedidos e lançamentos."
      >
        {/* shouldFilter=false: quem filtra e o Postgres, nao o cmdk. */}
        <Command shouldFilter={false}>
          <CommandInput
            value={term}
            onValueChange={setTerm}
            placeholder="Fornecedor, centro de custo, produto, pedido ou lançamento..."
          />
          <CommandList className="max-h-96">
            {tooShort ? (
              <CommandEmpty>Digite ao menos 2 caracteres.</CommandEmpty>
            ) : searching ? (
              <CommandEmpty>Buscando...</CommandEmpty>
            ) : grouped.length === 0 ? (
              <CommandEmpty>Nada encontrado para “{term}”.</CommandEmpty>
            ) : (
              grouped.map((entry) => (
                <CommandGroup key={entry.group} heading={entry.group}>
                  {entry.items.map((hit) => {
                    const Icon = hit.icon
                    return (
                      <CommandItem key={hit.id} value={hit.id} onSelect={() => go(hit.href)}>
                        <Icon className="size-4 shrink-0 text-muted-foreground" />
                        <span className="flex min-w-0 flex-col">
                          <span className="truncate">{hit.label}</span>
                          <span className="truncate text-xs text-muted-foreground">
                            {hit.detail}
                          </span>
                        </span>
                      </CommandItem>
                    )
                  })}
                </CommandGroup>
              ))
            )}
          </CommandList>
        </Command>
      </CommandDialog>
    </>
  )
}
