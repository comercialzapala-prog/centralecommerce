import type { SupplierLinkState } from '@/domain/intelligence'
import type { IntegrationHealthInput } from '@/domain/auditor/types'

/**
 * DISPONIBILIDADE DA FONTE DE FORNECEDOR (seções 27 e 33)
 *
 * O PRINCÍPIO, e ele vale para toda regra que dependa de dado externo:
 *
 *     ausência de DADO não é ausência OPERACIONAL.
 *
 * "Não recebi a lista de fornecedores" e "este produto não tem fornecedor" são
 * afirmações diferentes, e só a segunda é um problema da operação. Tratar a
 * primeira como se fosse a segunda produz um alerta em 100% dos produtos, todos
 * falsos, que afogam os alertas verdadeiros -- e ensinam a ignorar a lista.
 *
 * Por isso o auditor não infere a ausência pelo campo vazio. Ele pergunta antes
 * se a fonte tinha COMO responder:
 *
 *   ABSENT       nenhuma fonte configurada. A Fase A inteira vive aqui: o
 *                vínculo produto-fornecedor vem do Bling e o Bling ainda não
 *                existe. Não é defeito, é o estado esperado -- e alertar sobre
 *                ele por produto seria ruído permanente.
 *
 *   HEALTHY      fonte configurada, sincronizada e com dados. É o ÚNICO estado
 *                em que "este produto está sem fornecedor" é uma afirmação que o
 *                auditor tem evidência para fazer.
 *
 *   UNAVAILABLE  fonte configurada, mas sem resposta confiável agora. O auditor
 *                não sabe -- e "não sei" nunca vira "está faltando". O problema
 *                reportado é a indisponibilidade, não o fornecedor.
 */

export type SupplierSourceState = 'ABSENT' | 'HEALTHY' | 'UNAVAILABLE'

/**
 * Por que a fonte não pode ser usada.
 *
 * Todas menos `NO_DATA` já têm alerta próprio nas regras de integração; o mapa
 * motivo -> alerta está escrito em `supplierSourceRules()`, que existe
 * justamente para cobrir a que sobrava.
 */
export type SupplierSourceReason =
  | 'DISCONNECTED'
  | 'TOKEN_EXPIRED'
  | 'SYNC_ERROR'
  | 'NEVER_SYNCED'
  | 'NO_DATA'

export type SupplierSource = {
  state: SupplierSourceState
  /** `null` quando o estado não é UNAVAILABLE. */
  reason: SupplierSourceReason | null
  /** Última sincronização bem-sucedida conhecida. */
  lastSyncAt: string | null
  /** Quantos vínculos produto-fornecedor a fonte devolveu. */
  linksFound: number
}

/**
 * Decide o estado da fonte.
 *
 * Função PURA e no domínio de propósito: é uma regra de negócio ("quando posso
 * afirmar que falta fornecedor?"), não detalhe de infraestrutura. O serviço
 * apenas coleta os sinais e entrega.
 */
export function resolveSupplierSource(input: {
  /** Saúde da conexão com o ERP. `null` quando não há conexão nenhuma. */
  integration: IntegrationHealthInput | null
  /** Vínculos produto-fornecedor lidos da fonte. */
  linksFound: number
}): SupplierSource {
  const { integration, linksFound } = input

  const base = {
    lastSyncAt: integration?.lastSuccessfulSync ?? null,
    linksFound,
  }

  // Sem conexão, ou conexão que nunca foi configurada: não há fonte. Isto não é
  // falha -- e é exatamente onde a operação está hoje.
  if (!integration || integration.status === 'NOT_CONFIGURED') {
    return { ...base, state: 'ABSENT', reason: null }
  }

  if (integration.status === 'DISCONNECTED') {
    return { ...base, state: 'UNAVAILABLE', reason: 'DISCONNECTED' }
  }

  if (integration.status === 'TOKEN_EXPIRED') {
    return { ...base, state: 'UNAVAILABLE', reason: 'TOKEN_EXPIRED' }
  }

  // `status = ERROR`, ou saúde DEGRADED/DOWN: a conexão existe, mas o que ela
  // devolve não é confiável o bastante para sustentar uma acusação por produto.
  if (integration.status === 'ERROR' || integration.health === 'DEGRADED' || integration.health === 'DOWN') {
    return { ...base, state: 'UNAVAILABLE', reason: 'SYNC_ERROR' }
  }

  // Conectado e nunca sincronizou: a ausência de vínculo é a ausência da
  // primeira carga, não a ausência do fornecedor.
  if (!integration.lastSuccessfulSync) {
    return { ...base, state: 'UNAVAILABLE', reason: 'NEVER_SYNCED' }
  }

  // Conexão saudável que devolveu ZERO vínculos. Poderia significar "nenhum dos
  // produtos tem fornecedor cadastrado no ERP" -- mas é muito mais provável que
  // o recurso de fornecedores ainda não tenha sido sincronizado. Entre acusar
  // todos os produtos de uma vez e dizer "a fonte não trouxe nada", a segunda é
  // a afirmação que os dados sustentam.
  if (linksFound === 0) {
    return { ...base, state: 'UNAVAILABLE', reason: 'NO_DATA' }
  }

  return { ...base, state: 'HEALTHY', reason: null }
}

export type { SupplierLinkState }

/**
 * Traduz a resposta da fonte para um produto.
 *
 * Só um estado HEALTHY produz LINKED/MISSING. ABSENT e UNAVAILABLE produzem
 * UNKNOWN, e UNKNOWN nunca gera alerta de fornecedor ausente.
 */
export function resolveSupplierLink(source: SupplierSource, linked: boolean): SupplierLinkState {
  if (source.state !== 'HEALTHY') return 'UNKNOWN'
  return linked ? 'LINKED' : 'MISSING'
}

/**
 * Este produto exige fornecedor?
 *
 * Serviço, kit montado e item digital não exigem -- acusá-los de "fornecedor
 * ausente" estaria errado por construção, não por falta de dado.
 *
 * O tipo do produto virá do ERP (`products.tipo` no Bling). Enquanto não vier, a
 * Central NÃO inventa a exigência: usa o único sinal que ela própria possui, que
 * é o produto ser ESTOCADO -- ter saldo de estoque registrado em alguma origem.
 * Item que a operação nunca estocou não tem reposição a planejar, e é da
 * reposição que a exigência de fornecedor nasce.
 *
 * A consequência assumida: produto recém-cadastrado, ainda sem nenhum saldo, não
 * gera o alerta. É o lado conservador do princípio -- só alertar com evidência --
 * e é preferível ao contrário, que acusaria todo cadastro novo.
 *
 * QUANDO O TIPO CHEGAR DO ERP, é esta função que muda, e só ela.
 */
export function productRequiresSupplier(input: { hasStockRecord: boolean }): boolean {
  return input.hasStockRecord
}
