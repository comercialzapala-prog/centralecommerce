import 'server-only'

import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto'

import { IntegrationService } from '@/integrations/erp/service'
import { createAdminClient } from '@/lib/supabase/admin'

const OLIST_API_BASE = 'https://api.tiny.com.br/api2'
const OLIST_CONFIG_EXTERNAL_ID = 'OLIST_CONFIG'

export type OlistStoredConfig = {
  token_encrypted?: string | null
  masked_token?: string | null
  account_name?: string | null
  account_cnpj?: string | null
  auto_sync_orders?: boolean
  create_missing_products?: boolean
  webhook_secret?: string | null
  last_order_sync_at?: string | null
  last_product_sync_at?: string | null
  last_sync_summary?: {
    type: 'ORDERS' | 'PRODUCTS' | 'WEBHOOK'
    at: string
    imported: number
    updated: number
    skipped: number
    bagsDeducted: number
    message: string
  } | null
}

export type OlistPublicConfig = {
  configured: boolean
  tokenSource: 'ENV' | 'DB' | 'NONE'
  maskedToken: string | null
  accountName: string | null
  accountCnpj: string | null
  autoSyncOrders: boolean
  createMissingProducts: boolean
  webhookSecret: string | null
  lastOrderSyncAt: string | null
  lastProductSyncAt: string | null
  lastSyncSummary: OlistStoredConfig['last_sync_summary']
}

export type OlistOrderSearchItem = {
  id: string
  numero: string
  numero_ecommerce?: string
  data_pedido: string // DD/MM/YYYY
  nome: string
  valor: number
  situacao: string
  nome_transportador?: string
}

export type OlistOrderDetail = {
  id: string
  numero: string
  numero_ecommerce?: string
  data_pedido: string // DD/MM/YYYY
  situacao: string
  cliente?: {
    nome?: string
    cpf_cnpj?: string
    cidade?: string
    uf?: string
  }
  itens: Array<{
    item: {
      id_produto?: string
      codigo?: string
      descricao: string
      unidade?: string
      quantidade: string | number
      valor_unitario: string | number
    }
  }>
  valor_frete?: string | number
  valor_desconto?: string | number
  outras_despesas?: string | number
  total_produtos?: string | number
  total_pedido?: string | number
  ecommerce?: {
    id?: string | number
    numeroPedidoEcommerce?: string
    numeroPedidoCanalVenda?: string
    nomeEcommerce?: string
    canalVenda?: string
  }
  obs?: string
  obs_interna?: string
}

export type OlistProductSearchItem = {
  id: string
  nome: string
  codigo: string
  preco: number
  preco_custo?: number
  unidade?: string
  gtin?: string
  situacao?: string
}

export type OlistProductDetail = {
  id: string
  nome: string
  codigo: string
  unidade?: string
  preco: number
  preco_custo: number
  preco_custo_medio?: number
  peso_liquido?: number
  peso_bruto?: number
  gtin?: string
  ncm?: string
  marca?: string
  categoria?: string
  garantia?: string
  descricao_complementar?: string
  obs?: string
  situacao?: string
}

function getCipherKey(): Buffer {
  const raw =
    process.env.INTEGRATION_ENCRYPTION_KEY?.trim() ||
    process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() ||
    'central-ecommerce-olist-default-key'
  return createHash('sha256').update(raw).digest()
}

function encryptSecret(plaintext: string): string {
  const key = getCipherKey()
  const iv = randomBytes(12)
  const cipher = createCipheriv('aes-256-gcm', key, iv)
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()])
  const tag = cipher.getAuthTag()
  return `v1:${iv.toString('base64')}:${tag.toString('base64')}:${encrypted.toString('base64')}`
}

function decryptSecret(stored: string): string | null {
  try {
    const parts = stored.split(':')
    if (parts.length !== 4 || parts[0] !== 'v1') return null
    const [, ivB64, tagB64, dataB64] = parts
    const decipher = createDecipheriv('aes-256-gcm', getCipherKey(), Buffer.from(ivB64, 'base64'))
    decipher.setAuthTag(Buffer.from(tagB64, 'base64'))
    return Buffer.concat([
      decipher.update(Buffer.from(dataB64, 'base64')),
      decipher.final(),
    ]).toString('utf8')
  } catch {
    return null
  }
}

function maskToken(token: string): string {
  const clean = token.trim()
  if (clean.length <= 8) return '••••••••'
  return `${clean.slice(0, 4)}••••••••••••${clean.slice(-4)}`
}

