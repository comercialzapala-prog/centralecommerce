'use server'

import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'

import { actionError, readRequiredText, runAction, type ActionState } from '@/lib/actions'
import { AFTER_LOGIN_PATH, LOGIN_PATH } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'

/**
 * SERVER ACTIONS DE AUTENTICACAO
 *
 * Ficam em `lib` e nao ao lado de uma pagina porque `logout` e global -- ele e
 * chamado pelo cabecalho, que aparece em todas as rotas. Importar de dentro de um
 * route group (`(auth)/login/actions`) a partir do Topbar seria acoplamento torto.
 *
 * Estas sao as unicas actions do projeto que usam `@/lib/supabase/server`
 * diretamente, em vez do client autorizado de `@/lib/auth`. E obrigatorio: quem
 * esta entrando ainda nao tem sessao, e exigir sessao para entrar seria
 * circular.
 */

/**
 * Entrar com e-mail e senha.
 *
 * Mensagens: nao dizemos "e-mail nao existe" nem "senha errada" separadamente. A
 * distincao entrega quais e-mails tem conta (enumeracao de usuarios), e o
 * Supabase ja devolve `invalid_credentials` para os dois casos de proposito.
 *
 * `email_not_confirmed` e a excecao: ali a mensagem precisa ser especifica,
 * senao a pessoa fica tentando a senha certa para sempre.
 */
export async function signIn(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const next = readNextPath(formData)

  const result = await runAction(async () => {
    const email = readRequiredText(formData, 'email', 'E-mail')
    const password = readRequiredText(formData, 'password', 'Senha')

    const supabase = await createClient()
    const { error } = await supabase.auth.signInWithPassword({ email, password })

    if (error) {
      if (error.code === 'email_not_confirmed') {
        return actionError(
          'Esta conta ainda não foi confirmada. Abra o e-mail de confirmação antes de entrar.',
        )
      }
      if (error.code === 'invalid_credentials') {
        return actionError('E-mail ou senha incorretos.')
      }
      if (error.code === 'over_request_rate_limit' || error.status === 429) {
        return actionError('Muitas tentativas. Aguarde um minuto e tente novamente.')
      }
      return actionError('Não foi possível entrar. Tente novamente em instantes.')
    }

    // Sucesso: sinaliza para o bloco abaixo redirecionar.
    return { status: 'success' as const }
  })

  if (result.status !== 'success') return result

  // `redirect()` lanca. Precisa ficar FORA do runAction, senao o
  // `unstable_rethrow` de lá teria de deixar passar e o fluxo fica dificil de ler.
  // O layout do grupo (app) e o cache de rota precisam ser invalidados: a sessao
  // mudou e o cabecalho mostra o e-mail de quem entrou.
  revalidatePath('/', 'layout')
  redirect(next)
}

export async function logout(): Promise<void> {
  const supabase = await createClient()
  await supabase.auth.signOut({ scope: 'local' })

  revalidatePath('/', 'layout')
  redirect(LOGIN_PATH)
}

/**
 * Para onde ir depois de entrar.
 *
 * So aceita caminho interno. Sem esta checagem, `?next=https://site-falso` faria
 * o formulario de login virar redirecionador aberto -- o atacante manda o link,
 * a pessoa entra de verdade e sai no site dele.
 */
function readNextPath(formData: FormData): string {
  const raw = formData.get('next')
  if (typeof raw !== 'string' || raw === '') return AFTER_LOGIN_PATH

  // Precisa comecar com uma barra e nao pode ser "//host" (protocolo relativo).
  if (!raw.startsWith('/') || raw.startsWith('//')) return AFTER_LOGIN_PATH
  if (raw.startsWith(LOGIN_PATH)) return AFTER_LOGIN_PATH

  return raw
}
