import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

/**
 * PROXY (no Next 16, o antigo `middleware`)
 *
 * O arquivo se chama `proxy.ts` porque `middleware.ts` foi DEPRECIADO no Next 16
 * e renomeado -- a funcionalidade e a mesma, o nome do arquivo e do export
 * mudaram. Nao ha middleware.ts neste projeto de proposito.
 *
 * Dois papeis, e so estes dois:
 *
 * 1. RENOVAR O COOKIE DE SESSAO. Sem isso o token expira e o usuario e deslogado
 *    no meio do uso. `getUser()` aqui e o que dispara a renovacao.
 *
 * 2. REDIRECIONAR QUEM NAO TEM SESSAO. E uma checagem OTIMISTA: evita renderizar
 *    pagina para visitante e da a experiencia certa.
 *
 * O QUE ELE NAO E: a barreira de autorizacao. A propria doc do Next diz que
 * proxy "should not be used as a full session management or authorization
 * solution". Quem autoriza e src/lib/auth.ts, na camada de dados. Se este arquivo
 * fosse apagado, nenhum dado vazaria -- as paginas continuariam recusando.
 */

/** Rotas que respondem sem sessao. */
const PUBLIC_PATHS = ['/login']

/**
 * O webhook do Bling nao pode ser redirecionado: ele e chamado por servidor, sem
 * cookie, e um 307 para /login viraria "entrega aceita" aos olhos do Bling. Ele
 * tem a propria autenticacao, por assinatura HMAC.
 */
const BYPASS_PREFIXES = ['/api/']

function isPublic(pathname: string): boolean {
  if (BYPASS_PREFIXES.some((prefix) => pathname.startsWith(prefix))) return true
  return PUBLIC_PATHS.some((path) => pathname === path || pathname.startsWith(`${path}/`))
}

/** Havia cookie de sessao do Supabase na requisicao? */
function hadSessionCookie(request: NextRequest): boolean {
  return request.cookies.getAll().some((cookie) => /^sb-.*-auth-token/.test(cookie.name))
}

export async function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl

  // `supabaseResponse` precisa ser o objeto devolvido: e nele que os cookies
  // renovados foram gravados. Devolver um NextResponse.next() novo descartaria a
  // renovacao e o usuario cairia em loop de login.
  let supabaseResponse = NextResponse.next({ request })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          for (const { name, value } of cookiesToSet) {
            request.cookies.set(name, value)
          }
          supabaseResponse = NextResponse.next({ request })
          for (const { name, value, options } of cookiesToSet) {
            supabaseResponse.cookies.set(name, value, options)
          }
        },
      },
    },
  )

  // Esta chamada e o que renova o token. Nao remova nem troque por getSession().
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (isPublic(pathname)) {
    // Ja logado abrindo /login: manda para dentro em vez de mostrar o formulario.
    if (user && pathname === '/login') {
      const url = request.nextUrl.clone()
      url.pathname = '/dashboard'
      url.search = ''
      return redirectPreservingCookies(url, supabaseResponse)
    }
    return supabaseResponse
  }

  if (!user) {
    const url = request.nextUrl.clone()
    url.pathname = '/login'
    url.search = ''

    // `next` devolve a pessoa para onde ela queria ir depois do login.
    if (pathname !== '/') url.searchParams.set('next', `${pathname}${search}`)

    // Tinha cookie e nao tem usuario = sessao expirou ou foi revogada. A
    // distincao muda a mensagem: "entre" e diferente de "sua sessao expirou".
    if (hadSessionCookie(request)) url.searchParams.set('expirou', '1')

    return redirectPreservingCookies(url, supabaseResponse)
  }

  return supabaseResponse
}

/**
 * Redireciona SEM perder os cookies renovados.
 *
 * Criar um NextResponse.redirect do zero descartaria a renovacao feita acima --
 * bug classico que produz loop de redirecionamento.
 */
function redirectPreservingCookies(url: URL, carrier: NextResponse): NextResponse {
  const response = NextResponse.redirect(url)
  for (const cookie of carrier.cookies.getAll()) {
    response.cookies.set(cookie)
  }
  return response
}

export const config = {
  /**
   * Fora do matcher: assets estaticos, imagens otimizadas, favicon e arquivos
   * com extensao. Rodar o proxy neles gastaria uma chamada de auth por asset.
   */
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|woff2?)$).*)',
  ],
}
