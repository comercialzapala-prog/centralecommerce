import type { ProductInsight } from '@/domain/intelligence'
import { RESOLVE_PATHS } from '@/domain/auditor/impact'
import {
  finding,
  productLabel,
  type AuditFinding,
  type AuditSeverity,
  type ProductRule,
} from '@/domain/auditor/types'

/**
 * REGRAS DE CADASTRO (secao 27)
 *
 * Cadastro incompleto nao e preciosismo: sem custo nao existe margem, sem NCM
 * nao sai nota, sem peso e dimensao o frete e chute. A Central nao corrige o
 * cadastro -- isso e operacao, e operacao e do ERP (secao 37). Ela aponta.
 *
 * Um alerta por produto, nao um por campo: sete alertas para o mesmo produto
 * afogariam o painel /hoje (secao 30). Os campos faltantes vao em dataPoints.
 */

/** Gravidade de cada lacuna. Custo e o unico que trava a analise inteira. */
const GAP_SEVERITY: Record<string, AuditSeverity> = {
  CUSTO: 'CRITICO',
  PRECO: 'CRITICO',
  SKU: 'IMPORTANTE',
  NCM: 'IMPORTANTE',
  FORNECEDOR: 'IMPORTANTE',
  PESO: 'IMPORTANTE',
  DIMENSOES: 'IMPORTANTE',
}

const GAP_LABEL: Record<string, string> = {
  CUSTO: 'custo unitário',
  PRECO: 'preço de venda',
  SKU: 'SKU',
  NCM: 'NCM',
  FORNECEDOR: 'fornecedor',
  PESO: 'peso',
  DIMENSOES: 'dimensões',
}

const GAP_IMPACT: Record<string, string> = {
  CUSTO: 'sem custo não há margem: o produto fica fora de toda análise de rentabilidade e de preço mínimo',
  PRECO: 'sem preço não há como calcular margem nem comparar com o mínimo',
  SKU: 'sem SKU o produto não pode ser casado com o cadastro dos canais de venda de forma confiável',
  NCM: 'sem NCM a emissão fiscal trava e o imposto pode sair errado',
  FORNECEDOR: 'sem fornecedor o prazo de entrega cai no padrão configurado, e o ponto de reposição passa a ser uma estimativa',
  PESO: 'sem peso o custo de frete não pode ser estimado',
  DIMENSOES: 'sem dimensões a cubagem do frete não pode ser calculada',
}

export const registryRules: ProductRule = ({ insight }) => {
  if (insight.registryGaps.length === 0) return []

  const label = productLabel(insight)
  const gaps = insight.registryGaps

  const severity: AuditSeverity = gaps.some((gap) => GAP_SEVERITY[gap] === 'CRITICO')
    ? 'CRITICO'
    : 'IMPORTANTE'

  const missing = gaps.map((gap) => GAP_LABEL[gap] ?? gap)

  return [
    finding({
      ruleCode: 'REGISTRY_INCOMPLETE',
      domain: 'CADASTRO',
      severity,
      productId: insight.productId,
      resourceType: null,
      resourceId: null,
      // Cadastro incompleto nao tem impacto financeiro calculavel: o que falta e
      // justamente o dado que permitiria calcular.
      actionHref: RESOLVE_PATHS.produto(insight.productId),
      sku: insight.sku,
      title: `Cadastro incompleto em ${label}`,
      whatHappened: `${label} está sem ${listToText(missing)}.`,
      whyItMatters: gaps
        .map((gap) => GAP_IMPACT[gap])
        .filter(Boolean)
        .map(capitalize)
        .join('. ')
        .concat('.'),
      dataPoints: {
        campos_ausentes: gaps,
        tem_custo: !gaps.includes('CUSTO'),
        tem_preco: !gaps.includes('PRECO'),
        tem_fornecedor: !gaps.includes('FORNECEDOR'),
      },
      suggestedAction: `Completar o cadastro no ERP: ${listToText(missing)}.`,
    }),
  ]
}

/**
 * SKU DUPLICADO (secao 27)
 *
 * Regra GLOBAL: depende de olhar a lista inteira, nao um produto. Por isso nao e
 * um ProductRule -- ela recebe todos os insights.
 *
 * SKU duplicado e grave porque toda ponte com canal externo usa SKU como chave
 * humana: dois produtos com o mesmo codigo fazem estoque e venda irem para o
 * produto errado.
 */
export function duplicateSkuRule(insights: ProductInsight[]): AuditFinding[] {
  const bySku = new Map<string, ProductInsight[]>()

  for (const insight of insights) {
    if (!insight.sku) continue
    // Comparacao case-insensitive: o indice ux_products_sku do banco usa
    // lower(sku), entao "ABC" e "abc" ja sao o mesmo SKU para o Postgres.
    const key = insight.sku.trim().toLowerCase()
    if (!key) continue
    bySku.set(key, [...(bySku.get(key) ?? []), insight])
  }

  const findings: AuditFinding[] = []

  for (const [sku, group] of bySku) {
    if (group.length < 2) continue

    findings.push(
      finding({
        ruleCode: 'REGISTRY_DUPLICATE_SKU',
        domain: 'CADASTRO',
        severity: 'CRITICO',
        productId: null,
        resourceType: 'sku',
        resourceId: sku,
        // Regra global: leva para a lista, nao para um produto -- a correcao
        // envolve decidir entre dois ou mais.
        actionHref: RESOLVE_PATHS.produtos(),
        sku: group[0].sku,
        title: `SKU duplicado: ${group[0].sku}`,
        whatHappened: `${group.length} produtos usam o SKU "${group[0].sku}": ${group
          .map((item) => item.name)
          .join(', ')}.`,
        whyItMatters:
          'O SKU é a chave que liga o produto ao Mercado Livre, à Shopee e ao ERP. Duplicado, estoque e venda podem ser atribuídos ao produto errado — e o erro só aparece no inventário.',
        dataPoints: {
          sku: group[0].sku,
          produtos: group.map((item) => ({ id: item.productId, nome: item.name })),
          quantidade: group.length,
        },
        suggestedAction:
          'Definir qual produto mantém o SKU e corrigir os demais antes de ligar qualquer sincronização.',
      }),
    )
  }

  return findings
}

function listToText(items: string[]): string {
  if (items.length === 0) return ''
  if (items.length === 1) return items[0]
  return `${items.slice(0, -1).join(', ')} e ${items[items.length - 1]}`
}

function capitalize(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1)
}
