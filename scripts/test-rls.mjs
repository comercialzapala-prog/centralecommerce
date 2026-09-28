#!/usr/bin/env node
/**
 * Testes REAIS de permissao contra o Supabase linkado.
 *
 *   node scripts/test-rls.mjs
 *
 * Roda nos tres estados e SABE em qual esta -- as expectativas mudam com o
 * estado, entao o mesmo arquivo serve de baseline antes e de prova depois:
 *
 *   PRE_FOUNDATION  20260928120000 ainda nao aplicada
 *   FOUNDATION      aplicada; modo aberto da V2 ainda vale para anon
 *   HARDENED        20261005000000_rls_hardening.sql aplicada; anon sem acesso
 *
 * DISTINCAO QUE O SCRIPT FAZ E QUE IMPORTA MAIS QUE TUDO AQUI:
 *
 *   denied  -> o GRANT nao existe. HTTP 401/403. Barreira dura.
 *   empty   -> o grant existe, a RLS filtrou. HTTP 200 com [].
 *
 * Em SELECT a RLS nao levanta erro, ela remove linhas. Um teste que so olhasse
 * "deu erro?" daria como aprovado um vazamento em que a policy esta larga e a
 * tabela simplesmente estava vazia -- e daria como falha um isolamento
 * funcionando. Por isso `empty` e um resultado esperado distinto de `denied`.
 *
 * ESCRITAS: o script cria dados marcados com um prefixo unico e apaga tudo no
 * final, inclusive se algum teste falhar. Nao encosta em nada preexistente.
 */

import {
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

/* -------------------------------------------------------------------------- */
/* Classificacao do resultado                                                  */
/* -------------------------------------------------------------------------- */

function classify(res) {
  if (res.status === 404) {
    let code = null
    try {
      code = JSON.parse(res.body)?.code ?? null
    } catch {
      /* corpo nao-JSON */
    }
    if (code === 'PGRST205' || code === '42P01') return 'missing'
  }
  if (res.status === 401 || res.status === 403) return 'denied'
  if (res.status === 409) return 'conflict'

  if (res.status >= 200 && res.status < 300) {
    // 42501 pode chegar como 400 em algumas rotas.
    if (res.body.includes('42501')) return 'denied'
    try {
      const parsed = JSON.parse(res.body)
      if (Array.isArray(parsed)) return parsed.length > 0 ? 'rows' : 'empty'
    } catch {
      /* 204 sem corpo */
    }
    return 'ok'
  }

  let code = null
  try {
    code = JSON.parse(res.body)?.code ?? null
  } catch {
    /* ignora */
  }
  if (code === '42501') return 'denied'
  return `erro${res.status}${code ? `/${code}` : ''}`
}

/* -------------------------------------------------------------------------- */
/* Runner                                                                      */
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

function skip(label, why) {
  skipped += 1
  console.log(`   pulado  ${label}  (${why})`)
}

/* -------------------------------------------------------------------------- */
/* Deteccao de estado                                                          */
/* -------------------------------------------------------------------------- */

async function detectState() {
  const orgs = classify(await restRaw(env, 'organizations?select=id&limit=1', anon))
  if (orgs === 'missing') return 'PRE_FOUNDATION'

  const business = classify(await restRaw(env, 'categories?select=id&limit=1', anon))
  return business === 'denied' ? 'HARDENED' : 'FOUNDATION'
}

/* -------------------------------------------------------------------------- */
/* Grupos de teste                                                             */
/* -------------------------------------------------------------------------- */

const createdChannels = []

async function testAnonBusinessTables(state) {
  console.log('\n1) anon nas tabelas de negocio (SELECT/INSERT/UPDATE/DELETE)')

  const readExpected = state === 'HARDENED' ? 'denied' : ['rows', 'empty']
  // 'ok' = 204 sem corpo; 'rows' = 201 com Prefer: return=representation.
  // Os dois significam escrita aceita.
  const writeExpected = state === 'HARDENED' ? 'denied' : ['ok', 'rows']

  check('anon SELECT categories', classify(await restRaw(env, 'categories?select=id&limit=1', anon)), readExpected)
  check('anon SELECT transactions', classify(await restRaw(env, 'transactions?select=id&limit=1', anon)), readExpected)

  // INSERT: prova concreta de escrita publica. Linha marcada e removida depois.
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
      const rows = JSON.parse(insert.body)
      if (Array.isArray(rows) && rows[0]?.id) createdChannels.push(rows[0].id)
    } catch {
      /* sem representation */
    }
  }

  const id = createdChannels[0]

  if (id) {
    check(
      'anon UPDATE channels',
      classify(
        await restRaw(env, `channels?id=eq.${id}`, {
          ...anon,
          method: 'PATCH',
          body: JSON.stringify({ name: `${name} editado` }),
        }),
      ),
      writeExpected,
    )
    check(
      'anon DELETE channels',
      classify(await restRaw(env, `channels?id=eq.${id}`, { ...anon, method: 'DELETE' })),
      writeExpected,
    )
    if (state !== 'HARDENED') createdChannels.length = 0 // o proprio DELETE limpou
  } else {
    check(
      'anon UPDATE channels (sem linha criada)',
      classify(
        await restRaw(env, `channels?name=eq.${encodeURIComponent(name)}`, {
          ...anon,
          method: 'PATCH',
          body: JSON.stringify({ active: false }),
        }),
      ),
      writeExpected,
    )
    check(
      'anon DELETE channels (sem linha criada)',
      classify(
        await restRaw(env, `channels?name=eq.${encodeURIComponent(name)}`, {
          ...anon,
          method: 'DELETE',
        }),
      ),
      writeExpected,
    )
  }
}