async function readRawStoredConfig(): Promise<OlistStoredConfig> {
  try {
    const admin = createAdminClient()
    const { data } = await admin
      .from('erp_snapshots')
      .select('data')
      .eq('source', 'OLIST')
      .eq('resource_type', 'WAREHOUSE')
      .eq('external_id', OLIST_CONFIG_EXTERNAL_ID)
      .maybeSingle()

    if (!data?.data || typeof data.data !== 'object') return {}
    return data.data as OlistStoredConfig
  } catch {
    return {}
  }
}

export async function writeStoredOlistConfig(patch: Partial<OlistStoredConfig>): Promise<void> {
  const current = await readRawStoredConfig()
  const merged: OlistStoredConfig = {
    ...current,
    ...patch,
    auto_sync_orders: patch.auto_sync_orders ?? current.auto_sync_orders ?? true,
    create_missing_products:
      patch.create_missing_products ?? current.create_missing_products ?? true,
    webhook_secret:
      patch.webhook_secret ?? current.webhook_secret ?? randomBytes(12).toString('hex'),
  }

  const service = await IntegrationService.create({ provider: 'OLIST' })
  await service.upsertSnapshot({
    resourceType: 'WAREHOUSE',
    externalId: OLIST_CONFIG_EXTERNAL_ID,
    data: merged as unknown as Record<string, unknown>,
  })
}

export async function resolveOlistApiToken(): Promise<{
  token: string | null
  source: 'ENV' | 'DB' | 'NONE'
}> {
  const envToken = process.env.OLIST_API_TOKEN?.trim() || process.env.TINY_API_TOKEN?.trim()
  if (envToken) {
    return { token: envToken, source: 'ENV' }
  }

  const stored = await readRawStoredConfig()
  if (stored.token_encrypted) {
    const decrypted = decryptSecret(stored.token_encrypted)
    if (decrypted) {
      return { token: decrypted, source: 'DB' }
    }
  }

  return { token: null, source: 'NONE' }
}

export async function getOlistPublicConfig(): Promise<OlistPublicConfig> {
  const [stored, resolved] = await Promise.all([readRawStoredConfig(), resolveOlistApiToken()])

  return {
    configured: Boolean(resolved.token),
    tokenSource: resolved.source,
    maskedToken: resolved.token ? maskToken(resolved.token) : (stored.masked_token ?? null),
    accountName: stored.account_name ?? null,
    accountCnpj: stored.account_cnpj ?? null,
    autoSyncOrders: stored.auto_sync_orders ?? true,
    createMissingProducts: stored.create_missing_products ?? true,
    webhookSecret: stored.webhook_secret ?? null,
    lastOrderSyncAt: stored.last_order_sync_at ?? null,
    lastProductSyncAt: stored.last_product_sync_at ?? null,
    lastSyncSummary: stored.last_sync_summary ?? null,
  }
}

export async function saveOlistTokenAndOptions(input: {
  apiToken?: string
  autoSyncOrders?: boolean
  createMissingProducts?: boolean
}): Promise<{ ok: boolean; accountName?: string | null; accountCnpj?: string | null; error?: string }> {
  const trimmedToken = input.apiToken?.trim()
  let accountName: string | null | undefined = undefined
  let accountCnpj: string | null | undefined = undefined

  if (trimmedToken) {
    const info = await testOlistConnection(trimmedToken)
    if (!info.ok) {
      return { ok: false, error: info.error ?? 'Token inválido ou recusado pela API do Olist ERP.' }
    }
    accountName = info.accountName
    accountCnpj = info.accountCnpj
  }

  await writeStoredOlistConfig({
    ...(trimmedToken
      ? {
          token_encrypted: encryptSecret(trimmedToken),
          masked_token: maskToken(trimmedToken),
          account_name: accountName ?? null,
          account_cnpj: accountCnpj ?? null,
        }
      : {}),
    ...(input.autoSyncOrders !== undefined ? { auto_sync_orders: input.autoSyncOrders } : {}),
    ...(input.createMissingProducts !== undefined
      ? { create_missing_products: input.createMissingProducts }
      : {}),
  })

  return { ok: true, accountName, accountCnpj }
}

