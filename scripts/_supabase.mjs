/**
 * Utilidades compartilhadas pelos scripts de inspecao e de teste de permissao.
 *
 * Fala PostgREST direto por fetch (mesmo padrao de scripts/test-v2.mjs) em vez
 * de usar @supabase/supabase-js. Motivo: para testar PERMISSAO precisamos do
 * status HTTP e do codigo de erro do Postgres crus. O client tipado embrulha
 * isso e um 401 fica indistinguivel de "zero linhas".
 */

import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const here = dirname(fileURLToPath(import.meta.url))
export const ROOT = join(here, '..')

export function loadEnv() {
  const env = { ...process.env }
  try {
    const raw = readFileSync(join(ROOT, '.env.local'), 'utf8')
    for (const line of raw.split('\n')) {
      const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/)
      if (match) env[match[1]] ??= match[2].replace(/^["']|["']$/g, '')
    }
  } catch {
    /* .env.local e opcional se as variaveis vierem do ambiente */
  }

  if (!env.NEXT_PUBLIC_SUPABASE_URL || !env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
    throw new Error('Faltam NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY.')
  }
  return env
}

/** Tabelas que ja existiam antes da fundacao de integracao. */
export const TABLES_V2 = [
  'profiles',
  'categories',
  'subcategories',
  'cost_centers',
  'suppliers',
  'transactions',
  'investments',
  'settings',
  'products',
  'orders',
  'order_items',
  'stock_movements',
  'channels',
  'payment_methods',
]

/** Tabelas criadas por 20260928120000_integration_foundation.sql. */
export const TABLES_INTEGRATION = [
  'organizations',
  'organization_members',
  'integration_settings',
  'erp_connections',
  'integration_events',
  'integration_jobs',
  'integration_actions',
  'product_channels',
  'inventory_balances',
  'erp_snapshots',
  'alerts',
  'recommendations',
  'recommendation_outcomes',
]

export const VIEWS_V2 = [
  'v_cost_center_hierarchy',
  'v_cost_center_totals',
  'v_transaction_full',
  'v_order_result',
  'v_product_stats',
  'v_supplier_stats',
]

export const VIEWS_INTEGRATION = [
  'v_erp_connection_status',
  'v_integration_queue_health',
  'v_sales_fact',
]

export const VIEWS_ALL = [...VIEWS_V2, ...VIEWS_INTEGRATION]

/**
 * Request cru: devolve status + corpo sem lancar excecao.
 * `key` permite trocar a identidade (anon, token de usuario, service role).
 */
export async function restRaw(env, path, options = {}) {
  const key = options.key ?? env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  const bearer = options.bearer ?? key

  const response = await fetch(`${env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/${path}`, {
    method: options.method ?? 'GET',
    headers: {
      apikey: key,
      Authorization: `Bearer ${bearer}`,
      'Content-Type': 'application/json',
      ...(options.headers ?? {}),
    },
    body: options.body,
  })

  return { status: response.status, body: await response.text(), headers: response.headers }
}

/** Contagem exata via Content-Range, sem trazer linha nenhuma. */
export async function countRows(env, table, options = {}) {
  const res = await restRaw(env, `${table}?select=id&limit=0`, {
    ...options,
    headers: { Prefer: 'count=exact', ...(options.headers ?? {}) },
  })
  if (res.status !== 200 && res.status !== 206) return null
  const range = res.headers.get('content-range')
  const total = range?.split('/')?.[1]
  return total && total !== '*' ? Number(total) : null
}

/** Autentica um usuario e devolve o access_token (identidade `authenticated`). */
export async function signIn(env, email, password) {
  const response = await fetch(
    `${env.NEXT_PUBLIC_SUPABASE_URL}/auth/v1/token?grant_type=password`,
    {
      method: 'POST',
      headers: {
        apikey: env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ email, password }),
    },
  )
  const body = await response.json().catch(() => null)
  if (!response.ok) {
    throw new Error(`login falhou (${response.status}): ${JSON.stringify(body)}`)
  }
  return { accessToken: body.access_token, userId: body.user?.id }
}