async function testErpConnections(state) {
  console.log('\n2) erp_connections -- a tabela dos segredos')

  if (state === 'PRE_FOUNDATION') {
    skip('erp_connections', 'fundacao nao aplicada')
    return
  }

  // ESTE E O TESTE QUE NAO PODE FALHAR EM NENHUM ESTADO.
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
  // select=* precisa falhar tambem: ele inclui as colunas cifradas.
  check(
    'anon SELECT * em erp_connections',
    classify(await restRaw(env, 'erp_connections?select=*&limit=1', anon)),
    'denied',
  )

  const statusExpected = state === 'HARDENED' ? 'denied' : ['rows', 'empty']
  check(
    'anon SELECT colunas de status',
    classify(await restRaw(env, 'erp_connections?select=id,status,has_access_token&limit=1', anon)),
    statusExpected,
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

async function testViews(state) {
  console.log('\n3) views')

  const v2Expected = state === 'HARDENED' ? 'denied' : ['rows', 'empty']
  for (const view of ['v_transaction_full', 'v_product_stats', 'v_order_result']) {
    check(`anon SELECT ${view}`, classify(await restRaw(env, `${view}?select=*&limit=1`, anon)), v2Expected)
  }

  if (state === 'PRE_FOUNDATION') {
    skip('views de integracao', 'fundacao nao aplicada')
    return
  }

  for (const view of ['v_erp_connection_status', 'v_integration_queue_health', 'v_sales_fact']) {
    check(`anon SELECT ${view}`, classify(await restRaw(env, `${view}?select=*&limit=1`, anon)), v2Expected)
  }

  // A view de status nao pode expor token nem indiretamente.
  const res = await restRaw(env, 'v_erp_connection_status?select=*&limit=1', anon)
  if (classify(res) === 'rows' || classify(res) === 'empty') {
    const leaks = /access_token_encrypted|refresh_token_encrypted/.test(res.body)
    check('v_erp_connection_status nao projeta token', leaks ? 'VAZOU' : 'limpo', 'limpo')
  } else {
    skip('v_erp_connection_status nao projeta token', 'anon sem acesso a view')
  }
}

async function testIntegrationWrites(state) {
  console.log('\n4) escrita nas tabelas de integracao por anon (deve ser sempre negada)')

  if (state === 'PRE_FOUNDATION') {
    skip('integration_events / integration_jobs', 'fundacao nao aplicada')
    return
  }

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
        body: JSON.stringify({ job_type: 'PROCESS_EVENT', provider: 'BLING' }),
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
    classify(await restRaw(env, `integration_events?external_event_id=eq.${TAG}`, { ...anon, method: 'DELETE' })),
    'denied',
  )

  const readExpected = state === 'HARDENED' ? 'denied' : ['rows', 'empty']
  check(
    'anon SELECT integration_jobs',
    classify(await restRaw(env, 'integration_jobs?select=id&limit=1', anon)),
    readExpected,
  )
}

const createdEvents = []
const createdJobs = []
let orgId = null

async function testServiceRole(state) {
  console.log('\n5) service_role')

  if (!HAS_SERVICE_ROLE) {
    skip('service_role', 'SUPABASE_SERVICE_ROLE_KEY nao definida')
    return
  }
  if (state === 'PRE_FOUNDATION') {
    skip('service_role nas tabelas de integracao', 'fundacao nao aplicada')
    return
  }

  const orgRes = await restRaw(env, 'organizations?select=id&limit=1', service)
  try {
    orgId = JSON.parse(orgRes.body)?.[0]?.id ?? null
  } catch {
    orgId = null
  }
  check('service_role le organizations', classify(orgRes), 'rows')

  if (!orgId) {
    skip('escritas com service_role', 'nenhuma organizacao encontrada')
    return
  }

  // Token em claro: service role PODE ler. E o unico que pode.
  check(
    'service_role le access_token_encrypted',
    classify(await restRaw(env, 'erp_connections?select=access_token_encrypted&limit=1', service)),
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
      payload: { tag: TAG },
    }),
    headers: { Prefer: 'return=representation' },
  })
  check('service_role INSERT integration_events', classify(first), 'rows')
  try {
    const id = JSON.parse(first.body)?.[0]?.id
    if (id) createdEvents.push(id)
  } catch {
    /* ignora */
  }

  // Reenvio do MESMO eventId: a constraint tem de recusar (secao 6).
  check(
    'evento duplicado e recusado pelo UNIQUE',
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
  const job = await restRaw(env, 'integration_jobs', {
    ...service,
    method: 'POST',
    body: JSON.stringify(jobBody),
    headers: { Prefer: 'return=representation' },
  })
  check('service_role INSERT integration_jobs', classify(job), 'rows')
  try {
    const id = JSON.parse(job.body)?.[0]?.id
    if (id) createdJobs.push(id)
  } catch {
    /* ignora */
  }

  // Segundo job identico ainda PENDING: o indice parcial tem de recusar (secao 8).
  check(
    'job pendente duplicado e recusado pelo indice parcial',
    classify(
      await restRaw(env, 'integration_jobs', {
        ...service,
        method: 'POST',
        body: JSON.stringify(jobBody),
      }),
    ),
    'conflict',
  )
}

