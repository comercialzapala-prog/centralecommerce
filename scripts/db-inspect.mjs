#!/usr/bin/env node
/**
 * Inspecao READ-ONLY do banco linkado.
 *
 *   npm run db:inspect
 *
 * Nao escreve nada. Serve para dois momentos:
 *   - ANTES de aplicar uma migration, para saber o estado de partida e o volume
 *     de cada tabela (o que define o custo de lock do backfill);
 *   - DEPOIS, para confirmar que o que era esperado apareceu.
 *
 * DUAS COLUNAS DE IDENTIDADE, e a diferenca entre elas e o ponto:
 *
 *   anon    -> depois do hardening tem de ser `negado` em TUDO. Se aparecer `ok`
 *              numa tabela de negocio, e vazamento.
 *   service -> a verdade sobre o schema: o que existe e quantas linhas tem.
 *              Ignora RLS de proposito, e por isso nunca sai do servidor.
 *
 * Sem a service role o script ainda roda, mas só consegue dizer o que anon
 * alcanca -- o que, num banco endurecido, e nada.
 */

import {
  TABLES_V2,
  TABLES_INTEGRATION,
  VIEWS_ALL,
  countRows,
  loadEnv,
  restRaw,
} from './_supabase.mjs'

const env = loadEnv()
const anon = { key: env.NEXT_PUBLIC_SUPABASE_ANON_KEY }
const HAS_SERVICE = Boolean(env.SUPABASE_SERVICE_ROLE_KEY)
const service = { key: env.SUPABASE_SERVICE_ROLE_KEY }

const pad = (value, size) => String(value).padEnd(size)

async function probe(name, identity) {
  const res = await restRaw(env, `${name}?select=*&limit=0`, identity)

  if (res.status === 200 || res.status === 206) return 'ok'

  let code = null
  try {
    code = JSON.parse(res.body)?.code ?? null
  } catch {
    /* corpo nao-JSON */
  }

  if (code === 'PGRST205' || code === '42P01') return 'ausente'
  if (res.status === 401 || res.status === 403 || code === '42501') return 'negado'
  return `erro${res.status}`
}

async function hasColumn(table, column) {
  if (!HAS_SERVICE) return null
  const res = await restRaw(env, `${table}?select=${column}&limit=0`, service)
  return res.status === 200 || res.status === 206
}

async function report(title, names, { columns = false } = {}) {
  console.log(`\n=== ${title} ===`)
  console.log(`${pad('objeto', 28)}${pad('anon', 10)}${pad('service', 10)}${columns ? '   linhas  organization_id' : ''}`)

  for (const name of names) {
    const viaAnon = await probe(name, anon)
    const viaService = HAS_SERVICE ? await probe(name, service) : '-'

    let extra = ''
    if (columns && viaService === 'ok') {
      const rows = await countRows(env, name, service)
      const org = await hasColumn(name, 'organization_id')
      extra = `   ${String(rows ?? '-').padStart(6)}  ${org ? 'presente' : 'ausente'}`
    }

    // Marca o que seria vazamento: anon alcancando dado de negocio.
    const flag = viaAnon === 'ok' ? '   <-- ANON ALCANCA' : ''

    console.log(pad(name, 28) + pad(viaAnon, 10) + pad(viaService, 10) + extra + flag)
  }
}

async function main() {
  console.log(`Projeto: ${env.NEXT_PUBLIC_SUPABASE_URL}`)
  console.log(`Service role: ${HAS_SERVICE ? 'disponivel' : 'AUSENTE (coluna service fica vazia)'}`)

  await report('TABELAS DA V2 (existentes)', TABLES_V2, { columns: true })
  await report('TABELAS DE INTEGRACAO', TABLES_INTEGRATION, { columns: true })
  await report('VIEWS', VIEWS_ALL)

  const leaks = []
  for (const name of [...TABLES_V2, ...TABLES_INTEGRATION, ...VIEWS_ALL]) {
    if ((await probe(name, anon)) === 'ok') leaks.push(name)
  }

  console.log(
    leaks.length === 0
      ? '\nanon nao alcanca nenhum objeto de public. Endurecido.'
      : `\nATENCAO: anon alcanca ${leaks.length} objeto(s): ${leaks.join(', ')}`,
  )
}

main().catch((error) => {
  console.error(`\nFalhou: ${error.message}`)
  process.exit(1)
})
