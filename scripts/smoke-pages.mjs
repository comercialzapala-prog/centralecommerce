#!/usr/bin/env node
/**
 * Smoke de regressao das paginas.
 *
 *   npm run dev            (ou npm run start, em outro terminal)
 *   node scripts/smoke-pages.mjs
 *
 * Roda antes e depois de uma migration para provar que nada regrediu.
 *
 * DEPOIS DO LOGIN, ele AUTENTICA. Sem isso toda pagina responderia 307 para
 * /login e o smoke passaria a medir o redirecionamento em vez do conteudo -- um
 * teste verde que nao olha mais para o que deveria olhar. Cria um usuario membro
 * descartavel, usa a sessao dele e apaga no final.
 *
 * Nao basta conferir HTTP 200: as paginas sao Server Components e o error
 * boundary responde 200 com a tela de erro. Por isso o script procura marcas de
 * falha no HTML e tambem uma marca de SUCESSO esperada por rota, para nao
 * aprovar pagina que devolveu casca vazia.
 */

import { createMemberSession, loadEnv } from './_supabase.mjs'

const BASE = process.env.SMOKE_BASE_URL ?? 'http://localhost:3000'
const env = loadEnv()

/** `expect` = trecho que precisa existir no HTML se a pagina renderizou mesmo. */
const ROUTES = [
  { path: '/dashboard', expect: 'Dashboard' },
  { path: '/lancamentos', expect: 'Lançamentos' },
  { path: '/centros-de-custo', expect: 'Centros de Custo' },
  { path: '/investimentos', expect: 'Investimentos' },
  { path: '/vendas', expect: 'Vendas' },
  { path: '/produtos', expect: 'Produtos' },
  { path: '/movimentacoes', expect: 'Movimenta' },
  { path: '/fornecedores', expect: 'Fornecedores' },
  { path: '/categorias', expect: 'Categorias' },
  { path: '/configuracoes', expect: 'Configurações' },
  { path: '/configuracoes/integracoes/bling', expect: 'Integração com o Bling' },
]

/** Rotas publicas: precisam responder SEM sessao. */
const PUBLIC_ROUTES = [{ path: '/login', expect: 'Entrar' }]

const ENDPOINTS = [
  // GET e só diagnóstico: 200 depois da fundação aplicada, 503 antes dela.
  { path: '/api/webhooks/bling', method: 'GET', expectStatus: [200, 503] },
  // POST é a recepção de evento. Enquanto webhooks_enabled for false ele TEM de
  // responder 503 (seção 5: endpoint criado e não ativado). Se um dia isso virar
  // 202 sem alguém ter ligado a flag de propósito, é regressão de segurança.
  {
    path: '/api/webhooks/bling',
    method: 'POST',
    expectStatus: [503],
    body: JSON.stringify({ eventId: 'smoke', event: 'product.updated' }),
  },
]

const FAILURE_MARKERS = [
  'Falha ao carregar',
  'Application error',
  'Internal Server Error',
  'permission denied',
  'PGRST',
  'Unhandled Runtime Error',
]

let passed = 0
let failed = 0
const failures = []

async function checkRoute(route, cookie) {
  let response
  try {
    response = await fetch(`${BASE}${route.path}`, {
      redirect: 'manual',
      headers: cookie ? { Cookie: cookie } : {},
    })
  } catch (error) {
    failed += 1
    failures.push(`${route.path}: sem resposta (${error.message})`)
    console.log(`   FALHOU  ${route.path.padEnd(38)} sem resposta`)
    return
  }

  const problems = []

  // Redirecionamento aqui significa que a sessao nao foi aceita.
  if (response.status >= 300 && response.status < 400) {
    problems.push(`redirecionou para ${response.headers.get('location')}`)
  } else if (response.status !== 200) {
    problems.push(`HTTP ${response.status}`)
  }

  const html = problems.length ? '' : await response.text()

  if (html) {
    const marker = FAILURE_MARKERS.find((needle) => html.includes(needle))
    if (marker) problems.push(`contem "${marker}"`)
    if (route.expect && !html.includes(route.expect)) {
      problems.push(`nao contem "${route.expect}"`)
    }
  }

  if (problems.length === 0) {
    passed += 1
    console.log(`   ok      ${route.path.padEnd(38)} ${response.status} ${html.length}b`)
  } else {
    failed += 1
    failures.push(`${route.path}: ${problems.join('; ')}`)
    console.log(`   FALHOU  ${route.path.padEnd(38)} ${problems.join('; ')}`)
  }
}

async function checkEndpoint(endpoint) {
  const label = `${endpoint.method} ${endpoint.path}`
  try {
    const response = await fetch(`${BASE}${endpoint.path}`, {
      method: endpoint.method,
      headers: endpoint.body ? { 'Content-Type': 'application/json' } : undefined,
      body: endpoint.body,
    })
    if (endpoint.expectStatus.includes(response.status)) {
      passed += 1
      console.log(`   ok      ${label.padEnd(38)} ${response.status}`)
    } else {
      failed += 1
      failures.push(`${label}: HTTP ${response.status}`)
      console.log(`   FALHOU  ${label.padEnd(38)} HTTP ${response.status}`)
    }
  } catch (error) {
    failed += 1
    failures.push(`${label}: ${error.message}`)
    console.log(`   FALHOU  ${label.padEnd(38)} ${error.message}`)
  }
}

async function main() {
  console.log(`Smoke em ${BASE}`)

  try {
    await fetch(`${BASE}/login`)
  } catch {
    console.error(`\nServidor nao responde em ${BASE}. Rode \`npm run dev\` primeiro.`)
    process.exit(1)
  }

  let session = null
  if (env.SUPABASE_SERVICE_ROLE_KEY) {
    session = await createMemberSession(env, `__smoke_${Date.now()}`)
    console.log(`Sessao de teste: ${session.email}\n`)
  } else {
    console.log('AVISO: sem SUPABASE_SERVICE_ROLE_KEY nao da para autenticar.')
    console.log('       As paginas protegidas serao verificadas apenas como visitante.\n')
  }

  try {
    console.log('Publicas:')
    for (const route of PUBLIC_ROUTES) await checkRoute(route)

    console.log('\nPaginas protegidas:')
    if (session) {
      for (const route of ROUTES) await checkRoute(route, session.cookie)
    } else {
      for (const route of ROUTES) {
        const response = await fetch(`${BASE}${route.path}`, { redirect: 'manual' })
        const ok = response.status >= 300 && response.status < 400
        if (ok) {
          passed += 1
          console.log(`   ok      ${route.path.padEnd(38)} protegida (${response.status})`)
        } else {
          failed += 1
          failures.push(`${route.path}: deveria redirecionar sem sessao, veio ${response.status}`)
          console.log(`   FALHOU  ${route.path.padEnd(38)} nao protegida (${response.status})`)
        }
      }
    }

    console.log('\nEndpoints:')
    for (const endpoint of ENDPOINTS) await checkEndpoint(endpoint)
  } finally {
    if (session) await session.cleanup()
  }

  console.log(`\n=== ${passed} ok, ${failed} falharam ===`)
  if (failures.length) {
    console.log('\nFalhas:')
    for (const item of failures) console.log(`  - ${item}`)
  }
  process.exit(failed === 0 ? 0 : 1)
}

main()
