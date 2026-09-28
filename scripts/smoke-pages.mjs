#!/usr/bin/env node
/**
 * Smoke de regressao das paginas.
 *
 *   npm run dev            (em outro terminal)
 *   node scripts/smoke-pages.mjs
 *
 * Roda antes e depois de uma migration para provar que nada regrediu.
 *
 * Nao basta conferir HTTP 200: as paginas sao Server Components e o error
 * boundary (src/app/error.tsx) responde 200 com a tela de erro. Por isso o
 * script procura marcas de falha no HTML -- e tambem uma marca de SUCESSO
 * esperada por rota, para nao aprovar uma pagina que devolveu casca vazia.
 */

const BASE = process.env.SMOKE_BASE_URL ?? 'http://localhost:3000'

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

/** O webhook precisa responder 503 enquanto estiver desligado (secao 5). */
const ENDPOINTS = [
  { path: '/api/webhooks/bling', method: 'GET', expectStatus: [200, 503] },
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

async function checkRoute(route) {
  let response
  try {
    response = await fetch(`${BASE}${route.path}`, { redirect: 'follow' })
  } catch (error) {
    failed += 1
    failures.push(`${route.path}: sem resposta (${error.message})`)
    console.log(`   FALHOU  ${route.path.padEnd(38)} sem resposta`)
    return
  }

  const html = await response.text()
  const problems = []

  if (response.status !== 200) problems.push(`HTTP ${response.status}`)

  const marker = FAILURE_MARKERS.find((needle) => html.includes(needle))
  if (marker) problems.push(`contem "${marker}"`)

  if (route.expect && !html.includes(route.expect)) {
    problems.push(`nao contem "${route.expect}"`)
  }

  if (problems.length === 0) {
    passed += 1
    console.log(`   ok      ${route.path.padEnd(38)} ${String(response.status)} ${html.length}b`)
  } else {
    failed += 1
    failures.push(`${route.path}: ${problems.join('; ')}`)
    console.log(`   FALHOU  ${route.path.padEnd(38)} ${problems.join('; ')}`)
  }
}

async function checkEndpoint(endpoint) {
  try {
    const response = await fetch(`${BASE}${endpoint.path}`, { method: endpoint.method })
    const ok = endpoint.expectStatus.includes(response.status)
    if (ok) {
      passed += 1
      console.log(`   ok      ${endpoint.path.padEnd(38)} ${response.status}`)
    } else {
      failed += 1
      failures.push(`${endpoint.path}: HTTP ${response.status}`)
      console.log(`   FALHOU  ${endpoint.path.padEnd(38)} HTTP ${response.status}`)
    }
  } catch (error) {
    failed += 1
    failures.push(`${endpoint.path}: ${error.message}`)
    console.log(`   FALHOU  ${endpoint.path.padEnd(38)} ${error.message}`)
  }
}

async function main() {
  console.log(`Smoke em ${BASE}\n`)

  // Primeira requisicao compila a rota: o dev server e lento no cold start.
  try {
    await fetch(`${BASE}/dashboard`)
  } catch {
    console.error(`Servidor nao responde em ${BASE}. Rode \`npm run dev\` primeiro.`)
    process.exit(1)
  }

  console.log('Paginas:')
  for (const route of ROUTES) await checkRoute(route)

  console.log('\nEndpoints:')
  for (const endpoint of ENDPOINTS) await checkEndpoint(endpoint)

  console.log(`\n=== ${passed} ok, ${failed} falharam ===`)
  if (failures.length) {
    console.log('\nFalhas:')
    for (const item of failures) console.log(`  - ${item}`)
  }
  process.exit(failed === 0 ? 0 : 1)
}

main()
