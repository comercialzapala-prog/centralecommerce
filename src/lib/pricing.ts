import { num, round2 } from '@/lib/format'
import type { MonthlyCmvTrackEntry } from '@/lib/types'

export const ML_DEFAULT_CLASSIC_PERCENT = 14
export const ML_DEFAULT_PREMIUM_PERCENT = 19
export const ML_DEFAULT_TAX_PERCENT = 6
export const ML_DEFAULT_BURN_MARGIN_PERCENT = 8

export const ML_BANDED_FEES = [
  { firstCents: 1, lastCents: 2899, fee: 6.25, label: 'Abaixo de R$ 29 (R$ 6,25)' },
  { firstCents: 2900, lastCents: 4999, fee: 6.5, label: 'De R$ 29 a R$ 49,99 (R$ 6,50)' },
  { firstCents: 5000, lastCents: 7899, fee: 6.75, label: 'De R$ 50 a R$ 78,99 (R$ 6,75)' },
  { firstCents: 7900, lastCents: Infinity, fee: 0, label: 'A partir de R$ 79 (Isento de taxa fixa)' },
] as const

export function getMlFixedFeeByPrice(
  price: number,
  includeFixedFee = true,
): { fee: number; bandLabel: string } {
  if (!includeFixedFee || !Number.isFinite(price) || price <= 0) {
    return { fee: 0, bandLabel: 'Sem taxa fixa' }
  }
  const cents = Math.round(price * 100)
  const band = ML_BANDED_FEES.find((b) => cents <= b.lastCents) ?? ML_BANDED_FEES[3]
  return { fee: band.fee, bandLabel: band.label }
}

export type MlSaleScenarioResult = {
  price: number
  fee: number
  bandLabel: string
  ratesAmount: number
  totalCost: number
  profit: number
  marginPercent: number
}

export function evaluateMlSaleScenario(
  price: number | null | undefined,
  baseCost: number,
  ratesPercent: number,
  includeFixedFee = true,
): MlSaleScenarioResult | null {
  if (price === null || price === undefined || !Number.isFinite(price) || price <= 0) {
    return null
  }
  if (!Number.isFinite(baseCost) || baseCost < 0) return null
  const cleanPrice = round2(price)
  const { fee, bandLabel } = getMlFixedFeeByPrice(cleanPrice, includeFixedFee)
  const ratesDecimal = Math.max(0, ratesPercent) / 100
  const ratesAmount = round2(cleanPrice * ratesDecimal)
  const totalCost = round2(baseCost + fee + ratesAmount)
  const profit = round2(cleanPrice - totalCost)
  const marginPercent = cleanPrice > 0 ? round2((profit / cleanPrice) * 100) : 0
  return {
    price: cleanPrice,
    fee,
    bandLabel,
    ratesAmount,
    totalCost,
    profit,
    marginPercent,
  }
}

/**
 * Encontra o preço de venda no Mercado Livre para atingir `marginPercent` líquido sobre a venda,
 * descontando `ratesPercent` (Comissão ML + Imposto NF) e a taxa fixa escalonada por faixa (< R$ 79).
 * Mesma lógica exata do Simulador Petrus / Sapo Amarelo (`targetPrice`).
 */
export function findMlTargetPrice(
  baseCost: number,
  ratesPercent: number,
  marginPercent: number,
  includeFixedFee = true,
  verifyMargin = true,
): number | null {
  if (!Number.isFinite(baseCost) || baseCost <= 0) return null
  const ratesDecimal = Math.max(0, ratesPercent) / 100
  const marginDecimal = marginPercent / 100
  const netRate = 1 - ratesDecimal - marginDecimal
  if (netRate <= 1e-6) return null

  for (const band of ML_BANDED_FEES) {
    const fee = includeFixedFee ? band.fee : 0
    let cents = Math.max(
      band.firstCents,
      Math.ceil(((baseCost + fee) / netRate) * 100 - 1e-8),
    )
    while (
      verifyMargin &&
      Number.isSafeInteger(cents) &&
      cents <= band.lastCents
    ) {
      const check = evaluateMlSaleScenario(cents / 100, baseCost, ratesPercent, includeFixedFee)
      if (!check || check.profit / check.price + 1e-12 >= marginDecimal) break
      cents++
    }
    if (Number.isSafeInteger(cents) && cents <= band.lastCents) {
      return round2(cents / 100)
    }
  }
  return null
}

