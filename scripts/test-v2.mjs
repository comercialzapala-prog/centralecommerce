#!/usr/bin/env node
/**
 * Fase 9 -- valida os 5 cenarios da secao 49 contra o Supabase real.
 *
 *   npm run test:v2
 *
 * Cria dados marcados com um prefixo unico, confere os numeros e APAGA tudo o
 * que criou no final (inclusive se algum teste falhar). Nao encosta em nada
 * que ja existia.
 */

import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const here = dirname(fileURLToPath(import.meta.url))
const root = join(here, '..')

/* ---------- configuracao ---------- */

function loadEnv() {
  const env = { ...process.env }
  try {
    const raw = readFileSync(join(root, '.env.local'), 'utf8')
    for (const line of raw.split('\n')) {
      const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/)
      if (match) env[match[1]] ??= match[2].replace(/^["']|["']$/g, '')
    }
  } catch {
    /* .env.local opcional se as variaveis vierem do ambiente */
  }
  return env
}

const env = loadEnv()
const URL_BASE = env.NEXT_PUBLIC_SUPABASE_URL
const KEY = env.NEXT_PUBLIC_SUPABASE_ANON_KEY

if (!URL_BASE || !KEY) {
  console.error('Faltam NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY.')
  process.exit(1)
}

const TAG = `__teste_v2_${Date.now()}`
const headers = {
  apikey: KEY,
  Authorization: `Bearer ${KEY}`,
  'Content-Type': 'application/json',
}

/* ---------- helpers REST ---------- */

async function rest(path, options = {}) {
  const response = await fetch(`${URL_BASE}/rest/v1/${path}`, {
    ...options,
    headers: { ...headers, ...(options.headers ?? {}) },
  })
  const text = await response.text()
  if (!response.ok) {
    throw new Error(`${options.method ?? 'GET'} ${path} -> ${response.status} ${text}`)
  }
  return text ? JSON.parse(text) : null
}

const select = (path) => rest(path)
const insert = (table, body) =>
  rest(table, {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { Prefer: 'return=representation' },
  })
const remove = (path) => rest(path, { method: 'DELETE' })

const rpc = (fn, args) =>
  rest(`rpc/${fn}`, { method: 'POST', body: JSON.stringify(args ?? {}) })

const money = (value) =>
  Number(value).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })

/* ---------- runner ---------- */

let passed = 0
let failed = 0

/**
 * `unit` evita a saida mentir: quantidade nao e dinheiro. "2 un" e "R$ 2,00"
 * sao coisas diferentes e o relatorio precisa mostrar cada uma do seu jeito.
 */
function check(label, actual, expected, unit = 'money') {
  const numeric = typeof expected === 'number'
  const a = numeric ? Number(actual) : actual
  const ok = numeric ? Math.abs(a - expected) < 0.005 : a === expected

  const show = (value) => {
    if (!numeric) return String(value)
    if (unit === 'qty') return `${value} un`
    return money(value)
  }

  if (ok) {
    passed += 1
    console.log(`   PASSOU  ${label}: ${show(a)}`)
  } else {
    failed += 1
    console.log(`   FALHOU  ${label}: ${show(a)} (esperado ${show(expected)})`)
  }
}

const created = { transactions: [], orders: [], products: [], movements: [] }

async function findCostCenter(path) {
  const rows = await select(
    `v_cost_center_hierarchy?select=id,name,path&path=eq.${encodeURIComponent(path)}`,
  )
  if (!rows?.length) throw new Error(`Centro de custo nao encontrado: "${path}". Rode o seed (Parte 3).`)
  return rows[0]
}

async function addTransaction(fields) {
  const [row] = await insert('transactions', {
    status: 'PAGO',
    transaction_date: new Date().toISOString().slice(0, 10),
    ...fields,
    description: `${TAG} ${fields.description}`,
  })
  created.transactions.push(row.id)
  return row
}

