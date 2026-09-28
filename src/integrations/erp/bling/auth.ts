import 'server-only'

import { decryptIntegrationSecret, encryptIntegrationSecret } from '@/integrations/crypto'
import { ErpError, notConfigured, notImplemented } from '@/integrations/erp/errors'
import type { BlingTokenProvider } from '@/integrations/erp/bling/client'
import { getBlingOAuthUrls, getRequestedScopes, requireBlingCredentials } from '@/integrations/erp/bling/config'
import { createAdminClient } from '@/lib/supabase/admin'

/**
 * AUTENTICACAO DO BLING (secoes 12, 13, 14 e 39)
 *
 * O QUE ESTA IMPLEMENTADO (e funciona hoje):
 *   - leitura da conexao em erp_connections;
 *   - decifragem do token com a chave do servidor;
 *   - deteccao de token expirado / proximo de expirar;
 *   - gravacao cifrada do par de tokens;
 *   - montagem da URL de autorizacao a partir das variaveis de ambiente.
 *
 * O QUE NAO ESTA, DE PROPOSITO (secao 39: "NAO implementar OAuth real ainda"):
 *   - troca de authorization_code por token;
 *   - refresh de token.
 *   Ambos levantam NOT_IMPLEMENTED com a lista do que confirmar na Fase B.
 *   Nao ha palpite de formato de requisicao aqui: o metodo de autenticacao do
 *   cliente (Basic vs client_secret_post) e o nome de cada campo precisam sair
 *   da documentacao oficial, nao da nossa imaginacao.
 */

/** Renova antes de expirar de fato: token que morre no meio do job e retrabalho. */
const REFRESH_MARGIN_MS = 5 * 60 * 1000

export type ErpConnectionRow = {
  id: string
  organization_id: string
  provider: string
  status: string
  external_company_id: string | null
  access_token_encrypted: string | null
  refresh_token_encrypted: string | null
  access_token_expires_at: string | null
  scopes: string[]
}

const CONNECTION_COLUMNS =
  'id,organization_id,provider,status,external_company_id,access_token_encrypted,refresh_token_encrypted,access_token_expires_at,scopes'

/* -------------------------------------------------------------------------- */
/* Leitura e gravacao da conexao                                               */
/* -------------------------------------------------------------------------- */

export async function loadConnection(organizationId: string): Promise<ErpConnectionRow | null> {
  const supabase = createAdminClient()
  const { data, error } = await supabase
    .from('erp_connections')
    .select(CONNECTION_COLUMNS)
    .eq('organization_id', organizationId)
    .eq('provider', 'BLING')
    .maybeSingle()

  if (error) throw new ErpError('UNKNOWN', `Falha ao ler a conexao do ERP: ${error.message}`)
  return (data as ErpConnectionRow | null) ?? null
}

export type TokenSet = {
  accessToken: string
  refreshToken: string | null
  /** Segundos de validade informados pelo ERP. */
  expiresInSeconds: number | null
  scopes?: string[]
  externalCompanyId?: string | null
}

/** Grava o par cifrado e marca a conexao como CONNECTED (secoes 12 e 13). */
export async function saveTokenSet(organizationId: string, tokens: TokenSet): Promise<void> {
  const supabase = createAdminClient()

  const expiresAt = tokens.expiresInSeconds
    ? new Date(Date.now() + tokens.expiresInSeconds * 1000).toISOString()
    : null

  const patch: Record<string, unknown> = {
    status: 'CONNECTED',
    access_token_encrypted: encryptIntegrationSecret(tokens.accessToken),
    access_token_expires_at: expiresAt,
    last_error: null,
  }

  // Refresh token ausente na resposta NAO apaga o que ja estava guardado: alguns
  // fluxos devolvem apenas o access token na renovacao.
  if (tokens.refreshToken) {
    patch.refresh_token_encrypted = encryptIntegrationSecret(tokens.refreshToken)
  }
  if (tokens.scopes) patch.scopes = tokens.scopes
  if (tokens.externalCompanyId !== undefined) patch.external_company_id = tokens.externalCompanyId

  const { error } = await supabase
    .from('erp_connections')
    .update(patch)
    .eq('organization_id', organizationId)
    .eq('provider', 'BLING')

  if (error) throw new ErpError('UNKNOWN', `Falha ao gravar o token: ${error.message}`)
}

export async function markConnectionStatus(
  organizationId: string,
  status: 'NOT_CONFIGURED' | 'CONNECTED' | 'TOKEN_EXPIRED' | 'ERROR' | 'DISCONNECTED',
  lastError?: string | null,
): Promise<void> {
  const supabase = createAdminClient()
  await supabase
    .from('erp_connections')
    .update({ status, last_error: lastError ?? null })
    .eq('organization_id', organizationId)
    .eq('provider', 'BLING')
}

