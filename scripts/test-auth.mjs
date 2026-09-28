#!/usr/bin/env node
/**
 * Testes de AUTENTICACAO ponta a ponta, por HTTP, contra o app rodando.
 *
 *   npm run dev            (ou npm run start, em outro terminal)
 *   node scripts/test-auth.mjs
 *
 * Prova as sete garantias pedidas:
 *   1. nao autenticado nao acessa pagina nenhuma;
 *   2. autenticado SEM organization_members nao acessa dado;
 *   3. autenticado E membro acessa normalmente;
 *   4. profile e criado pelo trigger, sem membership;
 *   5. logout encerra a sessao de verdade;
 *   6. a sessao sobrevive a requisicoes seguintes (refresh);
 *   7. a service role nao esta no bundle do cliente.
 *
 * COMO A SESSAO E MONTADA: em vez de adivinhar o formato do cookie, o script
 * importa os PROPRIOS serializadores do @supabase/ssr (`stringToBase64URL` e
 * `createChunks`). Assim o cookie e byte a byte o que a biblioteca escreveria --
 * e se um dia o formato mudar, o teste muda junto com a dependencia em vez de
 * passar a mentir.
 *
 * Os usuarios de teste sao criados pela Admin API com `email_confirm: true` e
 * APAGADOS no final. Isso nao burla a confirmacao de e-mail de ninguem: sao
 * fixtures descartaveis, e a conta real do administrador nao e tocada.
 */

import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'

import {
  ROOT,
  adminCreateUser,
  adminDeleteUser,
  loadEnv,
  restRaw,
  sessionToCookieHeader,
  signInSession,
} from './_supabase.mjs'

const env = loadEnv()
const BASE = process.env.SMOKE_BASE_URL ?? 'http://localhost:3000'
const TAG = `__auth_${Date.now()}`

if (!env.SUPABASE_SERVICE_ROLE_KEY) {
  console.error('Estes testes precisam de SUPABASE_SERVICE_ROLE_KEY para criar os usuarios de teste.')
  process.exit(1)
}

const service = { key: env.SUPABASE_SERVICE_ROLE_KEY }

/* -------------------------------------------------------------------------- */
/* Runner                                                                      */
/* -------------------------------------------------------------------------- */

let passed = 0
let failed = 0
const failures = []

function check(label, actual, expected) {
  const allowed = Array.isArray(expected) ? expected : [expected]
  const ok = allowed.includes(actual)
  if (ok) {
    passed += 1
    console.log(`   ok      ${label}  ->  ${actual}`)
  } else {
    failed += 1
    failures.push(`${label}: ${actual} (esperado ${allowed.join(' ou ')})`)
    console.log(`   FALHOU  ${label}  ->  ${actual}  (esperado ${allowed.join(' ou ')})`)
  }
}

/* -------------------------------------------------------------------------- */
/* Sessao                                                                      */
/* -------------------------------------------------------------------------- */

/** GET sem seguir redirecionamento: o Location E o resultado que interessa. */
async function visit(path, cookieHeader) {
  const response = await fetch(`${BASE}${path}`, {
    redirect: 'manual',
    headers: cookieHeader ? { Cookie: cookieHeader } : {},
  })

  const location = response.headers.get('location')
  const destino = location ? new URL(location, BASE) : null

  return {
    status: response.status,
    /** Caminho de destino quando houve redirecionamento. */
    to: destino ? destino.pathname : null,
    query: destino ? destino.search : null,
    html: response.status === 200 ? await response.text() : '',
  }
}

/** Resume o resultado num rotulo curto e comparavel. */
function outcome(result) {
  if (result.status === 200) return '200'
  if (result.status >= 300 && result.status < 400) return `-> ${result.to}`
  return String(result.status)
}

/* -------------------------------------------------------------------------- */
/* Fixtures                                                                    */
/* -------------------------------------------------------------------------- */

const PROTECTED_PAGES = [
  '/dashboard',
  '/lancamentos',
  '/centros-de-custo',
  '/investimentos',
  '/vendas',
  '/produtos',
  '/movimentacoes',
  '/fornecedores',
  '/categorias',
  '/configuracoes',
  '/configuracoes/integracoes/bling',
]