export type MlBagPreset = {
  code: 'SAC-P' | 'SAC-M' | 'SAC-G'
  name: string
  lengthCm: number
  widthCm: number
  heightCm: number
  maxWeightGrams: number
  defaultCost: number
}

export const ML_BAG_PRESETS: MlBagPreset[] = [
  {
    code: 'SAC-P',
    name: 'SACOLA P (Até 500g · 25×18×8 cm)',
    lengthCm: 25,
    widthCm: 18,
    heightCm: 8,
    maxWeightGrams: 500,
    defaultCost: 1.1,
  },
  {
    code: 'SAC-M',
    name: 'SACOLA M (Até 1,5kg · 32×24×15 cm)',
    lengthCm: 32,
    widthCm: 24,
    heightCm: 15,
    maxWeightGrams: 1500,
    defaultCost: 1.8,
  },
  {
    code: 'SAC-G',
    name: 'SACOLA G (Até 5kg · 42×32×25 cm)',
    lengthCm: 42,
    widthCm: 32,
    heightCm: 25,
    maxWeightGrams: 5000,
    defaultCost: 2.5,
  },
]

export type MlShippingAndBagEstimate = {
  physicalWeightGrams: number
  lengthCm: number
  widthCm: number
  heightCm: number
  cubicWeightGrams: number
  billableWeightGrams: number
  mlMercadoEnviosFee: number
  supplierTransferFreight: number
  weightBracketLabel: string
  recommendedBag: MlBagPreset
}

export function estimateMlShippingAndBag(params: {
  grossWeightGrams?: number | null
  netWeightGrams?: number | null
  lengthCm?: number | null
  widthCm?: number | null
  heightCm?: number | null
  bagSku?: string | null
  bagName?: string | null
}): MlShippingAndBagEstimate {
  const physicalWeightGrams = Math.max(
    0,
    Math.round(num(params.grossWeightGrams) || num(params.netWeightGrams) || 500),
  )

  const bagText = `${params.bagSku ?? ''} ${params.bagName ?? ''}`.toUpperCase()
  let recommendedBag: MlBagPreset =
    physicalWeightGrams <= 450
      ? ML_BAG_PRESETS[0]
      : physicalWeightGrams <= 1200
        ? ML_BAG_PRESETS[1]
        : ML_BAG_PRESETS[2]

  if (bagText.includes('SAC-P') || bagText.includes('SACOLA P')) {
    recommendedBag = ML_BAG_PRESETS[0]
  } else if (bagText.includes('SAC-M') || bagText.includes('SACOLA M')) {
    recommendedBag = ML_BAG_PRESETS[1]
  } else if (bagText.includes('SAC-G') || bagText.includes('SACOLA G')) {
    recommendedBag = ML_BAG_PRESETS[2]
  }

  const lengthCm = num(params.lengthCm) > 0 ? num(params.lengthCm) : recommendedBag.lengthCm
  const widthCm = num(params.widthCm) > 0 ? num(params.widthCm) : recommendedBag.widthCm
  const heightCm = num(params.heightCm) > 0 ? num(params.heightCm) : recommendedBag.heightCm

  // Peso cubado Mercado Envios: (C * L * A) / 6000 kg -> * 1000 g = (C * L * A) / 6 g
  const cubicWeightGrams = Math.round((lengthCm * widthCm * heightCm) / 6)
  const billableWeightGrams = Math.max(physicalWeightGrams, cubicWeightGrams)

  // Tabela Mercado Envios (Frete Grátis >= R$ 79 c/ reputação verde) + Frete Fornecedor Petrus
  // Nota: Para o cálculo da faixa no Simulador Petrus/Sapo, usamos o peso físico quando a caixa é padrão
  const refWeight = physicalWeightGrams > 0 ? physicalWeightGrams : billableWeightGrams

  let mlMercadoEnviosFee = 19.45
  let supplierTransferFreight = 0.75
  let weightBracketLabel = '500g a 1kg'

  if (refWeight <= 300) {
    mlMercadoEnviosFee = 17.45
    supplierTransferFreight = 0.35
    weightBracketLabel = 'Até 300g'
  } else if (refWeight <= 500) {
    mlMercadoEnviosFee = 18.45
    supplierTransferFreight = 0.5
    weightBracketLabel = '300g a 500g'
  } else if (refWeight <= 800) {
    mlMercadoEnviosFee = 19.45
    supplierTransferFreight = 0.75
    weightBracketLabel = '500g a 800g'
  } else if (refWeight <= 1400) {
    mlMercadoEnviosFee = 20.45
    supplierTransferFreight = 0.95
    weightBracketLabel = '800g a 1,4kg'
  } else if (refWeight <= 2000) {
    mlMercadoEnviosFee = 21.45
    supplierTransferFreight = 1.35
    weightBracketLabel = '1,4kg a 2kg'
  } else if (refWeight <= 5000) {
    mlMercadoEnviosFee = 24.95
    supplierTransferFreight = 1.85
    weightBracketLabel = '2kg a 5kg'
  } else {
    mlMercadoEnviosFee = 32.95
    supplierTransferFreight = 2.5
    weightBracketLabel = 'Acima de 5kg'
  }

  return {
    physicalWeightGrams,
    lengthCm,
    widthCm,
    heightCm,
    cubicWeightGrams,
    billableWeightGrams,
    mlMercadoEnviosFee,
    supplierTransferFreight,
    weightBracketLabel,
    recommendedBag,
  }
}

