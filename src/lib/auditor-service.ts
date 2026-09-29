import 'server-only'

import {
  NO_VARIABLE_COSTS,
  recommendPrice,
  type ProductSnapshot,
  type SaleEvent,
  type StockBalance,
  type VariableCosts,
} from '@/domain/intelligence'
import {
  isMoreSevere,
  runAuditor,
  toIntelligenceParams,
  type AuditFinding,
  type AuditorReport,
  type AuditSeverity,
  type IntegrationHealthInput,
} from '@/domain/auditor'
import { loadIntegrationSettings } from '@/integrations/erp/settings'
import { num, round2, todayISO } from '@/lib/format'
import { createAdminClient } from '@/lib/supabase/admin'

/**
 * EXECUCAO DO AUDITOR (secoes 27, 28 e 30)
 *
 * Tres responsabilidades, nesta ordem:
 *
 *   1. MONTAR os snapshots a partir das tabelas reais;
 *   2. RODAR o auditor -- que e funcao pura e nao sabe que banco existe;
 *   3. PERSISTIR os achados em `alerts` e as sugestoes em `recommendations`.
 *
 * Escreve com service role porque `alerts` e `recommendations` so aceitam escrita
 * de service_role desde o hardening (secao 36). Por isso a execucao acontece numa
 * Server Action, e NUNCA durante a renderizacao de uma pagina: Server Component
 * nao deve ter efeito colateral, e uma pagina que grava a cada visita geraria
 * escrita a cada F5.
 *
 * NENHUM NUMERO NASCE AQUI. Este arquivo le, converte de formato e grava. Todo
 * calculo esta em src/domain/intelligence e toda decisao em src/domain/auditor.
 */

/* -------------------------------------------------------------------------- */
/* Montagem dos snapshots                                                     */
/* -------------------------------------------------------------------------- */

type ProductRow = {
  id: string
  sku: string | null
  name: string
  unit_cost: number | string | null
  sale_price: number | string | null
  active: boolean
}

type BalanceRow = {
  product_id: string
  source: string
  physical_quantity: number | string
  virtual_quantity: number | string
  reserved_quantity: number | string
}

type SalesRow = {
  product_id: string | null
  order_date: string
  quantity: number | string
  gross_revenue: number | string
  fees: number | string
  tax: number | string
  shipping_cost: number | string
  packaging: number | string
}

type SupplierLinkRow = {
  external_id: string
  data: Record<string, unknown>
}

/**
 * Custo variavel por produto, derivado das vendas reais.
 *
 * Deriva de `v_sales_fact`, que ja rateia os custos do pedido por item. Produto
 * sem venda no periodo fica com NO_VARIABLE_COSTS -- e nao com a media dos outros
 * produtos, que seria atribuir a um produto o custo de outro.
 *
 * `gatewayPercent` fica em zero de propósito: a view soma marketplace_fee e
 * gateway_fee numa coluna `fees` unica, entao separar aqui seria inventar a
 * divisao. O total de custo percentual esta correto.
 */
function deriveVariableCosts(rows: SalesRow[]): VariableCosts {
  let gross = 0
  let fees = 0
  let tax = 0
  let shipping = 0
  let packaging = 0
  let units = 0

  for (const row of rows) {
    gross += num(row.gross_revenue)
    fees += num(row.fees)
    tax += num(row.tax)
    shipping += num(row.shipping_cost)
    packaging += num(row.packaging)
    units += num(row.quantity)
  }

  if (gross <= 0 || units <= 0) return NO_VARIABLE_COSTS

  return {
    marketplacePercent: round2((fees / gross) * 100),
    gatewayPercent: 0,
    taxPercent: round2((tax / gross) * 100),
    shippingPerUnit: round2(shipping / units),
    packagingPerUnit: round2(packaging / units),
  }
}

export type SnapshotBuildResult = {
  snapshots: ProductSnapshot[]
  /**
   * Verdadeiro quando a organizacao nao tem NENHUMA fonte de fornecedor.
   * Ver a nota em `buildProductSnapshots`.
   */
  supplierSourceMissing: boolean
}

