import { num, round2 } from '@/lib/format'
import type { MonthlyCmvTrackEntry } from '@/lib/types'

export type PricingInputs = {
  unitCost: number
  shippingCost: number
  packagingCost: number
  laborCost: number
  lossPercent: number
  targetMarginPercent: number
  marketplacePercent?: number
  taxPercent?: number
  currentSalePrice?: number
  stockBalance?: number
  qtySold?: number
}

export type PricingScenarioRow = {
  id: string
  label: string
  baseCost: number
  lossPercent: number
  lossFactor: number
  adjustedCost: number
  lossReserveAmount: number
  targetMarginPercent: number
  marginFactor: number
  suggestedPrice: number
  grossProfit: number
  isCurrent?: boolean
}

export type PricingBreakdown = {
  unitCost: number
  shippingCost: number
  packagingCost: number
  laborCost: number
  totalBaseCost: number
  lossPercent: number
  lossFactor: number
  adjustedCost: number
  lossReserveAmount: number
  targetMarginPercent: number
  marginFactor: number
  suggestedPrice: number
  grossProfit: number
  marketplacePercent: number
  taxPercent: number
  feesAmountAtSuggested: number
  netRemainingAtSuggested: number
  suggestedPriceCoveringFees: number
  currentSalePrice: number
  currentRemainingGross: number
  currentRemainingNet: number
  currentMarginPercent: number
  stockBalance: number
  potentialStockRevenue: number
  potentialStockProfit: number
  scenarios: PricingScenarioRow[]
}

function clampPercent(val: number, max = 95): number {
  if (!Number.isFinite(val) || val < 0) return 0
  return Math.min(val, max)
}

export function computeScenario(
  id: string,
  label: string,
  baseCost: number,
  lossPercentRaw: number,
  targetMarginPercentRaw: number,
  isCurrent = false,
): PricingScenarioRow {
  const lossPercent = clampPercent(lossPercentRaw, 90)
  const targetMarginPercent = clampPercent(targetMarginPercentRaw, 90)
  const lossFactor = round2(1 - lossPercent / 100)
  const marginFactor = round2(1 - targetMarginPercent / 100)

  const adjustedCost = lossFactor > 0 ? round2(baseCost / (1 - lossPercent / 100)) : baseCost
  const lossReserveAmount = round2(Math.max(0, adjustedCost - baseCost))
  const suggestedPrice =
    marginFactor > 0 ? round2(adjustedCost / (1 - targetMarginPercent / 100)) : adjustedCost
  const grossProfit = round2(suggestedPrice - adjustedCost)

  return {
    id,
    label,
    baseCost: round2(baseCost),
    lossPercent,
    lossFactor,
    adjustedCost,
    lossReserveAmount,
    targetMarginPercent,
    marginFactor,
    suggestedPrice,
    grossProfit,
    isCurrent,
  }
}