/* -------------------------------------------------------------------------- */
/* authenticated + isolamento por organizacao                                  */
/* -------------------------------------------------------------------------- */

const createdUsers = []
let secondOrgId = null

async function testAuthenticatedAndIsolation(state) {
  console.log('\n6) authenticated e isolamento por organization_id')

  if (!HAS_SERVICE_ROLE) {
    skip('authenticated', 'precisa de service role para criar o usuario de teste')
    return
  }
  if (state === 'PRE_FOUNDATION') {
    skip('authenticated', 'fundacao nao aplicada')
    return
  }

  const password = `Teste-${Date.now()}-aA1!`
  const memberEmail = `${TAG}.member@exemplo.invalid`
  const outsiderEmail = `${TAG}.outsider@exemplo.invalid`

  const memberId = await adminCreateUser(env, memberEmail, password)
  const outsiderId = await adminCreateUser(env, outsiderEmail, password)
  if (memberId) createdUsers.push(memberId)
  if (outsiderId) createdUsers.push(outsiderId)

  if (!orgId) {
    const orgRes = await restRaw(env, 'organizations?select=id&limit=1', service)
    try {
      orgId = JSON.parse(orgRes.body)?.[0]?.id ?? null
    } catch {
      orgId = null
    }
  }
  if (!orgId || !memberId) {
    skip('authenticated', 'nao foi possivel preparar organizacao/usuario')
    return
  }

  // O membro entra na organizacao; o outsider NAO.
  await restRaw(env, 'organization_members', {
    ...service,
    method: 'POST',
    body: JSON.stringify({ organization_id: orgId, user_id: memberId, role: 'OWNER' }),
    headers: { Prefer: 'resolution=merge-duplicates' },
  })

  const member = await signIn(env, memberEmail, password)
  const outsider = await signIn(env, outsiderEmail, password)

  const asMember = { key: env.NEXT_PUBLIC_SUPABASE_ANON_KEY, bearer: member.accessToken }
  const asOutsider = { key: env.NEXT_PUBLIC_SUPABASE_ANON_KEY, bearer: outsider.accessToken }

  check(
    'membro SELECT categories',
    classify(await restRaw(env, 'categories?select=id&limit=1', asMember)),
    ['rows', 'empty'],
  )

  // ESTE E O TESTE DE ISOLAMENTO. Antes do hardening o outsider ve tudo
  // (a policy e USING(true)); depois, a RLS filtra e ele ve zero linhas.
  check(
    'NAO-membro SELECT categories',
    classify(await restRaw(env, 'categories?select=id&limit=1', asOutsider)),
    state === 'HARDENED' ? ['empty', 'denied'] : ['rows', 'empty'],
  )

  check(
    'membro nao le access_token_encrypted',
    classify(await restRaw(env, 'erp_connections?select=access_token_encrypted&limit=1', asMember)),
    'denied',
  )

  check(
    'membro nao escreve em integration_jobs',
    classify(
      await restRaw(env, 'integration_jobs', {
        ...asMember,
        method: 'POST',
        body: JSON.stringify({ organization_id: orgId, job_type: `${TAG}_AUTH`, provider: 'BLING' }),
      }),
    ),
    'denied',
  )

  // Isolamento entre organizacoes: cria uma segunda org com um alerta dentro e
  // confirma que o membro da primeira nao alcanca.
  const secondOrg = await restRaw(env, 'organizations', {
    ...service,
    method: 'POST',
    body: JSON.stringify({ name: `${TAG} Org 2`, slug: `${TAG}-org2` }),
    headers: { Prefer: 'return=representation' },
  })
  try {
    secondOrgId = JSON.parse(secondOrg.body)?.[0]?.id ?? null
  } catch {
    secondOrgId = null
  }

  if (!secondOrgId) {
    skip('isolamento entre organizacoes', 'nao foi possivel criar a segunda organizacao')
    return
  }

  await restRaw(env, 'alerts', {
    ...service,
    method: 'POST',
    body: JSON.stringify({
      organization_id: secondOrgId,
      rule_code: 'TESTE',
      domain: 'INTEGRACAO',
      severity: 'CRITICO',
      title: `${TAG} alerta da org 2`,
      what_happened: 'teste',
      why_it_matters: 'teste',
      fingerprint: `${TAG}-org2`,
    }),
  })

  const leak = await restRaw(
    env,
    `alerts?select=id&organization_id=eq.${secondOrgId}`,
    asMember,
  )
  check(
    'membro da org 1 NAO ve alerta da org 2',
    classify(leak),
    state === 'HARDENED' ? ['empty', 'denied'] : ['rows', 'empty'],
  )
  if (state !== 'HARDENED' && classify(leak) === 'rows') {
    console.log('           ^ esperado neste estado: a policy atual e USING(true).')
  }
}