/**
 * Monta um ProductSnapshot por produto ativo.
 *
 * SOBRE `hasSupplier` -- decisao que precisa estar escrita:
 *
 * O vinculo produto-fornecedor virá do Bling (`erp_snapshots` com resource_type
 * PRODUCT_SUPPLIER). Enquanto nao houver NENHUM registro desses, "fornecedor
 * ausente" e verdade para todos os produtos ao mesmo tempo -- e um alerta que
 * aparece em 100% dos itens nao informa nada, so afoga os alertas que importam.
 *
 * Entao: se a organizacao tem alguma fonte de fornecedor, `hasSupplier` reflete o
 * produto individualmente. Se nao tem nenhuma, a lacuna e suprimida por produto e
 * devolvida em `supplierSourceMissing`, para a tela dizer UMA vez que falta a
 * integracao. Isto nao esconde problema: troca 500 avisos iguais por um correto.
 */
export async function buildProductSnapshots(
  organizationId: string,
  referenceDate: string,
): Promise<SnapshotBuildResult> {
  const db = createAdminClient()

  const [products, balances, sales, supplierLinks] = await Promise.all([
    db
      .from('products')
      .select('id,sku,name,unit_cost,sale_price,active')
      .eq('organization_id', organizationId)
      .eq('active', true),
    db
      .from('inventory_balances')
      .select('product_id,source,physical_quantity,virtual_quantity,reserved_quantity')
      .eq('organization_id', organizationId),
    db
      .from('v_sales_fact')
      .select('product_id,order_date,quantity,gross_revenue,fees,tax,shipping_cost,packaging')
      .eq('organization_id', organizationId),
    db
      .from('erp_snapshots')
      .select('external_id,data')
      .eq('organization_id', organizationId)
      .eq('resource_type', 'PRODUCT_SUPPLIER')
      .is('deleted_at', null),
  ])

  for (const result of [products, balances, sales, supplierLinks]) {
    if (result.error) throw new Error(`Falha ao montar a análise: ${result.error.message}`)
  }

  const productRows = (products.data ?? []) as ProductRow[]
  const balanceRows = (balances.data ?? []) as BalanceRow[]
  const salesRows = (sales.data ?? []) as SalesRow[]
  const supplierRows = (supplierLinks.data ?? []) as SupplierLinkRow[]

  const supplierSourceMissing = supplierRows.length === 0

  // Indexa uma vez; o loop de produtos nao deve varrer os arrays inteiros.
  const balancesByProduct = new Map<string, StockBalance[]>()
  for (const row of balanceRows) {
    const list = balancesByProduct.get(row.product_id) ?? []
    list.push({
      source: row.source as StockBalance['source'],
      physical: num(row.physical_quantity),
      virtual: num(row.virtual_quantity),
      reserved: num(row.reserved_quantity),
    })
    balancesByProduct.set(row.product_id, list)
  }

  const salesByProduct = new Map<string, SalesRow[]>()
  for (const row of salesRows) {
    if (!row.product_id) continue
    const list = salesByProduct.get(row.product_id) ?? []
    list.push(row)
    salesByProduct.set(row.product_id, list)
  }

  const suppliersByProduct = new Set<string>()
  const leadTimeByProduct = new Map<string, number>()
  for (const row of supplierRows) {
    const productId = typeof row.data?.productId === 'string' ? row.data.productId : null
    if (!productId) continue
    suppliersByProduct.add(productId)
    const lead = Number(row.data?.leadTimeDays)
    if (Number.isFinite(lead) && lead > 0) leadTimeByProduct.set(productId, lead)
  }

  const snapshots: ProductSnapshot[] = productRows.map((product) => {
    const productSales = salesByProduct.get(product.id) ?? []

    const sales: SaleEvent[] = productSales.map((row) => ({
      date: row.order_date.slice(0, 10),
      quantity: num(row.quantity),
    }))

    // `unit_cost` e `sale_price` tem DEFAULT 0 no schema. Zero aqui significa
    // "nao preenchido", nao "custa zero" -- por isso vira null, e o auditor
    // acusa cadastro incompleto em vez de calcular margem de 100%.
    const cost = num(product.unit_cost)
    const price = num(product.sale_price)

    return {
      productId: product.id,
      sku: product.sku,
      name: product.name,
      cost: cost > 0 ? cost : null,
      price: price > 0 ? price : null,
      balances: balancesByProduct.get(product.id) ?? [],
      sales,
      supplierLeadDays: leadTimeByProduct.get(product.id) ?? null,
      hasSupplier: supplierSourceMissing ? true : suppliersByProduct.has(product.id),
      variableCosts: deriveVariableCosts(productSales),
      // Sem integracao de Ads nao existe gasto de midia. Null, nunca zero: zero
      // afirmaria "investimos nada", e a regra de oportunidade usa essa diferenca.
      ads: null,
      registry: {
        // NCM, peso e dimensao virao do Bling. Enquanto nao vierem, `products` nao
        // tem essas colunas -- a lacuna e real e o auditor deve apontar.
        ncm: null,
        weightKg: null,
        hasDimensions: false,
      },
    }
  })

  void referenceDate
  return { snapshots, supplierSourceMissing }
}

