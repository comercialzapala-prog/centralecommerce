import { ErpError } from '@/integrations/erp/errors'
import type {
  ErpOrder,
  ErpOrderItem,
  ErpProduct,
  ErpProductSupplier,
  ErpStock,
  ErpSupplier,
  ErpWarehouse,
} from '@/integrations/erp/types'

/**
 * TRADUCAO PAYLOAD DO BLING -> TIPOS DA CENTRAL (secao 1)
 *
 * ================== LEIA ANTES DE LIGAR A INTEGRACAO ==================
 * Os NOMES DE CAMPO abaixo NAO estao confirmados: nao temos a conta e portanto
 * nao vimos um payload real. Por isso este mapper foi escrito para FALHAR ALTO:
 * quando o campo obrigatorio nao aparece com nenhum dos nomes tentados, ele
 * levanta ErpError em vez de devolver null.
 *
 * Isso e deliberado. Um mapper permissivo transformaria "nao entendi o payload"
 * em "produto sem custo" e o auditor passaria a acusar problema de cadastro que
 * na verdade e bug nosso -- exatamente o tipo de inconsistencia silenciosa que a
 * secao 40 proibe.
 *
 * Na Fase B: pegue um payload real de cada recurso, ajuste as listas de nomes em
 * FIELDS e rode os testes de mapeamento. Nenhum outro arquivo precisa mudar.
 * ======================================================================
 *
 * O que JA e definitivo aqui (independe do nome do campo): a normalizacao. Todo
 * dinheiro vira number finito, todo texto vazio vira null, todo booleano tolera
 * 0/1/"S"/"N", e o que nao da para interpretar vira null em vez de NaN.
 */

/* -------------------------------------------------------------------------- */
/* Coercao                                                                     */
/* -------------------------------------------------------------------------- */

type Raw = Record<string, unknown>

function asRecord(value: unknown, what: string): Raw {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new ErpError('UNKNOWN', `Payload de ${what} nao e um objeto.`)
  }
  return value as Raw
}

/** Primeiro nome de campo presente. `null` quando nenhum existe. */
function pick(raw: Raw, keys: readonly string[]): unknown {
  for (const key of keys) {
    const value = raw[key]
    if (value !== undefined && value !== null) return value
  }
  return null
}

function toStringOrNull(value: unknown): string | null {
  if (typeof value === 'string') {
    const trimmed = value.trim()
    return trimmed === '' ? null : trimmed
  }
  if (typeof value === 'number' && Number.isFinite(value)) return String(value)
  return null
}

function toNumberOrNull(value: unknown): number | null {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null
  if (typeof value === 'string') {
    const trimmed = value.trim()
    if (!trimmed) return null
    // Dinheiro pode chegar como "1.234,56" ou "1234.56".
    const normalized =
      trimmed.lastIndexOf(',') > trimmed.lastIndexOf('.')
        ? trimmed.replace(/\./g, '').replace(',', '.')
        : trimmed.replace(/,/g, '')
    const parsed = Number(normalized)
    return Number.isFinite(parsed) ? parsed : null
  }
  return null
}

function toNumber(value: unknown, fallback = 0): number {
  return toNumberOrNull(value) ?? fallback
}

function toBoolean(value: unknown, fallback: boolean): boolean {
  if (typeof value === 'boolean') return value
  if (typeof value === 'number') return value !== 0
  if (typeof value === 'string') {
    const normalized = value.trim().toUpperCase()
    if (['S', 'SIM', 'A', 'ATIVO', 'TRUE', '1', 'Y', 'YES'].includes(normalized)) return true
    if (['N', 'NAO', 'NÃO', 'I', 'INATIVO', 'FALSE', '0'].includes(normalized)) return false
  }
  return fallback
}

/** Data em ISO. Aceita "YYYY-MM-DD" e datetime; recusa o resto. */
function toIsoDateOrNull(value: unknown): string | null {
  const text = toStringOrNull(value)
  if (!text) return null
  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) return text
  const parsed = Date.parse(text)
  return Number.isNaN(parsed) ? null : new Date(parsed).toISOString()
}

