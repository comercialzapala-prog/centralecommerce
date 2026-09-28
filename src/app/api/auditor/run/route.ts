import { getMembership, getSessionUser } from '@/lib/auth'
import { runAuditorForOrganization } from '@/lib/auditor-service'
import { createAdminClient } from '@/lib/supabase/admin'

/**
 * POST /api/auditor/run -- executa a analise da organizacao do usuario logado.
 *
 * POR QUE EXISTE, alem do botao na tela: a secao 32 pede uma rotina periodica de
 * reconciliacao, e agendador (Vercel Cron, por exemplo) chama endpoint, nao
 * Server Action. Mesma implementacao para os dois caminhos --
 * `runAuditorForOrganization` -- entao nao ha duas versoes da analise para
 * divergirem.
 *
 * AUTORIZACAO: exige sessao E vinculo. A organizacao analisada vem do VINCULO,
 * nunca do corpo da requisicao -- nao existe parametro `organization_id` aqui de
 * propósito, porque ele seria exatamente o jeito de pedir a analise da empresa de
 * outra pessoa.
 *
 * Responde JSON com 401/403 em vez de redirecionar: quem chama isto e script ou
 * agendador, e um 307 para /login seria interpretado como sucesso.
 */

export const dynamic = 'force-dynamic'

/** Janela minima entre execucoes. A analise le muita coisa; nao deve virar laco. */
const COOLDOWN_SECONDS = 30

export async function POST(): Promise<Response> {
  const user = await getSessionUser()
  if (!user) return json(401, { error: 'unauthenticated' })

  const membership = await getMembership()
  if (!membership) return json(403, { error: 'no_membership' })

  const db = createAdminClient()

  // Guarda contra execucao em rajada.
  const { data: recent } = await db
    .from('auditor_runs')
    .select('id,started_at,status')
    .eq('organization_id', membership.organizationId)
    .order('started_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (recent?.started_at) {
    const elapsed = (Date.now() - Date.parse(recent.started_at as string)) / 1000
    if (elapsed < COOLDOWN_SECONDS) {
      return json(429, {
        error: 'cooldown',
        retry_after_seconds: Math.ceil(COOLDOWN_SECONDS - elapsed),
      })
    }
  }

  try {
    const result = await runAuditorForOrganization({
      organizationId: membership.organizationId,
      triggeredBy: user.id,
    })

    return json(200, {
      status: 'completed',
      run_id: result.runId,
      reference_date: result.referenceDate,
      products_analyzed: result.productsAnalyzed,
      created: result.created,
      updated: result.updated,
      auto_resolved: result.autoResolved,
      recommendations: result.recommendations,
      counts: result.counts,
      supplier_source_missing: result.supplierSourceMissing,
    })
  } catch (error) {
    // A mensagem ja e sanitizada pelo servico; o stack nunca sai daqui.
    console.error('[auditor] execução falhou', {
      message: error instanceof Error ? error.message : String(error),
    })
    return json(500, {
      error: 'run_failed',
      message: error instanceof Error ? error.message.slice(0, 300) : 'Falha na análise.',
    })
  }
}

function json(status: number, body: Record<string, unknown>): Response {
  return Response.json(body, { status })
}