/* -------------------------------------------------------------------------- */
/* Saude da integracao                                                        */
/* -------------------------------------------------------------------------- */

export async function loadIntegrationHealth(
  organizationId: string,
): Promise<IntegrationHealthInput | null> {
  const db = createAdminClient()

  const [connection, queue, settings] = await Promise.all([
    db
      .from('v_erp_connection_status')
      .select('*')
      .eq('organization_id', organizationId)
      .eq('provider', 'BLING')
      .maybeSingle(),
    db
      .from('v_integration_queue_health')
      .select('*')
      .eq('organization_id', organizationId)
      .maybeSingle(),
    loadIntegrationSettings(organizationId),
  ])

  if (!connection.data) return null

  const row = connection.data as Record<string, unknown>
  const q = (queue.data ?? {}) as Record<string, unknown>

  return {
    status: String(row.status ?? 'NOT_CONFIGURED'),
    health: String(row.health ?? 'UNKNOWN'),
    lastSuccessfulSync: (row.last_successful_sync as string | null) ?? null,
    lastWebhookAt: (row.last_webhook_at as string | null) ?? null,
    tokenExpiresInMinutes:
      row.token_expires_in_minutes === null || row.token_expires_in_minutes === undefined
        ? null
        : num(row.token_expires_in_minutes),
    jobsPending: num(q.jobs_pending),
    jobsFailed: num(q.jobs_failed),
    jobsRetrying: num(q.jobs_retrying),
    eventsFailed: num(q.events_failed),
    oldestPendingAt: (q.oldest_pending_at as string | null) ?? null,
    webhooksEnabled: settings.webhooksEnabled,
  }
}

/* -------------------------------------------------------------------------- */
/* Execucao + persistencia                                                    */
/* -------------------------------------------------------------------------- */

export type AuditorRunResult = {
  runId: string
  referenceDate: string
  productsAnalyzed: number
  created: number
  updated: number
  autoResolved: number
  recommendations: number
  counts: AuditorReport['counts']
  supplierSourceMissing: boolean
}

type ExistingAlert = {
  id: string
  fingerprint: string
  status: string
  severity: string
  financial_impact: number | string | null
}

/**
 * O achado piorou desde a ultima execucao?
 *
 * Existe por causa do "visto": marcar como visto TIRA o alerta da lista. Se o
 * mesmo problema piorar depois disso, continuar escondido seria esconder
 * justamente o que mais importa -- entao piorar reabre.
 *
 * Piorar e uma de duas coisas, e nenhuma delas e opiniao:
 *   - a severidade subiu (atencao virou critico);
 *   - o impacto financeiro cresceu mais de 20%.
 *
 * A margem de 20% existe para o alerta nao voltar a cada centavo de variacao:
 * um numero que oscila 2% entre execucoes nao e noticia, e reabrir por isso
 * treinaria voce a ignorar a lista.
 */
const WORSENED_IMPACT_RATIO = 1.2

function worsened(previous: ExistingAlert, item: AuditFinding): boolean {
  if (isMoreSevere(item.severity as AuditSeverity, previous.severity as AuditSeverity)) return true

  const before = previous.financial_impact === null ? null : Number(previous.financial_impact)
  const after = item.financialImpact === null ? null : Number(item.financialImpact)

  // Sem numero antes e com numero agora: o alerta passou a saber quanto custa.
  // Isso e informacao nova, nao ruido.
  if (before === null) return after !== null && after > 0
  if (after === null) return false

  return after > before * WORSENED_IMPACT_RATIO
}

/**
 * Roda o auditor e reconcilia `alerts` com o resultado.
 *
 * A reconciliacao e o que faz a pagina ter memoria em vez de recomecar do zero:
 *
 *   - achado novo            -> INSERT com status OPEN;
 *   - achado que persiste    -> UPDATE do conteudo e de last_seen_at. O status e
 *                               PRESERVADO: quem marcou "visto" ou "ignorado" nao
 *                               ve o alerta voltar a gritar a cada execucao --
 *                               com UMA excecao: alerta "visto" que PIOROU volta
 *                               para OPEN (ver worsened());
 *   - achado que voltou      -> alerta antes RESOLVED volta para OPEN, porque o
 *                               problema reapareceu de fato;
 *   - achado que desapareceu -> RESOLVED automaticamente. E isto que alimenta
 *                               "Resolvidos recentemente" e o que impede a lista
 *                               de so crescer.
 */
