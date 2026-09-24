import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

/**
 * Cliente Supabase para Server Components e Server Actions.
 *
 * Usa sempre a chave ANON -- a service role nunca sai do servidor de
 * infraestrutura e nunca e embarcada no bundle (secao 40). O acesso hoje e
 * liberado via policy; quando o login entrar, o cookie de sessao ja viaja
 * por aqui sem mudar nenhuma chamada.
 */
export async function createClient() {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    throw new Error(
      'Supabase nao configurado: defina NEXT_PUBLIC_SUPABASE_URL e NEXT_PUBLIC_SUPABASE_ANON_KEY.',
    )
  }

  const cookieStore = await cookies()

  return createServerClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    cookies: {
      getAll() {
        return cookieStore.getAll()
      },
      setAll(cookiesToSet) {
        try {
          for (const { name, value, options } of cookiesToSet) {
            cookieStore.set(name, value, options)
          }
        } catch {
          // Server Component sem permissao de escrita de cookie: ignoravel.
        }
      },
    },
  })
}