export function calculateProductPricing(input: PricingInputs): PricingBreakdown {
  const unitCost = Math.max(0, num(input.unitCost))
  const shippingCost = Math.max(0, num(input.shippingCost))
  const packagingCost = Math.max(0, num(input.packagingCost))
  const laborCost = Math.max(0, num(input.laborCost))
  const totalBaseCost = round2(unitCost + shippingCost + packagingCost + laborCost)

  const lossPercent = clampPercent(num(input.lossPercent), 90)
  const targetMarginPercent = clampPercent(
    input.targetMarginPercent > 0 ? num(input.targetMarginPercent) : 30,
    90,
  )
  const marketplacePercent = clampPercent(num(input.marketplacePercent), 80)
  const taxPercent = clampPercent(num(input.taxPercent), 80)

  const mainScenario = computeScenario(
    'current',
    `Sua Meta (${lossPercent}% perda · ${targetMarginPercent}% margem)`,
    totalBaseCost,
    lossPercent,
    targetMarginPercent,
    true,
  )

  const totalFeesPct = marketplacePercent + taxPercent
  const feesAmountAtSuggested = round2(mainScenario.suggestedPrice * (totalFeesPct / 100))
  const netRemainingAtSuggested = round2(mainScenario.grossProfit - feesAmountAtSuggested)

  const combinedMarginAndFees = clampPercent(targetMarginPercent + totalFeesPct, 95)
  const suggestedPriceCoveringFees =
    combinedMarginAndFees < 95
      ? round2(mainScenario.adjustedCost / (1 - combinedMarginAndFees / 100))
      : mainScenario.suggestedPrice

  const currentSalePrice = Math.max(0, num(input.currentSalePrice))
  const currentFees = round2(currentSalePrice * (totalFeesPct / 100))
  const currentRemainingGross = round2(currentSalePrice - mainScenario.adjustedCost)
  const currentRemainingNet = round2(currentRemainingGross - currentFees)
  const currentMarginPercent =
    currentSalePrice > 0 ? round2((currentRemainingGross / currentSalePrice) * 100) : 0

  const stockBalance = Math.max(0, num(input.stockBalance))
  const potentialStockRevenue = round2(stockBalance * mainScenario.suggestedPrice)
  const potentialStockProfit = round2(stockBalance * mainScenario.grossProfit)

  const scenarios: PricingScenarioRow[] = [
    mainScenario,
    computeScenario('a', 'A (Sem perda · 30% margem)', totalBaseCost, 0, 30),
    computeScenario('b', 'B (Perda Baixa 5% · 30% margem)', totalBaseCost, 5, 30),
    computeScenario('c', 'C (Perda Baixa 5% · 40% margem)', totalBaseCost, 5, 40),
    computeScenario('d', 'D (Perda Alta 15% · 40% margem)', totalBaseCost, 15, 40),
    computeScenario('e', 'E (Margem Alta · 5% perda · 60% margem)', totalBaseCost, 5, 60),
  ]

  return {
    unitCost,
    shippingCost,
    packagingCost,
    laborCost,
    totalBaseCost,
    lossPercent: mainScenario.lossPercent,
    lossFactor: mainScenario.lossFactor,
    adjustedCost: mainScenario.adjustedCost,
    lossReserveAmount: mainScenario.lossReserveAmount,
    targetMarginPercent: mainScenario.targetMarginPercent,
    marginFactor: mainScenario.marginFactor,
    suggestedPrice: mainScenario.suggestedPrice,
    grossProfit: mainScenario.grossProfit,
    marketplacePercent,
    taxPercent,
    feesAmountAtSuggested,
    netRemainingAtSuggested,
    suggestedPriceCoveringFees,
    currentSalePrice,
    currentRemainingGross,
    currentRemainingNet,
    currentMarginPercent,
    stockBalance,
    potentialStockRevenue,
    potentialStockProfit,
    scenarios,
  }
}

export type ComputedMonthCard = {
  index: number
  monthKey: string
  label: string
  startQty: number
  startUnitCost: number
  startValue: number
  soldQty: number
  soldCostValue: number
  lostQty: number
  lostCostValue: number
  netSoldMinusLostValue: number
  totalExitQty: number
  totalExitValue: number
  residualQty: number
  residualUnitCost: number
  residualValue: number
  entryQty: number
  entryUnitCost: number
  entryValue: number
  availableQty: number
  availableValue: number
  newWeightedCost: number
  costDelta: number
  costDeltaPercent: number
  averageStatus: 'HIGHER' | 'LOWER' | 'SAME'
  suggestedSalePrice: number
  salePrice: number
  revenue: number
  cmvSold: number
  grossProfit: number
  closingResidualQty: number
  closingResidualValue: number
}

const MONTH_LABELS = [
  { key: '2026-01', label: 'Janeiro' },
  { key: '2026-02', label: 'Fevereiro' },
  { key: '2026-03', label: 'Março' },
  { key: '2026-04', label: 'Abril' },
  { key: '2026-05', label: 'Maio' },
  { key: '2026-06', label: 'Junho' },
  { key: '2026-07', label: 'Julho' },
  { key: '2026-08', label: 'Agosto' },
  { key: '2026-09', label: 'Setembro' },
  { key: '2026-10', label: 'Outubro' },
  { key: '2026-11', label: 'Novembro' },
  { key: '2026-12', label: 'Dezembro' },
]

export function buildDefaultMonthlyTrack(params: {
  initialStock: number
  unitCost: number
  salePrice: number
  existingTrack?: MonthlyCmvTrackEntry[] | null
}): MonthlyCmvTrackEntry[] {
  if (params.existingTrack && params.existingTrack.length === 12) {
    return params.existingTrack
  }

  const baseCost = params.unitCost > 0 ? round2(params.unitCost) : 5
  const basePrice = params.salePrice > 0 ? round2(params.salePrice) : round2(baseCost / 0.7)
  const initStock = params.initialStock > 0 ? Math.round(params.initialStock) : 100

  return MONTH_LABELS.map((m, idx) => ({
    monthKey: m.key,
    label: m.label,
    initialOverrideQty: idx === 0 ? initStock : null,
    initialOverrideCost: idx === 0 ? baseCost : null,
    entryQty: idx === 0 ? 100 : 0,
    entryUnitCost: idx === 0 ? round2(baseCost * 2) : baseCost,
    soldQty: idx === 0 ? Math.min(50, Math.round(initStock / 2)) : 0,
    lostQty: 0,
    salePrice: basePrice,
  }))
}