export async function runAuditorForOrganization(options: {
  organizationId: string
  triggeredBy?: string | null
  referenceDate?: string
}): Promise<AuditorRunResult> {
  const db = createAdminClient()
  const organizationId = options.organizationId
  const referenceDate = options.referenceDate ?? todayISO()

  const { data: runRow, error: runError } = await db
    .from('auditor_runs')
    .insert({
      organization_id: organizationId,
      reference_date: referenceDate,
      status: 'RUNNING',
      triggered_by: options.triggeredBy ?? null,
    })
    .select('id')
    .single()

  if (runError) throw new Error(`Falha ao registrar a execução: ${runError.message}`)
  const runId = runRow.id as string

  try {
    const settings = await loadIntegrationSettings(organizationId)
    const params = toIntelligenceParams(settings)

    const [{ snapshots, supplierSourceMissing }, integration] = await Promise.all([
      buildProductSnapshots(organizationId, referenceDate),
      loadIntegrationHealth(organizationId),
    ])

    const report = runAuditor({
      products: snapshots,
      params,
      referenceDate,
      integration,
      referenceTime: new Date(),
    })

    const existingResult = await db
      .from('alerts')
      .select('id,fingerprint,status,severity,financial_impact')
      .eq('organization_id', organizationId)

    if (existingResult.error) {
      throw new Error(`Falha ao ler alertas existentes: ${existingResult.error.message}`)
    }

    const existing = new Map<string, ExistingAlert>()
    for (const row of (existingResult.data ?? []) as ExistingAlert[]) {
      existing.set(row.fingerprint, row)
    }

    const now = new Date().toISOString()
    const seen = new Set<string>()
    let created = 0
    let updated = 0

    for (const item of report.findings) {
      seen.add(item.fingerprint)
      const previous = existing.get(item.fingerprint)
      const content = alertContent(item, organizationId, runId, now)

      if (!previous) {
        const { error } = await db.from('alerts').insert({ ...content, status: 'OPEN' })
        if (error) throw new Error(`Falha ao gravar alerta: ${error.message}`)
        created += 1
        continue
      }

      // Problema que havia sido resolvido e voltou: reabre. Caso contrario mantem
      // o status que a pessoa escolheu (OPEN, ACKNOWLEDGED ou DISMISSED).
      const patch: Record<string, unknown> = { ...content }
      delete patch.organization_id
      delete patch.first_seen_at

      if (previous.status === 'RESOLVED') {
        patch.status = 'OPEN'
        patch.resolved_at = null
      } else if (previous.status === 'ACKNOWLEDGED' && worsened(previous, item)) {
        // Visto esconde da lista; piorar traz de volta. Ver worsened().
        patch.status = 'OPEN'
        patch.acknowledged_at = null
      }

      const { error } = await db.from('alerts').update(patch).eq('id', previous.id)
      if (error) throw new Error(`Falha ao atualizar alerta: ${error.message}`)
      updated += 1
    }

    // Auto-resolve: o que estava aberto e nao apareceu nesta execucao deixou de
    // ter causa.
    const staleIds = [...existing.values()]
      .filter((row) => !seen.has(row.fingerprint))
      .filter((row) => row.status === 'OPEN' || row.status === 'ACKNOWLEDGED')
      .map((row) => row.id)

    let autoResolved = 0
    if (staleIds.length > 0) {
      const { error } = await db
        .from('alerts')
        .update({ status: 'RESOLVED', resolved_at: now, last_run_id: runId })
        .in('id', staleIds)
      if (error) throw new Error(`Falha ao resolver alertas: ${error.message}`)
      autoResolved = staleIds.length
    }

    const recommendations = await persistRecommendations(organizationId, report, params)

    await db
      .from('auditor_runs')
      .update({
        status: 'COMPLETED',
        finished_at: now,
        products_analyzed: report.productsAnalyzed,
        findings_total: report.findings.length,
        findings_critical: report.counts.CRITICO,
        findings_important: report.counts.IMPORTANTE,
        findings_opportunity: report.counts.OPORTUNIDADE,
        auto_resolved: autoResolved,
      })
      .eq('id', runId)

    return {
      runId,
      referenceDate,
      productsAnalyzed: report.productsAnalyzed,
      created,
      updated,
      autoResolved,
      recommendations,
      counts: report.counts,
      supplierSourceMissing,
    }
  } catch (error) {
    await db
      .from('auditor_runs')
      .update({
        status: 'FAILED',
        finished_at: new Date().toISOString(),
        error: error instanceof Error ? error.message.slice(0, 500) : String(error).slice(0, 500),
      })
      .eq('id', runId)

    throw error
  }
}

