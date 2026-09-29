import 'server-only'

import { createClient as createSupabaseClient, type SupabaseClient } from '@supabase/supabase-js'

/**
 * CLIENTE DE SERVICE ROLE -- SOMENTE SERVIDOR (secoes 35 e 36)
 *
 * Por que existe: as tabelas de integracao nao dao INSERT/UPDATE/DELETE para
 * anon nem para authenticated (ver migration 20260928120000). Quem escreve nelas
 * e o webhook, a fila de jobs e a reconciliacao -- processos de servidor. Este e
 * o unico caminho de escrita.
 *
 * Regras que nao podem ser quebradas:
 *  - `server-only`: importar de Client Component quebra o build;
 *  - a chave se chama SUPABASE_SERVICE_ROLE_KEY, JAMAIS com NEXT_PUBLIC_;
 *  - service role IGNORA RLS. Todo filtro por organization_id aqui e manual:
 *    sempre passe `.eq('organization_id', ...)`.
 *
 * Enquanto a chave nao estiver configurada, isto levanta erro claro em vez de
 * cair silenciosamente para a chave anon -- que nao teria permissao de escrita e
 * produziria um "0 linhas afetadas" dificil de diagnosticar.
 */

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY

export class ServiceRoleNotConfiguredError extends Error {
  constructor() {
    super(
      'SUPABASE_SERVICE_ROLE_KEY nao definida. As tabelas de integração só aceitam escrita por service role (seção 36).',
    )
    this.name = 'ServiceRoleNotConfiguredError'
  }
}

export function isServiceRoleConfigured(): boolean {
  return Boolean(SUPABASE_URL && SERVICE_ROLE_KEY)
}

let cached: SupabaseClient | null = null

export function createAdminClient(): SupabaseClient {
  if (!SUPABASE_URL || !SERVICE_ROLE_KEY) throw new ServiceRoleNotConfiguredError()

  // Uma instancia por processo: o client e stateless para service role (nao ha
  // sessao nem cookie) e recriar a cada chamada so gera overhead.
  if (cached) return cached

  cached = createSupabaseClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  })

  return cached
}

/**
 * Client para INFRAESTRUTURA sem sessao de usuario.
 *
 * Webhook, fila de jobs e reconciliacao rodam sem ninguem logado -- nao ha cookie
 * e nao ha `auth.uid()`. Eles precisam ler configuracao (`organizations`,
 * `integration_settings`) para funcionar, e depois do hardening essas leituras
 * exigem pelo menos `authenticated`.
 *
 * ESTA FUNCAO JA TEVE UMA QUEDA para o client de cookie quando a service role nao
 * estava configurada, e ela foi REMOVIDA em 2026-09-29. A justificativa escrita
 * aqui era "e aceitavel porque hoje `anon` ainda le essas tabelas" -- e o
 * hardening de 2026-09-28 acabou com essa premissa. O que sobrava era o pior tipo
 * de fallback: um caminho de negocio que troca de identidade em silencio,
 * conforme uma variavel de ambiente, e que num contexto sem sessao (webhook,
 * cron) resolveria para `anon`.
 *
 * Agora a falta da chave e um erro explicito (`ServiceRoleNotConfiguredError`).
 * Falhar dizendo o que falta e melhor do que rodar com a identidade errada.
 *
 * O nome continua existindo, em vez de todos chamarem `createAdminClient()`
 * direto, porque a distincao de INTENCAO importa: "sou infra, nao tenho usuario"
 * e diferente de "preciso ignorar a RLS". Se um dia essas tabelas passarem a
 * aceitar leitura por outro papel, a mudanca acontece aqui.
 *
 * NAO use isto para servir dado ao navegador: service role ignora RLS.
 */
export async function createInfraClient(): Promise<SupabaseClient> {
  return createAdminClient()
}