export type MlSimulatorComparison = {
  purchaseCost: number
  packagingCost: number
  shippingCost: number
  laborCost: number
  lossPercent: number
  lossReserveAmount: number
  baseCost: number
  commissionPercent: number
  taxPercent: number
  totalRatesPercent: number
  includeFixedFee: boolean
  normalMarginTargetPercent: number
  burnMarginTargetPercent: number
  floorPrice: number | null
  normal: MlSaleScenarioResult | null
  burn: MlSaleScenarioResult | null
  priceDiscount: number | null
  priceDiscountPercent: number | null
  profitDelta: number | null
  competitorAvgPrice: number | null
  marketDiscount: number | null
  marketDiscountPercent: number | null
}

export function calculateMlSimulatorComparison(params: {
  purchaseCost: number
  packagingCost: number
  shippingCost: number
  laborCost?: number
  lossPercent?: number
  commissionPercent: number
  taxPercent: number
  includeFixedFee?: boolean
  normalMarginTargetPercent: number
  normalManualPrice?: number | null
  burnMarginTargetPercent?: number
  burnManualPrice?: number | null
  competitorAvgPrice?: number | null
}): MlSimulatorComparison {
  const purchaseCost = Math.max(0, round2(num(params.purchaseCost)))
  const packagingCost = Math.max(0, round2(num(params.packagingCost)))
  const shippingCost = Math.max(0, round2(num(params.shippingCost)))
  const laborCost = Math.max(0, round2(num(params.laborCost)))
  const rawSum = round2(purchaseCost + packagingCost + shippingCost + laborCost)

  const lossPercent = clampPercent(num(params.lossPercent), 90)
  const baseCost = lossPercent > 0 ? round2(rawSum / (1 - lossPercent / 100)) : rawSum
  const lossReserveAmount = round2(Math.max(0, baseCost - rawSum))

  const commissionPercent = clampPercent(num(params.commissionPercent), 80)
  const taxPercent = clampPercent(num(params.taxPercent), 80)
  const totalRatesPercent = round2(commissionPercent + taxPercent)
  const includeFixedFee = params.includeFixedFee !== false

  const normalMarginTargetPercent = clampPercent(num(params.normalMarginTargetPercent), 85)
  const burnMarginTargetPercent = clampPercent(
    params.burnMarginTargetPercent !== undefined ? num(params.burnMarginTargetPercent) : ML_DEFAULT_BURN_MARGIN_PERCENT,
    85,
  )

  const floorPrice =
    baseCost > 0 ? findMlTargetPrice(baseCost, totalRatesPercent, 0, includeFixedFee, false) : null

  const computedNormalPrice =
    params.normalManualPrice && num(params.normalManualPrice) > 0
      ? round2(num(params.normalManualPrice))
      : baseCost > 0
        ? findMlTargetPrice(
            baseCost,
            totalRatesPercent,
            normalMarginTargetPercent,
            includeFixedFee,
            true,
          )
        : null

  const computedBurnPrice =
    params.burnManualPrice && num(params.burnManualPrice) > 0
      ? round2(num(params.burnManualPrice))
      : baseCost > 0
        ? findMlTargetPrice(
            baseCost,
            totalRatesPercent,
            burnMarginTargetPercent,
            includeFixedFee,
            false,
          )
        : null

  const normal = evaluateMlSaleScenario(
    computedNormalPrice,
    baseCost,
    totalRatesPercent,
    includeFixedFee,
  )
  const burn = evaluateMlSaleScenario(
    computedBurnPrice,
    baseCost,
    totalRatesPercent,
    includeFixedFee,
  )

  const priceDiscount = burn && normal ? round2(normal.price - burn.price) : null
  const priceDiscountPercent =
    priceDiscount !== null && normal && normal.price > 0
      ? round2((Math.abs(priceDiscount) / normal.price) * 100)
      : null
  const profitDelta = burn && normal ? round2(normal.profit - burn.profit) : null

  const competitorAvgPrice =
    params.competitorAvgPrice && num(params.competitorAvgPrice) > 0
      ? round2(num(params.competitorAvgPrice))
      : null
  const marketDiscount =
    burn && competitorAvgPrice && competitorAvgPrice > 0
      ? round2(competitorAvgPrice - burn.price)
      : null
  const marketDiscountPercent =
    marketDiscount !== null && competitorAvgPrice && competitorAvgPrice > 0
      ? round2((Math.abs(marketDiscount) / competitorAvgPrice) * 100)
      : null

  return {
    purchaseCost,
    packagingCost,
    shippingCost,
    laborCost,
    lossPercent,
    lossReserveAmount,
    baseCost,
    commissionPercent,
    taxPercent,
    totalRatesPercent,
    includeFixedFee,
    normalMarginTargetPercent,
    burnMarginTargetPercent,
    floorPrice,
    normal,
    burn,
    priceDiscount,
    priceDiscountPercent,
    profitDelta,
    competitorAvgPrice,
    marketDiscount,
    marketDiscountPercent,
  }
}

