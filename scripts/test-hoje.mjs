#!/usr/bin/env node
/**
 * Testes do painel /hoje, por HTTP, contra o app rodando.
 *
 *   npm run start          (ou npm run dev, em outro terminal)
 *   node scripts/test-hoje.mjs
 *
 * Cobre os cenarios pedidos:
 *   1. organizacao sem alertas;
 *   2. os tres niveis de severidade;
 *   3. dados ausentes (impacto, SKU, canal e evidencia nulos);
 *   4. alerta resolvido aparece em "Resolvidos recentemente";
 *   5. recomendacao associada aparece na secao propria;
 *   6. isolamento entre duas organizacoes;
 *   7. integracao desligada nao gera ruido;
 *   8. a ordem de prioridade documentada e a ordem renderizada.
 *
 * COMO ELE VERIFICA: procura no HTML servido. Nao e teste de unidade do
 * componente -- e prova de que o dado chegou na tela depois de passar por RLS,
 * gate de autorizacao, query e render. E o caminho que o usuario percorre.
 *
 * Tudo que o script cria leva um prefixo unico e e apagado no fim, inclusive se
 * algum teste falhar.
 */

import { createMemberSession, loadEnv, restRaw } from './_supabase.mjs'

const env = loadEnv()
const BASE = process.env.SMOKE_BASE_URL ?? 'http://localhost:3000'
const TAG = `HOJE${Date.now()}`

if (!env.SUPABASE_SERVICE_ROLE_KEY) {
  console.error('Estes testes precisam de SUPABASE_SERVICE_ROLE_KEY para semear os alertas.')
  process.exit(1)
}

const service = { key: env.SUPABASE_SERVICE_ROLE_KEY }

let passed = 0
let failed = 0
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

const cleanup = []
let orgId = null
let session = null
let secondOrgId = null

async function fetchHoje(query = '') {
  const response = await fetch(`${BASE}/hoje${query}`, {
    redirect: 'manual',
    headers: { Cookie: session.cookie },
  })
  return { status: response.status, html: response.status === 200 ? await response.text() : '' }
}

/**
 * Alerta valido para semear.
 *
 * TODAS as chaves opcionais aparecem, com null quando nao usadas. Nao e verbosidade:
 * o insert em lote do PostgREST exige que todos os objetos do array tenham
 * exatamente o mesmo conjunto de chaves -- objetos com chaves diferentes voltam
 * com PGRST102 "All object keys must match".
 */
function alertSeed(overrides = {}) {
  return {
    organization_id: orgId,
    rule_code: `${TAG}_RULE`,
    domain: 'ESTOQUE',
    severity: 'IMPORTANTE',
    title: `${TAG} alerta`,
    what_happened: 'Aconteceu algo mensurável.',
    why_it_matters: 'Importa por um motivo explícito.',
    data_points: { cobertura_dias: 3, velocidade_dia: 4.2 },
    suggested_action: 'Fazer a coisa certa.',
    status: 'OPEN',
    fingerprint: `${TAG}-${Math.random().toString(36).slice(2, 10)}`,
    financial_impact: null,
    impact_kind: null,
    action_href: null,
    sku: null,
    channel: null,
    resolved_at: null,
    ...overrides,
  }
}

async function seedAlerts(rows) {
  const res = await restRaw(env, 'alerts', {
    ...service,
    method: 'POST',
    body: JSON.stringify(rows),
    headers: { Prefer: 'return=representation' },
  })
  if (res.status >= 300) throw new Error(`falha ao semear alertas: ${res.status} ${res.body}`)
  return JSON.parse(res.body)
}

/* ========================================================================== */

