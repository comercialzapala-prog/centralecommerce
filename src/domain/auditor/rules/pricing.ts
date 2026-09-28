import { formatCurrency, formatPercent } from '@/lib/format'
import { detectMarginProblem, detectPriceProblem, recommendPrice } from '@/domain/intelligence'
import { finding, productLabel, type AuditFinding, type ProductRule } from '@/domain/auditor/types'

/**
 * REGRAS DE PRECO E MARGEM (secoes 27, 29 e 38)
 *
 * A Central nao repete o preco do ERP: ela diz o que aquele preco significa
 * (secao 38 -- "neste preço sua margem líquida será 4,1%").
 *
 * Margem aqui e sempre LIQUIDA de comissao, imposto, frete e embalagem. Alertar
 * por margem bruta em operacao de marketplace daria falso negativo justamente
 * onde o dinheiro se perde.
 */

export const pricingRules: ProductRule = ({ insight, params }) => {
  const findings: AuditFinding[] = []
  const label = productLabel(insight)

  const base = {
    domain: 'PRECO' as const,
    productId: insight.productId,
    resourceType: null,
    resourceId: null,
  }

  const marginProblems = detectMarginProblem(insight, params)

  // Sem custo nao ha margem a auditar: o problema e de cadastro e quem cobra e
  // rules/registry.ts. Alertar aqui duplicaria o mesmo fato em dois dominios.
  if (marginProblems.includes('SEM_CUSTO')) return findings

  const margin = insight.margin
  if (!margin) return findings

  if (marginProblems.includes('CUSTO_MAIOR_QUE_PRECO')) {
    findings.push(
      finding({
        ...base,
        ruleCode: 'PRICE_COST_ABOVE_PRICE',
        severity: 'CRITICO',
        title: `Custo maior que o preço em ${label}`,
        whatHappened:
          `${label} custa ${formatCurrency(margin.unitCost)} e é vendido por ` +
          `${formatCurrency(margin.price)}.`,
        whyItMatters:
          'Cada unidade vendida dá prejuízo antes mesmo de comissão, imposto e frete. Vender mais aumenta a perda.',
        dataPoints: {
          preco: margin.price,
          custo: margin.unitCost,
          margem_liquida: margin.netMargin,
          preco_minimo: insight.minimumPrice,
        },
        suggestedAction:
          insight.minimumPrice !== null
            ? `Corrigir o preço para no mínimo ${formatCurrency(insight.minimumPrice)} ou revisar o custo cadastrado.`
            : 'Revisar o custo cadastrado e a estrutura de custo variável.',
      }),
    )
  } else if (marginProblems.includes('MARGEM_NEGATIVA')) {
    findings.push(
      finding({
        ...base,
        ruleCode: 'PRICE_NEGATIVE_MARGIN',
        severity: 'CRITICO',
        title: `Margem negativa em ${label}`,
        whatHappened:
          `Ao preço de ${formatCurrency(margin.price)}, ${label} deixa ` +
          `${formatCurrency(margin.netMargin)} por unidade (${formatPercent(margin.netMarginPercent)}).`,
        whyItMatters:
          `O preço cobre o custo de ${formatCurrency(margin.unitCost)}, mas não os ` +
          `${formatCurrency(margin.percentualCosts + margin.fixedCosts)} de comissão, imposto, frete e embalagem. ` +
          'Cada venda tira dinheiro do caixa.',
        dataPoints: {
          preco: margin.price,
          custo: margin.unitCost,
          custos_percentuais: margin.percentualCosts,
          custos_fixos_unitarios: margin.fixedCosts,
          margem_liquida: margin.netMargin,
          margem_liquida_percent: margin.netMarginPercent,
          preco_minimo: insight.minimumPrice,
        },
        suggestedAction:
          insight.minimumPrice !== null
            ? `Subir o preço para ${formatCurrency(insight.minimumPrice)} ou parar de vender neste canal.`
            : 'A estrutura de custo não fecha em nenhum preço: renegociar custo ou comissão.',
      }),
    )
  } else if (marginProblems.includes('MARGEM_ABAIXO_DO_MINIMO')) {
    findings.push(
      finding({
        ...base,
        ruleCode: 'PRICE_MARGIN_BELOW_MIN',
        severity: 'CRITICO',
        title: `Margem abaixo do mínimo em ${label}`,
        whatHappened:
          `${label} está com ${formatPercent(margin.netMarginPercent)} de margem líquida, ` +
          `abaixo do mínimo de ${formatPercent(params.minMarginPercent)}.`,
        whyItMatters:
          'Margem nesse nível não absorve devolução, avaria nem variação de frete. Um imprevisto transforma a venda em prejuízo.',
        dataPoints: {
          preco: margin.price,
          margem_liquida_percent: margin.netMarginPercent,
          minimo_percent: params.minMarginPercent,
          meta_percent: params.targetMarginPercent,
          preco_minimo: insight.minimumPrice,
        },
        suggestedAction:
          insight.minimumPrice !== null
            ? `Reajustar para ${formatCurrency(insight.minimumPrice)}.`
            : 'Revisar custo e comissão.',
      }),
    )
  } else if (marginProblems.includes('MARGEM_ABAIXO_DA_META')) {
    const recommendation = recommendPrice(insight, params)

    findings.push(
      finding({
        ...base,
        ruleCode: 'PRICE_MARGIN_BELOW_TARGET',
        severity: 'IMPORTANTE',
        title: `Margem abaixo da meta em ${label}`,
        whatHappened:
          `${label} entrega ${formatPercent(margin.netMarginPercent)} de margem líquida; ` +
          `a meta é ${formatPercent(params.targetMarginPercent)}.`,
        whyItMatters:
          'O produto é rentável, mas rende menos do que a operação precisa para cobrir custo fixo e crescer.',
        dataPoints: {
          preco: margin.price,
          margem_liquida_percent: margin.netMarginPercent,
          meta_percent: params.targetMarginPercent,
          preco_recomendado: recommendation?.recommended ?? null,
          impacto_percent: recommendation?.assessment.changePercent ?? null,
          faixa_risco: recommendation?.assessment.riskLevel ?? null,
        },
        suggestedAction: recommendation
          ? `Avaliar reajuste de ${formatCurrency(recommendation.current)} para ` +
            `${formatCurrency(recommendation.recommended)} ` +
            `(${formatPercent(recommendation.assessment.changePercent)}).`
          : 'Avaliar redução de custo ou de comissão.',
      }),
    )
  }

  // Preco abaixo do minimo e um achado a parte: pode acontecer mesmo com margem
  // dentro da meta se a meta estiver menor que o minimo configurado.
  if (detectPriceProblem(insight).includes('PRECO_ABAIXO_DO_MINIMO') && insight.minimumPrice !== null) {
    const alreadyReported = findings.some((item) =>
      ['PRICE_NEGATIVE_MARGIN', 'PRICE_MARGIN_BELOW_MIN', 'PRICE_COST_ABOVE_PRICE'].includes(
        item.ruleCode,
      ),
    )

    if (!alreadyReported) {
      findings.push(
        finding({
          ...base,
          ruleCode: 'PRICE_BELOW_MINIMUM',
          severity: 'IMPORTANTE',
          title: `Preço abaixo do mínimo em ${label}`,
          whatHappened:
            `${label} está a ${formatCurrency(margin.price)}; o preço mínimo calculado é ` +
            `${formatCurrency(insight.minimumPrice)}.`,
          whyItMatters:
            'O preço mínimo é o que sustenta a margem meta depois de custo, comissão, imposto e frete.',
          dataPoints: {
            preco: margin.price,
            preco_minimo: insight.minimumPrice,
            diferenca: insight.minimumPrice - margin.price,
          },
          suggestedAction: `Reajustar para ${formatCurrency(insight.minimumPrice)}.`,
        }),
      )
    }
  }

  return findings
}