async function rollup(costCenterId) {
  const rows = await rpc('cost_center_report', {})
  const row = rows.find((item) => item.cost_center_id === costCenterId)
  return Number(row?.rollup_total ?? 0)
}

/* ---------- cenarios ---------- */

async function cenario1e2() {
  console.log('\n1 e 2) Drill-down hierarquico de centro de custo')

  const sacolas = await findCostCenter('Operação Logística > Expedição > Sacolas')
  const caixas = await findCostCenter('Operação Logística > Expedição > Caixas')
  const expedicao = await findCostCenter('Operação Logística > Expedição')
  const logistica = await findCostCenter('Operação Logística')

  const base = {
    sacolas: await rollup(sacolas.id),
    caixas: await rollup(caixas.id),
    expedicao: await rollup(expedicao.id),
    logistica: await rollup(logistica.id),
  }

  await addTransaction({
    type: 'SAIDA',
    amount: 500,
    cost_center_id: sacolas.id,
    description: '500 sacolas',
  })

  check('Sacolas', (await rollup(sacolas.id)) - base.sacolas, 500)
  check('Expedição', (await rollup(expedicao.id)) - base.expedicao, 500)
  check('Operação Logística', (await rollup(logistica.id)) - base.logistica, 500)

  await addTransaction({
    type: 'SAIDA',
    amount: 300,
    cost_center_id: caixas.id,
    description: 'caixas',
  })

  check('Caixas', (await rollup(caixas.id)) - base.caixas, 300)
  check('Sacolas (sem mudar)', (await rollup(sacolas.id)) - base.sacolas, 500)
  check('Expedição (somando os dois)', (await rollup(expedicao.id)) - base.expedicao, 800)
  check('Operação Logística (topo)', (await rollup(logistica.id)) - base.logistica, 800)
}

async function cenario3() {
  console.log('\n3) Aporte entra no caixa mas NÃO vira receita')

  const row = await addTransaction({ type: 'APORTE', amount: 20000, description: 'aporte de sócio' })
  const [view] = await select(
    `v_transaction_full?select=signed_amount,operational_revenue,operational_expense,contribution_amount&id=eq.${row.id}`,
  )

  check('Impacto no caixa', view.signed_amount, 20000)
  check('Receita operacional', view.operational_revenue, 0)
  check('Despesa operacional', view.operational_expense, 0)
  check('Registrado como aporte', view.contribution_amount, 20000)
}

async function cenario4e5() {
  console.log('\n4 e 5) Venda: resultado do pedido e baixa de estoque')

  const [product] = await insert('products', {
    name: `${TAG} Produto A`,
    sku: `${TAG}-A`,
    unit_cost: 25,
    sale_price: 50,
  })
  created.products.push(product.id)

  const [order] = await insert('orders', {
    order_number: `${TAG}-1`,
    order_date: new Date().toISOString().slice(0, 10),
    status: 'CONCLUIDO',
    marketplace_fee: 10,
  })
  created.orders.push(order.id)

  // 2 unidades a R$ 50 = R$ 100 de receita, R$ 50 de CMV, R$ 10 de taxa.
  await insert('order_items', {
    order_id: order.id,
    product_id: product.id,
    quantity: 2,
    unit_price: 50,
    unit_cost: 25,
    gross_total: 100,
    cost_total: 50,
  })

  const [result] = await select(
    `v_order_result?select=total_amount,cogs_amount,extra_costs,result_amount,items_quantity&id=eq.${order.id}`,
  )

  check('Receita do pedido', result.total_amount, 100)
  check('CMV', result.cogs_amount, 50)
  check('Taxas', result.extra_costs, 10)
  check('Resultado do pedido', result.result_amount, 40)

  const [stats] = await select(
    `v_product_stats?select=stock_balance,qty_sold&product_id=eq.${product.id}`,
  )

  check('Unidades vendidas', stats.qty_sold, 2, 'qty')
  check('Estoque após a venda (secao 23)', stats.stock_balance, -2, 'qty')

  // Entrada de 10 unidades: o saldo tem que ir para 8.
  const [movement] = await insert('stock_movements', {
    product_id: product.id,
    type: 'ENTRADA',
    quantity: 10,
    movement_date: new Date().toISOString().slice(0, 10),
    reason: TAG,
  })
  created.movements.push(movement.id)

  const [after] = await select(`v_product_stats?select=stock_balance&product_id=eq.${product.id}`)
  check('Estoque após entrada de 10', after.stock_balance, 8, 'qty')
}