export function computeMonthlyCarouselChain(
  entries: MonthlyCmvTrackEntry[],
  options?: {
    extraUnitCosts?: number
    lossPercent?: number
    targetMarginPercent?: number
  },
): ComputedMonthCard[] {
  const extraCosts = Math.max(0, num(options?.extraUnitCosts))
  const lossPct = clampPercent(num(options?.lossPercent), 90)
  const marginPct = clampPercent(
    options?.targetMarginPercent && options.targetMarginPercent > 0
      ? num(options.targetMarginPercent)
      : 30,
    90,
  )

  const cards: ComputedMonthCard[] = []
  let prevClosingQty = 0
  let prevWeightedCost = 0

  entries.forEach((entry, index) => {
    // 1. Estoque que iniciou o mês (vindo do fechamento do mês anterior, ou base inicial no 1º mês)
    const startQty =
      index === 0 && entry.initialOverrideQty !== null && entry.initialOverrideQty !== undefined
        ? Math.max(0, Math.round(num(entry.initialOverrideQty)))
        : prevClosingQty

    const startUnitCost =
      index === 0 && entry.initialOverrideCost !== null && entry.initialOverrideCost !== undefined
        ? Math.max(0, round2(num(entry.initialOverrideCost)))
        : prevWeightedCost

    const startValue = round2(startQty * startUnitCost)

    // 2. Saídas do mês: Peças Vendidas e Peças Perdidas (calculadas automaticamente pelo Custo Unitário Vigente)
    const soldQty = Math.max(0, Math.round(num(entry.soldQty)))
    const soldCostValue = round2(soldQty * startUnitCost)

    const lostQty = Math.max(0, Math.round(num(entry.lostQty)))
    const lostCostValue = round2(lostQty * startUnitCost)

    const netSoldMinusLostValue = round2(soldCostValue - lostCostValue)
    const totalExitQty = soldQty + lostQty
    const totalExitValue = round2(totalExitQty * startUnitCost)
    const cmvSold = totalExitValue

    // 3. Estoque Residual que sobrou após descontar vendidas e perdidas
    const residualQty = Math.max(0, startQty - totalExitQty)
    const residualUnitCost = startUnitCost
    const residualValue = round2(residualQty * residualUnitCost)

    // 4. Nova Entrada no mês + Novo Custo Médio Ponderado (Residual + Entrada)
    const entryQty = Math.max(0, Math.round(num(entry.entryQty)))
    const entryUnitCost = Math.max(0, round2(num(entry.entryUnitCost)))
    const entryValue = round2(entryQty * entryUnitCost)

    const availableQty = residualQty + entryQty
    const availableValue = round2(residualValue + entryValue)

    const newWeightedCost =
      availableQty > 0 ? round2(availableValue / availableQty) : residualUnitCost

    const costDelta = round2(newWeightedCost - residualUnitCost)
    const costDeltaPercent =
      residualUnitCost > 0 ? round2((costDelta / residualUnitCost) * 100) : 0

    const averageStatus: 'HIGHER' | 'LOWER' | 'SAME' =
      costDelta > 0.009 ? 'HIGHER' : costDelta < -0.009 ? 'LOWER' : 'SAME'

    const basePlusExtras = round2(newWeightedCost + extraCosts)
    const adjustedWithLoss =
      lossPct > 0 && lossPct < 95 ? round2(basePlusExtras / (1 - lossPct / 100)) : basePlusExtras
    const suggestedSalePrice =
      marginPct > 0 && marginPct < 95
        ? round2(adjustedWithLoss / (1 - marginPct / 100))
        : adjustedWithLoss

    const salePrice = Math.max(0, round2(num(entry.salePrice) || suggestedSalePrice))
    const revenue = round2(soldQty * salePrice)
    const grossProfit = round2(revenue - cmvSold)

    // O Novo Saldo Total (Residual + Nova Entrada) e o Novo Custo Médio passam para iniciar o próximo mês
    const closingResidualQty = availableQty
    const closingResidualValue = availableValue

    prevClosingQty = closingResidualQty
    prevWeightedCost = newWeightedCost

    cards.push({
      index,
      monthKey: entry.monthKey,
      label: entry.label,
      startQty,
      startUnitCost,
      startValue,
      soldQty,
      soldCostValue,
      lostQty,
      lostCostValue,
      netSoldMinusLostValue,
      totalExitQty,
      totalExitValue,
      residualQty,
      residualUnitCost,
      residualValue,
      entryQty,
      entryUnitCost,
      entryValue,
      availableQty,
      availableValue,
      newWeightedCost,
      costDelta,
      costDeltaPercent,
      averageStatus,
      suggestedSalePrice,
      salePrice,
      revenue,
      cmvSold,
      grossProfit,
      closingResidualQty,
      closingResidualValue,
    })
  })

  return cards
}
