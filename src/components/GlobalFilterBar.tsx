'use client'

import * as React from 'react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { Search, SlidersHorizontal, X } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { NativeSelect } from '@/components/ui/native-select'
import { PERIOD_PRESETS, type PeriodPreset } from '@/lib/filters'
import { ORDER_STATUSES, TRANSACTION_STATUSES, TRANSACTION_TYPES } from '@/lib/types'
import type { Category, Channel, CostCenterNode, PaymentMethod, Product, Supplier } from '@/lib/types'
import { cn } from '@/lib/utils'

export type FilterField =
  | 'period'
  | 'centro'
  | 'categoria'
  | 'fornecedor'
  | 'canal'
  | 'produto'
  | 'pagamento'
  | 'status'
  | 'statusPedido'
  | 'tipo'
  | 'tipoMovimento'
  | 'busca'

export type FilterOptions = {
  costCenters?: CostCenterNode[]
  categories?: Category[]
  suppliers?: Supplier[]
  channels?: Channel[]
  products?: Product[]
  paymentMethods?: PaymentMethod[]
  movementTypes?: readonly string[]
}

/**
 * Barra de filtros (secoes 8 e 29). Tudo vive na URL: o estado e
 * compartilhavel, sobrevive ao refresh e o Server Component le direto de
 * searchParams -- nao existe filtro "de mentira" que so muda a tela.
 */