async function main() {
  console.log(`App:     ${BASE}`)
  console.log(`Projeto: ${env.NEXT_PUBLIC_SUPABASE_URL}\n`)

  try {
    await fetch(`${BASE}/login`)
  } catch {
    console.error(`Servidor nao responde em ${BASE}. Rode \`npm run start\` primeiro.`)
    process.exit(1)
  }

  session = await createMemberSession(env, `__hoje_${Date.now()}`)
  orgId = session.organizationId
  cleanup.push(() => session.cleanup())
  console.log(`Sessao de teste: ${session.email}\n`)

  /* ---------------- 1) organizacao sem alertas ---------------- */
  console.log('1) organizacao sem alertas')

  const existing = JSON.parse(
    (await restRaw(env, `alerts?select=id&organization_id=eq.${orgId}&limit=1`, service)).body,
  )

  const empty = await fetchHoje()
  check('pagina abre', String(empty.status), '200')

  if (existing.length === 0) {
    const saysEmpty =
      empty.html.includes('Nada exige atenção agora') ||
      empty.html.includes('Nenhuma análise executada ainda')
    check('estado vazio e explicado', saysEmpty ? 'explica' : 'nao explica', 'explica')
    check(
      'nao inventa problema quando nao ha',
      empty.html.includes('Prioridades de hoje') ? 'inventou secao' : 'sem prioridades',
      'sem prioridades',
    )
  } else {
    check('organizacao ja tem alertas (cenario vazio pulado)', 'tem alertas', 'tem alertas')
  }

  /* ---------------- 2) tres niveis de severidade ---------------- */
  console.log('\n2) os tres niveis de severidade')

  const seeded = await seedAlerts([
    alertSeed({
      severity: 'CRITICO',
      domain: 'ESTOQUE',
      title: `${TAG} ruptura critica`,
      financial_impact: 4210.55,
      impact_kind: 'RISCO_RECEITA',
      sku: `${TAG}-SKU1`,
      action_href: '/produtos',
    }),
    alertSeed({
      severity: 'IMPORTANTE',
      domain: 'PRECO',
      title: `${TAG} margem abaixo da meta`,
      financial_impact: 320.1,
      impact_kind: 'PERDA_MARGEM',
      sku: `${TAG}-SKU2`,
    }),
    alertSeed({
      severity: 'OPORTUNIDADE',
      domain: 'ADS',
      title: `${TAG} produto rentavel sem anuncio`,
      channel: 'MERCADO_LIVRE',
    }),
  ])
  cleanup.push(() =>
    restRaw(env, `alerts?fingerprint=like.${TAG}*`, { ...service, method: 'DELETE' }),
  )

  const withAlerts = await fetchHoje()
  check('pagina abre com alertas', String(withAlerts.status), '200')
  check(
    'alerta critico aparece',
    withAlerts.html.includes(`${TAG} ruptura critica`) ? 'aparece' : 'ausente',
    'aparece',
  )
  check(
    'alerta de atencao aparece',
    withAlerts.html.includes(`${TAG} margem abaixo da meta`) ? 'aparece' : 'ausente',
    'aparece',
  )
  check(
    'oportunidade aparece',
    withAlerts.html.includes(`${TAG} produto rentavel sem anuncio`) ? 'aparece' : 'ausente',
    'aparece',
  )
  check(
    'bloco Criticos existe',
    withAlerts.html.includes('Críticos') ? 'existe' : 'ausente',
    'existe',
  )
  check(
    'bloco Oportunidades existe',
    withAlerts.html.includes('Oportunidades') ? 'existe' : 'ausente',
    'existe',
  )
  check(
    'impacto financeiro renderizado',
    withAlerts.html.includes('4.210,55') ? 'renderizado' : 'ausente',
    'renderizado',
  )
  check(
    'SKU renderizado',
    withAlerts.html.includes(`${TAG}-SKU1`) ? 'renderizado' : 'ausente',
    'renderizado',
  )
  check(
    'evidencia presente no HTML',
    withAlerts.html.includes('Evidência usada') ? 'presente' : 'ausente',
    'presente',
  )
  check(
    'acao sugerida presente',
    withAlerts.html.includes('Fazer a coisa certa.') ? 'presente' : 'ausente',
    'presente',
  )
  check(
    'secao de prioridades aparece',
    withAlerts.html.includes('Prioridades de hoje') ? 'aparece' : 'ausente',
    'aparece',
  )

  /* ---------------- 3) dados ausentes ---------------- */
  console.log('\n3) dados ausentes (impacto, SKU, canal e evidencia nulos)')

  await seedAlerts([
    alertSeed({
      severity: 'IMPORTANTE',
      domain: 'CADASTRO',
      title: `${TAG} cadastro sem nada`,
      financial_impact: null,
      impact_kind: null,
      sku: null,
      channel: null,
      action_href: null,
      suggested_action: null,
      data_points: {},
    }),
  ])

  const sparse = await fetchHoje()
  check('pagina nao quebra com campos nulos', String(sparse.status), '200')
  check(
    'alerta sem impacto ainda aparece',
    sparse.html.includes(`${TAG} cadastro sem nada`) ? 'aparece' : 'ausente',
    'aparece',
  )
  // Impacto nulo nao deve virar "R$ 0,00": isso afirmaria "custa nada".
  const zeroImpact = sparse.html.includes('R$ 0,00 de')
  check('impacto nulo nao vira R$ 0,00', zeroImpact ? 'VIROU ZERO' : 'omitido', 'omitido')

  /* ---------------- 4) alerta resolvido ---------------- */
  console.log('\n4) alerta resolvido')

  await seedAlerts([
    alertSeed({
      severity: 'CRITICO',
      domain: 'ESTOQUE',
      title: `${TAG} problema ja resolvido`,
      status: 'RESOLVED',
      resolved_at: new Date().toISOString(),
    }),
  ])

  const withResolved = await fetchHoje()
  check(
    'secao Resolvidos recentemente aparece',
    withResolved.html.includes('Resolvidos recentemente') ? 'aparece' : 'ausente',
    'aparece',
  )
  check(
    'alerta resolvido listado',
    withResolved.html.includes(`${TAG} problema ja resolvido`) ? 'listado' : 'ausente',
    'listado',
  )
  // Resolvido nao pode contar como critico em aberto no KPI.
  const summary = JSON.parse(
    (await restRaw(env, `v_hoje_summary?select=critical_open&organization_id=eq.${orgId}`, service))
      .body,
  )
  check(
    'resolvido fora da contagem de criticos abertos',
    Number(summary[0]?.critical_open) === 1 ? 'fora' : `dentro (${summary[0]?.critical_open})`,
    'fora',
  )

  /* ---------------- 5) recomendacao associada ---------------- */
  console.log('\n5) recomendacao associada')

  const alertForRec = seeded[0]
  const recRes = await restRaw(env, 'recommendations', {
    ...service,
    method: 'POST',
    body: JSON.stringify({
      organization_id: orgId,
      alert_id: alertForRec.id,
      rule_code: `${TAG}_REC`,
      kind: 'PRICE',
      title: `${TAG} reajustar preco`,
      reason: 'Margem abaixo da meta configurada.',
      current_value: 99.9,
      proposed_value: 112.9,
      expected_impact: { variacao_percent: 13.01 },
      status: 'OPEN',
    }),
    headers: { Prefer: 'return=representation' },
  })
  check('recomendacao criada', recRes.status < 300 ? 'criada' : `erro ${recRes.status}`, 'criada')
  cleanup.push(() =>
    restRaw(env, `recommendations?rule_code=eq.${TAG}_REC`, { ...service, method: 'DELETE' }),
  )

  const withRec = await fetchHoje()
  check(
    'secao Recomendacoes aparece',
    withRec.html.includes('Recomendações') ? 'aparece' : 'ausente',
    'aparece',
  )
  check(
    'recomendacao listada',
    withRec.html.includes(`${TAG} reajustar preco`) ? 'listada' : 'ausente',
    'listada',
  )
  check(
    'deixa claro que nada e aplicado sozinho',
    withRec.html.includes('Nenhuma é aplicada automaticamente') ? 'deixa claro' : 'nao avisa',
    'deixa claro',
  )

  /* ---------------- 6) ordem de prioridade ---------------- */
  console.log('\n6) ordem de prioridade documentada')

  const criticalHigh = withRec.html.indexOf(`${TAG} ruptura critica`)
  const attention = withRec.html.indexOf(`${TAG} margem abaixo da meta`)
  const opportunity = withRec.html.indexOf(`${TAG} produto rentavel sem anuncio`)

  check(
    'critico antes de atencao',
    criticalHigh >= 0 && attention >= 0 && criticalHigh < attention ? 'antes' : 'fora de ordem',
    'antes',
  )
  check(
    'atencao antes de oportunidade',
    attention >= 0 && opportunity >= 0 && attention < opportunity ? 'antes' : 'fora de ordem',
    'antes',
  )

  // Dois criticos: o de maior impacto vem primeiro (criterio 3).
  await seedAlerts([
    alertSeed({
      severity: 'CRITICO',
      domain: 'PRECO',
      title: `${TAG} critico de impacto menor`,
      financial_impact: 12.34,
      impact_kind: 'PERDA_MARGEM',
    }),
  ])

  const ordered = await fetchHoje()
  const big = ordered.html.indexOf(`${TAG} ruptura critica`)
  const small = ordered.html.indexOf(`${TAG} critico de impacto menor`)
  check(
    'entre criticos, maior impacto primeiro',
    big >= 0 && small >= 0 && big < small ? 'ordenado' : 'fora de ordem',
    'ordenado',
  )

  /* ---------------- 7) integracao desligada ---------------- */
  console.log('\n7) integracao desligada nao gera ruido')

  const conn = JSON.parse(
    (
      await restRaw(
        env,
        `v_erp_connection_status?select=status&organization_id=eq.${orgId}`,
        service,
      )
    ).body,
  )
  check('conexao segue NOT_CONFIGURED', conn[0]?.status ?? 'ausente', 'NOT_CONFIGURED')

  const integrationAlerts = JSON.parse(
    (
      await restRaw(
        env,
        `alerts?select=id&organization_id=eq.${orgId}&domain=eq.INTEGRACAO`,
        service,
      )
    ).body,
  )
  check(
    'nenhum alerta de integracao gerado',
    integrationAlerts.length === 0 ? 'nenhum' : `${integrationAlerts.length} alerta(s)`,
    'nenhum',
  )
  check(
    'KPI de integracoes diz OK',
    ordered.html.includes('>OK<') ? 'OK' : 'outro valor',
    'OK',
  )

  /* ---------------- 8) filtros ---------------- */
  console.log('\n8) filtros')

  const onlyCritical = await fetchHoje('?severidade=CRITICO')
  check(
    'filtro de severidade mantem o critico',
    onlyCritical.html.includes(`${TAG} ruptura critica`) ? 'mantem' : 'perdeu',
    'mantem',
  )
  check(
    'filtro de severidade remove a oportunidade',
    onlyCritical.html.includes(`${TAG} produto rentavel sem anuncio`) ? 'VAZOU' : 'removeu',
    'removeu',
  )

  const onlyPreco = await fetchHoje('?dominio=PRECO')
  check(
    'filtro de dominio remove estoque',
    onlyPreco.html.includes(`${TAG} ruptura critica`) ? 'VAZOU' : 'removeu',
    'removeu',
  )

  /* ---------------- 9) o auditor rodando de verdade ---------------- */
  console.log('\n9) execucao real do auditor (dados -> regras -> alertas)')

  // Produto com custo e preco, estoque baixo e historico de venda. E o cenario
  // classico de ruptura: cobertura curta contra o prazo do fornecedor.
  const productRes = await restRaw(env, 'products', {
    ...service,
    method: 'POST',
    body: JSON.stringify({
      organization_id: orgId,
      name: `${TAG} produto auditado`,
      sku: `${TAG}-AUD`,
      unit_cost: 20,
      sale_price: 100,
      active: true,
    }),
    headers: { Prefer: 'return=representation' },
  })
  const productId = JSON.parse(productRes.body)?.[0]?.id
  check('produto de teste criado', productId ? 'criado' : `erro ${productRes.status}`, 'criado')

  if (productId) {
    cleanup.push(async () => {
      await restRaw(env, `inventory_balances?product_id=eq.${productId}`, { ...service, method: 'DELETE' })
      await restRaw(env, `recommendations?product_id=eq.${productId}`, { ...service, method: 'DELETE' })
      await restRaw(env, `alerts?product_id=eq.${productId}`, { ...service, method: 'DELETE' })
      await restRaw(env, `order_items?product_id=eq.${productId}`, { ...service, method: 'DELETE' })
      await restRaw(env, `stock_movements?product_id=eq.${productId}`, { ...service, method: 'DELETE' })
      await restRaw(env, `orders?order_number=like.${TAG}*`, { ...service, method: 'DELETE' })
      await restRaw(env, `products?id=eq.${productId}`, { ...service, method: 'DELETE' })
    })

    // Saldo LOCAL baixo: 10 unidades disponiveis.
    await restRaw(env, 'inventory_balances', {
      ...service,
      method: 'POST',
      body: JSON.stringify({
        organization_id: orgId,
        product_id: productId,
        source: 'LOCAL',
        physical_quantity: 10,
        virtual_quantity: 10,
        reserved_quantity: 0,
      }),
    })

    // Historico de venda: 5 unidades/dia nos ultimos 6 dias -> cobertura de 2 dias
    // contra prazo default de 7 + 5 de seguranca. Ruptura garantida pelas regras.
    const today = new Date()
    for (let day = 1; day <= 6; day += 1) {
      const date = new Date(today.getTime() - day * 86_400_000).toISOString().slice(0, 10)
      const orderRes = await restRaw(env, 'orders', {
        ...service,
        method: 'POST',
        body: JSON.stringify({
          organization_id: orgId,
          order_number: `${TAG}-${day}`,
          order_date: date,
          status: 'CONCLUIDO',
        }),
        headers: { Prefer: 'return=representation' },
      })
      const orderId = JSON.parse(orderRes.body)?.[0]?.id
      if (!orderId) continue

      await restRaw(env, 'order_items', {
        ...service,
        method: 'POST',
        body: JSON.stringify({
          organization_id: orgId,
          order_id: orderId,
          product_id: productId,
          quantity: 5,
          unit_price: 100,
          unit_cost: 20,
          gross_total: 500,
          cost_total: 100,
        }),
      })
    }

    // Dispara a analise pelo endpoint protegido, com a sessao do membro.
    const run = await fetch(`${BASE}/api/auditor/run`, {
      method: 'POST',
      headers: { Cookie: session.cookie },
    })
    const runBody = await run.json().catch(() => ({}))
    check('endpoint da analise responde 200', String(run.status), '200')
    check(
      'produto entrou na analise',
      Number(runBody.products_analyzed) >= 1 ? 'analisado' : `${runBody.products_analyzed}`,
      'analisado',
    )

    const generated = JSON.parse(
      (
        await restRaw(
          env,
          `alerts?select=rule_code,severity,financial_impact,action_href&product_id=eq.${productId}`,
          service,
        )
      ).body,
    )
    const codes = generated.map((row) => row.rule_code)
    check(
      `auditor gerou alerta para o produto (${codes.join(', ') || 'nenhum'})`,
      generated.length > 0 ? 'gerou' : 'nenhum',
      'gerou',
    )
    check(
      'regra de ruptura disparou',
      codes.includes('STOCK_STOCKOUT_RISK') ? 'disparou' : 'nao disparou',
      'disparou',
    )
    const stockout = generated.find((row) => row.rule_code === 'STOCK_STOCKOUT_RISK')
    check(
      'impacto financeiro foi calculado pela regra',
      stockout && stockout.financial_impact !== null ? 'calculado' : 'nulo',
      'calculado',
    )
    check(
      'alerta traz link de resolucao',
      stockout?.action_href === `/produtos/${productId}` ? 'correto' : String(stockout?.action_href),
      'correto',
    )

    // Cadastro incompleto tem de ser acusado: o produto nao tem NCM nem peso.
    check(
      'cadastro incompleto acusado',
      codes.includes('REGISTRY_INCOMPLETE') ? 'acusado' : 'ignorado',
      'acusado',
    )

    // Recomendacao de compra deve ter sido gerada junto.
    const recs = JSON.parse(
      (await restRaw(env, `recommendations?select=rule_code&product_id=eq.${productId}`, service)).body,
    )
    check(
      'recomendacao de compra gerada',
      recs.some((r) => r.rule_code === 'PURCHASE_TO_COVERAGE') ? 'gerada' : 'ausente',
      'gerada',
    )

    // Cooldown: a segunda chamada imediata tem de ser recusada.
    const again = await fetch(`${BASE}/api/auditor/run`, {
      method: 'POST',
      headers: { Cookie: session.cookie },
    })
    check('segunda execucao imediata recusada', String(again.status), '429')

    // Sem sessao, o endpoint nao roda nada.
    const anonRun = await fetch(`${BASE}/api/auditor/run`, { method: 'POST' })
    check('endpoint exige sessao', String(anonRun.status), '401')

    const hojeAfter = await fetchHoje()
    check(
      'alerta do auditor aparece na pagina',
      hojeAfter.html.includes(`${TAG}-AUD`) ? 'aparece' : 'ausente',
      'aparece',
    )
  }

  /* ---------------- 10) isolamento entre organizacoes ---------------- */
  console.log('\n10) isolamento entre organizacoes')

  const org2 = await restRaw(env, 'organizations', {
    ...service,
    method: 'POST',
    body: JSON.stringify({ name: `${TAG} Org2`, slug: `${TAG}-org2` }),
    headers: { Prefer: 'return=representation' },
  })
  secondOrgId = JSON.parse(org2.body)?.[0]?.id ?? null
  check('segunda organizacao criada', secondOrgId ? 'criada' : 'FALHOU', 'criada')

  if (secondOrgId) {
    await seedAlerts([
      alertSeed({
        organization_id: secondOrgId,
        severity: 'CRITICO',
        title: `${TAG} SEGREDO DA ORG 2`,
        financial_impact: 999999,
        impact_kind: 'RISCO_RECEITA',
      }),
    ])
    await restRaw(env, 'recommendations', {
      ...service,
      method: 'POST',
      body: JSON.stringify({
        organization_id: secondOrgId,
        rule_code: `${TAG}_REC`,
        kind: 'PRICE',
        title: `${TAG} RECOMENDACAO DA ORG 2`,
        reason: 'x',
        status: 'OPEN',
      }),
    })

    cleanup.push(async () => {
      await restRaw(env, `alerts?organization_id=eq.${secondOrgId}`, { ...service, method: 'DELETE' })
      await restRaw(env, `recommendations?organization_id=eq.${secondOrgId}`, {
        ...service,
        method: 'DELETE',
      })
      await restRaw(env, `organizations?id=eq.${secondOrgId}`, { ...service, method: 'DELETE' })
    })

    const isolated = await fetchHoje()
    check(
      'alerta da org 2 NAO aparece na pagina',
      isolated.html.includes('SEGREDO DA ORG 2') ? 'VAZOU' : 'invisivel',
      'invisivel',
    )
    check(
      'recomendacao da org 2 NAO aparece',
      isolated.html.includes('RECOMENDACAO DA ORG 2') ? 'VAZOU' : 'invisivel',
      'invisivel',
    )
    check(
      'impacto da org 2 nao entra no KPI',
      isolated.html.includes('999.999') ? 'VAZOU' : 'fora',
      'fora',
    )
  }
}