function requireString(raw: Raw, keys: readonly string[], what: string): string {
  const value = toStringOrNull(pick(raw, keys))
  if (!value) {
    throw new ErpError('UNKNOWN', `Campo obrigatorio ausente no payload de ${what}: ${keys[0]}.`, {
      details: { triedKeys: keys, availableKeys: Object.keys(raw) },
    })
  }
  return value
}

/* -------------------------------------------------------------------------- */
/* Nomes de campo -- CONFIRMAR NA FASE B                                       */
/* -------------------------------------------------------------------------- */

const FIELDS = {
  product: {
    id: ['id', 'idProduto'],
    sku: ['codigo', 'sku'],
    name: ['nome', 'descricao'],
    price: ['preco', 'precoVenda'],
    cost: ['precoCusto', 'custo'],
    active: ['situacao', 'ativo'],
    ncm: ['ncm'],
    gtin: ['gtin', 'ean'],
    weight: ['pesoLiquido', 'peso'],
    length: ['comprimento'],
    width: ['largura'],
    height: ['altura'],
    unit: ['unidade'],
    brand: ['marca'],
    parentId: ['idProdutoPai', 'produtoPai'],
    updatedAt: ['dataAlteracao', 'updatedAt'],
  },
  stock: {
    productId: ['idProduto', 'produtoId'],
    warehouseId: ['idDeposito', 'depositoId'],
    warehouseName: ['deposito', 'nomeDeposito'],
    physical: ['saldoFisico', 'saldoFisicoTotal'],
    virtual: ['saldoVirtual', 'saldoVirtualTotal'],
    reserved: ['reservado', 'saldoReservado'],
    updatedAt: ['dataAlteracao', 'updatedAt'],
  },
  order: {
    id: ['id', 'idPedido'],
    number: ['numero'],
    date: ['data', 'dataPedido'],
    status: ['situacao'],
    channel: ['loja', 'canal'],
    customer: ['contato', 'cliente'],
    customerName: ['nome', 'razaoSocial'],
    gross: ['valorProdutos', 'totalProdutos'],
    discount: ['desconto', 'valorDesconto'],
    shipping: ['valorFrete', 'frete'],
    total: ['total', 'valorTotal'],
    items: ['itens', 'items'],
    updatedAt: ['dataAlteracao', 'updatedAt'],
  },
  orderItem: {
    productId: ['idProduto', 'produtoId'],
    sku: ['codigo', 'sku'],
    description: ['descricao', 'nome'],
    quantity: ['quantidade'],
    unitPrice: ['valor', 'valorUnitario', 'preco'],
    unitCost: ['precoCusto', 'custo'],
  },
  supplier: {
    id: ['id', 'idContato'],
    name: ['nome', 'razaoSocial'],
    document: ['numeroDocumento', 'cnpj', 'cpfCnpj'],
    email: ['email'],
    phone: ['telefone', 'celular'],
    active: ['situacao', 'ativo'],
  },
  productSupplier: {
    productId: ['idProduto', 'produtoId'],
    supplierId: ['idFornecedor', 'fornecedorId'],
    supplierSku: ['codigoNoFornecedor', 'codigo'],
    cost: ['precoCusto', 'custo'],
    leadTime: ['prazoEntrega', 'leadTime'],
    primary: ['padrao', 'principal'],
  },
  warehouse: {
    id: ['id', 'idDeposito'],
    name: ['nome', 'descricao'],
    active: ['situacao', 'ativo'],
    standard: ['padrao'],
  },
} as const

/* -------------------------------------------------------------------------- */
/* Mapeadores                                                                  */
/* -------------------------------------------------------------------------- */

