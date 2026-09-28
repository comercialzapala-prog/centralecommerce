import { formatCurrency, formatNumber, formatPercent } from '@/lib/format'
import { detectAdsProblem } from '@/domain/intelligence'
import { finding, productLabel, type AuditFinding, type ProductRule } from '@/domain/auditor/types'

/**
 * REGRAS DE ANUNCIO (secao 27)
 *
 * Estas regras so produzem achado quando existe dado de midia no snapshot
 * (`insight.ads`) -- com uma excecao deliberada: "produto rentável sem Ads", que
 * e justamente a ausencia de investimento e por isso e uma oportunidade (secao
 * 30).
 *
 * Enquanto a integracao de Ads nao existir, `insight.ads` vem null e o auditor
 * simplesmente nao gera esses alertas. Nenhuma regra aqui inventa gasto de midia.
 */

export const adsRules: ProductRule = ({ insight, params }) => {
  const problems = detectAdsProblem(insight, params)
  if (problems.length === 0) return []

  const findings: AuditFinding[] = []
  const label = productLabel(insight)

  const base = {
    domain: 'ADS' as const,
    productId: insight.productId,
    resourceType: null,
    resourceId: null,
  }

  if (problems.includes('RENTAVEL_SEM_ADS')) {
    findings.push(
      finding({
        ...base,
        ruleCode: 'ADS_PROFITABLE_WITHOUT_ADS',
        severity: 'OPORTUNIDADE',
        title: `${label} é rentável e não tem anúncio`,
        whatHappened:
          `${label} entrega ${formatPercent(insight.margin?.netMarginPercent ?? 0)} de margem líquida, ` +
          `tem ${formatNumber(insight.local.available)} unidades disponíveis e vende ` +
          `${formatNumber(insight.velocity.medium)}/dia sem investimento em mídia.`,
        whyItMatters:
          'Produto que já é rentável e tem estoque é o melhor lugar para colocar verba: o risco é menor do que testar um produto novo.',
        dataPoints: {
          margem_liquida_percent: insight.margin?.netMarginPercent ?? null,
          break_even_roas: insight.ads?.breakEvenRoas ?? null,
          disponivel: insight.local.available,
          cobertura_dias: insight.coverageDays,
          velocidade_dia: insight.velocity.medium,
        },
        suggestedAction: 'Avaliar campanha para este produto, respeitando a cobertura de estoque.',
      }),
    )
    // Sem investimento nao ha desempenho de midia a auditar.
    return findings
  }

  const ads = insight.ads
  if (!ads) return findings

  if (problems.includes('ROAS_ABAIXO_DO_BREAK_EVEN')) {
    findings.push(
      finding({
        ...base,
        ruleCode: 'ADS_ROAS_BELOW_BREAKEVEN',
        severity: 'CRITICO',
        title: `ROAS abaixo do break-even em ${label}`,
        whatHappened:
          `${label} está com ROAS de ${formatNumber(ads.roas ?? 0)}x; o break-even é ` +
          `${formatNumber(ads.breakEvenRoas ?? 0)}x.`,
        whyItMatters:
          `Com ${formatPercent(insight.margin?.netMarginPercent ?? 0)} de margem líquida, cada real ` +
          `investido precisa devolver ${formatNumber(ads.breakEvenRoas ?? 0)} reais só para empatar. ` +
          `No período, a mídia resultou em ${formatCurrency(ads.netResult)}.`,
        dataPoints: {
          investimento: ads.spend,
          receita_atribuida: ads.attributedRevenue,
          roas: ads.roas,
          break_even_roas: ads.breakEvenRoas,
          resultado_liquido: ads.netResult,
          margem_liquida_percent: insight.margin?.netMarginPercent ?? null,
        },
        suggestedAction:
          'Pausar ou reduzir a campanha, ou corrigir o preço até o ROAS passar do break-even.',
      }),
    )
  }

  if (problems.includes('ADS_SEM_ESTOQUE')) {
    findings.push(
      finding({
        ...base,
        ruleCode: 'ADS_WITHOUT_STOCK',
        severity: 'CRITICO',
        title: `Anúncio ativo sem estoque suficiente em ${label}`,
        whatHappened:
          `${label} recebe ${formatCurrency(ads.dailySpend)}/dia em mídia e tem ` +
          `${formatNumber(insight.local.available)} unidades disponíveis` +
          (insight.coverageDays !== null
            ? ` (${formatNumber(insight.coverageDays)} dias de cobertura).`
            : '.'),
        whyItMatters:
          'Investir em tráfego para um produto que vai faltar queima verba e gera cancelamento — que custa reputação no canal, não só a venda.',
        dataPoints: {
          investimento_diario: ads.dailySpend,
          disponivel: insight.local.available,
          cobertura_dias: insight.coverageDays,
          prazo_fornecedor_dias: insight.leadDaysUsed,
          compra_sugerida: insight.purchase.quantity,
        },
        suggestedAction:
          `Repor o estoque (${formatNumber(insight.purchase.quantity)} unidades) ou pausar a campanha até a reposição.`,
      }),
    )
  }

  if (problems.includes('ADS_COM_MARGEM_BAIXA')) {
    findings.push(
      finding({
        ...base,
        ruleCode: 'ADS_ON_LOW_MARGIN',
        severity: 'IMPORTANTE',
        title: `Anúncio em produto de margem baixa: ${label}`,
        whatHappened:
          `${label} tem ${formatPercent(insight.margin?.netMarginPercent ?? 0)} de margem líquida ` +
          `(mínimo configurado: ${formatPercent(params.minMarginPercent)}) e recebe ` +
          `${formatCurrency(ads.spend)} em mídia.`,
        whyItMatters:
          'Margem baixa deixa pouco espaço para pagar mídia: o break-even de ROAS fica alto e difícil de sustentar.',
        dataPoints: {
          investimento: ads.spend,
          margem_liquida_percent: insight.margin?.netMarginPercent ?? null,
          minimo_percent: params.minMarginPercent,
          break_even_roas: ads.breakEvenRoas,
        },
        suggestedAction: 'Corrigir a margem antes de manter a verba neste produto.',
      }),
    )
  }

  return findings
}
