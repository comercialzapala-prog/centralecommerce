import { formatNumber } from '@/lib/format'
import { calculateFullRestock, detectFullProblem } from '@/domain/intelligence'
import { RESOLVE_PATHS, idleCapitalImpact } from '@/domain/auditor/impact'
import { finding, productLabel, type AuditFinding, type ProductRule } from '@/domain/auditor/types'

/**
 * REGRAS DO FULL (secao 22)
 *
 * O Full e estoque EXTERNO: fica no centro de distribuicao do Mercado Livre.
 * Duas consequencias que estas regras respeitam:
 *
 *  - reposicao do Full sai do estoque LOCAL, entao a sugestao e limitada pelo que
 *    existe aqui -- e quando nao existe, o achado diz que falta comprar antes;
 *  - "LOCAL 80 + FULL 25 = 105" e verdade economica e mentira operacional: nao da
 *    para despachar do Full o que se vende no site.
 *
 * Enquanto a integracao com o Mercado Livre nao existir, nenhum produto tera
 * saldo FULL_MERCADO_LIVRE e estas regras so poderao gerar "elegível para Full".
 */

export const fullRules: ProductRule = ({ insight, params }) => {
  const problems = detectFullProblem(insight, params)
  if (problems.length === 0) return []

  const findings: AuditFinding[] = []
  const label = productLabel(insight)

  const base = {
    domain: 'FULL' as const,
    productId: insight.productId,
    resourceType: null,
    resourceId: null,
    actionHref: RESOLVE_PATHS.produto(insight.productId),
    sku: insight.sku,
    channel: 'MERCADO_LIVRE',
  }

  if (problems.includes('FULL_QUASE_SEM_ESTOQUE')) {
    const restock = calculateFullRestock({
      fullAvailable: insight.full.available,
      localAvailable: insight.local.available,
      fullDailyVelocity: insight.planningVelocity,
      targetCoverageDays: params.fullLowCoverageDays * 3,
      // Protege a cobertura do canal proprio antes de enviar para o Full.
      reserveLocal: insight.planningVelocity * (insight.leadDaysUsed + params.safetyDays),
    })

    findings.push(
      finding({
        ...base,
        ruleCode: 'FULL_LOW_STOCK',
        severity: 'IMPORTANTE',
        title: `Full quase sem estoque em ${label}`,
        whatHappened:
          `${label} tem ${formatNumber(insight.full.available)} unidades no Full — ` +
          `${formatNumber(insight.fullCoverageDays ?? 0)} dias de cobertura, abaixo do mínimo de ` +
          `${formatNumber(params.fullLowCoverageDays)} dias.`,
        whyItMatters:
          'Sem estoque no Full o anúncio perde a entrega rápida e cai no ranqueamento do canal — recuperar posição depois custa mais do que repor agora.',
        dataPoints: {
          full_disponivel: insight.full.available,
          full_cobertura_dias: insight.fullCoverageDays,
          minimo_dias: params.fullLowCoverageDays,
          local_disponivel: insight.local.available,
          enviar_sugerido: restock.quantity,
          pode_enviar_agora: restock.availableToSend,
          falta_comprar: restock.shortfall,
        },
        suggestedAction:
          restock.shortfall > 0
            ? `Enviar ${formatNumber(restock.availableToSend)} unidades agora e comprar ` +
              `${formatNumber(restock.shortfall)} para completar o envio.`
            : `Enviar ${formatNumber(restock.availableToSend)} unidades para o Full.`,
      }),
    )
  }

  if (problems.includes('FULL_EXCESSIVO')) {
    findings.push(
      finding({
        ...base,
        ruleCode: 'FULL_EXCESS',
        severity: 'IMPORTANTE',
        // No Full o capital parado ainda paga armazenagem.
        impact: idleCapitalImpact(insight.full.available, insight),
        title: `Excesso de estoque no Full em ${label}`,
        whatHappened:
          `${label} tem ${formatNumber(insight.full.available)} unidades no Full — ` +
          `${formatNumber(insight.fullCoverageDays ?? 0)} dias de cobertura.`,
        whyItMatters:
          'Estoque parado no Full acumula taxa de armazenagem além do capital imobilizado. É o pior lugar para deixar excesso.',
        dataPoints: {
          full_disponivel: insight.full.available,
          full_cobertura_dias: insight.fullCoverageDays,
          limite_dias: params.excessCoverageDays,
        },
        suggestedAction: 'Suspender novos envios e avaliar promoção no canal.',
      }),
    )
  }

  if (problems.includes('FULL_PARADO')) {
    findings.push(
      finding({
        ...base,
        ruleCode: 'FULL_STAGNANT',
        severity: 'IMPORTANTE',
        impact: idleCapitalImpact(insight.full.available, insight),
        title: `Estoque parado no Full em ${label}`,
        whatHappened:
          `${label} tem ${formatNumber(insight.full.available)} unidades no Full e ` +
          (insight.velocity.daysSinceLastSale === null
            ? 'nenhuma venda registrada.'
            : `não vende há ${formatNumber(insight.velocity.daysSinceLastSale)} dias.`),
        whyItMatters:
          'No Full o estoque parado custa armazenagem todo mês, diferente do depósito próprio.',
        dataPoints: {
          full_disponivel: insight.full.available,
          dias_sem_venda: insight.velocity.daysSinceLastSale,
          limite_dias: params.stagnantDays,
        },
        suggestedAction: 'Avaliar recolhimento do estoque ou promoção para girar.',
      }),
    )
  }

  if (problems.includes('ELEGIVEL_PARA_FULL')) {
    findings.push(
      finding({
        ...base,
        ruleCode: 'FULL_ELIGIBLE',
        severity: 'OPORTUNIDADE',
        title: `${label} é candidato ao Full`,
        whatHappened:
          `${label} gira ${formatNumber(insight.velocity.medium)}/dia, tem ` +
          `${formatNumber(insight.local.available)} unidades locais ` +
          `(${formatNumber(insight.coverageDays ?? 0)} dias de cobertura) e nenhum estoque no Full.`,
        whyItMatters:
          'Produto com giro, estoque sobrando e margem dentro da meta é o perfil que mais ganha com a entrega rápida do Full.',
        dataPoints: {
          velocidade_dia: insight.velocity.medium,
          local_disponivel: insight.local.available,
          cobertura_dias: insight.coverageDays,
          margem_liquida_percent: insight.margin?.netMarginPercent ?? null,
        },
        suggestedAction: 'Avaliar o primeiro envio para o Full.',
      }),
    )
  }

  return findings
}
