'use server'

import { revalidatePath } from 'next/cache'

import {
  actionError,
  actionOk,
  readOneOf,
  readUuid,
  runAction,
  type ActionState,
} from '@/lib/actions'
import { requireMembership } from '@/lib/auth'
import { runAuditorForOrganization } from '@/lib/auditor-service'
import { createAdminClient } from '@/lib/supabase/admin'
import { ALERT_STATUS_ORDER } from '@/lib/hoje'

/**
 * ACOES DO /hoje
 *
 * Todas gravam com service role, porque `alerts`, `recommendations` e
 * `auditor_runs` so aceitam escrita de service_role desde o hardening. Por isso
 * cada acao faz DUAS checagens antes de escrever:
 *
 *   1. `requireMembership()` -- quem esta chamando tem sessao e vinculo;
 *   2. o recurso pertence a organizacao desse vinculo.
 *
 * A segunda nao e redundante. A service role IGNORA a RLS: sem o filtro explicito
 * por organization_id, um id de alerta de outra organizacao passaria. Este e
 * exatamente o ponto em que o isolamento deixa de ser do banco e passa a ser do
 * codigo -- e onde ele precisa estar escrito.
 */

function revalidateHoje() {
  revalidatePath('/hoje')
  revalidatePath('/dashboard')
}

/**
 * Roda a analise agora.
 *
 * Assinatura `(prev, formData)` mesmo sem usar nenhum dos dois: e o contrato que
 * `useActionState` exige, e e ele que da o estado de carregamento no botao.
 *
 * Fica numa acao, e nao no render da pagina, de propósito: Server Component nao
 * deve ter efeito colateral. Uma pagina que roda o auditor ao renderizar gravaria
 * no banco a cada F5 e a cada prefetch do Next.
 */
export async function runAnalysis(
  _prev: ActionState,
  _formData: FormData,
): Promise<ActionState> {
  return runAction(async () => {
    const { user, membership } = await requireMembership()

    const result = await runAuditorForOrganization({
      organizationId: membership.organizationId,
      triggeredBy: user.id,
    })

    revalidateHoje()

    const parts = [`${result.productsAnalyzed} produto(s) analisado(s)`]
    if (result.created > 0) parts.push(`${result.created} alerta(s) novo(s)`)
    if (result.autoResolved > 0) parts.push(`${result.autoResolved} resolvido(s) sozinho(s)`)
    if (result.created === 0 && result.autoResolved === 0) parts.push('nada mudou')

    return actionOk(`Análise concluída: ${parts.join(', ')}.`)
  })
}

/**
 * Muda o status de um alerta.
 *
 * `RESOLVED` marcado a mao e diferente de resolvido pelo auditor: aqui a pessoa
 * afirma ter resolvido. Se o problema continuar, a proxima execucao reabre o
 * alerta -- e esse reabrir e informacao, nao bug.
 */
export async function setAlertStatus(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  return runAction(async () => {
    const { membership } = await requireMembership()

    const alertId = readUuid(formData, 'alert_id')
    if (!alertId) return actionError('Alerta não identificado.')

    const status = readOneOf(formData, 'status', ALERT_STATUS_ORDER, 'Status')
    const now = new Date().toISOString()

    const patch: Record<string, unknown> = { status }
    if (status === 'RESOLVED') patch.resolved_at = now
    if (status === 'ACKNOWLEDGED') patch.acknowledged_at = now
    if (status === 'DISMISSED') patch.dismissed_at = now
    if (status === 'OPEN') {
      patch.resolved_at = null
      patch.acknowledged_at = null
      patch.dismissed_at = null
    }

    const db = createAdminClient()
    const { data, error } = await db
      .from('alerts')
      .update(patch)
      .eq('id', alertId)
      // O filtro que impede um id de outra organizacao passar pela service role.
      .eq('organization_id', membership.organizationId)
      .select('id')

    if (error) return actionError(`Não foi possível atualizar: ${error.message}`)
    if (!data || data.length === 0) return actionError('Alerta não encontrado nesta organização.')

    revalidateHoje()

    const label =
      status === 'RESOLVED'
        ? 'Marcado como resolvido.'
        : status === 'DISMISSED'
          ? 'Alerta ignorado.'
          : status === 'ACKNOWLEDGED'
            ? 'Marcado como visto.'
            : 'Alerta reaberto.'

    return actionOk(label)
  })
}

/**
 * Marca o momento da revisao.
 *
 * E o que da resposta a "o que aconteceu desde a minha ultima analise?". Sem este
 * carimbo a pagina nao teria como responder, e inventar uma janela fixa de 24h
 * seria afirmar algo que ela nao sabe.
 */
export async function markReviewed(
  _prev: ActionState,
  _formData: FormData,
): Promise<ActionState> {
  return runAction(async () => {
    const { user, membership } = await requireMembership()

    const db = createAdminClient()
    const { error } = await db
      .from('organization_members')
      .update({ last_reviewed_at: new Date().toISOString() })
      .eq('organization_id', membership.organizationId)
      .eq('user_id', user.id)

    if (error) return actionError(`Não foi possível registrar a revisão: ${error.message}`)

    revalidateHoje()
    return actionOk('Revisão registrada. A partir daqui, o que aparecer é novo.')
  })
}