function alertContent(
  item: AuditFinding,
  organizationId: string,
  runId: string,
  now: string,
): Record<string, unknown> {
  return {
    organization_id: organizationId,
    rule_code: item.ruleCode,
    domain: item.domain,
    severity: item.severity,
    product_id: item.productId,
    resource_type: item.resourceType,
    resource_id: item.resourceId,
    title: item.title,
    what_happened: item.whatHappened,
    why_it_matters: item.whyItMatters,
    data_points: item.dataPoints,
    suggested_action: item.suggestedAction,
    financial_impact: item.financialImpact,
    impact_kind: item.impactKind,
    action_href: item.actionHref,
    sku: item.sku,
    channel: item.channel,
    fingerprint: item.fingerprint,
    last_seen_at: now,
    first_seen_at: now,
    last_run_id: runId,
  }
}

/**
 * Regenera as recomendacoes ABERTAS a partir da analise.
 *
 * Recomendacao aberta e estado derivado: se o produto voltou para a meta, a
 * sugestao de reajuste nao deve continuar na tela. Recomendacao ja decidida
 * (ACCEPTED, REJECTED, APPLIED) NAO e apagada -- ela e historico, e a secao 31
 * quer justamente medir se a decisao foi boa.
 */
async function persistRecommendations(
  organizationId: string,
  report: AuditorReport,
  params: Parameters<typeof recommendPrice>[1],
): Promise<number> {
  const db = createAdminClient()

  const { error: clearError } = await db
    .from('recommendations')
    .delete()
    .eq('organization_id', organizationId)
    .eq('status', 'OPEN')

  if (clearError) throw new Error(`Falha ao limpar recomendações: ${clearError.message}`)

  const rows: Record<string, unknown>[] = []

  for (const insight of report.insights) {
    // PRECO -- vem de recommendPrice, que devolve null quando nao ha o que sugerir.
    const price = recommendPrice(insight, params)
    if (price) {
      rows.push({
        organization_id: organizationId,
        rule_code: 'PRICE_TO_TARGET_MARGIN',
        product_id: insight.productId,
        kind: 'PRICE',
        title: `Reajustar ${insight.sku ?? insight.name} para a margem meta`,
        reason:
          `Margem líquida atual de ${insight.margin?.netMarginPercent ?? 0}% contra a meta de ` +
          `${params.targetMarginPercent}%. O preço mínimo calculado cobre custo, comissão, ` +
          `imposto, frete e embalagem.`,
        current_value: price.current,
        proposed_value: price.recommended,
        expected_impact: {
          variacao_percent: price.assessment.changePercent,
          faixa_risco: price.assessment.riskLevel,
          exige_aprovacao: price.assessment.requiresApproval,
          exige_dupla_confirmacao: price.assessment.requiresDoubleConfirmation,
        },
        status: 'OPEN',
      })
    }

    // COMPRA -- somente quando o auditor calculou quantidade maior que zero.
    if (insight.purchase.quantity > 0 && insight.planningVelocity > 0) {
      rows.push({
        organization_id: organizationId,
        rule_code: 'PURCHASE_TO_COVERAGE',
        product_id: insight.productId,
        kind: 'PURCHASE',
        title: `Comprar ${insight.purchase.quantity} un de ${insight.sku ?? insight.name}`,
        reason:
          `Cobertura de ${insight.coverageDays ?? 0} dias contra prazo de ` +
          `${insight.leadDaysUsed} dias do fornecedor. A compra cobre ` +
          `${insight.purchase.targetCoverageDays} dias de venda no ritmo atual.`,
        current_value: insight.local.available,
        proposed_value: insight.local.available + insight.purchase.quantity,
        expected_impact: {
          custo_estimado: insight.purchase.estimatedCost,
          ponto_reposicao: insight.purchase.reorderPoint,
          cobertura_alvo_dias: insight.purchase.targetCoverageDays,
        },
        status: 'OPEN',
      })
    }
  }

  if (rows.length === 0) return 0

  const { error } = await db.from('recommendations').insert(rows)
  if (error) throw new Error(`Falha ao gravar recomendações: ${error.message}`)

  return rows.length
}
