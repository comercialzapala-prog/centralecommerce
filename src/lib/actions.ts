import { unstable_rethrow } from 'next/navigation'

import { parseAmount } from '@/lib/format'

/** Contrato unico de retorno das Server Actions. */
export type ActionState = {
  status: 'idle' | 'success' | 'error'
  message?: string
  /** Erros por campo, quando fizer sentido destacar no formulario. */
  fieldErrors?: Record<string, string>
}

export const IDLE_STATE: ActionState = { status: 'idle' }

export function actionOk(message: string): ActionState {
  return { status: 'success', message }
}

export function actionError(message: string, fieldErrors?: Record<string, string>): ActionState {
  return { status: 'error', message, fieldErrors }
}

/** Erro do Postgres em linguagem de gente. */
export function describeDbError(error: { message: string; code?: string }): string {
  const message = error.message ?? 'Erro desconhecido'

  if (message.includes('Ciclo detectado')) {
    return 'Esse centro não pode virar filho de um descendente dele mesmo.'
  }
  if (message.includes('pai de si mesmo')) {
    return 'Um centro de custo não pode ser pai de si mesmo.'
  }
  if (error.code === '23505' || message.includes('duplicate key')) {
    if (message.includes('ux_cost_centers_parent_name')) {
      return 'Já existe um centro com esse nome dentro do mesmo pai.'
    }
    if (message.includes('ux_orders_order_number')) {
      return 'Já existe um pedido com esse número.'
    }
    if (message.includes('ux_products_sku')) {
      return 'Já existe um produto com esse SKU.'
    }
    if (message.includes('channels_name_key') || message.includes('payment_methods_name_key')) {
      return 'Esse nome já está cadastrado.'
    }
    return 'Esse registro já existe.'
  }
  if (error.code === '23503' || message.includes('violates foreign key')) {
    return 'Existe histórico ligado a esse registro. Desative em vez de excluir.'
  }
  if (error.code === '23514' || message.includes('violates check constraint')) {
    return 'Valor inválido para esse campo.'
  }

  return message
}

/* -------------------------------------------------------------------------- */
/* Leitura de FormData                                                         */
/* -------------------------------------------------------------------------- */

export function readText(formData: FormData, key: string): string | null {
  const value = formData.get(key)
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  return trimmed === '' ? null : trimmed
}

export function readRequiredText(formData: FormData, key: string, label: string): string {
  const value = readText(formData, key)
  if (!value) throw new ValidationError(`${label} é obrigatório.`, key)
  return value
}

/** UUID vazio vira null -- selects mandam "" quando nada foi escolhido. */
export function readUuid(formData: FormData, key: string): string | null {
  const value = readText(formData, key)
  if (!value) return null
  const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)
  return isUuid ? value : null
}

export function readAmount(formData: FormData, key: string, label: string, required = true): number {
  const raw = formData.get(key)
  const parsed = parseAmount(typeof raw === 'string' ? raw : null)

  if (parsed === null) {
    if (required) throw new ValidationError(`${label} é obrigatório.`, key)
    return 0
  }
  if (parsed < 0) throw new ValidationError(`${label} não pode ser negativo.`, key)
  return parsed
}

export function readInteger(formData: FormData, key: string, label: string): number {
  const value = readText(formData, key)
  const parsed = Number(value)
  if (!value || !Number.isFinite(parsed) || !Number.isInteger(parsed)) {
    throw new ValidationError(`${label} precisa ser um número inteiro.`, key)
  }
  return parsed
}

export function readDate(formData: FormData, key: string, label: string): string {
  const value = readText(formData, key)
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new ValidationError(`${label} é obrigatória.`, key)
  }
  return value
}

export function readBoolean(formData: FormData, key: string): boolean {
  const value = formData.get(key)
  return value === 'true' || value === 'on' || value === '1'
}

export function readOneOf<T extends string>(
  formData: FormData,
  key: string,
  allowed: readonly T[],
  label: string,
): T {
  const value = readText(formData, key)
  if (!value || !allowed.includes(value as T)) {
    throw new ValidationError(`${label} inválido.`, key)
  }
  return value as T
}

export class ValidationError extends Error {
  field?: string
  constructor(message: string, field?: string) {
    super(message)
    this.name = 'ValidationError'
    this.field = field
  }
}

/**
 * Embrulha a action: validacao e erro do banco viram ActionState.
 * `unstable_rethrow` deixa `redirect()` e `notFound()` subirem -- sem ele o
 * catch engoliria o controle de fluxo interno do Next.
 */
export async function runAction(fn: () => Promise<ActionState>): Promise<ActionState> {
  try {
    return await fn()
  } catch (error) {
    unstable_rethrow(error)

    if (error instanceof ValidationError) {
      return actionError(error.message, error.field ? { [error.field]: error.message } : undefined)
    }
    if (error instanceof Error) {
      return actionError(error.message)
    }
    return actionError('Não foi possível concluir a operação.')
  }
}