export function GlobalFilterBar({
  fields,
  options = {},
  searchPlaceholder = 'Buscar...',
  className,
}: {
  fields: FilterField[]
  options?: FilterOptions
  searchPlaceholder?: string
  className?: string
}) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()

  const current = React.useCallback(
    (key: string) => searchParams.get(key) ?? '',
    [searchParams],
  )

  const push = React.useCallback(
    (updates: Record<string, string | null>) => {
      const params = new URLSearchParams(searchParams.toString())
      for (const [key, value] of Object.entries(updates)) {
        if (!value) params.delete(key)
        else params.set(key, value)
      }
      // Trocar de filtro sempre volta para a primeira pagina da listagem.
      params.delete('pagina')
      const query = params.toString()
      router.push(query ? `${pathname}?${query}` : pathname, { scroll: false })
    },
    [pathname, router, searchParams],
  )

  const period = (current('period') || (current('from') || current('to') ? 'custom' : 'tudo')) as PeriodPreset
  const hasAnyFilter = [...searchParams.keys()].some((key) => key !== 'pagina')

  // Busca com debounce para nao disparar uma navegacao por tecla.
  const urlTerm = current('q')
  const [term, setTerm] = React.useState(urlTerm)
  const [syncedTerm, setSyncedTerm] = React.useState(urlTerm)

  // Quando a URL muda por fora (botao "Limpar", link com filtro pronto), o
  // campo acompanha. Ajustar estado durante o render em vez de num efeito
  // evita o render em cascata.
  if (urlTerm !== syncedTerm) {
    setSyncedTerm(urlTerm)
    setTerm(urlTerm)
  }

  React.useEffect(() => {
    if (term === urlTerm) return
    const timeout = setTimeout(() => push({ q: term || null }), 350)
    return () => clearTimeout(timeout)
  }, [term, urlTerm, push])

  return (
    <div className={cn('rounded-xl border bg-card p-3 shadow-sm', className)}>
      <div className="flex flex-wrap items-end gap-2">
        <div className="flex items-center gap-1.5 self-center pr-1 text-xs font-medium text-muted-foreground">
          <SlidersHorizontal className="size-3.5" />
          Filtros
        </div>

        {fields.includes('busca') ? (
          <Labeled label="Busca" className="min-w-[200px] flex-1">
            <div className="relative">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={term}
                onChange={(event) => setTerm(event.target.value)}
                placeholder={searchPlaceholder}
                className="h-9 pl-8"
              />
            </div>
          </Labeled>
        ) : null}

        {fields.includes('period') ? (
          <>
            <Labeled label="Per\u00edodo">
              <NativeSelect
                value={period}
                onChange={(event) => {
                  const value = event.target.value as PeriodPreset
                  push(
                    value === 'custom'
                      ? { period: 'custom' }
                      : { period: value === 'tudo' ? null : value, from: null, to: null },
                  )
                }}
              >
                {PERIOD_PRESETS.map((preset) => (
                  <option key={preset.value} value={preset.value}>
                    {preset.label}
                  </option>
                ))}
              </NativeSelect>
            </Labeled>

            {period === 'custom' ? (
              <>
                <Labeled label="De">
                  <Input
                    type="date"
                    className="h-9"
                    value={current('from')}
                    onChange={(event) => push({ period: 'custom', from: event.target.value || null })}
                  />
                </Labeled>
                <Labeled label="At\u00e9">
                  <Input
                    type="date"
                    className="h-9"
                    value={current('to')}
                    onChange={(event) => push({ period: 'custom', to: event.target.value || null })}
                  />
                </Labeled>
              </>
            ) : null}
          </>
        ) : null}

        {fields.includes('centro') && options.costCenters ? (
          <CostCenterCascade
            nodes={options.costCenters}
            value={current('centro')}
            onChange={(id) => push({ centro: id || null })}
          />
        ) : null}

        {fields.includes('categoria') && options.categories ? (
          <Labeled label="Categoria" className="min-w-[160px]">
            <NativeSelect
              value={current('categoria')}
              onChange={(event) => push({ categoria: event.target.value || null })}
            >
              <option value="">Todas</option>
              {options.categories
                .filter((category) => category.active)
                .map((category) => (
                  <option key={category.id} value={category.id}>
                    {category.name}
                  </option>
                ))}
            </NativeSelect>
          </Labeled>
        ) : null}

        {fields.includes('fornecedor') && options.suppliers ? (
          <Labeled label="Fornecedor" className="min-w-[160px]">
            <NativeSelect
              value={current('fornecedor')}
              onChange={(event) => push({ fornecedor: event.target.value || null })}
            >
              <option value="">Todos</option>
              {options.suppliers
                .filter((supplier) => supplier.active)
                .map((supplier) => (
                  <option key={supplier.id} value={supplier.id}>
                    {supplier.name}
                  </option>
                ))}
            </NativeSelect>
          </Labeled>
        ) : null}

        {fields.includes('canal') && options.channels ? (
          <Labeled label="Canal" className="min-w-[140px]">
            <NativeSelect
              value={current('canal')}
              onChange={(event) => push({ canal: event.target.value || null })}
            >
              <option value="">Todos</option>
              {options.channels
                .filter((channel) => channel.active)
                .map((channel) => (
                  <option key={channel.id} value={channel.id}>
                    {channel.name}
                  </option>
                ))}
            </NativeSelect>
          </Labeled>
        ) : null}

        {fields.includes('produto') && options.products ? (
          <Labeled label="Produto" className="min-w-[160px]">
            <NativeSelect
              value={current('produto')}
              onChange={(event) => push({ produto: event.target.value || null })}
            >
              <option value="">Todos</option>
              {options.products
                .filter((product) => product.active)
                .map((product) => (
                  <option key={product.id} value={product.id}>
                    {product.name}
                  </option>
                ))}
            </NativeSelect>
          </Labeled>
        ) : null}

        {fields.includes('pagamento') && options.paymentMethods ? (
          <Labeled label="Pagamento" className="min-w-[150px]">
            <NativeSelect
              value={current('pagamento')}
              onChange={(event) => push({ pagamento: event.target.value || null })}
            >
              <option value="">Todas</option>
              {options.paymentMethods
                .filter((method) => method.active)
                .map((method) => (
                  <option key={method.id} value={method.id}>
                    {method.name}
                  </option>
                ))}
            </NativeSelect>
          </Labeled>
        ) : null}

        {fields.includes('tipo') ? (
          <Labeled label="Tipo" className="min-w-[130px]">
            <NativeSelect
              value={current('tipo')}
              onChange={(event) => push({ tipo: event.target.value || null })}
            >
              <option value="">Todos</option>
              {TRANSACTION_TYPES.map((type) => (
                <option key={type} value={type}>
                  {type}
                </option>
              ))}
            </NativeSelect>
          </Labeled>
        ) : null}

        {fields.includes('tipoMovimento') ? (
          <Labeled label="Tipo" className="min-w-[140px]">
            <NativeSelect
              value={current('tipo')}
              onChange={(event) => push({ tipo: event.target.value || null })}
            >
              <option value="">Todos</option>
              {(options.movementTypes ?? []).map((type) => (
                <option key={type} value={type}>
                  {type}
                </option>
              ))}
            </NativeSelect>
          </Labeled>
        ) : null}

        {fields.includes('status') ? (
          <Labeled label="Status" className="min-w-[130px]">
            <NativeSelect
              value={current('status')}
              onChange={(event) => push({ status: event.target.value || null })}
            >
              <option value="">Todos</option>
              {TRANSACTION_STATUSES.map((status) => (
                <option key={status} value={status}>
                  {status}
                </option>
              ))}
            </NativeSelect>
          </Labeled>
        ) : null}

        {fields.includes('statusPedido') ? (
          <Labeled label="Status" className="min-w-[130px]">
            <NativeSelect
              value={current('status')}
              onChange={(event) => push({ status: event.target.value || null })}
            >
              <option value="">Todos</option>
              {ORDER_STATUSES.map((status) => (
                <option key={status} value={status}>
                  {status}
                </option>
              ))}
            </NativeSelect>
          </Labeled>
        ) : null}

        {hasAnyFilter ? (
          <Button
            variant="ghost"
            size="sm"
            className="self-end"
            onClick={() => router.push(pathname, { scroll: false })}
          >
            <X /> Limpar
          </Button>
        ) : null}
      </div>
    </div>
  )
}

