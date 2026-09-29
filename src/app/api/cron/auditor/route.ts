import { timingSafeEqual } from 'node:crypto'

import { runAuditorForOrganization } from '@/lib/auditor-service'
import { createAdminClient } from '@/lib/supabase/admin'

/**
 * GET /api/cron/auditor -- a execucao agendada da analise (secao 32).
 *
 * POR QUE UMA SEGUNDA ROTA, e nao o POST /api/auditor/run:
 *
 *   1. O Vercel Cron dispara **GET**. Nao existe configuracao de metodo: um cron
 *      apontado para o POST receberia 405 todo dia, em silencio.
 *   2. O POST se autoriza por SESSAO e analisa a organizacao do VINCULO de quem
 *      chamou. Um agendador nao tem sessao nem vinculo -- e dar a ele um jeito de
 *      passar `organization_id` seria abrir exatamente o parametro que o POST
 *      recusa ter.
 *
 * Entao esta rota tem outra identidade: ela nao e um usuario, e o relogio. Se
 * autentica por segredo compartilhado e roda para TODAS as organizacoes.
 *
 * A analise em si e a mesma dos dois caminhos -- `runAuditorForOrganization` --,
 * entao nao ha duas versoes das regras para divergirem.
 *
 * AUTENTICACAO: o Vercel envia `Authorization: Bearer $CRON_SECRET` quando a
 * variavel existe no projeto. Sem a variavel a rota responde 503 e NAO roda: uma
 * rota que executa a analise da operacao inteira sem provar quem e seria um botao
 * publico de carga, disponivel para qualquer um que descobrisse o caminho.
 */

export const dynamic = 'force-dynamic'

/** Hobby permite ate 60s de funcao; acima disso o plano recusa o deploy. */
export const maxDuration = 60

/**
 * Guarda contra disparo duplicado (retentativa do agendador, deploy que reexecuta
 * o cron, clique no "Executar agora" do painel logo depois). NAO substitui o
 * cooldown de 30s do botao da tela: aquele protege contra rajada humana, este
 * contra a mesma execucao chegar duas vezes.
 */
const SKIP_IF_RUN_WITHIN_SECONDS = 5 * 60

export async function GET(request: Request): Promise<Response> {
  const secret = process.env.CRON_SECRET

  if (!secret) {
    console.error('[cron] CRON_SECRET nao definida -- execucao recusada')
    return json(503, { error: 'cron_not_configured' })
  }

  if (!authorized(request, secret)) {
    return json(401, { error: 'unauthorized' })
  }

  const db = createAdminClient()

  const { data: organizations, error } = await db.from('organizations').select('id,name')
  if (error) {
    console.error('[cron] falha ao listar organizacoes', { message: error.message })
    return json(500, { error: 'organizations_unavailable' })
  }

  const results: Record<string, unknown>[] = []

  // Sequencial de propósito: a analise le muita coisa por organizacao, e disparar
  // todas em paralelo transformaria o horario do cron num pico de carga no banco.
  for (const organization of organizations ?? []) {
    const organizationId = String(organization.id)

    const { data: recent } = await db
      .from('auditor_runs')
      .select('started_at')
      .eq('organization_id', organizationId)
      .order('started_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (recent?.started_at) {
      const elapsed = (Date.now() - Date.parse(recent.started_at as string)) / 1000
      if (elapsed < SKIP_IF_RUN_WITHIN_SECONDS) {
        results.push({ organization_id: organizationId, status: 'skipped', reason: 'recent_run' })
        continue
      }
    }

    try {
      const result = await runAuditorForOrganization({
        organizationId,
        // Sem usuario: quem disparou foi o relogio. Gravar um id de pessoa aqui
        // seria atribuir a alguem uma acao que nao foi dela.
        triggeredBy: null,
      })

      results.push({
        organization_id: organizationId,
        status: 'completed',
        run_id: result.runId,
        products_analyzed: result.productsAnalyzed,
        created: result.created,
        auto_resolved: result.autoResolved,
      })
    } catch (runError) {
      // Uma organizacao que falha nao pode impedir as outras de rodar.
      const message = runError instanceof Error ? runError.message : String(runError)
      console.error('[cron] analise falhou', { organizationId, message })
      results.push({
        organization_id: organizationId,
        status: 'failed',
        message: message.slice(0, 300),
      })
    }
  }

  const failed = results.filter((item) => item.status === 'failed').length

  return json(failed > 0 ? 207 : 200, {
    status: failed > 0 ? 'partial' : 'completed',
    organizations: results.length,
    failed,
    results,
  })
}

/**
 * Compara o segredo em tempo constante.
 *
 * `===` em string vaza o tamanho do prefixo correto pelo tempo de resposta. O
 * custo de fazer certo aqui e uma linha.
 */
function authorized(request: Request, secret: string): boolean {
  const header = request.headers.get('authorization') ?? ''
  const expected = `Bearer ${secret}`

  const a = Buffer.from(header)
  const b = Buffer.from(expected)
  if (a.length !== b.length) return false

  return timingSafeEqual(a, b)
}

function json(status: number, body: Record<string, unknown>): Response {
  return Response.json(body, { status })
}
