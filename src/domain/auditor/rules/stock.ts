import { formatNumber } from '@/lib/format'
import { detectStockProblem } from '@/domain/intelligence'
import { finding, productLabel, type AuditFinding, type ProductRule } from '@/domain/auditor/types'

/**
 * REGRAS DE ESTOQUE (secoes 27, 28 e 29)
 *
 * O exemplo da secao 29 e o padrao de qualidade:
 *
 *   ESTOQUE CRITICO
 *   Produto: ABC123 / Estoque disponível: 18 / Venda média: 4,2/dia
 *   Cobertura: 4,3 dias / Fornecedor: 6 dias
 *   Conclusão: existe risco de ruptura antes da próxima reposição.
 *   Sugestão: comprar 45 unidades.
 *
 * Toda regra daqui trabalha com o estoque LOCAL. Full tem regras proprias
 * (rules/full.ts) porque nao da para despachar do Full o que se vende no site.
 */

export const stockRules: ProductRule = ({ insight, params }) => {
  const problems = detectStockProblem(insight, params)
  if (problems.length === 0) return []

  const findings: AuditFinding[] = []
  const label = productLabel(insight)
  const velocity = insight.planningVelocity

  const base = {
    domain: 'ESTOQUE' as const,
    productId: insight.productId,
    resourceType: null,
    resourceId: null,
  }

  if (problems.includes('ESTOQUE_NEGATIVO')) {
    findings.push(
      finding({
        ...base,
        ruleCode: 'STOCK_NEGATIVE',
        severity: 'CRITICO',
        title: `Estoque negativo em ${label}`,
        whatHappened: `O saldo local de ${label} está em ${formatNumber(insight.local.available)} unidades.`,
        whyItMatters:
          'Saldo negativo não existe fisicamente: significa venda lançada sem entrada, movimentação faltando ou divergência com o ERP. Toda conta de cobertura e de compra fica errada enquanto isso não for resolvido.',
        dataPoints: {
          saldo_fisico: insight.local.physical,
          saldo_disponivel: insight.local.available,
          reservado: insight.local.reserved,
        },
        suggestedAction:
          'Conferir as movimentações do produto no ERP e lançar o ajuste de inventário que falta.',
      }),
    )
  }

  if (problems.includes('ESTOQUE_ZERADO')) {
    findings.push(
      finding({
        ...base,
        ruleCode: 'STOCK_OUT',
        severity: velocity > 0 ? 'CRITICO' : 'IMPORTANTE',
        title: `${label} sem estoque`,
        whatHappened: `Não há unidades disponíveis de ${label} no estoque local.`,
        whyItMatters:
          velocity > 0
            ? `O produto vendia ${formatNumber(velocity)}/dia: cada dia parado é venda perdida e posição perdida nos canais.`
            : 'O produto está zerado e sem giro recente. Se ele saiu de linha, desative-o para parar de aparecer nos alertas.',
        dataPoints: {
          disponivel: insight.local.available,
          velocidade_dia: velocity,
          compra_sugerida: insight.purchase.quantity,
        },
        suggestedAction:
          insight.purchase.quantity > 0
            ? `Comprar ${formatNumber(insight.purchase.quantity)} unidades.`
            : 'Confirmar se o produto continua ativo.',
      }),
    )
  }

  if (problems.includes('RUPTURA_PROXIMA')) {
    const coverage = insight.coverageDays ?? 0
    const threshold = insight.leadDaysUsed + params.safetyDays

    findings.push(
      finding({
        ...base,
        ruleCode: 'STOCK_STOCKOUT_RISK',
        severity: 'CRITICO',
        title: `Risco de ruptura em ${label}`,
        whatHappened:
          `${label} tem ${formatNumber(insight.local.available)} unidades disponíveis e vende ` +
          `${formatNumber(velocity)}/dia — ${formatNumber(coverage)} dias de cobertura.`,
        whyItMatters:
          `O fornecedor leva ${formatNumber(insight.leadDaysUsed)} dias e a operação guarda ` +
          `${formatNumber(params.safetyDays)} dias de segurança (${formatNumber(threshold)} dias no total). ` +
          'A cobertura atual é menor do que isso: o estoque acaba antes da próxima reposição chegar.',
        dataPoints: {
          disponivel: insight.local.available,
          velocidade_dia: velocity,
          cobertura_dias: coverage,
          prazo_fornecedor_dias: insight.leadDaysUsed,
          dias_seguranca: params.safetyDays,
          ponto_reposicao: insight.purchase.reorderPoint,
          compra_sugerida: insight.purchase.quantity,
          custo_estimado: insight.purchase.estimatedCost,
        },
        suggestedAction: `Comprar ${formatNumber(insight.purchase.quantity)} unidades.`,
      }),
    )
  }

  if (problems.includes('GIRO_ACELERADO')) {
    const acceleration = insight.velocity.accelerationPercent ?? 0

    findings.push(
      finding({
        ...base,
        ruleCode: 'STOCK_VELOCITY_SPIKE',
        severity: 'IMPORTANTE',
        title: `Giro acelerou em ${label}`,
        whatHappened:
          `Nos últimos ${params.velocityWindows.short} dias ${label} vendeu ` +
          `${formatNumber(insight.velocity.short)}/dia, contra ${formatNumber(insight.velocity.medium)}/dia ` +
          `na média de ${params.velocityWindows.medium} dias.`,
        whyItMatters:
          `Giro acelerou ${formatNumber(acceleration)}%. Planejar a compra pela média de ` +
          `${params.velocityWindows.medium} dias compraria para a demanda antiga e levaria à ruptura.`,
        dataPoints: {
          velocidade_curta: insight.velocity.short,
          velocidade_media: insight.velocity.medium,
          velocidade_longa: insight.velocity.long,
          aceleracao_percent: acceleration,
          cobertura_dias: insight.coverageDays,
        },
        suggestedAction:
          'Revisar a compra usando a velocidade dos últimos dias, não a média do mês.',
      }),
    )
  }

  if (problems.includes('ESTOQUE_EXCESSIVO')) {
    findings.push(
      finding({
        ...base,
        ruleCode: 'STOCK_EXCESS',
        severity: 'IMPORTANTE',
        title: `Estoque excessivo em ${label}`,
        whatHappened:
          `${label} tem ${formatNumber(insight.coverageDays ?? 0)} dias de cobertura — ` +
          `acima do limite de ${formatNumber(params.excessCoverageDays)} dias.`,
        whyItMatters:
          'Cobertura muito longa é capital imobilizado e risco de obsolescência. Esse dinheiro poderia estar em produto que gira.',
        dataPoints: {
          disponivel: insight.local.available,
          cobertura_dias: insight.coverageDays,
          limite_dias: params.excessCoverageDays,
          valor_imobilizado: insight.margin
            ? insight.local.available * insight.margin.unitCost
            : null,
        },
        suggestedAction: 'Suspender a recompra e avaliar promoção ou envio para o Full.',
      }),
    )
  }

  if (problems.includes('ESTOQUE_PARADO')) {
    const days = insight.velocity.daysSinceLastSale

    findings.push(
      finding({
        ...base,
        ruleCode: 'STOCK_STAGNANT',
        severity: 'IMPORTANTE',
        title: `${label} com estoque parado`,
        whatHappened:
          days === null
            ? `${label} tem ${formatNumber(insight.local.available)} unidades e nenhuma venda registrada.`
            : `${label} tem ${formatNumber(insight.local.available)} unidades e não vende há ${formatNumber(days)} dias.`,
        whyItMatters:
          `O limite configurado é ${formatNumber(params.stagnantDays)} dias sem venda. ` +
          'Produto parado ocupa espaço e dinheiro sem gerar retorno.',
        dataPoints: {
          disponivel: insight.local.available,
          dias_sem_venda: days,
          limite_dias: params.stagnantDays,
          ultima_venda: insight.velocity.lastSaleDate,
        },
        suggestedAction: 'Decidir entre promoção, kit com produto que gira, ou desativação.',
      }),
    )
  }

  return findings
}
