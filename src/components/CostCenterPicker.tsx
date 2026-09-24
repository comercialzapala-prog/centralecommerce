'use client'

import * as React from 'react'
import { Check, ChevronsUpDown, X } from 'lucide-react'

import {
  Command,
  CommandEmpty,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { normalize } from '@/lib/cost-centers'
import type { CostCenterNode } from '@/lib/types'
import { cn } from '@/lib/utils'

/**
 * Seletor hierarquico de centro de custo (secao 37).
 *
 * O usuario clica direto em "Sacolas"; o sistema grava apenas
 * `cost_center_id` e a hierarquia inteira vem do parent_id (secao 38).
 * A busca casa contra o caminho completo, entao digitar "expedicao" acha
 * todos os filhos de Expedicao.
 */
export function CostCenterPicker({
  name,
  nodes,
  defaultValue = null,
  placeholder = 'Selecione o centro de custo',
  required,
  allowClear = true,
  id,
}: {
  name: string
  nodes: CostCenterNode[]
  defaultValue?: string | null
  placeholder?: string
  required?: boolean
  allowClear?: boolean
  id?: string
}) {
  const [open, setOpen] = React.useState(false)
  const [value, setValue] = React.useState<string | null>(defaultValue)

  // Inativos ficam fora da lista, exceto o que ja estava selecionado.
  const options = React.useMemo(
    () => nodes.filter((node) => node.path_active || node.id === defaultValue),
    [nodes, defaultValue],
  )

  const selected = React.useMemo(
    () => options.find((node) => node.id === value) ?? null,
    [options, value],
  )

  return (
    <div>
      <input type="hidden" name={name} value={value ?? ''} />
      {/* Guarda a obrigatoriedade sem depender do JS do Popover. */}
      {required && !value ? (
        <input
          type="text"
          required
          tabIndex={-1}
          aria-hidden="true"
          value=""
          onChange={() => {}}
          className="pointer-events-none absolute size-0 opacity-0"
        />
      ) : null}

      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger
          id={id}
          className={cn(
            'flex h-9 w-full items-center justify-between gap-2 rounded-lg border border-input bg-transparent px-2.5 text-left text-sm outline-none transition-colors',
            'focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50',
            'dark:bg-input/30',
          )}
        >
          {selected ? (
            <span className="flex min-w-0 flex-col leading-tight">
              <span className="truncate font-medium">{selected.name}</span>
              {selected.depth > 1 ? (
                <span className="truncate text-[11px] text-muted-foreground">{selected.path}</span>
              ) : null}
            </span>
          ) : (
            <span className="truncate text-muted-foreground">{placeholder}</span>
          )}
          <span className="flex shrink-0 items-center gap-1">
            {allowClear && selected ? (
              <span
                role="button"
                tabIndex={0}
                aria-label="Limpar centro de custo"
                onClick={(event) => {
                  event.preventDefault()
                  event.stopPropagation()
                  setValue(null)
                }}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault()
                    event.stopPropagation()
                    setValue(null)
                  }
                }}
                className="rounded p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground"
              >
                <X className="size-3.5" />
              </span>
            ) : null}
            <ChevronsUpDown className="size-3.5 text-muted-foreground" />
          </span>
        </PopoverTrigger>

        <PopoverContent align="start" className="w-(--anchor-width) min-w-[280px] p-0">
          <Command
            filter={(itemValue, search) => {
              if (!search) return 1
              return normalize(itemValue).includes(normalize(search)) ? 1 : 0
            }}
          >
            <CommandInput placeholder="Buscar centro ou subcentro..." />
            <CommandList className="max-h-72">
              <CommandEmpty>Nenhum centro encontrado.</CommandEmpty>
              {options.map((node) => (
                <CommandItem
                  key={node.id}
                  value={node.path}
                  onSelect={() => {
                    setValue(node.id)
                    setOpen(false)
                  }}
                  className="gap-2"
                >
                  <span
                    className="flex min-w-0 flex-1 items-center gap-2"
                    style={{ paddingLeft: `${(node.depth - 1) * 14}px` }}
                  >
                    {node.depth > 1 ? (
                      <span aria-hidden="true" className="text-muted-foreground">
                        └
                      </span>
                    ) : null}
                    <span className={cn('truncate', node.depth === 1 && 'font-medium')}>
                      {node.name}
                    </span>
                  </span>
                  {node.id === value ? <Check className="size-4 shrink-0" /> : null}
                </CommandItem>
              ))}
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
    </div>
  )
}