async function cenarioCancelamento() {
  console.log('\n6) Cancelar zera o efeito financeiro mas mantém o histórico')

  const row = await addTransaction({ type: 'SAIDA', amount: 999, description: 'a ser cancelado' })
  await rest(`transactions?id=eq.${row.id}`, {
    method: 'PATCH',
    body: JSON.stringify({ status: 'CANCELADO' }),
  })

  const [view] = await select(
    `v_transaction_full?select=signed_amount,operational_expense,status&id=eq.${row.id}`,
  )

  check('Ainda existe no histórico', view.status, 'CANCELADO')
  check('Impacto no caixa', view.signed_amount, 0)
  check('Impacto na despesa', view.operational_expense, 0)
}

async function cenarioCiclo() {
  console.log('\n7) Hierarquia não aceita ciclo')

  const expedicao = await findCostCenter('Operação Logística > Expedição')
  const logistica = await findCostCenter('Operação Logística')

  try {
    await rest(`cost_centers?id=eq.${logistica.id}`, {
      method: 'PATCH',
      body: JSON.stringify({ parent_id: expedicao.id }),
    })
    check('Ciclo bloqueado pelo banco', 'aceitou', 'recusado')
    // desfaz caso o trigger nao tenha barrado
    await rest(`cost_centers?id=eq.${logistica.id}`, {
      method: 'PATCH',
      body: JSON.stringify({ parent_id: null }),
    })
  } catch (error) {
    const blocked = /ciclo|cycle/i.test(String(error))
    check('Ciclo bloqueado pelo banco', blocked ? 'recusado' : 'erro inesperado', 'recusado')
    if (!blocked) console.log(`      (erro recebido: ${error})`)
  }
}

/* ---------- limpeza ---------- */

async function cleanup() {
  console.log('\nLimpando os dados de teste...')
  try {
    for (const id of created.movements) await remove(`stock_movements?id=eq.${id}`)
    // order_items e os movimentos VENDA saem junto com o pedido (cascade).
    for (const id of created.orders) {
      await remove(`order_items?order_id=eq.${id}`)
      await remove(`orders?id=eq.${id}`)
    }
    for (const id of created.products) await remove(`products?id=eq.${id}`)
    for (const id of created.transactions) await remove(`transactions?id=eq.${id}`)
    console.log('Limpeza concluída.')
  } catch (error) {
    console.error(`ATENÇÃO: a limpeza falhou (${error}).`)
    console.error(`Procure e remova manualmente os registros com "${TAG}" na descrição.`)
  }
}

/* ---------- main ---------- */

async function main() {
  console.log(`Control Center V2 -- validação dos cenários da seção 49`)
  console.log(`Projeto: ${URL_BASE}`)

  try {
    await select('v_transaction_full?select=id&limit=1')
  } catch {
    console.error('\nAs views da V2 não existem no banco. Aplique as migrations antes de testar.')
    process.exit(1)
  }

  try {
    await cenario1e2()
    await cenario3()
    await cenario4e5()
    await cenarioCancelamento()
    await cenarioCiclo()
  } catch (error) {
    failed += 1
    console.error(`\nERRO durante os testes: ${error}`)
  } finally {
    await cleanup()
  }

  console.log(`\n${passed} passaram, ${failed} falharam.`)
  process.exit(failed === 0 ? 0 : 1)
}

main()