/* -------------------------------------------------------------------------- */
/* OAuth                                                                       */
/* -------------------------------------------------------------------------- */

/**
 * URL para onde mandar o usuario autorizar (secao 41).
 *
 * `state` e obrigatorio: sem ele o callback aceita qualquer redirecionamento e o
 * fluxo fica vulneravel a CSRF. Quem chama deve gerar um valor aleatorio,
 * guardar em cookie httpOnly e comparar no retorno.
 */
export function buildAuthorizationUrl(state: string): string {
  if (!state || state.length < 16) {
    throw new ErpError('INVALID_REQUEST', 'state do OAuth precisa ser aleatorio e ter 16+ chars.')
  }

  const credentials = requireBlingCredentials()
  const urls = getBlingOAuthUrls()
  if (!urls) throw notConfigured('BLING_OAUTH_AUTHORIZE_URL / BLING_OAUTH_TOKEN_URL')
  if (!credentials.redirectUri) throw notConfigured('BLING_REDIRECT_URI')

  const url = new URL(urls.authorizeUrl)
  url.searchParams.set('response_type', 'code')
  url.searchParams.set('client_id', credentials.clientId)
  url.searchParams.set('redirect_uri', credentials.redirectUri)
  url.searchParams.set('state', state)
  // Secao 14: pede so leitura na primeira conexao.
  url.searchParams.set('scope', getRequestedScopes().join(' '))

  return url.toString()
}

/**
 * FASE B. Troca o authorization_code pelo primeiro par de tokens.
 *
 * Para implementar, confirmar na documentacao oficial:
 *   1. metodo de autenticacao do cliente (Basic base64(id:secret) ou body);
 *   2. content-type esperado (form-urlencoded ou json);
 *   3. nomes dos campos da resposta (access_token, refresh_token, expires_in);
 *   4. se a resposta traz o id da empresa -- vai para external_company_id.
 * Depois basta chamar saveTokenSet(), que ja cifra e grava.
 */
export async function exchangeAuthorizationCode(
  organizationId: string,
  code: string,
): Promise<never> {
  // O code entra na mensagem apenas pelo TAMANHO: o valor e credencial de uso
  // unico e nao pode aparecer em log nem em erro (secao 34).
  throw notImplemented(
    `Troca de authorization_code por token do Bling (organizacao ${organizationId}, code de ${code.length} chars)`,
  )
}

/**
 * FASE B. Renova o access token usando o refresh token guardado.
 * O refresh token e lido e decifrado aqui (`readRefreshToken`) -- o que falta e
 * so a chamada HTTP, que depende dos mesmos 4 pontos acima.
 */
export async function refreshAccessToken(organizationId: string): Promise<never> {
  throw notImplemented(`Refresh de token do Bling (organizacao ${organizationId})`)
}

async function readRefreshToken(organizationId: string): Promise<string> {
  const connection = await loadConnection(organizationId)
  if (!connection?.refresh_token_encrypted) {
    throw new ErpError('UNAUTHORIZED', 'Nao existe refresh token guardado para esta organizacao.')
  }
  return decryptIntegrationSecret(connection.refresh_token_encrypted)
}

/* -------------------------------------------------------------------------- */
/* TokenProvider                                                               */
/* -------------------------------------------------------------------------- */

export function isTokenExpired(expiresAt: string | null): boolean {
  if (!expiresAt) return false
  const expiry = Date.parse(expiresAt)
  if (Number.isNaN(expiry)) return false
  return expiry - REFRESH_MARGIN_MS <= Date.now()
}

/**
 * Implementacao de BlingTokenProvider para o BlingApiClient.
 *
 * O client nunca ve a tabela nem a criptografia: pede token, recebe string.
 * Quando o refresh entrar (Fase B), nada no client muda.
 */
export class StoredTokenProvider implements BlingTokenProvider {
  constructor(private readonly organizationId: string) {}

  async getAccessToken(): Promise<string> {
    const connection = await loadConnection(this.organizationId)

    if (!connection || connection.status === 'NOT_CONFIGURED') {
      throw notConfigured('Conexao com o Bling')
    }
    if (!connection.access_token_encrypted) {
      throw new ErpError('UNAUTHORIZED', 'Conexao sem access token. Reconecte a integracao.')
    }
    if (isTokenExpired(connection.access_token_expires_at)) {
      // Renovacao proativa: evita gastar uma requisicao so para levar 401.
      return this.refreshAccessToken()
    }

    return decryptIntegrationSecret(connection.access_token_encrypted)
  }

  async refreshAccessToken(): Promise<string> {
    // Confirma que existe refresh token antes de anunciar o que falta -- assim o
    // erro diz "reconecte" quando e reconexao e "Fase B" quando e implementacao.
    await readRefreshToken(this.organizationId)
    return refreshAccessToken(this.organizationId)
  }
}