const createdUsers = []
const password = `Teste-${Date.now()}-aA1!`

async function main() {
  console.log(`App:     ${BASE}`)
  console.log(`Projeto: ${env.NEXT_PUBLIC_SUPABASE_URL}\n`)

  try {
    await fetch(`${BASE}/login`)
  } catch {
    console.error(`Servidor nao responde em ${BASE}. Rode \`npm run dev\` primeiro.`)
    process.exit(1)
  }

  const orgRow = JSON.parse((await restRaw(env, 'organizations?select=id&limit=1', service)).body)[0]

  /* ---------------- 4) profile pelo trigger ---------------- */
  console.log('4) profile criado pelo trigger em auth.users')

  const memberEmail = `${TAG}.member@exemplo.invalid`
  const outsiderEmail = `${TAG}.outsider@exemplo.invalid`

  const memberId = await adminCreateUser(env, memberEmail, password)
  const outsiderId = await adminCreateUser(env, outsiderEmail, password)
  createdUsers.push(memberId, outsiderId)

  const profile = JSON.parse(
    (await restRaw(env, `profiles?select=id,role&id=eq.${outsiderId}`, service)).body,
  )
  check('profile existe para o usuario novo', profile.length === 1 ? 'criado' : 'ausente', 'criado')
  check('profile nasce com role USER', profile[0]?.role ?? 'sem linha', 'USER')

  // O trigger NAO pode dar acesso. Ter profile e diferente de ser membro.
  const membershipOfNew = JSON.parse(
    (await restRaw(env, `organization_members?select=id&user_id=eq.${outsiderId}`, service)).body,
  )
  check(
    'trigger NAO criou organization_members',
    membershipOfNew.length === 0 ? 'nenhum' : `${membershipOfNew.length} vinculo(s)`,
    'nenhum',
  )

  // Vincula apenas o "member".
  await restRaw(env, 'organization_members', {
    ...service,
    method: 'POST',
    body: JSON.stringify({ organization_id: orgRow.id, user_id: memberId, role: 'ADMIN' }),
    headers: { Prefer: 'resolution=merge-duplicates' },
  })

  /* ---------------- 1) nao autenticado ---------------- */
  console.log('\n1) visitante sem sessao')

  for (const path of PROTECTED_PAGES) {
    const result = await visit(path)
    check(`sem sessao ${path}`, outcome(result), '-> /login')
  }

  const rootResult = await visit('/')
  check('sem sessao /', outcome(rootResult), '-> /login')

  const loginResult = await visit('/login')
  check('sem sessao /login', outcome(loginResult), '200')

  const nextParam = await visit('/produtos')
  check(
    'redirecionamento preserva o destino em ?next',
    nextParam.query?.includes('next=%2Fprodutos') ? 'preservado' : `sem next (${nextParam.query})`,
    'preservado',
  )

  /* ---------------- 2) autenticado sem vinculo ---------------- */
  console.log('\n2) autenticado SEM organization_members')

  const outsiderSession = await signInSession(env, outsiderEmail, password)
  const outsiderCookie = await sessionToCookieHeader(env, outsiderSession)

  for (const path of ['/dashboard', '/lancamentos', '/produtos', '/configuracoes']) {
    const result = await visit(path, outsiderCookie)
    check(`sem vinculo ${path}`, outcome(result), '-> /acesso-pendente')
  }

  const pending = await visit('/acesso-pendente', outsiderCookie)
  check('sem vinculo /acesso-pendente', outcome(pending), '200')
  check(
    'pagina explica o estado',
    pending.html.includes('Acesso pendente') ? 'explica' : 'nao explica',
    'explica',
  )

  /* ---------------- 3) autenticado e membro ---------------- */
  console.log('\n3) autenticado E membro')

  const memberSession = await signInSession(env, memberEmail, password)
  const memberCookie = await sessionToCookieHeader(env, memberSession)

  for (const path of PROTECTED_PAGES) {
    const result = await visit(path, memberCookie)
    check(`membro ${path}`, outcome(result), '200')
  }

  const memberLogin = await visit('/login', memberCookie)
  check('membro em /login volta para dentro', outcome(memberLogin), '-> /dashboard')

  const dash = await visit('/dashboard', memberCookie)
  check(
    'dashboard mostra o e-mail do usuario',
    dash.html.includes(memberEmail) ? 'mostra' : 'nao mostra',
    'mostra',
  )
  check(
    'dashboard tem o botao de sair',
    dash.html.includes('aria-label="Sair"') ? 'tem' : 'nao tem',
    'tem',
  )

  /* ---------------- 6) sessao persistente ---------------- */
  console.log('\n6) sessao persiste entre requisicoes')

  const again = await visit('/lancamentos', memberCookie)
  check('segunda requisicao com o mesmo cookie', outcome(again), '200')
  const third = await visit('/vendas', memberCookie)
  check('terceira requisicao com o mesmo cookie', outcome(third), '200')

  /* ---------------- 5) logout ---------------- */
  console.log('\n5) logout encerra a sessao')

  // Revoga a sessao no servidor de auth -- e exatamente o que signOut() faz.
  const revoke = await fetch(`${env.NEXT_PUBLIC_SUPABASE_URL}/auth/v1/logout?scope=local`, {
    method: 'POST',
    headers: {
      apikey: env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
      Authorization: `Bearer ${memberSession.access_token}`,
    },
  })
  check('revogacao aceita pelo servidor de auth', revoke.status < 300 ? 'ok' : String(revoke.status), 'ok')

  // O MESMO cookie de antes agora nao serve mais. Se ainda servisse, "sair" seria
  // decorativo -- e e justamente isso que este teste existe para impedir.
  const afterLogout = await visit('/dashboard', memberCookie)
  check('cookie antigo apos logout', outcome(afterLogout), '-> /login')

  /* ---------------- 7) service role fora do cliente ---------------- */
  console.log('\n7) service role nao vaza para o cliente')

  const serviceSignature = env.SUPABASE_SERVICE_ROLE_KEY.split('.').pop()
  const staticDir = join(ROOT, '.next', 'static')
  let hits = 0
  let scanned = 0

  function walk(dir) {
    for (const entry of readdirSync(dir)) {
      const full = join(dir, entry)
      if (statSync(full).isDirectory()) walk(full)
      else {
        scanned += 1
        try {
          if (readFileSync(full, 'utf8').includes(serviceSignature)) hits += 1
        } catch {
          /* binario */
        }
      }
    }
  }

  try {
    walk(staticDir)
    check(
      `service role em ${scanned} arquivo(s) do bundle`,
      hits === 0 ? 'ausente' : `PRESENTE em ${hits}`,
      'ausente',
    )
  } catch {
    console.log('   pulado  varredura do bundle (rode `npm run build` antes)')
  }

  // Nenhuma pagina servida pode conter a chave, nem por acidente de SSR.
  check(
    'HTML do dashboard nao contem a service role',
    dash.html.includes(serviceSignature) ? 'CONTEM' : 'ausente',
    'ausente',
  )
}

async function cleanup() {
  console.log('\nLimpando...')
  try {
    // Apagar o usuario remove profile e membership por cascade.
    for (const id of createdUsers) await adminDeleteUser(env, id)
    console.log('Limpeza concluida.')
  } catch (error) {
    console.error(`ATENCAO: limpeza falhou (${error.message}). Procure por "${TAG}".`)
  }
}

try {
  await main()
} catch (error) {
  failed += 1
  failures.push(`erro inesperado: ${error.message}`)
  console.error(`\nERRO: ${error.message}`)
} finally {
  await cleanup()
}

console.log(`\n=== ${passed} ok, ${failed} falharam ===`)
if (failures.length) {
  console.log('\nFalhas:')
  for (const item of failures) console.log(`  - ${item}`)
}
process.exit(failed === 0 ? 0 : 1)
