#!/usr/bin/env node
/**
 * Testes REAIS de permissao contra o Supabase linkado.
 *
 *   npm run test:rls
 *
 * Roda nos tres estados e SABE em qual esta -- as expectativas mudam com o
 * estado, entao o mesmo arquivo serve de baseline antes e de prova depois:
 *
 *   PRE_FOUNDATION  20260928120000 ainda nao aplicada
 *   FOUNDATION      aplicada; modo aberto da V2 ainda vale para anon
 *   HARDENED        20261005000000_rls_hardening.sql aplicada; anon sem acesso
 *
 * DISTINCAO QUE IMPORTA MAIS QUE TUDO AQUI:
 *
 *   denied  -> o GRANT nao existe. HTTP 401/403. Barreira dura.
 *   empty   -> o grant existe, a RLS filtrou. HTTP 200 com [].
 *
 * Em SELECT a RLS nao levanta erro, ela remove linhas. Um teste que so olhasse
 * "deu erro?" daria como aprovado um vazamento numa tabela que por acaso estava
 * vazia -- e daria como falha um isolamento funcionando. Por isso `empty` e um
 * resultado esperado distinto de `denied`.
 *
 * ESCRITAS: tudo que o script cria leva um prefixo unico e e apagado no final,
 * inclusive quando algum teste falha. Nao encosta em nada preexistente.
 */

import {
  TABLES_V2,
  VIEWS_V2,
  VIEWS_INTEGRATION,
  adminCreateUser,
  adminDeleteUser,
  loadEnv,
  restRaw,
  signIn,
} from './_supabase.mjs'

const env = loadEnv()
const TAG = `__rls_${Date.now()}`
const HAS_SERVICE_ROLE = Boolean(env.SUPABASE_SERVICE_ROLE_KEY)

const anon = { key: env.NEXT_PUBLIC_SUPABASE_ANON_KEY }
const service = { key: env.SUPABASE_SERVICE_ROLE_KEY }

/** As 13 tabelas de negocio (profiles fica de fora: nao tem organization_id). */
const BUSINESS = TABLES_V2.filter((t) => t !== 'profiles')