/** Cria (ou recupera) um usuario via Admin API. Exige service role. */
export async function adminCreateUser(env, email, password) {
  const response = await fetch(`${env.NEXT_PUBLIC_SUPABASE_URL}/auth/v1/admin/users`, {
    method: 'POST',
    headers: {
      apikey: env.SUPABASE_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ email, password, email_confirm: true }),
  })
  const body = await response.json().catch(() => null)

  // 422 com email_exists: reaproveita o usuario, o script e re-executavel.
  if (!response.ok && response.status !== 422) {
    throw new Error(`criacao de usuario falhou (${response.status}): ${JSON.stringify(body)}`)
  }
  return body?.id ?? null
}

export async function adminDeleteUser(env, userId) {
  if (!userId) return
  await fetch(`${env.NEXT_PUBLIC_SUPABASE_URL}/auth/v1/admin/users/${userId}`, {
    method: 'DELETE',
    headers: {
      apikey: env.SUPABASE_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
    },
  })
}

/* -------------------------------------------------------------------------- */
/* Sessao HTTP (usado por test-auth.mjs e smoke-pages.mjs)                     */
/* -------------------------------------------------------------------------- */

/**
 * Monta o header Cookie de uma sessao do Supabase.
 *
 * Usa os PROPRIOS serializadores do @supabase/ssr em vez de reimplementar o
 * formato: assim o cookie e byte a byte o que a biblioteca escreveria, e se o
 * formato mudar numa atualizacao o teste muda junto em vez de passar a mentir.
 */
export async function sessionToCookieHeader(env, session) {
  const { createChunks, stringToBase64URL } = await import('@supabase/ssr')

  const projectRef = new URL(env.NEXT_PUBLIC_SUPABASE_URL).hostname.split('.')[0]
  const storageKey = `sb-${projectRef}-auth-token`
  const value = `base64-${stringToBase64URL(JSON.stringify(session))}`

  return createChunks(storageKey, value)
    .map((chunk) => `${chunk.name}=${encodeURIComponent(chunk.value)}`)
    .join('; ')
}

/** Sessao crua do endpoint de token (a forma que o auth-js guarda). */
export async function signInSession(env, email, password) {
  const response = await fetch(
    `${env.NEXT_PUBLIC_SUPABASE_URL}/auth/v1/token?grant_type=password`,
    {
      method: 'POST',
      headers: { apikey: env.NEXT_PUBLIC_SUPABASE_ANON_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    },
  )
  const body = await response.json()
  if (!response.ok) throw new Error(`login falhou (${response.status}): ${JSON.stringify(body)}`)
  return body
}

/**
 * Cria um usuario de teste JA vinculado a organizacao e devolve o header Cookie
 * pronto, mais o `cleanup` que apaga o usuario (profile e membership saem por
 * cascade). Exige service role.
 */
export async function createMemberSession(env, tag) {
  const email = `${tag}@exemplo.invalid`
  const password = `Teste-${Date.now()}-aA1!`
  const service = { key: env.SUPABASE_SERVICE_ROLE_KEY }

  const userId = await adminCreateUser(env, email, password)

  const orgRes = await restRaw(env, 'organizations?select=id&limit=1', service)
  const organizationId = JSON.parse(orgRes.body)?.[0]?.id
  if (!organizationId) throw new Error('nenhuma organizacao encontrada')

  await restRaw(env, 'organization_members', {
    ...service,
    method: 'POST',
    body: JSON.stringify({ organization_id: organizationId, user_id: userId, role: 'ADMIN' }),
    headers: { Prefer: 'resolution=merge-duplicates' },
  })

  const session = await signInSession(env, email, password)

  return {
    email,
    userId,
    organizationId,
    cookie: await sessionToCookieHeader(env, session),
    cleanup: () => adminDeleteUser(env, userId),
  }
}
