#!/usr/bin/env node
/**
 * FRONTEIRA DE IDENTIDADE DOS CLIENTS SUPABASE
 *
 *   npm run start          (ou npm run dev, em outro terminal)
 *   node scripts/test-client-boundaries.mjs
 *
 * POR QUE ESTE ARQUIVO EXISTE
 *
 * Em 2026-09-29 a producao caiu com `permission denied for table products`. A
 * causa foi um deploy antigo, anterior ao login, consultando como `anon` contra
 * um banco que o hardening havia fechado. Ao investigar, apareceram DUAS
 * armadilhas latentes que aquele erro estava disfarcando:
 *
 *   1. `src/lib/supabase.ts` -- client anon em escopo de MODULO, com
 *      `|| 'placeholder'` nas credenciais. Nao era importado por ninguem, mas
 *      estava a um autocomplete de voltar a ser;
 *   2. `createInfraClient()` caia para o client de cookie quando a service role
 *      nao estava configurada -- um caminho de negocio que trocava de identidade
 *      em silencio conforme uma variavel de ambiente e que, sem sessao (webhook,
 *      cron), resolvia para `anon`.
 *
 * Teste de permissao no banco nao pega nenhuma das duas: o banco estava CORRETO
 * nos dois casos. O que estava errado era QUEM a aplicacao mandava perguntar.
 * Por isso metade deste arquivo le o codigo-fonte, e nao o banco.
 *
 * A REGRA QUE ELE DEFENDE:
 *
 *   dado de negocio  -> createAuthedClient()  (cookie do usuario, passa pela RLS)
 *   infraestrutura   -> createInfraClient()   (service role, sem usuario)
 *   nunca            -> client anon em codigo de negocio, nem queda silenciosa
 */

import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'

import { loadEnv, restRaw, ROOT, sessionToCookieHeader, signInSession } from './_supabase.mjs'

const env = loadEnv()
const BASE = process.env.SMOKE_BASE_URL ?? 'http://localhost:3000'

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

/* -------------------------------------------------------------------------- */
/* Leitura do codigo-fonte                                                    */
/* -------------------------------------------------------------------------- */

const SRC = join(ROOT, 'src')

function sourceFiles(dir = SRC) {
  const out = []
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) out.push(...sourceFiles(full))
    else if (/\.(ts|tsx)$/.test(entry)) out.push(full)
  }
  return out
}

const FILES = sourceFiles().map((path) => ({
  path: relative(ROOT, path).replace(/\\/g, '/'),
  body: readFileSync(path, 'utf8'),
}))

function filesMatching(pattern, filter = () => true) {
  return FILES.filter((file) => filter(file.path) && pattern.test(file.body)).map((f) => f.path)
}

/* ========================================================================== */

