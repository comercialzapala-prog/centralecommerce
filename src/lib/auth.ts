import 'server-only'

import { cache } from 'react'
import { redirect } from 'next/navigation'
import type { SupabaseClient } from '@supabase/supabase-js'

import { createClient } from '@/lib/supabase/server'

/**
 * CAMADA DE AUTORIZACAO (Data Access Layer)
 *
 * Esta e a barreira DE VERDADE. `proxy.ts` faz apenas a checagem otimista --
 * a propria documentacao do Next 16 diz que proxy "should not be used as a full
 * session management or authorization solution".
 *
 * E o gate NAO fica no layout, tambem por recomendacao explicita da doc: layout
 * nao re-renderiza em navegacao client-side e nao controla se o resto da rota
 * renderiza. Um layout que esconde a UI nao impede a pagina de rodar nem de
 * aparecer no RSC payload.
 *
 * Por isso a regra do projeto e: NINGUEM chama `@/lib/supabase/server` direto
 * para ler ou escrever dado de negocio. Todo mundo passa por
 * `createAuthedClient()` daqui. Assim a checagem acontece onde o dado e lido, e
 * uma pagina nova nasce protegida sem ninguem precisar lembrar de proteger.
 *
 * `cache()` memoiza por render pass: uma unica validacao de sessao por
 * requisicao, mesmo com vinte funcoes de leitura na mesma pagina.
 */

export const LOGIN_PATH = '/login'
export const PENDING_ACCESS_PATH = '/acesso-pendente'
export const AFTER_LOGIN_PATH = '/dashboard'

export const MEMBER_ROLES = ['OWNER', 'ADMIN', 'MEMBER', 'VIEWER'] as const
export type MemberRole = (typeof MEMBER_ROLES)[number]

export type SessionUser = {
  id: string
  email: string | null
}

export type Membership = {
  organizationId: string
  role: MemberRole
}

export type AuthContext = {
  user: SessionUser
  membership: Membership
}

/**
 * Usuario da sessao, ou null.
 *
 * Usa `auth.getUser()` e NAO `auth.getSession()`. A diferenca importa: getSession
 * so decodifica o cookie, que o cliente controla; getUser valida o JWT contra o
 * servidor de auth. Para decisao de autorizacao, apenas getUser serve.
 */
export const getSessionUser = cache(async (): Promise<SessionUser | null> => {
  const supabase = await createClient()
  const { data, error } = await supabase.auth.getUser()

  if (error || !data.user) return null

  return { id: data.user.id, email: data.user.email ?? null }
})

/**
 * Vinculo do usuario com uma organizacao, ou null.
 *
 * Ter conta NAO da acesso: quem da acesso e a linha em organization_members.
 * A policy da tabela ja restringe a leitura ao proprio usuario
 * (`user_id = auth.uid()`), entao esta consulta nao consegue ver vinculo alheio
 * nem sem o hardening aplicado.
 */
export const getMembership = cache(async (): Promise<Membership | null> => {
  const user = await getSessionUser()
  if (!user) return null

  const supabase = await createClient()
  const { data, error } = await supabase
    .from('organization_members')
    .select('organization_id,role')
    .eq('user_id', user.id)
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle()

  if (error || !data) return null

  return {
    organizationId: data.organization_id as string,
    role: data.role as MemberRole,
  }
})

/** Exige sessao. Sem ela, vai para o login. */
export const requireUser = cache(async (): Promise<SessionUser> => {
  const user = await getSessionUser()
  if (!user) redirect(LOGIN_PATH)
  return user
})

/**
 * Exige sessao E vinculo com organizacao. E o gate que todo dado de negocio usa.
 *
 * Autenticado sem vinculo nao ve dado nenhum -- vai para /acesso-pendente. Isso
 * vale desde ja, ANTES do hardening da RLS: a checagem e da aplicacao, nao
 * depende da policy. Depois do hardening passa a haver duas barreiras.
 */
export const requireMembership = cache(async (): Promise<AuthContext> => {
  const user = await requireUser()
  const membership = await getMembership()

  if (!membership) redirect(PENDING_ACCESS_PATH)

  return { user, membership }
})

/**
 * O client que TODA leitura e escrita de dado de negocio deve usar.
 *
 * Ele valida a sessao e o vinculo antes de devolver a conexao. Os modulos
 * importam com alias (`createAuthedClient as createClient`) para que o call site
 * fique identico ao de antes -- o que muda e a garantia, nao o codigo.
 */
export const createAuthedClient = cache(async (): Promise<SupabaseClient> => {
  await requireMembership()
  return createClient()
})

/**
 * Encerra a sessao. Chamado pelo botao de sair.
 *
 * `scope: 'local'` limpa a sessao deste navegador. Nao usamos 'global' porque
 * derrubar a sessao de todos os dispositivos nao e o que "sair" significa.
 */
export async function signOut(): Promise<void> {
  const supabase = await createClient()
  await supabase.auth.signOut({ scope: 'local' })
}
