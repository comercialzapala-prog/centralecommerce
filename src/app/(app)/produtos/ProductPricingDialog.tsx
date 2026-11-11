'use client'

import {
  AlertTriangle,
  Calculator,
  Check,
  ChevronDown,
  Flame,
  Info,
  Package,
  ShieldCheck,
  Sparkles,
  TrendingUp,
  Truck,
  X,
} from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useMemo, useState, useTransition } from 'react'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { formatCurrency, formatPercent, num, round2 } from '@/lib/format'
import {
  buildDefaultMonthlyTrack,
  calculateMlSimulatorComparison,
  calculateProductPricing,
  computeMonthlyCarouselChain,
  estimateMlShippingAndBag,
  ML_BAG_PRESETS,
  ML_DEFAULT_BURN_MARGIN_PERCENT,
  ML_DEFAULT_CLASSIC_PERCENT,
  ML_DEFAULT_TAX_PERCENT,
} from '@/lib/pricing'
import type { MonthlyCmvTrackEntry, ProductStats } from '@/lib/types'
import { cn } from '@/lib/utils'

import { saveProductPricingAction } from './actions'
import { MonthlyResidualCarousel } from './MonthlyResidualCarousel'
import type { PackagingOption } from './ProductForm'

const MARGIN_PRESETS = [15, 20, 25, 30, 35, 40, 50]
const BURN_MARGIN_PRESETS = [0, 5, 8, 10, 12, 15]

function resolveInitialUnitCost(product: ProductStats): number {
  const direct = num(product.unit_cost)
  if (direct > 0) return round2(direct)
  const track = product.monthly_cmv_track
  if (Array.isArray(track) && track.length > 0) {
    const chain = computeMonthlyCarouselChain(track, {
      extraUnitCosts: 0,
      lossPercent: num(product.loss_percent ?? 0),
      targetMarginPercent: num(product.target_margin_percent ?? 30) || 30,
    })
    const activeCost = chain[0]?.newWeightedCost ?? 0
    if (activeCost > 0) return round2(activeCost)
  }
  return 0
}