function Labeled({
  label,
  children,
  className,
}: {
  label: string
  children: React.ReactNode
  className?: string
}) {
  return (
    <label className={cn('flex flex-col gap-1', className)}>
      <span className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
        {label}
      </span>
      {children}
    </label>
  )
}

/**
 * Seletor de centro de custo em cascata.
 *
 * Primeiro dropdown: apenas centros raiz (depth === 1).
 * Segundo dropdown: filhos diretos do centro raiz selecionado.
 *
 * - Se o usuario seleciona apenas o pai, o filtro aplica na subtree inteira.
 * - Se seleciona um filho, filtra especificamente naquele filho.
 */
function CostCenterCascade({
  nodes,
  value,
  onChange,
}: {
  nodes: CostCenterNode[]
  value: string
  onChange: (id: string) => void
}) {
  const activeNodes = nodes.filter((n) => n.path_active)
  const roots = activeNodes.filter((n) => n.depth === 1)

  // Descobrir qual raiz esta selecionada (pode ser o proprio root ou um filho dele)
  const selectedNode = activeNodes.find((n) => n.id === value)
  const selectedRootId = selectedNode?.root_id ?? ''

  // Filhos diretos do root selecionado (depth === 2 e parent_id === rootId)
  const children = selectedRootId
    ? activeNodes.filter((n) => n.parent_id === selectedRootId)
    : []

  // O valor do segundo dropdown: se o valor atual NAO eh o root, eh um filho
  const childValue = value && value !== selectedRootId ? value : ''

  return (
    <>
      <Labeled label="Centro de custo" className="min-w-[180px]">
        <NativeSelect
          value={selectedRootId}
          onChange={(event) => {
            // Ao trocar o pai, seleciona a raiz (subtree inteira)
            onChange(event.target.value)
          }}
        >
          <option value="">Todos</option>
          {roots.map((node) => (
            <option key={node.id} value={node.id}>
              {node.name}
            </option>
          ))}
        </NativeSelect>
      </Labeled>

      {children.length > 0 && (
        <Labeled label="Subcentro" className="min-w-[180px]">
          <NativeSelect
            value={childValue}
            onChange={(event) => {
              // Se limpar, volta pro pai (subtree inteira)
              onChange(event.target.value || selectedRootId)
            }}
          >
            <option value="">Todos de {roots.find((r) => r.id === selectedRootId)?.name}</option>
            {children.map((node) => (
              <option key={node.id} value={node.id}>
                {node.name}
              </option>
            ))}
          </NativeSelect>
        </Labeled>
      )}
    </>
  )
}
