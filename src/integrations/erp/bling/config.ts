import 'server-only'

import { notConfigured, notImplemented } from '@/integrations/erp/errors'
import { READ_ONLY_SCOPES, type ErpScope } from '@/integrations/erp/types'

/**
 * CONFIGURACAO DO BLING (secoes 12, 14 e 39)
 *
 * NADA aqui tem valor default de rede. Nenhuma URL, nenhum client_id, nenhum
 * caminho de endpoint esta escrito no codigo -- porque ainda nao temos a conta e
 * um valor chutado seria pior do que nenhum: pareceria funcionar.
 *
 * Enquanto as variaveis nao existirem, tudo devolve NOT_CONFIGURED e o painel
 * mostra "Não configurado". Nenhuma requisicao sai.
 *
 * VARIAVEIS (todas SEM NEXT_PUBLIC_ -- secao 12):
 *   BLING_CLIENT_ID
 *   BLING_CLIENT_SECRET
 *   BLING_API_BASE_URL           base da API, conforme a documentacao oficial
 *   BLING_OAUTH_AUTHORIZE_URL    URL de autorizacao do OAuth
 *   BLING_OAUTH_TOKEN_URL        URL de troca/refresh de token
 *   BLING_WEBHOOK_SECRET         segredo do HMAC do webhook
 *   BLING_REDIRECT_URI           callback registrado no aplicativo
 */

export type BlingCredentials = {
  clientId: string
  clientSecret: string
  apiBaseUrl: string
  redirectUri: string | null
}

export type BlingOAuthUrls = {
  authorizeUrl: string
  tokenUrl: string
}

function readEnv(name: string): string | null {
  const value = process.env[name]?.trim()
  return value ? value : null
}

/* -------------------------------------------------------------------------- */
/* Credencial                                                                  */
/* -------------------------------------------------------------------------- */

export function getBlingCredentials(): BlingCredentials | null {
  const clientId = readEnv('BLING_CLIENT_ID')
  const clientSecret = readEnv('BLING_CLIENT_SECRET')
  const apiBaseUrl = readEnv('BLING_API_BASE_URL')

  // Credencial parcial e a mesma coisa que credencial ausente: metade de uma
  // configuracao produz erro confuso mais tarde, entao ela nao passa daqui.
  if (!clientId || !clientSecret || !apiBaseUrl) return null

  return {
    clientId,
    clientSecret,
    apiBaseUrl: apiBaseUrl.replace(/\/+$/, ''),
    redirectUri: readEnv('BLING_REDIRECT_URI'),
  }
}

export function requireBlingCredentials(): BlingCredentials {
  const credentials = getBlingCredentials()
  if (!credentials) {
    throw notConfigured(
      'Bling (defina BLING_CLIENT_ID, BLING_CLIENT_SECRET e BLING_API_BASE_URL no servidor)',
    )
  }
  return credentials
}

export function getBlingOAuthUrls(): BlingOAuthUrls | null {
  const authorizeUrl = readEnv('BLING_OAUTH_AUTHORIZE_URL')
  const tokenUrl = readEnv('BLING_OAUTH_TOKEN_URL')
  if (!authorizeUrl || !tokenUrl) return null
  return { authorizeUrl, tokenUrl }
}

export function getBlingWebhookSecret(): string | null {
  return readEnv('BLING_WEBHOOK_SECRET')
}

/** Escopos que a Fase A pede: leitura, nada mais (secao 14). */
export function getRequestedScopes(): ErpScope[] {
  return [...READ_ONLY_SCOPES]
}

/* -------------------------------------------------------------------------- */
/* Endpoints                                                                   */
/* -------------------------------------------------------------------------- */

/**
 * Caminhos logicos da API.
 *
 * PROPOSITALMENTE TODOS `null`. Quando a conta existir (Fase B), preencha cada
 * um com o caminho da documentacao oficial -- e este e o UNICO arquivo a editar:
 * os modulos de recurso pedem o caminho por nome logico.
 *
 * O nome logico tambem e o que vai para log (secao 34): registramos
 * "products.list", nunca a URL montada com query string.
 */
export type BlingEndpointName =
  | 'products.list'
  | 'products.get'
  | 'products.update'
  | 'products.updatePrice'
  | 'stock.list'
  | 'stock.getByProduct'
  | 'orders.list'
  | 'orders.get'
  | 'suppliers.list'
  | 'productSuppliers.listByProduct'
  | 'warehouses.list'

const ENDPOINTS: Record<BlingEndpointName, string | null> = {
  'products.list': null,
  'products.get': null,
  'products.update': null,
  'products.updatePrice': null,
  'stock.list': null,
  'stock.getByProduct': null,
  'orders.list': null,
  'orders.get': null,
  'suppliers.list': null,
  'productSuppliers.listByProduct': null,
  'warehouses.list': null,
}

/**
 * Devolve o caminho de um endpoint. Enquanto o mapa nao estiver preenchido,
 * levanta NOT_IMPLEMENTED com o nome exato do que falta -- e assim que a Fase A
 * se comporta: recusa explicita, nunca chamada para um lugar inventado.
 */
export function requireEndpoint(name: BlingEndpointName): string {
  const path = ENDPOINTS[name]
  if (!path) {
    throw notImplemented(
      `Endpoint "${name}" (preencha ENDPOINTS em src/integrations/erp/bling/config.ts com o caminho da documentacao oficial)`,
    )
  }
  return path
}

export function hasEndpoint(name: BlingEndpointName): boolean {
  return ENDPOINTS[name] !== null
}

/** Verdadeiro so quando credencial E endpoints existem. */
export function isBlingReady(): boolean {
  return getBlingCredentials() !== null && hasEndpoint('products.list')
}