async function callOlistApi<T = Record<string, unknown>>(
  endpoint: string,
  params: Record<string, string | number | undefined> = {},
  tokenOverride?: string,
): Promise<T> {
  const token = tokenOverride ?? (await resolveOlistApiToken()).token
  if (!token) {
    throw new Error('Token da API do Olist ERP não configurado.')
  }

  const body = new URLSearchParams()
  body.set('token', token)
  body.set('formato', 'json')
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== '') {
      body.set(key, String(value))
    }
  }

  const response = await fetch(`${OLIST_API_BASE}/${endpoint}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Accept: 'application/json',
    },
    body: body.toString(),
    cache: 'no-store',
  })

  if (!response.ok) {
    throw new Error(`Olist API HTTP ${response.status} em ${endpoint}`)
  }

  const json = (await response.json()) as {
    retorno?: {
      status?: string
      codigo_erro?: string | number
      erros?: Array<{ erro?: string }>
      [key: string]: unknown
    }
  }

  const retorno = json?.retorno
  if (!retorno) {
    throw new Error(`Resposta inesperada da API Olist em ${endpoint}`)
  }

  if (retorno.status === 'Erro') {
    const code = Number(retorno.codigo_erro ?? 0)
    const msg =
      retorno.erros?.map((e) => e.erro).filter(Boolean).join('; ') ||
      `Erro na API Olist (código ${code})`
    // Código 20 = "A consulta não retornou registros"
    if (code === 20) {
      return retorno as unknown as T
    }
    throw new Error(msg)
  }

  return retorno as unknown as T
}

export async function testOlistConnection(tokenOverride?: string): Promise<{
  ok: boolean
  accountName?: string
  accountCnpj?: string
  error?: string
}> {
  try {
    const retorno = await callOlistApi<{
      conta?: { razao_social?: string; fantasia?: string; cnpj?: string }
    }>('info.php', {}, tokenOverride)

    const conta = retorno.conta
    return {
      ok: true,
      accountName: conta?.fantasia || conta?.razao_social || 'Conta Olist ERP Conectada',
      accountCnpj: conta?.cnpj || undefined,
    }
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : 'Falha ao conectar ao Olist ERP.',
    }
  }
}

export async function searchOlistOrders(params: {
  dataInicial?: string // DD/MM/YYYY
  dataFinal?: string // DD/MM/YYYY
  numero?: string
  pagina?: number
}): Promise<{ orders: OlistOrderSearchItem[]; totalPages: number }> {
  const retorno = await callOlistApi<{
    numero_paginas?: number | string
    pedidos?: Array<{ pedido: OlistOrderSearchItem }>
  }>('pedidos.pesquisa.php', {
    dataInicial: params.dataInicial,
    dataFinal: params.dataFinal,
    numero: params.numero,
    pagina: params.pagina ?? 1,
  })

  const list = (retorno.pedidos ?? []).map((entry) => entry.pedido).filter(Boolean)
  return {
    orders: list,
    totalPages: Number(retorno.numero_paginas ?? 1) || 1,
  }
}

export async function getOlistOrder(externalId: string): Promise<OlistOrderDetail> {
  const retorno = await callOlistApi<{ pedido: OlistOrderDetail }>('pedido.obter.php', {
    id: externalId,
  })
  if (!retorno.pedido) {
    throw new Error(`Pedido ${externalId} não encontrado no Olist ERP.`)
  }
  return retorno.pedido
}

export async function searchOlistProducts(params: {
  pesquisa?: string
  pagina?: number
}): Promise<{ products: OlistProductSearchItem[]; totalPages: number }> {
  const retorno = await callOlistApi<{
    numero_paginas?: number | string
    produtos?: Array<{ produto: OlistProductSearchItem }>
  }>('produtos.pesquisa.php', {
    pesquisa: params.pesquisa ?? '',
    pagina: params.pagina ?? 1,
  })

  const list = (retorno.produtos ?? []).map((entry) => entry.produto).filter(Boolean)
  return {
    products: list,
    totalPages: Number(retorno.numero_paginas ?? 1) || 1,
  }
}

export async function getOlistProduct(externalId: string): Promise<OlistProductDetail> {
  const retorno = await callOlistApi<{ produto: OlistProductDetail }>('produto.obter.php', {
    id: externalId,
  })
  if (!retorno.produto) {
    throw new Error(`Produto ${externalId} não encontrado no Olist ERP.`)
  }
  return retorno.produto
}

export async function getOlistProductStock(externalId: string): Promise<number> {
  const retorno = await callOlistApi<{
    produto?: { saldo?: number | string; saldoReservado?: number | string }
  }>('produto.obter.estoque.php', {
    id: externalId,
  })
  return Number(retorno.produto?.saldo ?? 0) || 0
}