export function mapProduct(input: unknown): ErpProduct {
  const raw = asRecord(input, 'produto')
  const f = FIELDS.product

  const length = toNumberOrNull(pick(raw, f.length))
  const width = toNumberOrNull(pick(raw, f.width))
  const height = toNumberOrNull(pick(raw, f.height))

  return {
    externalId: requireString(raw, f.id, 'produto'),
    sku: toStringOrNull(pick(raw, f.sku)),
    name: requireString(raw, f.name, 'produto'),
    price: toNumberOrNull(pick(raw, f.price)),
    cost: toNumberOrNull(pick(raw, f.cost)),
    active: toBoolean(pick(raw, f.active), true),
    ncm: toStringOrNull(pick(raw, f.ncm)),
    gtin: toStringOrNull(pick(raw, f.gtin)),
    weightKg: toNumberOrNull(pick(raw, f.weight)),
    // Dimensao pela metade nao serve para calcular cubagem: ou vem completa ou e null.
    dimensions:
      length === null && width === null && height === null
        ? null
        : { lengthCm: length, widthCm: width, heightCm: height },
    unit: toStringOrNull(pick(raw, f.unit)),
    brand: toStringOrNull(pick(raw, f.brand)),
    parentExternalId: toStringOrNull(pick(raw, f.parentId)),
    updatedAt: toIsoDateOrNull(pick(raw, f.updatedAt)),
  }
}

/**
 * Saldo.
 *
 * `source` NAO e lido do payload: o Bling e a fonte do estoque LOCAL e nada
 * mais (secao 22). Full do Mercado Livre entra por outra integracao e nunca
 * deve nascer daqui, nem por deposito com nome parecido.
 */
export function mapStock(input: unknown): ErpStock {
  const raw = asRecord(input, 'estoque')
  const f = FIELDS.stock

  const physical = toNumber(pick(raw, f.physical))
  const virtual = toNumberOrNull(pick(raw, f.virtual))
  const reserved = toNumberOrNull(pick(raw, f.reserved))

  return {
    productExternalId: requireString(raw, f.productId, 'estoque'),
    source: 'LOCAL',
    warehouseExternalId: toStringOrNull(pick(raw, f.warehouseId)),
    warehouseName: toStringOrNull(pick(raw, f.warehouseName)),
    physicalQuantity: physical,
    // Sem saldo virtual informado, o disponivel e o fisico menos a reserva --
    // nunca o fisico puro, que mentiria sobre o que da para vender (secao 21).
    virtualQuantity: virtual ?? physical - (reserved ?? 0),
    reservedQuantity: reserved ?? (virtual !== null ? Math.max(physical - virtual, 0) : 0),
    updatedAt: toIsoDateOrNull(pick(raw, f.updatedAt)),
  }
}

export function mapOrderItem(input: unknown): ErpOrderItem {
  const raw = asRecord(input, 'item de pedido')
  const f = FIELDS.orderItem

  return {
    productExternalId: toStringOrNull(pick(raw, f.productId)),
    sku: toStringOrNull(pick(raw, f.sku)),
    description: toStringOrNull(pick(raw, f.description)) ?? 'Item sem descrição',
    quantity: toNumber(pick(raw, f.quantity)),
    unitPrice: toNumber(pick(raw, f.unitPrice)),
    unitCost: toNumberOrNull(pick(raw, f.unitCost)),
  }
}

