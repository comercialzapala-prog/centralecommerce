#!/usr/bin/env node
/**
 * Inspecao READ-ONLY do banco linkado.
 *
 *   node scripts/db-inspect.mjs
 *
 * Nao escreve nada. Serve para dois momentos:
 *   - ANTES de aplicar uma migration, para saber o estado de partida e o volume
 *     de cada tabela (o que define o custo de lock do backfill);
 *   - DEPOIS, para confirmar que o que era esperado apareceu.
 *
 * Usa a chave anon e o PostgREST. Consequencia disso: "ausente" pode significar
 * "nao existe" OU "existe e a RLS/grant nao deixa anon ver". O script distingue
 * os dois casos pelo codigo HTTP e pelo codigo de erro do PostgREST -- e essa
 * distincao e justamente o que interessa depois do hardening.
 */

import { loadEnv, restRaw, countRows, TABLES_V2, TABLES_INTEGRATION, VIEWS_ALL } from './_supabase.mjs'

const env = loadEnv()

const label = (value) => String(value).padEnd(28)

async function probe(name) {
  // limit=0 devolve corpo vazio e ainda assim passa por RLS e grants.
  const res = await restRaw(env, `${name}?select=*&limit=0`)

  if (res.status === 200) return { state: 'OK' }

  let code = null
  try {
    code = JSON.parse(res.body)?.code ?? null
  } catch {
    /* corpo nao-JSON */
  }

  // 42P01 = relacao inexistente. 42501 = permissao negada.
  if (code === '42P01') return { state: 'NAO EXISTE' }
  if (code === '42501' || res.status === 401 || res.status === 403) {
    return { state: 'SEM PERMISSAO', detail: `HTTP ${res.status}` }
  }
  return { state: `ERRO ${res.status}`, detail: code ?? res.body.slice(0, 120) }
}

async function hasColumn(table, column) {
  const res = await restRaw(env, `${table}?select=${column}&limit=0`)
  if (res.status === 200) return true
  return false
}

async function main() {
  console.log(`Projeto: ${env.NEXT_PUBLIC_SUPABASE_URL}`)
  console.log(`Chave:   anon\n`)

  console.log('=== TABELAS DA V2 (existentes) ===')
  console.log(`${label('tabela')}${'estado'.padEnd(16)}${'linhas'.padStart(9)}  organization_id`)
  for (const table of TABLES_V2) {
    const result = await probe(table)
    const rows = result.state === 'OK' ? await countRows(env, table) : null
    const org = result.state === 'OK' ? await hasColumn(table, 'organization_id') : false
    console.log(
      label(table) +
        result.state.padEnd(16) +
        String(rows ?? '-').padStart(9) +
        '  ' +
        (result.state === 'OK' ? (org ? 'presente' : 'AUSENTE') : '-') +
        (result.detail ? `  (${result.detail})` : ''),
    )
  }

  console.log('\n=== TABELAS DE INTEGRACAO (novas) ===')
  for (const table of TABLES_INTEGRATION) {
    const result = await probe(table)
    const rows = result.state === 'OK' ? await countRows(env, table) : null
    console.log(
      label(table) + result.state.padEnd(16) + String(rows ?? '-').padStart(9) +
        (result.detail ? `  (${result.detail})` : ''),
    )
  }

  console.log('\n=== VIEWS ===')
  for (const view of VIEWS_ALL) {
    const result = await probe(view)
    console.log(label(view) + result.state.padEnd(16) + (result.detail ? `(${result.detail})` : ''))
  }
}

main().catch((error) => {
  console.error(`\nFalhou: ${error.message}`)
  process.exit(1)
})