export function ProductPricingDialog({
  product,
  packagingOptions = [],
  triggerVariant = 'compact',
}: {
  product: ProductStats
  packagingOptions?: PackagingOption[]
  triggerVariant?: 'compact' | 'button'
}) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [confirmClosePrompt, setConfirmClosePrompt] = useState(false)
  const [pending, startTransition] = useTransition()
  const [feedback, setFeedback] = useState<{ ok: boolean; text: string } | null>(null)

  const initialEst = useMemo(
    () =>
      estimateMlShippingAndBag({
        grossWeightGrams: product.gross_weight_grams,
        netWeightGrams: product.net_weight_grams,
        lengthCm: product.length_cm,
        widthCm: product.width_cm,
        heightCm: product.height_cm,
        bagSku: product.linked_packaging_sku,
        bagName: product.linked_packaging_name,
      }),
    [
      product.gross_weight_grams,
      product.net_weight_grams,
      product.length_cm,
      product.width_cm,
      product.height_cm,
      product.linked_packaging_sku,
      product.linked_packaging_name,
    ],
  )

  // Entradas principais do Simulador
  const [unitCost, setUnitCost] = useState<number>(() => resolveInitialUnitCost(product))
  const [targetMarginPercent, setTargetMarginPercent] = useState<number>(() =>
    num(product.target_margin_percent ?? 30) > 0 ? num(product.target_margin_percent ?? 30) : 30,
  )
  const [burnMarginPercent, setBurnMarginPercent] = useState<number>(() =>
    product.burn_margin_percent !== undefined
      ? num(product.burn_margin_percent)
      : ML_DEFAULT_BURN_MARGIN_PERCENT,
  )
  const [burnManualPrice, setBurnManualPrice] = useState<number>(() =>
    num(product.burn_price_override ?? 0),
  )

  // Despesas e Taxas do Mercado Livre
  const [packagingCost, setPackagingCost] = useState<number>(() =>
    num(product.packaging_cost) > 0
      ? num(product.packaging_cost)
      : initialEst.recommendedBag.defaultCost,
  )
  const [shippingCost, setShippingCost] = useState<number>(() => num(product.shipping_cost))
  const [laborCost, setLaborCost] = useState<number>(() => num(product.labor_cost))
  const [lossPercent, setLossPercent] = useState<number>(() => num(product.loss_percent ?? 2))

  const [marketplacePercent, setMarketplacePercent] = useState<number>(() =>
    num(product.marketplace_percent) > 0
      ? num(product.marketplace_percent)
      : ML_DEFAULT_CLASSIC_PERCENT,
  )
  const [taxPercent, setTaxPercent] = useState<number>(() =>
    num(product.tax_percent) > 0 ? num(product.tax_percent) : ML_DEFAULT_TAX_PERCENT,
  )
  const [includeMlFixedFee, setIncludeMlFixedFee] = useState<boolean>(() =>
    product.include_ml_fixed_fee !== undefined ? Boolean(product.include_ml_fixed_fee) : true,
  )

  // Sacola selecionada
  const [selectedBagId, setSelectedBagId] = useState<string>(() => {
    if (product.linked_packaging_product_id) return product.linked_packaging_product_id
    const matched = packagingOptions.find(
      (b) =>
        (b.sku ?? '').toUpperCase() === initialEst.recommendedBag.code ||
        b.name.toUpperCase().includes(initialEst.recommendedBag.code.replace('SAC-', 'SACOLA ')),
    )
    return matched?.id ?? initialEst.recommendedBag.code
  })
  const [linkedBagQty] = useState<number>(() => Math.max(1, num(product.linked_packaging_qty ?? 1)))
  const [grossWeightGrams, setGrossWeightGrams] = useState<number>(() => initialEst.physicalWeightGrams)
  const [lengthCm, setLengthCm] = useState<number>(() => initialEst.lengthCm)
  const [widthCm, setWidthCm] = useState<number>(() => initialEst.widthCm)
  const [heightCm, setHeightCm] = useState<number>(() => initialEst.heightCm)

  const [carouselEntries, setCarouselEntries] = useState<MonthlyCmvTrackEntry[]>(() =>
    buildDefaultMonthlyTrack({
      initialStock: Math.max(0, num(product.stock_balance)),
      unitCost: resolveInitialUnitCost(product),
      salePrice: num(product.sale_price),
      existingTrack: product.monthly_cmv_track,
    }),
  )

  const effectiveUnitCost = unitCost > 0 ? unitCost : resolveInitialUnitCost(product)

  // Cálculo assertivo do Mercado Livre (Venda Normal vs. Queima vs. Piso)
  const mlSim = useMemo(
    () =>
      calculateMlSimulatorComparison({
        purchaseCost: effectiveUnitCost,
        packagingCost,
        shippingCost,
        laborCost,
        lossPercent,
        commissionPercent: marketplacePercent,
        taxPercent,
        includeFixedFee: includeMlFixedFee,
        normalMarginTargetPercent: targetMarginPercent,
        burnMarginTargetPercent: burnMarginPercent,
        burnManualPrice: burnManualPrice > 0 ? burnManualPrice : null,
        competitorAvgPrice: num(product.competitor_avg_price ?? 0),
      }),
    [
      effectiveUnitCost,
      packagingCost,
      shippingCost,
      laborCost,
      lossPercent,
      marketplacePercent,
      taxPercent,
      includeMlFixedFee,
      targetMarginPercent,
      burnMarginPercent,
      burnManualPrice,
      product.competitor_avg_price,
    ],
  )

  const pricing = useMemo(
    () =>
      calculateProductPricing({
        unitCost: effectiveUnitCost,
        shippingCost,
        packagingCost,
        laborCost,
        lossPercent,
        targetMarginPercent,
        marketplacePercent,
        taxPercent,
        includeFixedFee: includeMlFixedFee,
        currentSalePrice: num(product.sale_price),
        stockBalance: num(product.stock_balance),
        qtySold: num(product.qty_sold),
      }),
    [
      effectiveUnitCost,
      shippingCost,
      packagingCost,
      laborCost,
      lossPercent,
      targetMarginPercent,
      marketplacePercent,
      taxPercent,
      includeMlFixedFee,
      product.sale_price,
      product.stock_balance,
      product.qty_sold,
    ],
  )

  function handleSelectBag(bagValue: string) {
    setSelectedBagId(bagValue)
    const dbBag = packagingOptions.find((b) => b.id === bagValue)
    const presetBag = ML_BAG_PRESETS.find(
      (p) =>
        p.code === bagValue ||
        (dbBag?.sku ?? '').toUpperCase() === p.code ||
        (dbBag?.name ?? '').toUpperCase().includes(p.code.replace('SAC-', 'SACOLA ')),
    )
    const unitBagCost =
      dbBag && num(dbBag.unit_cost) > 0 ? num(dbBag.unit_cost) : presetBag?.defaultCost ?? packagingCost
    setPackagingCost(round2(unitBagCost * Math.max(1, linkedBagQty)))
    if (presetBag) {
      setLengthCm(presetBag.lengthCm)
      setWidthCm(presetBag.widthCm)
      setHeightCm(presetBag.heightCm)
    }
  }

  function handleBackdropClick() {
    setConfirmClosePrompt(true)
  }

  function handleRequestClose() {
    setConfirmClosePrompt(true)
  }

  function confirmCloseNow() {
    setConfirmClosePrompt(false)
    setOpen(false)
  }

  function handleSave(applyPriceValue?: number | null, shouldClose = true) {
    setFeedback(null)
    const resolvedDbBag = packagingOptions.find((b) => b.id === selectedBagId)
    startTransition(async () => {
      const res = await saveProductPricingAction({
        productId: product.product_id,
        unitCost: effectiveUnitCost,
        shippingCost,
        packagingCost,
        laborCost,
        lossPercent,
        targetMarginPercent,
        burnMarginPercent,
        burnPriceOverride: burnManualPrice > 0 ? burnManualPrice : null,
        competitorAvgPrice: num(product.competitor_avg_price ?? 0),
        includeMlFixedFee,
        marketplacePercent,
        taxPercent,
        linkedPackagingProductId: resolvedDbBag ? resolvedDbBag.id : product.linked_packaging_product_id,
        linkedPackagingQty: linkedBagQty,
        grossWeightGrams,
        lengthCm,
        widthCm,
        heightCm,
        monthlyTrack: carouselEntries,
        applySalePrice: applyPriceValue,
      })
      setFeedback({ ok: res.ok, text: res.message })
      if (res.ok) {
        setConfirmClosePrompt(false)
        if (shouldClose) {
          setOpen(false)
        }
        router.refresh()
      }
    })
  }

  return (
    <>
      {triggerVariant === 'button' ? (
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => {
            setConfirmClosePrompt(false)
            setOpen(true)
          }}
        >
          <Calculator className="size-3.5 text-emerald-600" />
          Simulador de Precificação Mercado Livre
        </Button>
      ) : (
        <button
          type="button"
          onClick={() => {
            setConfirmClosePrompt(false)
            setOpen(true)
          }}
          className="inline-flex items-center gap-1 rounded-md border border-emerald-500/30 bg-emerald-500/10 px-2 py-1 text-[11px] font-medium text-emerald-800 transition-colors hover:bg-emerald-500/20 dark:text-emerald-300"
          title="Abrir simulador assertivo de taxas do Mercado Livre"
        >
          <Calculator className="size-3" />
          <span>Precificar ML</span>
        </button>
      )}

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-3 backdrop-blur-xs"
          onClick={handleBackdropClick}
        >
          <div
            className="max-h-[94vh] w-full max-w-4xl overflow-y-auto rounded-2xl border bg-background p-5 text-left shadow-2xl space-y-4"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Aviso de Confirmação ao Fechar */}
            {confirmClosePrompt && (
              <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border-2 border-amber-500 bg-amber-500/15 px-4 py-3 text-xs shadow-md">
                <div className="flex items-center gap-2 font-semibold text-amber-950 dark:text-amber-200">
                  <AlertTriangle className="size-4 shrink-0 text-amber-600" />
                  <span>Deseja fechar o simulador de precificação?</span>
                </div>
                <div className="flex items-center gap-2">
                  <Button type="button" size="sm" variant="default" onClick={() => setConfirmClosePrompt(false)}>
                    Continuar Editando
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() => handleSave(pricing.suggestedPrice, true)}
                    disabled={pending}
                  >
                    <Check className="size-3.5" />
                    {pending ? 'Salvando...' : 'Salvar e Fechar'}
                  </Button>
                  <Button type="button" size="sm" variant="destructive" onClick={confirmCloseNow} disabled={pending}>
                    Fechar sem Salvar
                  </Button>
                </div>
              </div>
            )}

            {/* Mensagem de Feedback (Erro ou Sucesso) */}
            {feedback && (
              <div
                className={cn(
                  'rounded-lg border px-3 py-2 text-xs font-semibold',
                  feedback.ok
                    ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-800 dark:text-emerald-300'
                    : 'border-destructive/40 bg-destructive/10 text-destructive',
                )}
              >
                {feedback.text}
              </div>
            )}

            {/* Cabeçalho Limpo */}
            <div className="flex items-start justify-between gap-3 border-b pb-3">
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="inline-flex items-center gap-1 rounded-md bg-emerald-500/15 px-2 py-0.5 text-xs font-semibold text-emerald-700 dark:text-emerald-300">
                    <Calculator className="size-3.5" />
                    Simulador Assertivo de Taxas &amp; Preços — Mercado Livre
                  </span>
                  {product.sku && (
                    <span className="font-mono text-xs text-muted-foreground font-semibold">SKU {product.sku}</span>
                  )}
                  {product.supplier_sku && (
                    <span className="font-mono text-xs text-muted-foreground">Ref. Petrus {product.supplier_sku}</span>
                  )}
                </div>
                <h2 className="mt-1 text-lg font-bold text-foreground">{product.name}</h2>
                <p className="text-xs text-muted-foreground">
                  Altere o custo pago ou as margens abaixo para ver instantaneamente para onde vai cada centavo de taxa do Mercado Livre.
                </p>
              </div>
              <button
                type="button"
                onClick={handleRequestClose}
                className="rounded-lg p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
                title="Fechar"
              >
                <X className="size-4" />
              </button>
            </div>

            {/* BLOCO 1: ENTRADAS DIRETAS (CUSTO PAGO + MARGEM NORMAL + MARGEM DE QUEIMA) */}
            <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
              {/* 1. Preço Pago no Produto */}
              <div className="rounded-xl border-2 border-sky-500/40 bg-sky-500/5 p-3.5 space-y-2">
                <div className="flex items-center justify-between">
                  <Label htmlFor="sim-cost" className="text-xs font-bold text-foreground">
                    1. Custo de Compra (R$/un.)
                  </Label>
                  <span className="rounded bg-sky-500/20 px-1.5 py-0.5 font-mono text-[10px] font-semibold text-sky-700 dark:text-sky-300">
                    Pago c/ IPI
                  </span>
                </div>
                <Input
                  id="sim-cost"
                  type="number"
                  step="0.01"
                  min={0}
                  value={effectiveUnitCost || ''}
                  onChange={(e) => setUnitCost(Math.max(0, Number(e.target.value)))}
                  className="h-10 font-mono text-lg font-extrabold border-sky-500/60 bg-background"
                />
                <p className="text-[11px] text-muted-foreground">
                  Valor pago de fábrica (ex.: R$ 24,91 + 13% IPI = R$ 28,15).
                </p>
              </div>

              {/* 2. Margem Normal Desejada (%) */}
              <div className="rounded-xl border-2 border-emerald-500/40 bg-emerald-500/5 p-3.5 space-y-2">
                <div className="flex items-center justify-between">
                  <Label htmlFor="sim-margin" className="text-xs font-bold text-emerald-800 dark:text-emerald-300">
                    2. Margem Venda Normal (%)
                  </Label>
                  <span className="font-mono text-[11px] font-semibold text-emerald-700 dark:text-emerald-300">
                    Lucro no Bolso
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <Input
                    id="sim-margin"
                    type="number"
                    min={0}
                    max={80}
                    step="any"
                    value={targetMarginPercent}
                    onChange={(e) => setTargetMarginPercent(Math.max(0, Number(e.target.value)))}
                    className="h-10 w-24 font-mono text-lg font-extrabold border-emerald-500/60 bg-background"
                  />
                  <div className="flex flex-wrap gap-1">
                    {MARGIN_PRESETS.map((pct) => (
                      <button
                        key={pct}
                        type="button"
                        onClick={() => setTargetMarginPercent(pct)}
                        className={cn(
                          'rounded-md px-2 py-1 text-xs font-semibold transition-colors',
                          targetMarginPercent === pct ? 'bg-emerald-600 text-white' : 'border bg-background hover:bg-muted',
                        )}
                      >
                        {pct}%
                      </button>
                    ))}
                  </div>
                </div>
                <p className="text-[11px] text-muted-foreground">Margem líquida padrão desejada para vendas regulares.</p>
              </div>

              {/* 3. Margem na Queima p/ Ranquear (%) */}
              <div className="rounded-xl border-2 border-amber-500/50 bg-amber-500/10 p-3.5 space-y-2">
                <div className="flex items-center justify-between">
                  <Label htmlFor="sim-burn" className="text-xs font-bold text-amber-900 dark:text-amber-200">
                    3. Margem na Queima (%)
                  </Label>
                  <span className="inline-flex items-center gap-1 font-mono text-[11px] font-bold text-amber-800 dark:text-amber-300">
                    <Flame className="size-3.5 text-amber-600" />
                    Giro Rápido ML
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <Input
                    id="sim-burn"
                    type="number"
                    min={0}
                    max={80}
                    step="any"
                    value={burnMarginPercent}
                    onChange={(e) => {
                      setBurnManualPrice(0)
                      setBurnMarginPercent(Math.max(0, Number(e.target.value)))
                    }}
                    className="h-10 w-20 font-mono text-lg font-extrabold border-amber-500/60 bg-background"
                  />
                  <div className="flex flex-wrap gap-1">
                    {BURN_MARGIN_PRESETS.map((pct) => (
                      <button
                        key={pct}
                        type="button"
                        onClick={() => {
                          setBurnManualPrice(0)
                          setBurnMarginPercent(pct)
                        }}
                        className={cn(
                          'rounded-md px-2 py-1 text-xs font-semibold transition-colors',
                          burnMarginPercent === pct && burnManualPrice === 0
                            ? 'bg-amber-600 text-white'
                            : 'border bg-background hover:bg-muted',
                        )}
                      >
                        {pct}%
                      </button>
                    ))}
                  </div>
                </div>
                <p className="text-[11px] text-muted-foreground">Preço agressivo para tracionar o anúncio e gerar avaliações.</p>
              </div>
            </div>

            {/* BLOCO 2: OS 3 PREÇOS DE RESULTADO (VENDA NORMAL vs. QUEIMA vs. PISO) */}
            <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
              {/* Card 1: Venda Normal */}
              <div className="rounded-xl border-2 border-emerald-600/50 bg-emerald-500/10 p-4 shadow-xs">
                <div className="flex items-center justify-between text-xs font-bold text-emerald-800 dark:text-emerald-300">
                  <span className="flex items-center gap-1.5">
                    <TrendingUp className="size-4" />
                    Preço Venda Normal ({targetMarginPercent}%)
                  </span>
                  <span className="rounded bg-emerald-600 text-white px-1.5 py-0.5 text-[10px]">Recomendado</span>
                </div>
                <div className="mt-2 text-3xl font-extrabold tabular-nums text-foreground">
                  {mlSim.normal ? formatCurrency(mlSim.normal.price) : 'R$ 0,00'}
                </div>
                {mlSim.normal ? (
                  <div className="mt-2 space-y-1 text-xs">
                    <div className="font-bold text-emerald-700 dark:text-emerald-300">
                      Sobra no bolso: +{formatCurrency(mlSim.normal.profit)} ({formatPercent(mlSim.normal.marginPercent)})
                    </div>
                    <div className="text-[11px] text-muted-foreground">
                      Custo c/ taxas ML: {formatCurrency(mlSim.normal.totalCost)}
                    </div>
                  </div>
                ) : null}
              </div>

              {/* Card 2: Venda na Queima */}
              <div className="rounded-xl border-2 border-amber-500/70 bg-amber-500/15 p-4 shadow-xs">
                <div className="flex items-center justify-between text-xs font-bold text-amber-900 dark:text-amber-200">
                  <span className="flex items-center gap-1.5">
                    <Flame className="size-4 text-amber-600" />
                    Preço na Queima ({burnMarginPercent}%)
                  </span>
                  <span className="rounded bg-amber-600 text-white px-1.5 py-0.5 text-[10px]">Ranquear</span>
                </div>
                <div className="mt-2 text-3xl font-extrabold tabular-nums text-foreground">
                  {mlSim.burn ? formatCurrency(mlSim.burn.price) : 'R$ 0,00'}
                </div>
                {mlSim.burn ? (
                  <div className="mt-2 space-y-1 text-xs">
                    <div
                      className={cn(
                        'font-bold',
                        mlSim.burn.profit >= 0 ? 'text-emerald-700 dark:text-emerald-300' : 'text-rose-600',
                      )}
                    >
                      Sobra no bolso: +{formatCurrency(mlSim.burn.profit)} ({formatPercent(mlSim.burn.marginPercent)})
                    </div>
                    {mlSim.priceDiscount !== null && (
                      <div className="text-[11px] text-amber-800 dark:text-amber-300 font-semibold">
                        Desconto vs. normal: -{formatCurrency(Math.abs(mlSim.priceDiscount))} ({mlSim.priceDiscountPercent}%)
                      </div>
                    )}
                  </div>
                ) : null}
              </div>

              {/* Card 3: Piso sem Prejuízo */}
              <div className="rounded-xl border-2 border-sky-500/30 bg-muted/30 p-4 shadow-xs">
                <div className="flex items-center justify-between text-xs font-semibold text-muted-foreground">
                  <span className="flex items-center gap-1.5">
                    <ShieldCheck className="size-4 text-sky-600" />
                    Piso sem Prejuízo (0% Margem)
                  </span>
                  <span className="text-[10px]">Break-even</span>
                </div>
                <div className="mt-2 text-3xl font-extrabold tabular-nums text-foreground">
                  {mlSim.floorPrice ? formatCurrency(mlSim.floorPrice) : 'R$ 0,00'}
                </div>
                <div className="mt-2 text-xs text-muted-foreground">
                  Preço mínimo absoluto no ML p/ empatar custos e taxas (Lucro R$ 0,00).
                </div>
              </div>
            </div>

            {/* BLOCO 3: RAIO-X COMPLETO DAS TAXAS E DEDUÇÕES DO MERCADO LIVRE (TABELA LADO A LADO) */}
            <div className="rounded-xl border bg-card overflow-hidden">
              <div className="flex flex-wrap items-center justify-between gap-2 border-b bg-muted/40 px-4 py-2.5">
                <div>
                  <h3 className="text-xs font-bold text-foreground">
                    Raio-X de Custos e Taxas Exatas do Mercado Livre (Composição por Unidade)
                  </h3>
                  <p className="text-[11px] text-muted-foreground">
                    Veja exatamente para onde vai cada centavo entre o preço anunciado e o que cai limpo na sua conta.
                  </p>
                </div>
                <span className="rounded bg-sky-500/10 px-2 py-0.5 font-mono text-[11px] font-semibold text-sky-700 dark:text-sky-300">
                  Taxas ML: {marketplacePercent}% comissão + {taxPercent}% imposto + R$ 6,50 taxa fixa
                </span>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b bg-muted/20 text-left text-[11px] text-muted-foreground">
                      <th className="px-3.5 py-2">Item da Composição</th>
                      <th className="px-3.5 py-2 text-right bg-amber-500/10 text-amber-900 dark:text-amber-200">
                        Venda na Queima ({burnMarginPercent}%)
                      </th>
                      <th className="px-3.5 py-2 text-right bg-emerald-500/10 text-emerald-900 dark:text-emerald-200">
                        Venda Normal ({targetMarginPercent}%)
                      </th>
                      <th className="px-3.5 py-2 text-left hidden sm:table-cell">Explicação / Detalhe</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y font-mono text-xs">
                    {/* Preço de Venda */}
                    <tr className="font-extrabold bg-muted/15 text-sm">
                      <th className="px-3.5 py-2.5 text-left font-sans">1. Preço Anunciado no ML</th>
                      <td className="px-3.5 py-2.5 text-right bg-amber-500/10 text-amber-900 dark:text-amber-200">
                        {mlSim.burn ? formatCurrency(mlSim.burn.price) : '—'}
                      </td>
                      <td className="px-3.5 py-2.5 text-right bg-emerald-500/10 text-emerald-900 dark:text-emerald-200">
                        {mlSim.normal ? formatCurrency(mlSim.normal.price) : '—'}
                      </td>
                      <td className="px-3.5 py-2.5 text-left font-sans text-[11px] font-normal text-muted-foreground hidden sm:table-cell">
                        Valor final que o cliente paga no anúncio
                      </td>
                    </tr>

                    {/* Custo de Compra */}
                    <tr>
                      <th className="px-3.5 py-1.5 text-left font-sans font-normal text-muted-foreground">
                        (-) Custo do Produto Pago
                      </th>
                      <td className="px-3.5 py-1.5 text-right text-rose-600">-{formatCurrency(effectiveUnitCost)}</td>
                      <td className="px-3.5 py-1.5 text-right text-rose-600">-{formatCurrency(effectiveUnitCost)}</td>
                      <td className="px-3.5 py-1.5 text-left font-sans text-[11px] text-muted-foreground hidden sm:table-cell">
                        Preço pago ao fornecedor (com IPI incluso)
                      </td>
                    </tr>

                    {/* Sacola / Embalagem */}
                    <tr>
                      <th className="px-3.5 py-1.5 text-left font-sans font-normal text-muted-foreground">
                        (-) Sacola / Embalagem
                      </th>
                      <td className="px-3.5 py-1.5 text-right text-rose-600">-{formatCurrency(packagingCost)}</td>
                      <td className="px-3.5 py-1.5 text-right text-rose-600">-{formatCurrency(packagingCost)}</td>
                      <td className="px-3.5 py-1.5 text-left font-sans text-[11px] text-muted-foreground hidden sm:table-cell">
                        Sacola vinculada ({initialEst.recommendedBag.name})
                      </td>
                    </tr>

                    {/* Perda / Quebra */}
                    {lossPercent > 0 && (
                      <tr>
                        <th className="px-3.5 py-1.5 text-left font-sans font-normal text-muted-foreground">
                          (-) Reserva de Quebra / Perda ({lossPercent}%)
                        </th>
                        <td className="px-3.5 py-1.5 text-right text-rose-600">-{formatCurrency(pricing.lossReserveAmount)}</td>
                        <td className="px-3.5 py-1.5 text-right text-rose-600">-{formatCurrency(pricing.lossReserveAmount)}</td>
                        <td className="px-3.5 py-1.5 text-left font-sans text-[11px] text-muted-foreground hidden sm:table-cell">
                          Provisão para peças danificadas no transporte
                        </td>
                      </tr>
                    )}

                    {/* Taxa Fixa ML (< R$ 79) */}
                    <tr className="bg-sky-500/5">
                      <th className="px-3.5 py-1.5 text-left font-sans font-bold text-sky-900 dark:text-sky-200">
                        (-) Taxa Fixa ML (&lt; R$ 79,90)
                      </th>
                      <td className="px-3.5 py-1.5 text-right text-rose-600 font-bold">
                        {mlSim.burn ? `-${formatCurrency(mlSim.burn.fee)}` : '—'}
                      </td>
                      <td className="px-3.5 py-1.5 text-right text-rose-600 font-bold">
                        {mlSim.normal ? `-${formatCurrency(mlSim.normal.fee)}` : '—'}
                      </td>
                      <td className="px-3.5 py-1.5 text-left font-sans text-[11px] text-sky-800 dark:text-sky-300 font-medium hidden sm:table-cell">
                        Tarifa de envio obrigatória do ML por unidade (R$ 6,50)
                      </td>
                    </tr>

                    {/* Comissão ML */}
                    <tr>
                      <th className="px-3.5 py-1.5 text-left font-sans font-normal text-muted-foreground">
                        (-) Comissão ML ({marketplacePercent}%)
                      </th>
                      <td className="px-3.5 py-1.5 text-right text-rose-600">
                        {mlSim.burn ? `-${formatCurrency(round2(mlSim.burn.price * (marketplacePercent / 100)))}` : '—'}
                      </td>
                      <td className="px-3.5 py-1.5 text-right text-rose-600">
                        {mlSim.normal ? `-${formatCurrency(round2(mlSim.normal.price * (marketplacePercent / 100)))}` : '—'}
                      </td>
                      <td className="px-3.5 py-1.5 text-left font-sans text-[11px] text-muted-foreground hidden sm:table-cell">
                        Tarifa de venda do Mercado Livre (anúncio Clássico)
                      </td>
                    </tr>

                    {/* Imposto NF */}
                    <tr>
                      <th className="px-3.5 py-1.5 text-left font-sans font-normal text-muted-foreground">
                        (-) Imposto NF Simples ({taxPercent}%)
                      </th>
                      <td className="px-3.5 py-1.5 text-right text-rose-600">
                        {mlSim.burn ? `-${formatCurrency(round2(mlSim.burn.price * (taxPercent / 100)))}` : '—'}
                      </td>
                      <td className="px-3.5 py-1.5 text-right text-rose-600">
                        {mlSim.normal ? `-${formatCurrency(round2(mlSim.normal.price * (taxPercent / 100)))}` : '—'}
                      </td>
                      <td className="px-3.5 py-1.5 text-left font-sans text-[11px] text-muted-foreground hidden sm:table-cell">
                        Alíquota Simples Nacional sobre a nota emitida
                      </td>
                    </tr>

                    {/* Total de Custos */}
                    <tr className="font-bold border-t-2">
                      <th className="px-3.5 py-2 text-left font-sans">Total Custos + Taxas ML</th>
                      <td className="px-3.5 py-2 text-right text-muted-foreground">
                        {mlSim.burn ? formatCurrency(mlSim.burn.totalCost) : '—'}
                      </td>
                      <td className="px-3.5 py-2 text-right text-muted-foreground">
                        {mlSim.normal ? formatCurrency(mlSim.normal.totalCost) : '—'}
                      </td>
                      <td className="px-3.5 py-2 text-left font-sans text-[11px] text-muted-foreground hidden sm:table-cell">
                        Soma de todas as despesas da venda
                      </td>
                    </tr>

                    {/* Lucro Líquido */}
                    <tr className="font-extrabold bg-emerald-500/10 text-sm">
                      <th className="px-3.5 py-2.5 text-left font-sans text-emerald-950 dark:text-emerald-100">
                        (=) Lucro Líquido no Bolso
                      </th>
                      <td className="px-3.5 py-2.5 text-right text-emerald-700 dark:text-emerald-300">
                        {mlSim.burn ? `+${formatCurrency(mlSim.burn.profit)}` : '—'}
                      </td>
                      <td className="px-3.5 py-2.5 text-right text-emerald-700 dark:text-emerald-300">
                        {mlSim.normal ? `+${formatCurrency(mlSim.normal.profit)}` : '—'}
                      </td>
                      <td className="px-3.5 py-2.5 text-left font-sans text-[11px] font-semibold text-emerald-800 dark:text-emerald-200 hidden sm:table-cell">
                        Quanto sobra limpo por unidade vendida
                      </td>
                    </tr>

                    {/* Margem Líquida Real */}
                    <tr className="font-bold bg-emerald-500/5">
                      <th className="px-3.5 py-2 text-left font-sans">Margem Líquida Real</th>
                      <td className="px-3.5 py-2 text-right text-amber-700 dark:text-amber-300">
                        {mlSim.burn ? formatPercent(mlSim.burn.marginPercent) : '—'}
                      </td>
                      <td className="px-3.5 py-2 text-right text-emerald-700 dark:text-emerald-300">
                        {mlSim.normal ? formatPercent(mlSim.normal.marginPercent) : '—'}
                      </td>
                      <td className="px-3.5 py-2 text-left font-sans text-[11px] text-muted-foreground hidden sm:table-cell">
                        Percentual do faturamento que fica para a loja
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>

            {/* BLOCO 4: PARÂMETROS ADICIONAIS (SACOLA, IMPOSTO, TAXA FIXA) */}
            <div className="rounded-xl border bg-muted/20 p-3 space-y-2">
              <div className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground">
                <Info className="size-3.5" />
                <span>Parâmetros de Cálculo da Venda:</span>
              </div>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 text-xs">
                <div>
                  <Label className="text-[10px] text-muted-foreground">Sacola / Embalagem</Label>
                  <select
                    value={selectedBagId}
                    onChange={(e) => handleSelectBag(e.target.value)}
                    className="mt-0.5 h-8 w-full rounded-md border bg-background px-2 font-medium text-xs"
                  >
                    {packagingOptions.length > 0 ? (
                      packagingOptions.map((opt) => (
                        <option key={opt.id} value={opt.id}>
                          {opt.name} ({formatCurrency(opt.unit_cost)})
                        </option>
                      ))
                    ) : (
                      ML_BAG_PRESETS.map((p) => (
                        <option key={p.code} value={p.code}>
                          {p.name} ({formatCurrency(p.defaultCost)})
                        </option>
                      ))
                    )}
                  </select>
                </div>

                <div>
                  <Label className="text-[10px] text-muted-foreground">Comissão ML (%)</Label>
                  <Input
                    type="number"
                    step="0.5"
                    value={marketplacePercent}
                    onChange={(e) => setMarketplacePercent(Math.max(0, Number(e.target.value)))}
                    className="mt-0.5 h-8 font-mono text-xs font-bold bg-background"
                  />
                </div>

                <div>
                  <Label className="text-[10px] text-muted-foreground">Imposto NF (%)</Label>
                  <Input
                    type="number"
                    step="0.5"
                    value={taxPercent}
                    onChange={(e) => setTaxPercent(Math.max(0, Number(e.target.value)))}
                    className="mt-0.5 h-8 font-mono text-xs font-bold bg-background"
                  />
                </div>

                <div className="flex flex-col justify-end">
                  <label className="flex items-center gap-2 cursor-pointer text-xs font-medium pb-1.5">
                    <input
                      type="checkbox"
                      checked={includeMlFixedFee}
                      onChange={(e) => setIncludeMlFixedFee(e.target.checked)}
                      className="size-4 rounded accent-sky-600"
                    />
                    <span>Taxa Fixa ML (R$ 6,50)</span>
                  </label>
                </div>
              </div>
            </div>

            {/* BLOCO 5: HISTÓRICO DE ESTOQUE RESIDUAL MÊS A MÊS (COLAPSADO POR PADRÃO PARA NÃO POLUIR) */}
            <details className="group rounded-xl border bg-muted/10 p-3 text-xs">
              <summary className="cursor-pointer font-bold text-xs text-muted-foreground hover:text-foreground flex items-center justify-between">
                <span>📊 Ver Carrossel de Estoque Residual Mês a Mês (Opcional)</span>
                <ChevronDown className="size-4 transition-transform group-open:rotate-180" />
              </summary>
              <div className="mt-3 pt-3 border-t">
                <MonthlyResidualCarousel
                  product={product}
                  externalUnitCost={effectiveUnitCost}
                  extraUnitCosts={shippingCost + packagingCost + laborCost}
                  lossPercent={lossPercent}
                  targetMarginPercent={targetMarginPercent}
                  onApplyWeightedCost={(newCost) => setUnitCost(newCost)}
                  onTrackEntriesChange={(nextEntries, activeWeightedCost) => {
                    setCarouselEntries(nextEntries)
                    if (activeWeightedCost > 0) setUnitCost(activeWeightedCost)
                  }}
                />
              </div>
            </details>

            {feedback && (
              <div
                className={cn(
                  'rounded-lg border px-3 py-2 text-xs',
                  feedback.ok ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-800' : 'border-destructive/40 bg-destructive/10 text-destructive',
                )}
              >
                {feedback.text}
              </div>
            )}

            {/* RODAPÉ ASSERTIVO DE AÇÕES */}
            <div className="flex flex-wrap items-center justify-between gap-2 border-t pt-3">
              <Button type="button" variant="outline" size="sm" onClick={handleRequestClose} disabled={pending}>
                Fechar
              </Button>
              <div className="flex flex-wrap items-center gap-2">
                {mlSim.burn && (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={pending}
                    onClick={() => handleSave(mlSim.burn?.price ?? null, true)}
                    className="border-amber-500 bg-amber-500/10 text-amber-900 hover:bg-amber-500/20 font-bold dark:text-amber-200"
                  >
                    <Flame className="size-3.5 text-amber-600" />
                    {pending ? 'Salvando...' : `Aplicar Preço de Queima (${formatCurrency(mlSim.burn.price)})`}
                  </Button>
                )}
                <Button
                  type="button"
                  size="sm"
                  disabled={pending}
                  onClick={() => handleSave(mlSim.normal?.price ?? pricing.suggestedPrice, true)}
                  className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold"
                >
                  <Sparkles className="size-3.5" />
                  {pending ? 'Salvando...' : `Aplicar Preço Normal Sugerido (${formatCurrency(mlSim.normal?.price ?? pricing.suggestedPrice)})`}
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
