'use client'

import * as React from 'react'
import Link from 'next/link'
import { ChevronDown, ChevronRight, Eye, EyeOff, Pencil, Plus, Search } from 'lucide-react'

import { Field } from '@/components/FormControls'
import { ConfirmActionButton, FormDialog } from '@/components/FormDialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { NativeSelect } from '@/components/ui/native-select'
import { buildReportTree, filterTree, normalize, type TreeNode } from '@/lib/cost-centers'
import { formatCurrency, num } from '@/lib/format'
import type { CostCenterReportRow } from '@/lib/types'
import { cn } from '@/lib/utils'

import { createCostCenter, setCostCenterActive, updateCostCenter } from './actions'

type Row = CostCenterReportRow

/**
 * Arvore de centros de custo (secoes 5 e 7).
 *
 * Cada linha mostra o total DA SUBARVORE (rollup) -- e isso que faz
 * "Sacolas R$ 500" virar "Expedicao R$ 500" e "Operacao Logistica R$ 500"
 * sem lancar nada duas vezes.
 */
export function CostCenterTree({ rows }: { rows: Row[] }) {
  const [term, setTerm] = React.useState('')
  const [collapsed, setCollapsed] = React.useState<Set<string>>(() => new Set())
  const [showInactive, setShowInactive] = React.useState(false)

  const visibleRows = React.useMemo(
    () => (showInactive ? rows : rows.filter((row) => row.active)),
    [rows, showInactive],
  )

  const tree = React.useMemo(() => {
    const full = buildReportTree(visibleRows)
    if (!term.trim()) return full
    const needle = normalize(term)
    return filterTree(full, (node) => normalize(node.path).includes(needle))
  }, [visibleRows, term])

  const searching = term.trim().length > 0

  const toggle = (id: string) => {
    setCollapsed((current) => {
      const next = new Set(current)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-[220px] flex-1">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={term}
            onChange={(event) => setTerm(event.target.value)}
            placeholder="Buscar centro ou subcentro (ex.: sacola)"
            className="h-9 pl-8"
          />
        </div>

        <Button
          variant="outline"
          size="sm"
          onClick={() => setShowInactive((value) => !value)}
        >
          {showInactive ? <EyeOff /> : <Eye />}
          {showInactive ? 'Ocultar inativos' : 'Mostrar inativos'}
        </Button>

        <NewCostCenterButton rows={rows} />
      </div>

      <div className="rounded-xl border bg-card">
        {tree.length === 0 ? (
          <p className="p-8 text-center text-sm text-muted-foreground">
            {searching
              ? `Nenhum centro de custo encontrado para “${term}”.`
              : 'Nenhum centro de custo cadastrado ainda.'}
          </p>
        ) : (
          <ul className="divide-y">
            {tree.map((node) => (
              <TreeRow
                key={node.cost_center_id}
                node={node}
                rows={rows}
                collapsed={collapsed}
                toggle={toggle}
                forceOpen={searching}
              />
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}

function TreeRow({
  node,
  rows,
  collapsed,
  toggle,
  forceOpen,
}: {
  node: TreeNode<Row>
  rows: Row[]
  collapsed: Set<string>
  toggle: (id: string) => void
  forceOpen: boolean
}) {
  const hasChildren = node.children.length > 0
  const isOpen = forceOpen || !collapsed.has(node.cost_center_id)
  const rollup = num(node.rollup_total)
  const direct = num(node.direct_total)

  return (
    <li>
      <div
        className={cn(
          'group flex items-center gap-2 px-2 py-2 transition-colors hover:bg-muted/50',
          !node.active && 'opacity-55',
        )}
        style={{ paddingLeft: `${8 + (node.depth - 1) * 20}px` }}
      >
        {hasChildren ? (
          <button
            type="button"
            onClick={() => toggle(node.cost_center_id)}
            aria-label={isOpen ? 'Recolher' : 'Expandir'}
            aria-expanded={isOpen}
            className="flex size-5 shrink-0 items-center justify-center rounded text-muted-foreground hover:bg-muted"
          >
            {isOpen ? <ChevronDown className="size-4" /> : <ChevronRight className="size-4" />}
          </button>
        ) : (
          <span className="size-5 shrink-0" />
        )}

        <Link
          href={`/centros-de-custo/${node.cost_center_id}`}
          className="min-w-0 flex-1 truncate text-sm hover:underline"
        >
          <span className={cn(node.depth === 1 && 'font-medium')}>{node.cost_center_name}</span>
          {!node.active ? (
            <span className="ml-2 rounded bg-muted px-1.5 py-0.5 text-[10px] uppercase text-muted-foreground">
              inativo
            </span>
          ) : null}
        </Link>

        <div className="flex shrink-0 items-center gap-3">
          <div className="text-right">
            <div className="text-sm font-medium tabular-nums">{formatCurrency(rollup)}</div>
            {hasChildren && direct !== 0 ? (
              <div className="text-[11px] text-muted-foreground tabular-nums">
                próprio: {formatCurrency(direct)}
              </div>
            ) : null}
          </div>

          <div className="flex items-center opacity-0 transition-opacity focus-within:opacity-100 group-hover:opacity-100">
            <NewCostCenterButton
              rows={rows}
              parentId={node.cost_center_id}
              parentName={node.path}
              compact
            />
            <EditCostCenterButton node={node} rows={rows} />
            <ConfirmActionButton
              action={setCostCenterActive}
              fields={{ id: node.cost_center_id, active: node.active ? 'false' : 'true' }}
              label=""
              icon={node.active ? <EyeOff /> : <Eye />}
              size="icon-sm"
              confirmMessage={
                node.active
                  ? `Desativar "${node.cost_center_name}" e todos os subcentros? O histórico é preservado.`
                  : `Reativar "${node.cost_center_name}"?`
              }
            />
          </div>
        </div>
      </div>

      {hasChildren && isOpen ? (
        <ul>
          {node.children.map((child) => (
            <TreeRow
              key={child.cost_center_id}
              node={child}
              rows={rows}
              collapsed={collapsed}
              toggle={toggle}
              forceOpen={forceOpen}
            />
          ))}
        </ul>
      ) : null}
    </li>
  )
}

/** Secao 6: nome + centro pai. Sem pai informado, nasce como centro raiz. */
function NewCostCenterButton({
  rows,
  parentId,
  parentName,
  compact,
}: {
  rows: Row[]
  parentId?: string
  parentName?: string
  compact?: boolean
}) {
  return (
    <FormDialog
      trigger={
        compact ? (
          <Button variant="ghost" size="icon-sm" aria-label="Novo subcentro">
            <Plus />
          </Button>
        ) : (
          <Button size="sm">
            <Plus /> Novo centro
          </Button>
        )
      }
      title={parentName ? `Novo subcentro em ${parentName}` : 'Novo centro de custo'}
      description={
        parentName
          ? undefined
          : 'Sem centro pai, ele nasce como centro raiz. Com um pai, vira subcentro.'
      }
      action={createCostCenter}
      submitLabel="Criar"
    >
      <Field label="Nome" htmlFor="cc-name">
        <Input id="cc-name" name="name" required autoFocus placeholder="Ex.: Sacolas" />
      </Field>

      <Field label="Centro pai">
        <ParentSelect rows={rows} defaultValue={parentId ?? ''} />
      </Field>
    </FormDialog>
  )
}

function EditCostCenterButton({ node, rows }: { node: Row; rows: Row[] }) {
  // Impede escolher a propria subarvore como pai (o banco tambem barra).
  const invalidParents = React.useMemo(() => {
    const blocked = new Set<string>([node.cost_center_id])
    let changed = true
    while (changed) {
      changed = false
      for (const row of rows) {
        if (row.parent_id && blocked.has(row.parent_id) && !blocked.has(row.cost_center_id)) {
          blocked.add(row.cost_center_id)
          changed = true
        }
      }
    }
    return blocked
  }, [node.cost_center_id, rows])

  return (
    <FormDialog
      trigger={
        <Button variant="ghost" size="icon-sm" aria-label="Editar centro">
          <Pencil />
        </Button>
      }
      title={`Editar ${node.cost_center_name}`}
      action={updateCostCenter}
    >
      <input type="hidden" name="id" value={node.cost_center_id} />

      <Field label="Nome" htmlFor="cc-edit-name">
        <Input id="cc-edit-name" name="name" required defaultValue={node.cost_center_name} />
      </Field>

      <Field label="Centro pai" hint="Mover para a raiz deixa este centro no topo da árvore.">
        <ParentSelect
          rows={rows.filter((row) => !invalidParents.has(row.cost_center_id))}
          defaultValue={node.parent_id ?? ''}
        />
      </Field>
    </FormDialog>
  )
}

function ParentSelect({ rows, defaultValue }: { rows: Row[]; defaultValue: string }) {
  return (
    <NativeSelect name="parent_id" defaultValue={defaultValue}>
      <option value="">Nenhum (centro raiz)</option>
      {rows
        .filter((row) => row.active)
        .map((row) => (
          <option key={row.cost_center_id} value={row.cost_center_id}>
            {`${'  '.repeat(Math.max(row.depth - 1, 0))}${row.depth > 1 ? '└ ' : ''}${row.cost_center_name}`}
          </option>
        ))}
    </NativeSelect>
  )
}
