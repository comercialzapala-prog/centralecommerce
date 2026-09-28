import 'server-only'

import { createClient } from '@/lib/supabase/server'

/**
 * ORGANIZACAO CORRENTE (secao 35)
 *
 * A operacao e single-tenant hoje e roda sem login, entao "a organizacao" e a
 * primeira linha de `organizations`. Este arquivo existe para que esse fato
 * fique em UM lugar: quando o login entrar, a troca e aqui -- ler o
 * organization_id do membro autenticado -- e nao em cada consulta.
 *
 * ATENCAO AO CACHE: `cachedId` e cache de MODULO, compartilhado entre requests
 * do mesmo processo. Com uma organizacao e inofensivo. Com duas, o primeiro
 * request aquece o cache e os seguintes recebem a organizacao errada -- remova
 * o cache (ou chaveie por usuario) antes de habilitar multi-tenant.
 */

let cachedId: string | null = null

/**
 * Codigos que significam "a fundacao de integracao ainda nao foi aplicada":
 * PGRST205 (PostgREST nao achou a tabela no schema cache) e 42P01 (relacao
 * inexistente no Postgres).
 */
const MISSING_TABLE_CODES = new Set(['PGRST205', '42P01'])

async function resolve(): Promise<{ id: string | null; missingFoundation: boolean }> {
  if (cachedId) return { id: cachedId, missingFoundation: false }

  const supabase = await createClient()
  const { data, error } = await supabase
    .from('organizations')
    .select('id')
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle()

  if (error) {
    if (MISSING_TABLE_CODES.has(error.code ?? '')) {
      return { id: null, missingFoundation: true }
    }
    throw new Error(`Falha ao identificar a organização: ${error.message}`)
  }

  if (!data?.id) return { id: null, missingFoundation: true }

  cachedId = data.id as string
  return { id: cachedId, missingFoundation: false }
}

/**
 * Id da organizacao. Lanca quando nao ha nenhuma -- use em fluxo que nao tem
 * como seguir sem ela (webhook, jobs, IntegrationService).
 */
export async function getCurrentOrganizationId(): Promise<string> {
  const { id } = await resolve()

  if (!id) {
    throw new Error(
      'Nenhuma organização encontrada. Aplique a migration ' +
        'supabase/migrations/20260928120000_integration_foundation.sql.',
    )
  }
  return id
}

/**
 * Versao que NAO lanca quando a fundacao nao existe: devolve null.
 *
 * Existe para a tela de status poder explicar o que falta em vez de responder
 * 500. Erro de verdade (rede, credencial) continua subindo -- so a ausencia da
 * tabela vira null, e essa distincao e o ponto da funcao.
 */
export async function findCurrentOrganizationId(): Promise<string | null> {
  const { id } = await resolve()
  return id
}