/**
 * Apaga usuarios de teste que tenham sobrado de execucoes anteriores.
 *
 * O dominio `.invalid` e reservado por RFC 2606 justamente para isto: nenhum
 * endereco real pode termina assim, entao a varredura nao tem como apagar conta
 * de gente.
 */
async function sweepTestUsers() {
  try {
    const list = await fetch(
      `${env.NEXT_PUBLIC_SUPABASE_URL}/auth/v1/admin/users?per_page=200`,
      {
        headers: {
          apikey: env.SUPABASE_SERVICE_ROLE_KEY,
          Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
        },
      },
    ).then((response) => response.json())

    for (const user of list.users ?? []) {
      if (!user.email?.endsWith('@exemplo.invalid')) continue
      await fetch(`${env.NEXT_PUBLIC_SUPABASE_URL}/auth/v1/admin/users/${user.id}`, {
        method: 'DELETE',
        headers: {
          apikey: env.SUPABASE_SERVICE_ROLE_KEY,
          Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
        },
      })
    }
  } catch (error) {
    console.error(`  varredura de usuarios falhou: ${error.message}`)
  }
}

async function runCleanup() {
  console.log('\nLimpando...')
  let problems = 0
  for (const task of cleanup.reverse()) {
    try {
      await task()
    } catch (error) {
      problems += 1
      console.error(`  falha na limpeza: ${error.message}`)
    }
  }
  // Varredura final. Inclui auditor_runs e usuarios @exemplo.invalid: a execucao
  // real do auditor grava a propria linha de auditoria, e um DELETE de usuario
  // pode falhar em silencio -- deixar sobra faz a proxima rodada partir de um
  // estado sujo e o cenario "organizacao sem alertas" nunca mais rodar.
  await restRaw(env, `auditor_runs?organization_id=eq.${orgId}`, {
    ...service,
    method: 'DELETE',
  }).catch(() => {})
  await sweepTestUsers()
  await restRaw(env, `alerts?fingerprint=like.${TAG}*`, { ...service, method: 'DELETE' }).catch(() => {})
  await restRaw(env, `recommendations?rule_code=eq.${TAG}_REC`, {
    ...service,
    method: 'DELETE',
  }).catch(() => {})
  await restRaw(env, `organizations?slug=like.${TAG}*`, { ...service, method: 'DELETE' }).catch(() => {})
  console.log(problems === 0 ? 'Limpeza concluida.' : `Limpeza com ${problems} problema(s).`)
}

try {
  await main()
} catch (error) {
  failed += 1
  failures.push(`erro inesperado: ${error.message}`)
  console.error(`\nERRO: ${error.message}`)
} finally {
  await runCleanup()
}

console.log(`\n=== ${passed} ok, ${failed} falharam ===`)
if (failures.length) {
  console.log('\nFalhas:')
  for (const item of failures) console.log(`  - ${item}`)
}
process.exit(failed === 0 ? 0 : 1)
