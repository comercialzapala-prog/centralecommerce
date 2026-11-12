'use client'

import * as React from 'react'
import { Check, Filter, Layers, Package, Search, ShieldCheck, Sparkles } from 'lucide-react'

import { FormDialog } from '@/components/FormDialog'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { formatCurrency, formatNumber, num, round2 } from '@/lib/format'
import { cn } from '@/lib/utils'

import { batchAssignBubbleWrapAction } from './actions'
import type { PackagingOption } from './ProductForm'

export type BubbleWrapProductItem = {
  id: string
  name: string
  sku: string | null
  category?: string | null
  sale_price?: number | string
  unit_cost?: number | string
  packaging_cost?: number | string | null
  linked_packaging_name?: string | null
  linked_packaging_sku?: string | null
  linked_packaging_unit_cost?: number | string | null
  use_bubble_wrap?: boolean | null
  linked_bubble_wrap_qty?: number | null
}

const FRAGILE_KEYWORDS = [
  'VIDRO',
  'HERMETICO',
  'HERMÉTICO',
  'BOROSSILICATO',
  'CHALEIRA',
  'CONDIMENTO',
  'XICARA',
  'XÍCARA',
  'CANECA',
  'PRATO',
  'TRAVESSA',
  'CERAMICA',
  'CERÂMICA',
  'GARRAFA',
  'ESPELHO',
  'LUMINARIA',
  'LUMINÁRIA',
  'POTE',
]

function isLikelyFragile(name: string, category?: string | null): boolean {
  const text = `${name} ${category ?? ''}`.toUpperCase()
  return FRAGILE_KEYWORDS.some((kw) => text.includes(kw))
}