const INTEGRATION_TABLES = [
  'integration_settings',
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

/** As 5 views que o GlobalSearch consulta direto do navegador. */
const GLOBAL_SEARCH_VIEWS = [
  'v_supplier_stats',
  'v_cost_center_hierarchy',
  'v_product_stats',
  'v_order_result',
  'v_transaction_full',
]

/* -------------------------------------------------------------------------- */
/* Classificacao                                                              */
/* -------------------------------------------------------------------------- */

function classify(res) {
  const code = (() => {
    try {
      return JSON.parse(res.body)?.code ?? null
    } catch {
      return null
    }
  })()

  if (res.status === 404 && (code === 'PGRST205' || code === '42P01')) return 'missing'
  if (res.status === 401 || res.status === 403) return 'denied'
  if (res.status === 409) return 'conflict'
  if (code === '42501') return 'denied'

  if (res.status >= 200 && res.status < 300) {
    try {
      const parsed = JSON.parse(res.body)
      if (Array.isArray(parsed)) return parsed.length > 0 ? 'rows' : 'empty'
    } catch {
      /* 204 sem corpo */
    }
    return 'ok'
  }

  return `erro${res.status}${code ? `/${code}` : ''}`
}

/* -------------------------------------------------------------------------- */
/* Runner                                                                     */
/* -------------------------------------------------------------------------- */

let passed = 0
let failed = 0
let skipped = 0
const failures = []

function check(label, actual, expected) {
  const allowed = Array.isArray(expected) ? expected : [expected]
  if (allowed.includes(actual)) {
    passed += 1
    console.log(`   ok      ${label}  ->  ${actual}`)
  } else {
    failed += 1
    failures.push(`${label}: ${actual} (esperado ${allowed.join(' ou ')})`)
    console.log(`   FALHOU  ${label}  ->  ${actual}  (esperado ${allowed.join(' ou ')})`)
  }
}

/** Versao silenciosa para as varreduras longas: imprime so o agregado. */
function tally(results) {
  const counts = {}
  for (const value of results) counts[value] = (counts[value] ?? 0) + 1
  return Object.entries(counts)
    .map(([k, v]) => `${v}x ${k}`)
    .join(', ')
}

function skip(label, why) {
  skipped += 1
  console.log(`   pulado  ${label}  (${why})`)
}

/* -------------------------------------------------------------------------- */
/* Estado                                                                     */
/* -------------------------------------------------------------------------- */

async function detectState() {
  const orgs = classify(await restRaw(env, 'organizations?select=id&limit=1', anon))
  if (orgs === 'missing') return 'PRE_FOUNDATION'
  const business = classify(await restRaw(env, 'categories?select=id&limit=1', anon))
  return business === 'denied' ? 'HARDENED' : 'FOUNDATION'
}

/* -------------------------------------------------------------------------- */
/* Estado compartilhado                                                       */
/* -------------------------------------------------------------------------- */

const cleanupTasks = []
let orgId = null
let secondOrgId = null

/* ========================================================================== */
/* 1) anon nas tabelas de negocio                                             */
/* ========================================================================== */

async function testAnonBusiness(state) {
  console.log('\n1) anon nas 13 tabelas de negocio')

  const readExpected = state === 'HARDENED' ? 'denied' : ['rows', 'empty']
  const writeExpected = state === 'HARDENED' ? 'denied' : ['ok', 'rows']

  // SELECT em todas as 13.
  const reads = []
  for (const table of BUSINESS) {
    reads.push(classify(await restRaw(env, `${table}?select=*&limit=1`, anon)))
  }
  const allReadsMatch = reads.every((r) =>
    Array.isArray(readExpected) ? readExpected.includes(r) : r === readExpected,
  )
  check(`SELECT nas 13 (${tally(reads)})`, allReadsMatch ? 'conforme' : 'DIVERGENTE', 'conforme')

  // INSERT / UPDATE / DELETE numa tabela de cadastro simples.
  const name = `${TAG} canal`
  const insert = await restRaw(env, 'channels', {
    ...anon,
    method: 'POST',
    body: JSON.stringify({ name }),
    headers: { Prefer: 'return=representation' },
  })
  const insertResult = classify(insert)
  check('anon INSERT channels', insertResult, writeExpected)

  if (insertResult === 'rows' || insertResult === 'ok') {
    try {
      const id = JSON.parse(insert.body)?.[0]?.id
      if (id) cleanupTasks.push(() => restRaw(env, `channels?id=eq.${id}`, { ...service, method: 'DELETE' }))
    } catch {
      /* sem representation */
    }
  }

  check(
    'anon UPDATE channels',
    classify(
      await restRaw(env, 'channels?active=eq.true', {
        ...anon,
        method: 'PATCH',
        body: JSON.stringify({ active: true }),
      }),
    ),
    writeExpected,
  )

  check(
    'anon DELETE channels',
    classify(
      await restRaw(env, `channels?name=eq.${encodeURIComponent(name)}`, { ...anon, method: 'DELETE' }),
    ),
    writeExpected,
  )

  // INSERT em transactions: a tabela com dado financeiro.
  check(
    'anon INSERT transactions',
    classify(
      await restRaw(env, 'transactions', {
        ...anon,
        method: 'POST',
        body: JSON.stringify({
          transaction_date: '2026-01-01',
          type: 'SAIDA',
          description: `${TAG} teste`,
          amount: 1,
          payment_method: 'PIX',
          status: 'PAGO',
        }),
      }),
    ),
    writeExpected,
  )
}

/* ========================================================================== */
/* 2) anon nas views e RPCs                                                   */
/* ========================================================================== */

async function testAnonViewsAndRpc(state) {
  console.log('\n2) anon nas views e nos RPCs')

  const expected = state === 'HARDENED' ? 'denied' : ['rows', 'empty']

  const viewResults = []
  for (const view of [...VIEWS_V2, ...VIEWS_INTEGRATION]) {
    viewResults.push(classify(await restRaw(env, `${view}?select=*&limit=1`, anon)))
  }
  const ok = viewResults.every((r) => (Array.isArray(expected) ? expected.includes(r) : r === expected))
  check(`SELECT nas 9 views (${tally(viewResults)})`, ok ? 'conforme' : 'DIVERGENTE', 'conforme')

  // RPC de drill-down: e a porta mais larga do sistema (le v_transaction_full).
  check(
    'anon RPC cost_center_report',
    classify(await restRaw(env, 'rpc/cost_center_report', { ...anon, method: 'POST', body: '{}' })),
    state === 'HARDENED' ? 'denied' : ['rows', 'empty'],
  )

  // Os resolvedores de identidade nao podem ser chamados por anon.
  check(
    'anon RPC is_org_member',
    classify(
      await restRaw(env, 'rpc/is_org_member', {
        ...anon,
        method: 'POST',
        body: JSON.stringify({ p_organization_id: orgId ?? '00000000-0000-0000-0000-000000000000' }),
      }),
    ),
    state === 'HARDENED' ? 'denied' : ['ok', 'rows', 'empty'],
  )

  check(
    'anon RPC default_organization_id',
    classify(await restRaw(env, 'rpc/default_organization_id', { ...anon, method: 'POST', body: '{}' })),
    state === 'HARDENED' ? 'denied' : ['ok', 'rows', 'empty'],
  )

  if (state === 'HARDENED') {
    check(
      'anon RPC current_organization_id',
      classify(await restRaw(env, 'rpc/current_organization_id', { ...anon, method: 'POST', body: '{}' })),
      'denied',
    )
  }
}

/* ========================================================================== */
/* 3) anon nas tabelas de integracao e nos tokens                             */
/* ========================================================================== */

async function testAnonIntegration(state) {
  console.log('\n3) anon nas tabelas de integracao e em erp_connections')

  if (state === 'PRE_FOUNDATION') {
    skip('tabelas de integracao', 'fundacao nao aplicada')
    return
  }

  // ESTES NAO PODEM FALHAR EM NENHUM ESTADO.
  check(
    'anon SELECT access_token_encrypted',
    classify(await restRaw(env, 'erp_connections?select=access_token_encrypted&limit=1', anon)),
    'denied',
  )
  check(
    'anon SELECT refresh_token_encrypted',
    classify(await restRaw(env, 'erp_connections?select=refresh_token_encrypted&limit=1', anon)),
    'denied',
  )
  check(
    'anon SELECT * em erp_connections',
    classify(await restRaw(env, 'erp_connections?select=*&limit=1', anon)),
    'denied',
  )

  const readExpected = state === 'HARDENED' ? 'denied' : ['rows', 'empty']
  const reads = []
  for (const table of INTEGRATION_TABLES) {
    reads.push(classify(await restRaw(env, `${table}?select=*&limit=1`, anon)))
  }
  const ok = reads.every((r) => (Array.isArray(readExpected) ? readExpected.includes(r) : r === readExpected))
  check(`SELECT nas 10 de integracao (${tally(reads)})`, ok ? 'conforme' : 'DIVERGENTE', 'conforme')

  // Escrita em integracao: negada em TODO estado (so service_role escreve).
  check(
    'anon INSERT integration_events',
    classify(
      await restRaw(env, 'integration_events', {
        ...anon,
        method: 'POST',
        body: JSON.stringify({
          provider: 'BLING',
          external_event_id: `${TAG}-anon`,
          event_type: 'product.updated',
        }),
      }),
    ),
    'denied',
  )
  check(
    'anon INSERT integration_jobs',
    classify(
      await restRaw(env, 'integration_jobs', {
        ...anon,
        method: 'POST',
        body: JSON.stringify({ job_type: 'X', provider: 'BLING' }),
      }),
    ),
    'denied',
  )
  check(
    'anon UPDATE integration_jobs',
    classify(
      await restRaw(env, 'integration_jobs?status=eq.PENDING', {
        ...anon,
        method: 'PATCH',
        body: JSON.stringify({ status: 'COMPLETED' }),
      }),
    ),
    'denied',
  )
  check(
    'anon DELETE integration_events',
    classify(await restRaw(env, `integration_events?event_type=eq.x`, { ...anon, method: 'DELETE' })),
    'denied',
  )
  check(
    'anon UPDATE erp_connections',
    classify(
      await restRaw(env, 'erp_connections?provider=eq.BLING', {
        ...anon,
        method: 'PATCH',
        body: JSON.stringify({ status: 'CONNECTED' }),
      }),
    ),
    'denied',
  )
}

/* ========================================================================== */
/* 4) service_role                                                            */
/* ========================================================================== */

async function testServiceRole(state) {
  console.log('\n4) service_role administra')

  if (!HAS_SERVICE_ROLE) return skip('service_role', 'SUPABASE_SERVICE_ROLE_KEY ausente')
  if (state === 'PRE_FOUNDATION') return skip('service_role', 'fundacao nao aplicada')

  const orgRes = await restRaw(env, 'organizations?select=id&limit=1', service)
  check('service_role le organizations', classify(orgRes), 'rows')
  orgId = JSON.parse(orgRes.body)?.[0]?.id ?? null

  check(
    'service_role le o token cifrado',
    classify(await restRaw(env, 'erp_connections?select=access_token_encrypted&limit=1', service)),
    ['rows', 'empty'],
  )
  check(
    'service_role le as 13 de negocio',
    classify(await restRaw(env, 'transactions?select=id&limit=1', service)),
    ['rows', 'empty'],
  )

  const eventId = `${TAG}-svc`
  const first = await restRaw(env, 'integration_events', {
    ...service,
    method: 'POST',
    body: JSON.stringify({
      organization_id: orgId,
      provider: 'BLING',
      external_event_id: eventId,
      event_type: 'product.updated',
    }),
    headers: { Prefer: 'return=representation' },
  })
  check('service_role INSERT integration_events', classify(first), 'rows')
  cleanupTasks.push(() =>
    restRaw(env, `integration_events?external_event_id=eq.${eventId}`, { ...service, method: 'DELETE' }),
  )

  check(
    'evento duplicado recusado pelo UNIQUE',
    classify(
      await restRaw(env, 'integration_events', {
        ...service,
        method: 'POST',
        body: JSON.stringify({
          organization_id: orgId,
          provider: 'BLING',
          external_event_id: eventId,
          event_type: 'product.updated',
        }),
      }),
    ),
    'conflict',
  )

  const jobBody = {
    organization_id: orgId,
    provider: 'BLING',
    job_type: `${TAG}_JOB`,
    resource_type: 'product',
    resource_id: '999',
  }
  check(
    'service_role INSERT integration_jobs',
    classify(
      await restRaw(env, 'integration_jobs', {
        ...service,
        method: 'POST',
        body: JSON.stringify(jobBody),
        headers: { Prefer: 'return=representation' },
      }),
    ),
    'rows',
  )
  cleanupTasks.push(() =>
    restRaw(env, `integration_jobs?job_type=eq.${TAG}_JOB`, { ...service, method: 'DELETE' }),
  )

  check(
    'job pendente duplicado recusado pelo indice parcial',
    classify(
      await restRaw(env, 'integration_jobs', { ...service, method: 'POST', body: JSON.stringify(jobBody) }),
    ),
    'conflict',
  )
}

/* ========================================================================== */
/* 5) authenticated SEM vinculo                                               */
/* ========================================================================== */

async function testOutsider(state) {
  console.log('\n5) authenticated SEM organization_members')

  if (!HAS_SERVICE_ROLE) return skip('authenticated', 'precisa de service role para criar usuario')
  if (state === 'PRE_FOUNDATION') return skip('authenticated', 'fundacao nao aplicada')

  const email = `${TAG}.outsider@exemplo.invalid`
  const password = `Teste-${Date.now()}-aA1!`
  const userId = await adminCreateUser(env, email, password)
  cleanupTasks.push(() => adminDeleteUser(env, userId))

  const { accessToken } = await signIn(env, email, password)
  const as = { key: env.NEXT_PUBLIC_SUPABASE_ANON_KEY, bearer: accessToken }

  // Leitura: o grant existe (authenticated), a RLS filtra -> `empty`.
  const reads = []
  for (const table of BUSINESS) {
    reads.push(classify(await restRaw(env, `${table}?select=*&limit=1`, as)))
  }
  const readExpected = state === 'HARDENED' ? ['empty'] : ['rows', 'empty']
  check(
    `nao-membro SELECT nas 13 (${tally(reads)})`,
    reads.every((r) => readExpected.includes(r)) ? 'conforme' : 'DIVERGENTE',
    'conforme',
  )

  const viewReads = []
  for (const view of VIEWS_V2) {
    viewReads.push(classify(await restRaw(env, `${view}?select=*&limit=1`, as)))
  }
  check(
    `nao-membro nas views de negocio (${tally(viewReads)})`,
    viewReads.every((r) => readExpected.includes(r)) ? 'conforme' : 'DIVERGENTE',
    'conforme',
  )

  check(
    'nao-membro RPC cost_center_report',
    classify(await restRaw(env, 'rpc/cost_center_report', { ...as, method: 'POST', body: '{}' })),
    state === 'HARDENED' ? ['empty'] : ['rows', 'empty'],
  )

  // ESTE E O TESTE DA PONTE SINGLE-ORG.
  // current_organization_id() cai na organizacao unica quando nao ha vinculo, e o
  // INSERT abaixo NAO passa organization_id -- ou seja, o default aponta para a
  // organizacao principal. Se a ponte fosse um furo, este insert entraria.
  // O WITH CHECK is_org_member() e o que o barra.
  check(
    'nao-membro INSERT sem organization_id (prova que a ponte nao e bypass)',
    classify(
      await restRaw(env, 'channels', {
        ...as,
        method: 'POST',
        body: JSON.stringify({ name: `${TAG} invasao` }),
      }),
    ),
    state === 'HARDENED' ? 'denied' : ['ok', 'rows'],
  )

  // E com organization_id explicito da organizacao principal.
  if (orgId) {
    check(
      'nao-membro INSERT com organization_id explicito',
      classify(
        await restRaw(env, 'channels', {
          ...as,
          method: 'POST',
          body: JSON.stringify({ name: `${TAG} invasao2`, organization_id: orgId }),
        }),
      ),
      state === 'HARDENED' ? 'denied' : ['ok', 'rows'],
    )
  }

  // UPDATE que a RLS filtra devolve 204 ("ok"), nao 403: ele casa ZERO linhas.
  // "ok" aqui nao e permissao, e por isso o teste nao para no status -- ele
  // confere no banco, com service_role, que nada foi alterado.
  const marker = `${TAG}-invadido`
  await restRaw(env, 'transactions?amount=gt.0', {
    ...as,
    method: 'PATCH',
    body: JSON.stringify({ notes: marker }),
  })
  const touched = JSON.parse(
    (await restRaw(env, `transactions?select=id&notes=eq.${marker}`, service)).body,
  )
  check(
    'nao-membro UPDATE transactions nao alterou nada',
    touched.length === 0 ? 'intacto' : `${touched.length} linha(s) ALTERADA(S)`,
    'intacto',
  )

  check(
    'nao-membro nao le o token',
    classify(await restRaw(env, 'erp_connections?select=access_token_encrypted&limit=1', as)),
    'denied',
  )

  check(
    'nao-membro nao escreve em integration_jobs',
    classify(
      await restRaw(env, 'integration_jobs', {
        ...as,
        method: 'POST',
        body: JSON.stringify({ organization_id: orgId, job_type: 'X', provider: 'BLING' }),
      }),
    ),
    'denied',
  )

  // is_org_member tem de responder FALSE para ele, nao erro nem true.
  const member = await restRaw(env, 'rpc/is_org_member', {
    ...as,
    method: 'POST',
    body: JSON.stringify({ p_organization_id: orgId }),
  })
  check('nao-membro is_org_member(org principal)', member.body.trim(), 'false')
}

/* ========================================================================== */
/* 6) membro OWNER                                                            */
/* ========================================================================== */

let ownerAs = null

async function testOwner(state) {
  console.log('\n6) membro (papel administrativo)')

  if (!HAS_SERVICE_ROLE) return skip('membro', 'precisa de service role')
  if (state === 'PRE_FOUNDATION') return skip('membro', 'fundacao nao aplicada')
  if (!orgId) return skip('membro', 'organizacao nao identificada')

  const email = `${TAG}.owner@exemplo.invalid`
  const password = `Teste-${Date.now()}-aA1!`
  const userId = await adminCreateUser(env, email, password)
  cleanupTasks.push(() => adminDeleteUser(env, userId))

  await restRaw(env, 'organization_members', {
    ...service,
    method: 'POST',
    body: JSON.stringify({ organization_id: orgId, user_id: userId, role: 'OWNER' }),
    headers: { Prefer: 'resolution=merge-duplicates' },
  })

  const { accessToken } = await signIn(env, email, password)
  ownerAs = { key: env.NEXT_PUBLIC_SUPABASE_ANON_KEY, bearer: accessToken }

  const reads = []
  for (const table of BUSINESS) {
    reads.push(classify(await restRaw(env, `${table}?select=*&limit=1`, ownerAs)))
  }
  check(
    `membro SELECT nas 13 (${tally(reads)})`,
    reads.every((r) => ['rows', 'empty'].includes(r)) ? 'conforme' : 'DIVERGENTE',
    'conforme',
  )

  // As 5 views do GlobalSearch, que o navegador consulta direto.
  const searchReads = []
  for (const view of GLOBAL_SEARCH_VIEWS) {
    searchReads.push(classify(await restRaw(env, `${view}?select=*&limit=1`, ownerAs)))
  }
  check(
    `membro nas views do GlobalSearch (${tally(searchReads)})`,
    searchReads.every((r) => ['rows', 'empty'].includes(r)) ? 'conforme' : 'DIVERGENTE',
    'conforme',
  )

  check(
    'membro RPC cost_center_report',
    classify(await restRaw(env, 'rpc/cost_center_report', { ...ownerAs, method: 'POST', body: '{}' })),
    ['rows', 'empty'],
  )

  // Ciclo completo de escrita: INSERT sem informar organization_id (o default
  // resolve), depois UPDATE e DELETE da propria linha.
  const created = await restRaw(env, 'channels', {
    ...ownerAs,
    method: 'POST',
    body: JSON.stringify({ name: `${TAG} canal membro` }),
    headers: { Prefer: 'return=representation' },
  })
  check('membro INSERT channels', classify(created), 'rows')

  let createdId = null
  let createdOrg = null
  try {
    const row = JSON.parse(created.body)?.[0]
    createdId = row?.id
    createdOrg = row?.organization_id
  } catch {
    /* ignora */
  }
  if (createdId) {
    cleanupTasks.push(() =>
      restRaw(env, `channels?id=eq.${createdId}`, { ...service, method: 'DELETE' }),
    )
  }

  check(
    'default preencheu a organizacao do membro',
    createdOrg === orgId ? 'correta' : `outra (${createdOrg})`,
    'correta',
  )

  if (createdId) {
    check(
      'membro UPDATE a propria linha',
      classify(
        await restRaw(env, `channels?id=eq.${createdId}`, {
          ...ownerAs,
          method: 'PATCH',
          body: JSON.stringify({ active: false }),
        }),
      ),
      ['ok', 'rows'],
    )
    check(
      'membro DELETE a propria linha',
      classify(await restRaw(env, `channels?id=eq.${createdId}`, { ...ownerAs, method: 'DELETE' })),
      ['ok', 'rows'],
    )
  }

  // Mesmo sendo OWNER, nao alcanca o token nem escreve na fila.
  check(
    'membro NAO le o token',
    classify(await restRaw(env, 'erp_connections?select=access_token_encrypted&limit=1', ownerAs)),
    'denied',
  )
  check(
    'membro ve o status da conexao',
    classify(await restRaw(env, 'v_erp_connection_status?select=status&limit=1', ownerAs)),
    ['rows', 'empty'],
  )
  check(
    'membro NAO escreve em integration_jobs',
    classify(
      await restRaw(env, 'integration_jobs', {
        ...ownerAs,
        method: 'POST',
        body: JSON.stringify({ organization_id: orgId, job_type: 'X', provider: 'BLING' }),
      }),
    ),
    'denied',
  )
}

/* ========================================================================== */
/* 7) isolamento entre organizacoes                                           */
/* ========================================================================== */

async function testIsolation(state) {
  console.log('\n7) isolamento multi-tenant (duas organizacoes)')

  if (!HAS_SERVICE_ROLE) return skip('isolamento', 'precisa de service role')
  if (state === 'PRE_FOUNDATION' || !ownerAs || !orgId) {
    return skip('isolamento', 'pre-requisitos ausentes')
  }

  // --- cria a segunda organizacao ---
  const created = await restRaw(env, 'organizations', {
    ...service,
    method: 'POST',
    body: JSON.stringify({ name: `${TAG} Org 2`, slug: `${TAG}-org2` }),
    headers: { Prefer: 'return=representation' },
  })
  secondOrgId = JSON.parse(created.body)?.[0]?.id ?? null
  check('segunda organizacao criada', secondOrgId ? 'criada' : 'FALHOU', 'criada')
  if (!secondOrgId) return

  // --- dados pertencentes a ela, em tabelas de tipos diferentes ---
  const seeded = {}
  for (const [table, body] of [
    ['channels', { organization_id: secondOrgId, name: `${TAG} canal org2` }],
    ['categories', { organization_id: secondOrgId, name: `${TAG} cat org2`, type: 'SAIDA' }],
    ['products', { organization_id: secondOrgId, name: `${TAG} produto org2`, sku: `${TAG}-P2` }],
    [
      'transactions',
      {
        organization_id: secondOrgId,
        transaction_date: '2026-01-15',
        type: 'SAIDA',
        description: `${TAG} lancamento org2`,
        amount: 4321.99,
        payment_method: 'PIX',
        status: 'PAGO',
      },
    ],
    [
      'alerts',
      {
        organization_id: secondOrgId,
        rule_code: 'TESTE',
        domain: 'INTEGRACAO',
        severity: 'CRITICO',
        title: `${TAG} alerta org2`,
        what_happened: 'x',
        why_it_matters: 'y',
        fingerprint: `${TAG}-org2`,
      },
    ],
  ]) {
    const res = await restRaw(env, table, {
      ...service,
      method: 'POST',
      body: JSON.stringify(body),
      headers: { Prefer: 'return=representation' },
    })
    seeded[table] = classify(res)
    try {
      seeded[`${table}_id`] = JSON.parse(res.body)?.[0]?.id
    } catch {
      /* ignora */
    }
  }
  check(
    `dados semeados na org 2 (${tally(Object.values(seeded).filter((v) => typeof v === 'string' && !v.includes('-')))})`,
    ['channels', 'categories', 'products', 'transactions', 'alerts'].every((t) => seeded[t] === 'rows')
      ? 'semeados'
      : 'FALHOU',
    'semeados',
  )

  // A limpeza precisa vir ANTES da organizacao: o FK organization_id das tabelas
  // de negocio e NO ACTION (nao cascade), ao contrario das de integracao.
  cleanupTasks.push(async () => {
    for (const table of ['transactions', 'products', 'categories', 'channels', 'alerts']) {
      await restRaw(env, `${table}?organization_id=eq.${secondOrgId}`, { ...service, method: 'DELETE' })
    }
    await restRaw(env, `organizations?id=eq.${secondOrgId}`, { ...service, method: 'DELETE' })
  })

  /* --- o membro da org 1 NAO pode enxergar --- */

  const leakReads = []
  for (const table of ['channels', 'categories', 'products', 'transactions', 'alerts']) {
    leakReads.push(
      classify(
        await restRaw(env, `${table}?select=id&organization_id=eq.${secondOrgId}`, ownerAs),
      ),
    )
  }
  check(
    `membro da org 1 lendo dados da org 2 (${tally(leakReads)})`,
    leakReads.every((r) => r === 'empty' || r === 'denied') ? 'invisiveis' : 'VAZOU',
    'invisiveis',
  )

  // Pela view tambem nao: v_transaction_full nao tem organization_id, entao o
  // filtro depende exclusivamente da RLS da tabela de base. E o teste que pega
  // vazamento por view.
  const viaView = await restRaw(
    env,
    `v_transaction_full?select=id,description&description=like.*${TAG}*`,
    ownerAs,
  )
  check('membro nao ve o lancamento da org 2 pela view', classify(viaView), 'empty')

  const viaSales = await restRaw(env, `v_sales_fact?select=order_id&limit=100`, ownerAs)
  check('v_sales_fact acessivel e filtrada', classify(viaSales), ['rows', 'empty'])

  // Nem pelo RPC de drill-down.
  const rpcRows = await restRaw(env, 'rpc/cost_center_report', {
    ...ownerAs,
    method: 'POST',
    body: JSON.stringify({ p_search: TAG }),
  })
  let rpcLeak = 'limpo'
  try {
    const rows = JSON.parse(rpcRows.body)
    if (Array.isArray(rows) && rows.some((r) => Number(r.rollup_total) !== 0)) rpcLeak = 'VAZOU'
  } catch {
    /* ignora */
  }
  check('RPC cost_center_report nao soma a org 2', rpcLeak, 'limpo')

  /* --- nem alterar --- */

  const updateLeak = await restRaw(env, `channels?organization_id=eq.${secondOrgId}`, {
    ...ownerAs,
    method: 'PATCH',
    body: JSON.stringify({ name: `${TAG} invadido` }),
  })
  // A RLS filtra o UPDATE: ele "funciona" e afeta zero linha. A prova de verdade
  // e conferir que o valor NAO mudou.
  const afterUpdate = JSON.parse(
    (await restRaw(env, `channels?select=name&organization_id=eq.${secondOrgId}`, service)).body,
  )
  check(
    'UPDATE cruzado nao alterou nada',
    afterUpdate.every((r) => !r.name.includes('invadido')) ? 'intacto' : 'ALTERADO',
    'intacto',
  )
  void updateLeak

  await restRaw(env, `transactions?organization_id=eq.${secondOrgId}`, {
    ...ownerAs,
    method: 'DELETE',
  })
  const afterDelete = JSON.parse(
    (await restRaw(env, `transactions?select=id&organization_id=eq.${secondOrgId}`, service)).body,
  )
  check(
    'DELETE cruzado nao apagou nada',
    afterDelete.length === 1 ? 'intacto' : `${afterDelete.length} linha(s)`,
    'intacto',
  )

  // is_org_member da org 2 tem de ser false para o membro da org 1.
  const memberOfTwo = await restRaw(env, 'rpc/is_org_member', {
    ...ownerAs,
    method: 'POST',
    body: JSON.stringify({ p_organization_id: secondOrgId }),
  })
  check('is_org_member(org 2) para membro da org 1', memberOfTwo.body.trim(), 'false')

  /* --- service_role continua administrando --- */

  check(
    'service_role ve os dados da org 2',
    classify(
      await restRaw(env, `transactions?select=id&organization_id=eq.${secondOrgId}`, service),
    ),
    'rows',
  )
  check(
    'service_role altera dados da org 2',
    classify(
      await restRaw(env, `channels?organization_id=eq.${secondOrgId}`, {
        ...service,
        method: 'PATCH',
        body: JSON.stringify({ active: false }),
      }),
    ),
    ['ok', 'rows'],
  )
}

/* -------------------------------------------------------------------------- */
/* Limpeza                                                                    */
/* -------------------------------------------------------------------------- */

async function cleanup() {
  console.log('\nLimpando...')
  let problems = 0

  // Ordem inversa: o que foi criado por ultimo sai primeiro.
  for (const task of cleanupTasks.reverse()) {
    try {
      await task()
    } catch (error) {
      problems += 1
      console.error(`  falha numa limpeza: ${error.message}`)
    }
  }

  if (HAS_SERVICE_ROLE) {
    // Varredura final por qualquer sobra com o TAG.
    for (const table of ['channels', 'categories', 'products', 'transactions']) {
      await restRaw(env, `${table}?name=like.*${TAG}*`, { ...service, method: 'DELETE' }).catch(() => {})
    }
    await restRaw(env, `transactions?description=like.*${TAG}*`, { ...service, method: 'DELETE' }).catch(() => {})
    await restRaw(env, `organizations?slug=like.*${TAG}*`, { ...service, method: 'DELETE' }).catch(() => {})
  }

  console.log(problems === 0 ? 'Limpeza concluida.' : `Limpeza com ${problems} problema(s) -- procure por "${TAG}".`)
}

/* -------------------------------------------------------------------------- */

async function main() {
  console.log(`Projeto: ${env.NEXT_PUBLIC_SUPABASE_URL}`)
  console.log(`Service role: ${HAS_SERVICE_ROLE ? 'disponivel' : 'AUSENTE (parte sera pulada)'}`)

  const state = await detectState()
  console.log(`Estado detectado: ${state}\n`)

  if (state === 'FOUNDATION') {
    console.log('AVISO: neste estado anon ainda escreve nas tabelas de negocio.')
    console.log('       Os testes CONFIRMAM esse risco em vez de reprova-lo.\n')
  }

  try {
    // service_role primeiro: ele descobre o orgId que os outros grupos usam.
    await testServiceRole(state)
    await testAnonBusiness(state)
    await testAnonViewsAndRpc(state)
    await testAnonIntegration(state)
    await testOutsider(state)
    await testOwner(state)
    await testIsolation(state)
  } catch (error) {
    failed += 1
    failures.push(`erro inesperado: ${error.message}`)
    console.error(`\nERRO: ${error.message}`)
  } finally {
    await cleanup()
  }

  console.log(`\n=== ${passed} ok, ${failed} falharam, ${skipped} pulados (estado ${state}) ===`)
  if (failures.length) {
    console.log('\nFalhas:')
    for (const item of failures) console.log(`  - ${item}`)
  }
  process.exit(failed === 0 ? 0 : 1)
}

main()