export function mapOrder(input: unknown): ErpOrder {
  const raw = asRecord(input, 'pedido')
  const f = FIELDS.order

  const rawItems = pick(raw, f.items)
  const items = Array.isArray(rawItems) ? rawItems.map(mapOrderItem) : []

  const gross = toNumberOrNull(pick(raw, f.gross))
  const discount = toNumber(pick(raw, f.discount))
  const shipping = toNumber(pick(raw, f.shipping))
  const total = toNumberOrNull(pick(raw, f.total))

  // Sem o bruto no payload, soma os itens: e o unico bruto defensavel.
  const grossAmount = gross ?? items.reduce((sum, item) => sum + item.quantity * item.unitPrice, 0)

  const customer = pick(raw, f.customer)
  const customerName =
    customer !== null && typeof customer === 'object'
      ? toStringOrNull(pick(customer as Raw, f.customerName))
      : toStringOrNull(customer)

  const channel = pick(raw, f.channel)
  const channelName =
    channel !== null && typeof channel === 'object'
      ? toStringOrNull(pick(channel as Raw, ['nome', 'descricao']))
      : toStringOrNull(channel)

  return {
    externalId: requireString(raw, f.id, 'pedido'),
    number: toStringOrNull(pick(raw, f.number)) ?? requireString(raw, f.id, 'pedido'),
    date: toIsoDateOrNull(pick(raw, f.date))?.slice(0, 10) ?? '',
    status: toStringOrNull(pick(raw, f.status)) ?? 'DESCONHECIDO',
    channelName,
    customerName,
    grossAmount,
    discountAmount: discount,
    shippingCharged: shipping,
    totalAmount: total ?? grossAmount - discount + shipping,
    items,
    updatedAt: toIsoDateOrNull(pick(raw, f.updatedAt)),
  }
}

export function mapSupplier(input: unknown): ErpSupplier {
  const raw = asRecord(input, 'fornecedor')
  const f = FIELDS.supplier

  return {
    externalId: requireString(raw, f.id, 'fornecedor'),
    name: requireString(raw, f.name, 'fornecedor'),
    document: toStringOrNull(pick(raw, f.document)),
    email: toStringOrNull(pick(raw, f.email)),
    phone: toStringOrNull(pick(raw, f.phone)),
    active: toBoolean(pick(raw, f.active), true),
  }
}

export function mapProductSupplier(input: unknown): ErpProductSupplier {
  const raw = asRecord(input, 'fornecedor do produto')
  const f = FIELDS.productSupplier

  return {
    productExternalId: requireString(raw, f.productId, 'fornecedor do produto'),
    supplierExternalId: requireString(raw, f.supplierId, 'fornecedor do produto'),
    supplierSku: toStringOrNull(pick(raw, f.supplierSku)),
    cost: toNumberOrNull(pick(raw, f.cost)),
    leadTimeDays: toNumberOrNull(pick(raw, f.leadTime)),
    primary: toBoolean(pick(raw, f.primary), false),
  }
}

export function mapWarehouse(input: unknown): ErpWarehouse {
  const raw = asRecord(input, 'deposito')
  const f = FIELDS.warehouse

  return {
    externalId: requireString(raw, f.id, 'deposito'),
    name: requireString(raw, f.name, 'deposito'),
    active: toBoolean(pick(raw, f.active), true),
    // O ERP nao diz se o deposito e de marketplace. Classificar por heuristica de
    // nome seria chute: fica UNKNOWN e quem decide e o vinculo em product_channels.
    kind: 'UNKNOWN',
  }
}

/**
 * Extrai a lista de uma resposta paginada.
 * Aceita `{ data: [...] }` e array direto; qualquer outra forma e erro explicito.
 */
export function extractList(payload: unknown, what: string): unknown[] {
  if (Array.isArray(payload)) return payload

  if (payload !== null && typeof payload === 'object') {
    const data = (payload as Raw).data ?? (payload as Raw).retorno
    if (Array.isArray(data)) return data
  }

  throw new ErpError('UNKNOWN', `Resposta de ${what} nao contem lista reconhecivel.`, {
    details: { receivedType: typeof payload },
  })
}

/** Extrai o objeto unico de uma resposta de detalhe. */
export function extractOne(payload: unknown): unknown | null {
  if (payload === null || typeof payload !== 'object') return null

  const data = (payload as Raw).data
  if (Array.isArray(data)) return data[0] ?? null
  if (data !== undefined && data !== null) return data

  return payload
}

export const mapperInternals = {
  toNumberOrNull,
  toBoolean,
  toIsoDateOrNull,
  toStringOrNull,
}