export function BubbleWrapLinkDialog({
  products,
  bubbleWrapInsumo,
  triggerLabel = 'Atribuir Plástico Bolha',
  compact = false,
}: {
  products: BubbleWrapProductItem[]
  bubbleWrapInsumo?: PackagingOption | null
  triggerLabel?: string
  compact?: boolean
}) {
  const [searchTerm, setSearchTerm] = React.useState('')
  const [filterMode, setFilterMode] = React.useState<'ALL' | 'FRAGILE' | 'ACTIVE' | 'INACTIVE'>('ALL')
  const [selectedIds, setSelectedIds] = React.useState<Set<string>>(() => {
    const initial = new Set<string>()
    for (const p of products) {
      if (p.use_bubble_wrap) {
        initial.add(p.id)
      }
    }
    return initial
  })

  // Sincroniza quando os produtos mudam
  React.useEffect(() => {
    const current = new Set<string>()
    for (const p of products) {
      if (p.use_bubble_wrap) {
        current.add(p.id)
      }
    }
    setSelectedIds(current)
  }, [products])

  const bubbleCost = num(bubbleWrapInsumo?.unit_cost) > 0 ? num(bubbleWrapInsumo?.unit_cost) : 0.6

  const filteredProducts = React.useMemo(() => {
    const term = searchTerm.trim().toUpperCase()
    return products.filter((prod) => {
      const matchSearch =
        !term ||
        prod.name.toUpperCase().includes(term) ||
        (prod.sku ?? '').toUpperCase().includes(term) ||
        (prod.category ?? '').toUpperCase().includes(term)

      if (!matchSearch) return false

      if (filterMode === 'FRAGILE') {
        return isLikelyFragile(prod.name, prod.category)
      }
      if (filterMode === 'ACTIVE') {
        return selectedIds.has(prod.id)
      }
      if (filterMode === 'INACTIVE') {
        return !selectedIds.has(prod.id)
      }
      return true
    })
  }, [products, searchTerm, filterMode, selectedIds])

  const fragileCount = React.useMemo(
    () => products.filter((p) => isLikelyFragile(p.name, p.category)).length,
    [products],
  )

  const activeCount = selectedIds.size

  function toggleProduct(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) {
        next.delete(id)
      } else {
        next.add(id)
      }
      return next
    })
  }

  function handleSelectAllFiltered() {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      for (const p of filteredProducts) {
        next.add(p.id)
      }
      return next
    })
  }

  function handleDeselectAllFiltered() {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      for (const p of filteredProducts) {
        next.delete(p.id)
      }
      return next
    })
  }

  function handleSelectAllFragile() {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      for (const p of products) {
        if (isLikelyFragile(p.name, p.category)) {
          next.add(p.id)
        }
      }
      return next
    })
    setFilterMode('FRAGILE')
  }

  return (
    <FormDialog
      trigger={
        compact ? (
          <Button variant="outline" size="xs" className="border-sky-600/40 text-sky-700 dark:text-sky-300">
            <Sparkles className="size-3.5 text-sky-500" />
            {triggerLabel}
          </Button>
        ) : (
          <Button variant="outline" size="sm" className="border-sky-600/40 text-sky-700 dark:text-sky-300 font-semibold shadow-xs">
            <Sparkles className="size-4 text-sky-500" />
            {triggerLabel}
          </Button>
        )
      }
      title="🫧 Atribuir Plástico Bolha aos Produtos"
      description="Marque quais produtos necessitam de proteção interna extra (vidros, chaleiras, potes herméticos, etc.). O sistema soma o custo unitário do plástico bolha à sacola de envio na precificação e gerencia o consumo automático."
      action={batchAssignBubbleWrapAction}
      submitLabel={`Salvar Vínculos (${activeCount} selecionados)`}
    >
      <input
        type="hidden"
        name="bubble_wrap_product_id"
        value={bubbleWrapInsumo?.id ?? 'f1496437-530f-48fd-957b-69190ff4ce1b'}
      />

      {/* Hidden inputs para todos os produtos candidatos e os selecionados */}
      {products.map((p) => (
        <input key={p.id} type="hidden" name="all_candidate_product_ids" value={p.id} />
      ))}
      {Array.from(selectedIds).map((id) => (
        <input key={id} type="hidden" name="selected_product_ids" value={id} />
      ))}

      <div className="space-y-3">
        {/* Info Box do Plástico Bolha */}
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-sky-500/30 bg-sky-500/10 p-3 text-xs">
          <div className="flex items-center gap-2">
            <div className="flex size-7 items-center justify-center rounded-lg bg-sky-500/20 text-sky-700 dark:text-sky-300 font-bold">
              🫧
            </div>
            <div>
              <div className="font-bold text-foreground">
                Insumo: {bubbleWrapInsumo?.name ?? 'PLASTICO BOLHA'} (1 un.)
              </div>
              <div className="text-[11px] text-muted-foreground">
                Custo adicional por produto: <strong className="text-foreground">{formatCurrency(bubbleCost)}</strong> · Saldo disponível:{' '}
                <strong>{formatNumber(bubbleWrapInsumo?.stock_balance ?? 100)} un.</strong>
              </div>
            </div>
          </div>
          <Button
            type="button"
            variant="outline"
            size="xs"
            onClick={handleSelectAllFragile}
            className="border-sky-500/40 bg-background text-sky-800 dark:text-sky-200 font-bold"
          >
            ⚡ Auto-marcar {fragileCount} Frágeis (Vidros/Chaleiras)
          </Button>
        </div>

        {/* Barra de Filtros e Busca */}
        <div className="space-y-2">
          <div className="relative">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Buscar por nome do produto, SKU ou categoria..."
              className="pl-8 text-xs"
            />
          </div>

          <div className="flex flex-wrap items-center justify-between gap-1.5 text-xs">
            <div className="flex flex-wrap gap-1">
              <button
                type="button"
                onClick={() => setFilterMode('ALL')}
                className={cn(
                  'rounded-md px-2 py-0.5 text-[11px] font-semibold transition-colors',
                  filterMode === 'ALL'
                    ? 'bg-foreground text-background'
                    : 'border bg-background hover:bg-muted text-muted-foreground',
                )}
              >
                Todos ({products.length})
              </button>
              <button
                type="button"
                onClick={() => setFilterMode('FRAGILE')}
                className={cn(
                  'rounded-md px-2 py-0.5 text-[11px] font-semibold transition-colors',
                  filterMode === 'FRAGILE'
                    ? 'bg-amber-600 text-white'
                    : 'border bg-background hover:bg-muted text-amber-700 dark:text-amber-400',
                )}
              >
                Frágeis ({fragileCount})
              </button>
              <button
                type="button"
                onClick={() => setFilterMode('ACTIVE')}
                className={cn(
                  'rounded-md px-2 py-0.5 text-[11px] font-semibold transition-colors',
                  filterMode === 'ACTIVE'
                    ? 'bg-sky-600 text-white'
                    : 'border bg-background hover:bg-muted text-sky-700 dark:text-sky-400',
                )}
              >
                Com Bolha ({activeCount})
              </button>
              <button
                type="button"
                onClick={() => setFilterMode('INACTIVE')}
                className={cn(
                  'rounded-md px-2 py-0.5 text-[11px] font-semibold transition-colors',
                  filterMode === 'INACTIVE'
                    ? 'bg-muted-foreground text-background'
                    : 'border bg-background hover:bg-muted text-muted-foreground',
                )}
              >
                Sem Bolha ({products.length - activeCount})
              </button>
            </div>

            <div className="flex items-center gap-1.5 text-[11px]">
              <button
                type="button"
                onClick={handleSelectAllFiltered}
                className="font-medium text-sky-600 hover:underline dark:text-sky-400"
              >
                Marcar filtrados ({filteredProducts.length})
              </button>
              <span>·</span>
              <button
                type="button"
                onClick={handleDeselectAllFiltered}
                className="font-medium text-muted-foreground hover:underline"
              >
                Desmarcar filtrados
              </button>
            </div>
          </div>
        </div>

        {/* Lista de Produtos para Seleção */}
        <div className="max-h-80 overflow-y-auto divide-y rounded-xl border bg-background">
          {filteredProducts.length === 0 ? (
            <div className="p-6 text-center text-xs text-muted-foreground">
              Nenhum produto encontrado com os filtros atuais.
            </div>
          ) : (
            filteredProducts.map((prod) => {
              const isChecked = selectedIds.has(prod.id)
              const fragile = isLikelyFragile(prod.name, prod.category)
              const bagName = prod.linked_packaging_name ?? 'Sacola M'
              const bagUnitCost = num(prod.linked_packaging_unit_cost) > 0 ? num(prod.linked_packaging_unit_cost) : 0.28
              const totalPkgCost = round2(bagUnitCost + (isChecked ? bubbleCost : 0))

              return (
                <div
                  key={prod.id}
                  onClick={() => toggleProduct(prod.id)}
                  className={cn(
                    'flex items-center justify-between gap-3 p-2.5 text-xs transition-colors cursor-pointer select-none',
                    isChecked ? 'bg-sky-500/10 hover:bg-sky-500/15' : 'hover:bg-muted/40',
                  )}
                >
                  <div className="flex items-start gap-2.5 min-w-0">
                    <input
                      type="checkbox"
                      checked={isChecked}
                      onChange={() => {}} // handled by parent onClick
                      className="mt-0.5 size-4 rounded accent-sky-600 pointer-events-none"
                    />
                    <div className="min-w-0 space-y-0.5">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="font-semibold text-foreground truncate">{prod.name}</span>
                        {fragile && (
                          <Badge variant="outline" className="text-[9px] px-1 py-0 border-amber-500/40 text-amber-700 dark:text-amber-300">
                            Frágil
                          </Badge>
                        )}
                      </div>
                      <div className="flex items-center gap-2 text-[11px] text-muted-foreground flex-wrap">
                        {prod.sku && <span>SKU: {prod.sku}</span>}
                        {prod.category && <span>· {prod.category}</span>}
                        <span>· Env: {bagName} ({formatCurrency(bagUnitCost)})</span>
                      </div>
                    </div>
                  </div>

                  <div className="text-right shrink-0">
                    {isChecked ? (
                      <div className="space-y-0.5">
                        <span className="rounded bg-sky-600 text-white px-2 py-0.5 text-[10px] font-bold">
                          🫧 Bolha Ativo (+{formatCurrency(bubbleCost)})
                        </span>
                        <div className="text-[10px] text-muted-foreground font-mono">
                          Total emb: {formatCurrency(totalPkgCost)}
                        </div>
                      </div>
                    ) : (
                      <span className="text-[11px] text-muted-foreground font-mono">
                        {formatCurrency(bagUnitCost)}
                      </span>
                    )}
                  </div>
                </div>
              )
            })
          )}
        </div>
      </div>
    </FormDialog>
  )
}
