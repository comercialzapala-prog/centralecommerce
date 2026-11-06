import { num, round2 } from '@/lib/format'

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
