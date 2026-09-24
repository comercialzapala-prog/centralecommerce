import type { CostCenterNode, CostCenterReportRow } from '@/lib/types'

/** Montagem e navegacao da arvore de centros de custo (niveis ilimitados). */

type HasParent = { parent_id: string | null }

export type TreeNode<T> = T & { children: TreeNode<T>[] }

/**
 * Transforma a lista plana em arvore. Nos orfaos (pai inativo/removido do
 * recorte) sobem para a raiz em vez de sumir da tela.
 */
export function buildTree<T extends HasParent>(
  rows: T[],
  getId: (row: T) => string,
): TreeNode<T>[] {
  const nodes = new Map<string, TreeNode<T>>()
  for (const row of rows) {
    nodes.set(getId(row), { ...row, children: [] })
  }

  const roots: TreeNode<T>[] = []
  for (const row of rows) {
    const node = nodes.get(getId(row))!
    const parent = row.parent_id ? nodes.get(row.parent_id) : undefined
    if (parent) parent.children.push(node)
    else roots.push(node)
  }

  return roots
}

export function buildReportTree(rows: CostCenterReportRow[]): TreeNode<CostCenterReportRow>[] {
  return buildTree(rows, (row) => row.cost_center_id)
}

export function buildHierarchyTree(rows: CostCenterNode[]): TreeNode<CostCenterNode>[] {
  return buildTree(rows, (row) => row.id)
}

/** Percorre a arvore em profundidade, mantendo a ordem visual. */
export function flattenTree<T>(nodes: TreeNode<T>[]): T[] {
  const out: T[] = []
  const walk = (list: TreeNode<T>[]) => {
    for (const node of list) {
      out.push(node)
      walk(node.children)
    }
  }
  walk(nodes)
  return out
}

/**
 * Filtra a arvore por texto. Um no e mantido quando ele casa OU quando algum
 * descendente casa -- assim a busca por "sacola" continua mostrando o caminho
 * Operacao Logistica > Expedicao > Sacolas.
 */
export function filterTree<T>(
  nodes: TreeNode<T>[],
  matches: (node: T) => boolean,
): TreeNode<T>[] {
  const out: TreeNode<T>[] = []

  for (const node of nodes) {
    const children = filterTree(node.children, matches)
    if (children.length > 0 || matches(node)) {
      out.push({ ...node, children })
    }
  }

  return out
}

/** Todos os ids do no e dos seus descendentes (base do drill-down). */
export function collectSubtreeIds<T>(node: TreeNode<T>, getId: (row: T) => string): string[] {
  const ids: string[] = [getId(node)]
  for (const child of node.children) {
    ids.push(...collectSubtreeIds(child, getId))
  }
  return ids
}

export function findNode<T>(
  nodes: TreeNode<T>[],
  predicate: (node: T) => boolean,
): TreeNode<T> | null {
  for (const node of nodes) {
    if (predicate(node)) return node
    const found = findNode(node.children, predicate)
    if (found) return found
  }
  return null
}

/** "Operação Logística > Expedição > Sacolas" -> ["Operação Logística", ...]. */
export function splitPath(path: string | null | undefined): string[] {
  if (!path) return []
  return path.split('>').map((part) => part.trim()).filter(Boolean)
}

/** Comparacao sem acento e sem caixa: "Logística" casa com "logistica". */
export function normalize(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .trim()
}