export type PricingInputs = {
  unitCost: number
  shippingCost: number
  packagingCost: number
  laborCost: number
  lossPercent: number
  targetMarginPercent: number
  marketplacePercent?: number
  taxPercent?: number
  includeFixedFee?: boolean
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
  fixedFeeAmount: number
  ratesAmount: number
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
  fixedFeeAmount: number
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
  ratesPercentRaw = 0,
  includeFixedFee = true,
): PricingScenarioRow {
  const lossPercent = clampPercent(lossPercentRaw, 90)
  const targetMarginPercent = clampPercent(targetMarginPercentRaw, 90)
  const ratesPercent = clampPercent(ratesPercentRaw, 80)
  const lossFactor = round2(1 - lossPercent / 100)
  const combinedMarginAndRates = clampPercent(targetMarginPercent + ratesPercent, 95)
  const marginFactor = round2(1 - combinedMarginAndRates / 100)

  const adjustedCost = lossFactor > 0 ? round2(baseCost / (1 - lossPercent / 100)) : baseCost
  const lossReserveAmount = round2(Math.max(0, adjustedCost - baseCost))

  let suggestedPrice = 0
  let fixedFeeAmount = 0
  let ratesAmount = 0
  let grossProfit = 0

  if (adjustedCost > 0) {
    const mlPrice = findMlTargetPrice(
      adjustedCost,
      ratesPercent,
      targetMarginPercent,
      includeFixedFee,
      true,
    )
    if (mlPrice !== null && mlPrice > 0) {
      const evalRes = evaluateMlSaleScenario(mlPrice, adjustedCost, ratesPercent, includeFixedFee)
      suggestedPrice = mlPrice
      fixedFeeAmount = evalRes?.fee ?? 0
      ratesAmount = evalRes?.ratesAmount ?? 0
      grossProfit = evalRes?.profit ?? round2(suggestedPrice - adjustedCost - fixedFeeAmount - ratesAmount)
    } else {
      suggestedPrice =
        marginFactor > 0 ? round2(adjustedCost / (1 - combinedMarginAndRates / 100)) : adjustedCost
      const feeObj = getMlFixedFeeByPrice(suggestedPrice, includeFixedFee)
      fixedFeeAmount = feeObj.fee
      ratesAmount = round2(suggestedPrice * (ratesPercent / 100))
      grossProfit = round2(suggestedPrice - adjustedCost - fixedFeeAmount - ratesAmount)
    }
  }

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
    fixedFeeAmount,
    ratesAmount,
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
    input.targetMarginPercent >= 0 ? num(input.targetMarginPercent) : 30,
    90,
  )
  const marketplacePercent = clampPercent(num(input.marketplacePercent), 80)
  const taxPercent = clampPercent(num(input.taxPercent), 80)
  const totalFeesPct = round2(marketplacePercent + taxPercent)
  const includeFixedFee = input.includeFixedFee !== false

  const mainScenario = computeScenario(
    'current',
    `Sua Meta (${lossPercent}% perda · ${targetMarginPercent}% margem líquida ML)`,
    totalBaseCost,
    lossPercent,
    targetMarginPercent,
    true,
    totalFeesPct,
    includeFixedFee,
  )

  const feesAmountAtSuggested = round2(mainScenario.ratesAmount + mainScenario.fixedFeeAmount)
  const netRemainingAtSuggested = mainScenario.grossProfit
  const suggestedPriceCoveringFees = mainScenario.suggestedPrice

  const currentSalePrice = Math.max(0, num(input.currentSalePrice))
  const currentEval = evaluateMlSaleScenario(
    currentSalePrice,
    mainScenario.adjustedCost,
    totalFeesPct,
    includeFixedFee,
  )
  const currentRemainingGross =
    currentSalePrice > 0 ? round2(currentSalePrice - mainScenario.adjustedCost) : 0
  const currentRemainingNet = currentEval ? currentEval.profit : 0
  const currentMarginPercent = currentEval ? currentEval.marginPercent : 0

  const stockBalance = Math.max(0, num(input.stockBalance))
  const potentialStockRevenue = round2(stockBalance * mainScenario.suggestedPrice)
  const potentialStockProfit = round2(stockBalance * mainScenario.grossProfit)

  const scenarios: PricingScenarioRow[] = [
    mainScenario,
    computeScenario(
      'burn8',
      'Queima / Ranqueamento ML (8% margem líquida)',
      totalBaseCost,
      lossPercent,
      8,
      false,
      totalFeesPct,
      includeFixedFee,
    ),
    computeScenario(
      'm15',
      'A (Giro Rápido · 15% margem líquida)',
      totalBaseCost,
      lossPercent,
      15,
      false,
      totalFeesPct,
      includeFixedFee,
    ),
    computeScenario(
      'm20',
      'B (Padrão ML · 20% margem líquida)',
      totalBaseCost,
      lossPercent,
      20,
      false,
      totalFeesPct,
      includeFixedFee,
    ),
    computeScenario(
      'm25',
      'C (Saudável · 25% margem líquida)',
      totalBaseCost,
      lossPercent,
      25,
      false,
      totalFeesPct,
      includeFixedFee,
    ),
    computeScenario(
      'm30',
      'D (Meta Alta · 30% margem líquida)',
      totalBaseCost,
      lossPercent,
      30,
      false,
      totalFeesPct,
      includeFixedFee,
    ),
    computeScenario(
      'floor0',
      'E (Piso Sem Prejuízo · 0% margem)',
      totalBaseCost,
      lossPercent,
      0,
      false,
      totalFeesPct,
      includeFixedFee,
    ),
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
    fixedFeeAmount: mainScenario.fixedFeeAmount,
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
    entryQty: 0,
    entryUnitCost: 0,
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

/* -------------------------------------------------------------------------- */
/* Planilha de Precificação — Simulador Mercado Livre (Clássico vs Premium)    */
/* -------------------------------------------------------------------------- */

export type MlListingType = 'CLASSICO' | 'PREMIUM'
export type MlFixedFeeMode = 'AUTO_79' | 'MANUAL' | 'EXEMPT'

export const ML_THRESHOLD_FREE_FIXED_FEE = 79

export type MlPricingRowInput = {
  unitCost: number
  packagingCost: number
  laborCost: number
  lossPercent: number
  taxPercent: number
  mlListingType: MlListingType
  mlClassicPercent: number
  mlPremiumPercent: number
  mlFixedFeeMode: MlFixedFeeMode
  mlFixedFeeAmount: number
  shippingCost: number
  targetMarginPercent: number
  salePrice: number
  stockBalance?: number
}

export type MlPricingTierBreakdown = {
  listingType: MlListingType
  label: string
  mlPercent: number
  salePrice: number
  commissionAmount: number
  fixedFeeAmount: number
  isExemptFromFixedFee: boolean
  totalMlFeesAmount: number
  taxAmount: number
  shippingAmount: number
  mlNetPayout: number
  totalCostAndDeductions: number
  netProfit: number
  netMarginPercent: number
  roiOnCostPercent: number
  breakEvenPrice: number
  suggestedPrice: number
  suggestedFixedFeeAmount: number
  profitAtSuggested: number
}

export type MlPricingRowResult = {
  unitCost: number
  packagingCost: number
  laborCost: number
  baseAcquisitionCost: number
  lossPercent: number
  lossReserveAmount: number
  adjustedAcquisitionCost: number
  taxPercent: number
  shippingCost: number
  targetMarginPercent: number
  salePrice: number
  stockBalance: number
  activeListingType: MlListingType
  classic: MlPricingTierBreakdown
  premium: MlPricingTierBreakdown
  active: MlPricingTierBreakdown
  potentialStockRevenue: number
  potentialStockNetProfit: number
  marginHealth: 'EMPTY' | 'NEGATIVE' | 'BELOW_TARGET' | 'HEALTHY'
}

function resolveMlFixedFee(
  price: number,
  mode: MlFixedFeeMode,
  configuredFee: number,
): { fee: number; exempt: boolean } {
  const cleanFee = Math.max(0, round2(configuredFee))
  if (mode === 'EXEMPT') {
    return { fee: 0, exempt: true }
  }
  if (mode === 'MANUAL') {
    return { fee: cleanFee, exempt: cleanFee === 0 }
  }
  // AUTO_79: abaixo de R$ 79 cobra taxa fixa escalonada do ML (R$ 6,25 / R$ 6,50 / R$ 6,75); >= R$ 79 fica isento
  if (price >= ML_THRESHOLD_FREE_FIXED_FEE) {
    return { fee: 0, exempt: true }
  }
  const banded = getMlFixedFeeByPrice(price > 0 ? price : 39.9, true)
  return { fee: banded.fee, exempt: false }
}

function computeSuggestedPriceForMlTier(params: {
  adjustedAcquisitionCost: number
  shippingCost: number
  taxPercent: number
  mlPercent: number
  targetMarginPercent: number
  mlFixedFeeMode: MlFixedFeeMode
  mlFixedFeeAmount: number
}): { suggestedPrice: number; suggestedFixedFee: number } {
  const {
    adjustedAcquisitionCost,
    shippingCost,
    taxPercent,
    mlPercent,
    targetMarginPercent,
    mlFixedFeeMode,
    mlFixedFeeAmount,
  } = params

  const totalPct = clampPercent(taxPercent + mlPercent + targetMarginPercent, 95)
  const divisor = 1 - totalPct / 100
  const safeDivisor = divisor > 0.03 ? divisor : 0.05
  const cleanFee = Math.max(0, round2(mlFixedFeeAmount))

  if (adjustedAcquisitionCost <= 0 && shippingCost <= 0) {
    return { suggestedPrice: 0, suggestedFixedFee: 0 }
  }

  if (mlFixedFeeMode === 'EXEMPT') {
    return {
      suggestedPrice: round2((adjustedAcquisitionCost + shippingCost) / safeDivisor),
      suggestedFixedFee: 0,
    }
  }

  if (mlFixedFeeMode === 'MANUAL') {
    return {
      suggestedPrice: round2((adjustedAcquisitionCost + shippingCost + cleanFee) / safeDivisor),
      suggestedFixedFee: cleanFee,
    }
  }

  // Modo AUTO_79 (usa as faixas oficiais R$ 6,25 / R$ 6,50 / R$ 6,75 < R$ 79)
  const basePlusShipping = round2(adjustedAcquisitionCost + shippingCost)
  const target = findMlTargetPrice(
    basePlusShipping,
    round2(taxPercent + mlPercent),
    targetMarginPercent,
    true,
    true,
  )
  if (target !== null && target > 0) {
    const { fee } = getMlFixedFeeByPrice(target, true)
    return { suggestedPrice: target, suggestedFixedFee: fee }
  }

  const priceWithoutFixedFee = round2(basePlusShipping / safeDivisor)
  const finalOver79 = Math.max(ML_THRESHOLD_FREE_FIXED_FEE, priceWithoutFixedFee)
  return { suggestedPrice: finalOver79, suggestedFixedFee: 0 }
}

function computeMlTierBreakdown(params: {
  listingType: MlListingType
  label: string
  mlPercent: number
  adjustedAcquisitionCost: number
  shippingCost: number
  taxPercent: number
  targetMarginPercent: number
  mlFixedFeeMode: MlFixedFeeMode
  mlFixedFeeAmount: number
  salePrice: number
}): MlPricingTierBreakdown {
  const {
    listingType,
    label,
    mlPercent,
    adjustedAcquisitionCost,
    shippingCost,
    taxPercent,
    targetMarginPercent,
    mlFixedFeeMode,
    mlFixedFeeAmount,
    salePrice,
  } = params

  const { suggestedPrice, suggestedFixedFee } = computeSuggestedPriceForMlTier({
    adjustedAcquisitionCost,
    shippingCost,
    taxPercent,
    mlPercent,
    targetMarginPercent,
    mlFixedFeeMode,
    mlFixedFeeAmount,
  })

  const { suggestedPrice: breakEvenPrice } = computeSuggestedPriceForMlTier({
    adjustedAcquisitionCost,
    shippingCost,
    taxPercent,
    mlPercent,
    targetMarginPercent: 0,
    mlFixedFeeMode,
    mlFixedFeeAmount,
  })

  const effectivePrice = salePrice > 0 ? round2(salePrice) : suggestedPrice
  const { fee: fixedFeeAmount, exempt: isExemptFromFixedFee } = resolveMlFixedFee(
    effectivePrice,
    mlFixedFeeMode,
    mlFixedFeeAmount,
  )

  const commissionAmount = round2(effectivePrice * (mlPercent / 100))
  const totalMlFeesAmount = round2(commissionAmount + fixedFeeAmount)
  const taxAmount = round2(effectivePrice * (taxPercent / 100))
  const shippingAmount = round2(shippingCost)

  const mlNetPayout = round2(effectivePrice - totalMlFeesAmount - shippingAmount)
  const totalCostAndDeductions = round2(
    adjustedAcquisitionCost + taxAmount + totalMlFeesAmount + shippingAmount,
  )
  const netProfit = round2(effectivePrice - totalCostAndDeductions)
  const netMarginPercent =
    effectivePrice > 0 ? round2((netProfit / effectivePrice) * 100) : 0
  const roiOnCostPercent =
    adjustedAcquisitionCost > 0 ? round2((netProfit / adjustedAcquisitionCost) * 100) : 0

  const suggestedCommission = round2(suggestedPrice * (mlPercent / 100))
  const suggestedTax = round2(suggestedPrice * (taxPercent / 100))
  const profitAtSuggested =
    suggestedPrice > 0
      ? round2(
          suggestedPrice -
            adjustedAcquisitionCost -
            shippingAmount -
            suggestedTax -
            suggestedCommission -
            suggestedFixedFee,
        )
      : 0

  return {
    listingType,
    label,
    mlPercent,
    salePrice: effectivePrice,
    commissionAmount,
    fixedFeeAmount,
    isExemptFromFixedFee,
    totalMlFeesAmount,
    taxAmount,
    shippingAmount,
    mlNetPayout,
    totalCostAndDeductions,
    netProfit,
    netMarginPercent,
    roiOnCostPercent,
    breakEvenPrice,
    suggestedPrice,
    suggestedFixedFeeAmount: suggestedFixedFee,
    profitAtSuggested,
  }
}

export function calculateMlPricingRow(input: MlPricingRowInput): MlPricingRowResult {
  const unitCost = Math.max(0, round2(num(input.unitCost)))
  const packagingCost = Math.max(0, round2(num(input.packagingCost)))
  const laborCost = Math.max(0, round2(num(input.laborCost)))
  const baseAcquisitionCost = round2(unitCost + packagingCost + laborCost)

  const lossPercent = clampPercent(num(input.lossPercent), 90)
  const adjustedAcquisitionCost =
    lossPercent > 0 ? round2(baseAcquisitionCost / (1 - lossPercent / 100)) : baseAcquisitionCost
  const lossReserveAmount = round2(Math.max(0, adjustedAcquisitionCost - baseAcquisitionCost))

  const taxPercent = clampPercent(num(input.taxPercent), 60)
  const mlClassicPercent = clampPercent(num(input.mlClassicPercent), 60)
  const mlPremiumPercent = clampPercent(num(input.mlPremiumPercent), 60)
  const shippingCost = Math.max(0, round2(num(input.shippingCost)))
  const targetMarginPercent = clampPercent(
    input.targetMarginPercent > 0 ? num(input.targetMarginPercent) : 20,
    80,
  )
  const salePrice = Math.max(0, round2(num(input.salePrice)))
  const stockBalance = Math.max(0, num(input.stockBalance))
  const activeListingType: MlListingType =
    input.mlListingType === 'PREMIUM' ? 'PREMIUM' : 'CLASSICO'
  const mlFixedFeeMode: MlFixedFeeMode = input.mlFixedFeeMode ?? 'AUTO_79'
  const mlFixedFeeAmount = Math.max(0, round2(num(input.mlFixedFeeAmount)))

  const classic = computeMlTierBreakdown({
    listingType: 'CLASSICO',
    label: 'ML Clássico',
    mlPercent: mlClassicPercent,
    adjustedAcquisitionCost,
    shippingCost,
    taxPercent,
    targetMarginPercent,
    mlFixedFeeMode,
    mlFixedFeeAmount,
    salePrice,
  })

  const premium = computeMlTierBreakdown({
    listingType: 'PREMIUM',
    label: 'ML Premium (Sem Juros)',
    mlPercent: mlPremiumPercent,
    adjustedAcquisitionCost,
    shippingCost,
    taxPercent,
    targetMarginPercent,
    mlFixedFeeMode,
    mlFixedFeeAmount,
    salePrice,
  })

  const active = activeListingType === 'PREMIUM' ? premium : classic

  const marginHealth: MlPricingRowResult['marginHealth'] =
    unitCost <= 0 && salePrice <= 0
      ? 'EMPTY'
      : active.netProfit < 0
        ? 'NEGATIVE'
        : active.netMarginPercent < targetMarginPercent - 0.1
          ? 'BELOW_TARGET'
          : 'HEALTHY'

  return {
    unitCost,
    packagingCost,
    laborCost,
    baseAcquisitionCost,
    lossPercent,
    lossReserveAmount,
    adjustedAcquisitionCost,
    taxPercent,
    shippingCost,
    targetMarginPercent,
    salePrice,
    stockBalance,
    activeListingType,
    classic,
    premium,
    active,
    potentialStockRevenue: round2(stockBalance * active.salePrice),
    potentialStockNetProfit: round2(stockBalance * active.netProfit),
    marginHealth,
  }
}