/* -------------------------------------------------------------------------- */
/* Limpeza                                                                     */
/* -------------------------------------------------------------------------- */

async function cleanup() {
  console.log('\nLimpando...')
  const client = HAS_SERVICE_ROLE ? service : anon

  try {
    for (const id of createdJobs) await restRaw(env, `integration_jobs?id=eq.${id}`, { ...client, method: 'DELETE' })
    for (const id of createdEvents) await restRaw(env, `integration_events?id=eq.${id}`, { ...client, method: 'DELETE' })
    for (const id of createdChannels) await restRaw(env, `channels?id=eq.${id}`, { ...client, method: 'DELETE' })

    // Sobra de job/evento criados com o TAG mas sem id capturado.
    if (HAS_SERVICE_ROLE) {
      await restRaw(env, `integration_jobs?job_type=like.${TAG}*`, { ...service, method: 'DELETE' })
      await restRaw(env, `integration_events?external_event_id=like.${TAG}*`, { ...service, method: 'DELETE' })
      await restRaw(env, `channels?name=like.${TAG}*`, { ...service, method: 'DELETE' })

      if (secondOrgId) {
        // alerts tem FK com on delete cascade para organizations.
        await restRaw(env, `organizations?id=eq.${secondOrgId}`, { ...service, method: 'DELETE' })
      }
      for (const userId of createdUsers) await adminDeleteUser(env, userId)
    }
    console.log('Limpeza concluida.')
  } catch (error) {
    console.error(`ATENCAO: a limpeza falhou (${error.message}).`)
    console.error(`Procure e remova manualmente o que tiver "${TAG}".`)
  }
}

/* -------------------------------------------------------------------------- */

async function main() {
  console.log(`Projeto: ${env.NEXT_PUBLIC_SUPABASE_URL}`)
  console.log(`Service role: ${HAS_SERVICE_ROLE ? 'disponivel' : 'AUSENTE (parte dos testes sera pulada)'}`)

  const state = await detectState()
  console.log(`Estado detectado: ${state}\n`)

  if (state === 'FOUNDATION') {
    console.log('AVISO: neste estado anon ainda escreve nas tabelas de negocio.')
    console.log('       Os testes abaixo CONFIRMAM esse risco em vez de reprova-lo.')
    console.log('       Aplique supabase/pending/20261005000000_rls_hardening.sql para fechar.\n')
  }

  try {
    await testAnonBusinessTables(state)
    await testErpConnections(state)
    await testViews(state)
    await testIntegrationWrites(state)
    await testServiceRole(state)
    await testAuthenticatedAndIsolation(state)
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