async function main() {
  console.log(`App:     ${BASE}`)
  console.log(`Fontes:  ${FILES.length} arquivos em src/\n`)

  /* ---------------- 1) quem pode falar com o client base ---------------- */
  console.log('1) client base (@/lib/supabase/server)')

  // Somente o fluxo de autenticacao. Qualquer outro modulo que importe o client
  // base esta a uma linha de servir dado de negocio sem checar vinculo.
  const ALLOWED_BASE_IMPORT = ['src/lib/auth.ts', 'src/lib/auth-actions.ts']
  const strays = filesMatching(/from '@\/lib\/supabase\/server'/).filter(
    (path) => !ALLOWED_BASE_IMPORT.includes(path),
  )
  check(
    'client base importado so pelo fluxo de auth',
    strays.length === 0 ? 'so auth' : `fora da regra: ${strays.join(', ')}`,
    'so auth',
  )

  /* ---------------- 2) client em escopo de modulo ---------------- */
  console.log('\n2) client em escopo de modulo')

  // `export const supabase = createClient(...)` e o padrao mais perigoso do
  // ecossistema: uma instancia por processo, criada fora de request, que nunca
  // tem cookie -- portanto sempre anon. Era exatamente src/lib/supabase.ts.
  const moduleScoped = filesMatching(
    /^(?!.*await)(?:export )?const \w+ = create(?:Client|ServerClient)\(/m,
    (path) => path !== 'src/lib/supabase/client.ts' && path !== 'src/proxy.ts',
  )
  check(
    'nenhum client de modulo em codigo de negocio',
    moduleScoped.length === 0 ? 'nenhum' : `encontrados: ${moduleScoped.join(', ')}`,
    'nenhum',
  )

  // Credencial com default placeholder faz o client "funcionar" apontando para
  // lugar nenhum, em vez de falhar dizendo o que falta.
  const placeholderCreds = filesMatching(
    /process\.env\.NEXT_PUBLIC_SUPABASE_(?:ANON_KEY|URL) \|\|/,
  )
  check(
    'nenhuma credencial com default placeholder',
    placeholderCreds.length === 0 ? 'nenhuma' : `encontradas: ${placeholderCreds.join(', ')}`,
    'nenhuma',
  )

  /* ---------------- 3) queda silenciosa de identidade ---------------- */
  console.log('\n3) queda silenciosa de identidade')

  // O padrao que existia: `if (!serviceRole) return createServerClient(...)`.
  // Funcao de infra resolvendo para o client de cookie -- e, sem sessao, anon.
  const admin = FILES.find((f) => f.path === 'src/lib/supabase/admin.ts')
  check(
    'createInfraClient nao alcanca o client de cookie',
    admin && /supabase\/server/.test(admin.body) ? 'AINDA CAI' : 'sem queda',
    'sem queda',
  )

  /* ---------------- 4) camada de dados e actions ---------------- */
  console.log('\n4) camada de dados e actions')

  const data = FILES.find((f) => f.path === 'src/lib/data.ts')
  check(
    'data.ts usa o client autenticado',
    data && /createAuthedClient as createClient/.test(data.body) ? 'autenticado' : 'OUTRO CLIENT',
    'autenticado',
  )
  check(
    'data.ts nao toca em service role',
    data && /createAdminClient|createInfraClient/.test(data.body) ? 'TOCA' : 'nao toca',
    'nao toca',
  )

  // Uma excecao, documentada: /hoje escreve em alerts, recommendations e
  // auditor_runs, que depois do hardening so aceitam service_role -- e a action
  // checa vinculo e organization_id antes de cada escrita.
  const ACTIONS_WITH_SERVICE_ROLE = ['src/app/(app)/hoje/actions.ts']
  const actionFiles = FILES.filter((f) => /^src\/app\/\(app\)\/.*actions\.ts$/.test(f.path))
  const unexpected = actionFiles
    .filter((f) => /createAdminClient|createInfraClient/.test(f.body))
    .map((f) => f.path)
    .filter((path) => !ACTIONS_WITH_SERVICE_ROLE.includes(path))
  check(
    `actions de negocio sem service role (${actionFiles.length} arquivos)`,
    unexpected.length === 0 ? 'todas' : `com service role: ${unexpected.join(', ')}`,
    'todas',
  )

  /* ---------------- 5) paginas ---------------- */
  console.log('\n5) paginas')

  // Pagina que instancia service role renderiza ignorando a RLS. Consultar o
  // booleano `isServiceRoleConfigured()` continua permitido: nao cria client.
  const pagesWithPrivilege = FILES.filter(
    (f) =>
      /^src\/app\/.*page\.tsx$/.test(f.path) && /createAdminClient\(|createInfraClient\(/.test(f.body),
  ).map((f) => f.path)
  check(
    'nenhuma pagina instancia client privilegiado',
    pagesWithPrivilege.length === 0 ? 'nenhuma' : `instanciam: ${pagesWithPrivilege.join(', ')}`,
    'nenhuma',
  )

  /* ---------------- 6) anon contra o banco ---------------- */
  console.log('\n6) anon contra o banco')

  const anon = { key: env.NEXT_PUBLIC_SUPABASE_ANON_KEY }
  for (const table of ['products', 'orders', 'transactions', 'alerts', 'erp_connections']) {
    const res = await restRaw(env, `${table}?select=id&limit=1`, anon)
    const denied = res.status === 401 || res.status === 403 || res.body.includes('permission denied')
    check(`anon SELECT ${table}`, denied ? 'negado' : `PASSOU (${res.status})`, 'negado')
  }

  const insert = await restRaw(env, 'products', {
    ...anon,
    method: 'POST',
    body: JSON.stringify({ name: 'boundary-test', sku: 'BOUNDARY-TEST' }),
  })
  check(
    'anon INSERT products',
    insert.status === 401 || insert.status === 403 ? 'negado' : `PASSOU (${insert.status})`,
    'negado',
  )

  /* ---------------- 7) o dashboard pela porta da frente ---------------- */
  console.log('\n7) dashboard por HTTP')

  const anonDash = await fetch(`${BASE}/dashboard`, { redirect: 'manual' })
  check('anon em /dashboard vai para o login', String(anonDash.status), ['307', '302'])
  check('anon em /dashboard nao recebe 500', anonDash.status === 500 ? 'QUEBROU' : 'sem 500', 'sem 500')

  // Membro de verdade. Nenhum usuario de teste e criado aqui: test-auth.mjs ja
  // cobre criacao de conta, vinculo e ausencia de vinculo.
  const email = process.env.BOUNDARY_TEST_EMAIL
  const password = process.env.BOUNDARY_TEST_PASSWORD

  if (!email || !password) {
    skipped += 1
    console.log('   pulado  membro autenticado  ->  defina BOUNDARY_TEST_EMAIL e BOUNDARY_TEST_PASSWORD')
  } else {
    const session = await signInSession(env, email, password)
    const cookie = await sessionToCookieHeader(env, session)

    for (const path of ['/dashboard', '/produtos', '/vendas', '/lancamentos']) {
      const response = await fetch(`${BASE}${path}`, {
        redirect: 'manual',
        headers: { Cookie: cookie },
      })
      check(`membro ${path}`, String(response.status), '200')

      if (response.status === 200) {
        const html = await response.text()
        const broke = ['permission denied', 'Falha ao carregar', 'Minified React error'].find((m) =>
          html.includes(m),
        )
        check(`${path} sem erro de permissao`, broke ? `ACHOU "${broke}"` : 'limpo', 'limpo')
      }
    }
  }

  /* ---------------- 8) service role nao vaza ---------------- */
  console.log('\n8) service role')

  const key = env.SUPABASE_SERVICE_ROLE_KEY
  const loginHtml = await (await fetch(`${BASE}/login`)).text()
  check(
    'HTML servido nao contem a service role',
    key && loginHtml.includes(key) ? 'VAZOU' : 'nao vaza',
    'nao vaza',
  )
}

main()
  .then(() => {
    const tail = skipped > 0 ? `, ${skipped} pulado(s)` : ''
    console.log(`\n=== ${passed} ok, ${failed} falharam${tail} ===`)
    if (failed > 0) {
      console.log('\nFalhas:')
      for (const line of failures) console.log(`  - ${line}`)
      process.exit(1)
    }
  })
  .catch((error) => {
    console.error('\nErro fatal:', error.message)
    process.exit(1)
  })
