'use server'

import { revalidatePath } from 'next/cache'

import { createAuthedClient as createClient } from '@/lib/auth'
import { num, round2 } from '@/lib/format'

export type MonthlyLogisticsRecord = {
  monthKey: string // e.g. "2026-11"
  monthLabel: string // e.g. "Novembro/2026"
  routeDistanceKm: number
  costPerKm: number
  tripsCount: number
  boxesShipped: number
  totalTripCost: number
  totalMonthlyCost: number
  costPerBox: number
  updatedAt: string
}

export type LogisticsFleetConfig = {
  defaultRouteKm: number
  costPerKm: number
  monthlyTrips: number
  monthlyBoxes: number
  history?: MonthlyLogisticsRecord[]
  updatedAt?: string
}

const DEFAULT_FLEET_CONFIG: LogisticsFleetConfig = {
  defaultRouteKm: 8.2,
  costPerKm: 0,
  monthlyTrips: 0,
  monthlyBoxes: 0,
  history: [],
}

export async function loadLogisticsConfig(): Promise<LogisticsFleetConfig> {
  try {
    const supabase = await createClient()
    const { data } = await supabase
      .from('erp_snapshots')
      .select('data')
      .eq('source', 'CENTRAL')
      .eq('resource_type', 'LOGISTICS')
      .eq('external_id', 'FLEET_CONFIG')
      .maybeSingle()

    if (!data || !data.data) {
      return DEFAULT_FLEET_CONFIG
    }

    const raw = data.data as Record<string, unknown>
    return {
      defaultRouteKm: raw.defaultRouteKm !== undefined ? num(raw.defaultRouteKm) : 8.2,
      costPerKm: raw.costPerKm !== undefined ? num(raw.costPerKm) : 0,
      monthlyTrips: raw.monthlyTrips !== undefined ? Math.round(num(raw.monthlyTrips)) : 0,
      monthlyBoxes: raw.monthlyBoxes !== undefined ? Math.round(num(raw.monthlyBoxes)) : 0,
      history: Array.isArray(raw.history) ? (raw.history as MonthlyLogisticsRecord[]) : [],
      updatedAt: typeof raw.updatedAt === 'string' ? raw.updatedAt : undefined,
    }
  } catch {
    return DEFAULT_FLEET_CONFIG
  }
}

export async function saveLogisticsConfigAction(input: {
  defaultRouteKm: number
  costPerKm: number
  monthlyTrips: number
  monthlyBoxes: number
  history?: MonthlyLogisticsRecord[]
}): Promise<{ ok: boolean; message: string }> {
  try {
    const supabase = await createClient()
    const routeKm = Math.max(0, num(input.defaultRouteKm) || 8.2)
    const costPerKm = Math.max(0, num(input.costPerKm) || 0)
    const trips = Math.max(0, Math.round(num(input.monthlyTrips) || 0))
    const boxes = Math.max(0, Math.round(num(input.monthlyBoxes) || 0))

    const existing = await supabase
      .from('erp_snapshots')
      .select('id, data')
      .eq('source', 'CENTRAL')
      .eq('resource_type', 'LOGISTICS')
      .eq('external_id', 'FLEET_CONFIG')
      .maybeSingle()

    const prevHistory: MonthlyLogisticsRecord[] =
      existing.data?.data && Array.isArray((existing.data.data as Record<string, unknown>).history)
        ? ((existing.data.data as Record<string, unknown>).history as MonthlyLogisticsRecord[])
        : []

    const payload: LogisticsFleetConfig = {
      defaultRouteKm: routeKm,
      costPerKm,
      monthlyTrips: trips,
      monthlyBoxes: boxes,
      history: input.history ?? prevHistory,
      updatedAt: new Date().toISOString(),
    }

    if (existing.data?.id) {
      await supabase
        .from('erp_snapshots')
        .update({
          data: payload,
          last_synced_at: new Date().toISOString(),
        })
        .eq('id', existing.data.id)
    } else {
      await supabase.from('erp_snapshots').insert({
        source: 'CENTRAL',
        resource_type: 'LOGISTICS',
        external_id: 'FLEET_CONFIG',
        data: payload,
        last_synced_at: new Date().toISOString(),
      })
    }

    revalidatePath('/logistica')
    return { ok: true, message: 'Parâmetros de logística salvos com sucesso!' }
  } catch (err) {
    return {
      ok: false,
      message: err instanceof Error ? err.message : 'Erro ao salvar parâmetros de logística.',
    }
  }
}
