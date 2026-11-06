'use client'

import { Calculator, Check, Sparkles, TrendingUp, X } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useMemo, useState, useTransition } from 'react'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { formatCurrency, formatNumber, formatPercent, num } from '@/lib/format'
import { calculateProductPricing } from '@/lib/pricing'
import type { ProductStats } from '@/lib/types'
import { cn } from '@/lib/utils'

import { registerWeightedBatchEntryAction, saveProductPricingAction } from './actions'

const MARGIN_PRESETS = [25, 30, 35, 40, 45, 50, 60]
const LOSS_PRESETS = [0, 3, 5, 10, 15]

export function ProductPricingDialog({
  product,
  triggerVariant = 'compact',
}: {
  product: ProductStats
  triggerVariant?: 'compact' | 'button'
}) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [pending, startTransition] = useTransition()
  const [feedback, setFeedback] = useState<{ ok: boolean; text: string } | null>(null)

  const [unitCost, setUnitCost] = useState(() => num(product.unit_cost))
  const [shippingCost, setShippingCost] = useState(() => num(product.shipping_cost))
  const [packagingCost, setPackagingCost] = useState(() => num(product.packaging_cost))
  const [laborCost, setLaborCost] = useState(() => num(product.labor_cost))
  const [lossPercent, setLossPercent] = useState(() => num(product.loss_percent ?? 0))
  const [targetMarginPercent, setTargetMarginPercent] = useState(() =>
    num(product.target_margin_percent ?? 30) > 0 ? num(product.target_margin_percent ?? 30) : 30,
  )
  const [marketplacePercent, setMarketplacePercent] = useState(() =>
    num(product.marketplace_percent),
  )
  const [taxPercent, setTaxPercent] = useState(() => num(product.tax_percent))
  const [residualQty, setResidualQty] = useState(() => Math.max(0, num(product.stock_balance)))
  const [newEntryQty, setNewEntryQty] = useState<number>(0)
  const [newEntryCost, setNewEntryCost] = useState<number>(0)

  const residualTotalValue = residualQty * unitCost
  const newEntryTotalValue = Math.max(0, newEntryQty) * Math.max(0, newEntryCost)
  const combinedStockQty = residualQty + Math.max(0, newEntryQty)
  const combinedStockValue = residualTotalValue + newEntryTotalValue
  const weightedAverageCost =
    combinedStockQty > 0 ? Number((combinedStockValue / combinedStockQty).toFixed(2)) : unitCost
  const weightedDiff = Number((weightedAverageCost - unitCost).toFixed(2))

  const totalLostOrDamaged = num(product.qty_lost) + num(product.qty_damaged)
  const totalBaseVolume = Math.max(
    num(product.qty_in),
    num(product.qty_sold) + totalLostOrDamaged,
  )
  const measuredLossPercent =
    totalBaseVolume > 0 ? Number(((totalLostOrDamaged / totalBaseVolume) * 100).toFixed(2)) : 0

  const pricing = useMemo(
    () =>
      calculateProductPricing({
        unitCost,
        shippingCost,
        packagingCost,
        laborCost,
        lossPercent,
        targetMarginPercent,
        marketplacePercent,
        taxPercent,
        currentSalePrice: num(product.sale_price),
        stockBalance: num(product.stock_balance),
        qtySold: num(product.qty_sold),
      }),
    [
      unitCost,
      shippingCost,
      packagingCost,
      laborCost,
      lossPercent,
      targetMarginPercent,
      marketplacePercent,
      taxPercent,
      product.sale_price,
      product.stock_balance,
      product.qty_sold,
    ],
  )

  function handleSave(applyPriceValue?: number | null) {
    setFeedback(null)
    startTransition(async () => {
      const res = await saveProductPricingAction({
        productId: product.product_id,
        unitCost,
        shippingCost,
        packagingCost,
        laborCost,
        lossPercent,
        targetMarginPercent,
        marketplacePercent,
        taxPercent,
        applySalePrice: applyPriceValue,
      })
      setFeedback({ ok: res.ok, text: res.message })
      if (res.ok) {
        router.refresh()
      }
    })
  }

  function handleRegisterWeightedEntry() {
    setFeedback(null)
    startTransition(async () => {
      const res = await registerWeightedBatchEntryAction({
        productId: product.product_id,
        entryQuantity: newEntryQty,
        entryUnitCost: newEntryCost,
        newWeightedUnitCost: weightedAverageCost,
      })
      setFeedback({ ok: res.ok, text: res.message })
      if (res.ok) {
        setUnitCost(weightedAverageCost)
        setResidualQty(combinedStockQty)
        setNewEntryQty(0)
        router.refresh()
      }
    })
  }

  return (
    <>
      {triggerVariant === 'button' ? (
        <Button type="button" variant="outline" size="sm" onClick={() => setOpen(true)}>
          <Calculator className="size-3.5 text-emerald-600" />
          Simulador de Margem &amp; Detalhes ({formatPercent(targetMarginPercent)})
        </Button>
      ) : (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="inline-flex items-center gap-1 rounded-md border border-emerald-500/30 bg-emerald-500/10 px-2 py-1 text-[11px] font-medium text-emerald-800 transition-colors hover:bg-emerald-500/20 dark:text-emerald-300"
          title="Abrir detalhes de custo, perda variável e margem pretendida"
        >
          <Calculator className="size-3" />
          <span>Detalhes</span>
        </button>
      )}

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-3 backdrop-blur-xs"
          onClick={() => setOpen(false)}
        >
          <div
            className="max-h-[92vh] w-full max-w-4xl overflow-y-auto rounded-2xl border bg-background p-5 text-left shadow-2xl space-y-5"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Cabeçalho */}
            <div className="flex items-start justify-between gap-3 border-b pb-3">
              <div>
                <div className="flex items-center gap-2">
                  <span className="inline-flex items-center gap-1 rounded-md bg-emerald-500/15 px-2 py-0.5 text-xs font-semibold text-emerald-700 dark:text-emerald-300">
                    <Calculator className="size-3.5" />
                    Precificação &amp; Margem Pretendida
                  </span>
                  {product.sku && (
                    <span className="font-mono text-xs text-muted-foreground">
                      SKU {product.sku}
                    </span>
                  )}
                </div>
                <h2 className="mt-1 text-base font-bold text-foreground">{product.name}</h2>
                <p className="text-xs text-muted-foreground">
                  Edite sua margem pretendida, perda variável, hora de trabalho, sacola e frete para
                  ver o valor ideal de venda e quanto vai sobrar no fim.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="rounded-lg p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
              >
                <X className="size-4" />
              </button>
            </div>

            {/* 1. Controles de Margem Pretendida e Perda Variável */}
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/5 p-3.5 space-y-2.5">
                <div className="flex items-center justify-between">
                  <Label htmlFor="sim-margin" className="text-xs font-semibold">
                    Margem Bruta Pretendida (%)
                  </Label>
                  <span className="font-mono text-[11px] text-emerald-700 dark:text-emerald-300">
                    Divide por {(1 - pricing.targetMarginPercent / 100).toFixed(2).replace('.', ',')}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <Input
                    id="sim-margin"
                    type="number"
                    min={0}
                    max={95}
                    step="any"
                    placeholder="Ex.: 30"
                    value={targetMarginPercent}
                    onChange={(e) => setTargetMarginPercent(Number(e.target.value))}
                    className="h-9 w-28 font-mono text-sm font-bold"
                  />
                  <div className="flex flex-wrap gap-1">
                    {MARGIN_PRESETS.map((pct) => (
                      <button
                        key={pct}
                        type="button"
                        onClick={() => setTargetMarginPercent(pct)}
                        className={cn(
                          'rounded-md px-2 py-1 text-xs font-medium transition-colors',
                          targetMarginPercent === pct
                            ? 'bg-emerald-600 text-white'
                            : 'border bg-background hover:bg-muted',
                        )}
                      >
                        {pct}%
                      </button>
                    ))}
                  </div>
                </div>
                <p className="text-[11px] text-muted-foreground">
                  Digite qualquer valor no campo acima (ex.: 27,5%, 30%, 42%) ou use um atalho.
                </p>
              </div>

              <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-3.5 space-y-2.5">
                <div className="flex items-center justify-between">
                  <Label htmlFor="sim-loss" className="text-xs font-semibold">
                    Custo Variável de Perda / Quebra (X%)
                  </Label>
                  <span className="font-mono text-[11px] text-amber-700 dark:text-amber-300">
                    Divide por {(1 - pricing.lossPercent / 100).toFixed(2).replace('.', ',')} (+
                    {formatCurrency(pricing.lossReserveAmount)})
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <Input
                    id="sim-loss"
                    type="number"
                    min={0}
                    max={90}
                    step="any"
                    placeholder="0%"
                    value={lossPercent}
                    onChange={(e) => setLossPercent(Number(e.target.value))}
                    className="h-9 w-28 font-mono text-sm font-bold"
                  />
                  <div className="flex flex-wrap gap-1">
                    {LOSS_PRESETS.map((pct) => (
                      <button
                        key={pct}
                        type="button"
                        onClick={() => setLossPercent(pct)}
                        className={cn(
                          'rounded-md px-2 py-1 text-xs font-medium transition-colors',
                          lossPercent === pct
                            ? 'bg-amber-600 text-white'
                            : 'border bg-background hover:bg-muted',
                        )}
                      >
                        {pct}%
                      </button>
                    ))}
                  </div>
                </div>
                <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] text-muted-foreground">
                  <span>
                    Perda medida no estoque: <strong>{formatNumber(totalLostOrDamaged)} un.</strong>{' '}
                    ({measuredLossPercent}%)
                  </span>
                  {measuredLossPercent > 0 && lossPercent !== measuredLossPercent && (
                    <button
                      type="button"
                      onClick={() => setLossPercent(measuredLossPercent)}
                      className="font-semibold text-amber-700 underline hover:no-underline dark:text-amber-300"
                    >
                      Usar média medida ({measuredLossPercent}%)
                    </button>
                  )}
                </div>
              </div>
            </div>

            {/* 2. Custos Unitários Embutidos no Produto */}
            <div className="rounded-xl border bg-muted/20 p-3.5 space-y-3">
              <div className="flex items-center justify-between">
                <p className="text-xs font-semibold">
                  Composição dos Custos por Unidade (somados antes da perda e da margem)
                </p>
                {product.linked_packaging_name && (
                  <span className="text-[11px] text-sky-600 dark:text-sky-400">
                    Sacola vinculada: <strong>{product.linked_packaging_name}</strong>
                  </span>
                )}
              </div>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-6">
                <div className="space-y-1">
                  <Label className="text-[11px]">Custo Produto (R$)</Label>
                  <Input
                    type="number"
                    step="0.01"
                    min={0}
                    value={unitCost}
                    onChange={(e) => setUnitCost(Number(e.target.value))}
                    className="h-8 font-mono text-xs"
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-[11px]">Frete Unit. (R$)</Label>
                  <Input
                    type="number"
                    step="0.01"
                    min={0}
                    value={shippingCost}
                    onChange={(e) => setShippingCost(Number(e.target.value))}
                    className="h-8 font-mono text-xs"
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-[11px]">Sacola / Emb. (R$)</Label>
                  <Input
                    type="number"
                    step="0.01"
                    min={0}
                    value={packagingCost}
                    onChange={(e) => setPackagingCost(Number(e.target.value))}
                    className="h-8 font-mono text-xs"
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-[11px]">Hora Trabalho (R$)</Label>
                  <Input
                    type="number"
                    step="0.01"
                    min={0}
                    value={laborCost}
                    onChange={(e) => setLaborCost(Number(e.target.value))}
                    className="h-8 font-mono text-xs"
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-[11px]">Comissão Canal (%)</Label>
                  <Input
                    type="number"
                    step="0.1"
                    min={0}
                    value={marketplacePercent}
                    onChange={(e) => setMarketplacePercent(Number(e.target.value))}
                    className="h-8 font-mono text-xs"
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-[11px]">Imposto NF (%)</Label>
                  <Input
                    type="number"
                    step="0.1"
                    min={0}
                    value={taxPercent}
                    onChange={(e) => setTaxPercent(Number(e.target.value))}
                    className="h-8 font-mono text-xs"
                  />
                </div>
              </div>
            </div>

            {/* 2.B Estoque Residual + Nova Entrada (Custo Médio Ponderado do Mês) */}
            <div className="rounded-xl border border-purple-500/30 bg-purple-500/5 p-3.5 space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <p className="text-xs font-semibold text-purple-900 dark:text-purple-200">
                    Cálculo de Estoque Residual + Nova Entrada (Custo Médio Ponderado / VM)
                  </p>
                  <p className="text-[11px] text-muted-foreground">
                    Ex.: Sobrou 50 pçs a R$ 5,00 (R$ 250) + Entrou 100 pçs a R$ 10,00 (R$ 1.000) =
                    R$ 1.250 ÷ 150 pçs = <strong>R$ 8,33/un.</strong>
                  </p>
                </div>
                {newEntryQty > 0 && (
                  <span
                    className={cn(
                      'rounded-md px-2 py-0.5 text-[11px] font-bold',
                      weightedDiff > 0
                        ? 'bg-amber-500/20 text-amber-800 dark:text-amber-300'
                        : weightedDiff < 0
                          ? 'bg-emerald-500/20 text-emerald-800 dark:text-emerald-300'
                          : 'bg-muted text-muted-foreground',
                    )}
                  >
                    {weightedDiff > 0
                      ? `Média SUBIU (+${formatCurrency(weightedDiff)}/un.)`
                      : weightedDiff < 0
                        ? `Média CAIU (${formatCurrency(weightedDiff)}/un.)`
                        : 'Média MANTEVE igual'}
                  </span>
                )}
              </div>

              <div className="grid grid-cols-2 gap-3 sm:grid-cols-6">
                <div className="space-y-1">
                  <Label className="text-[11px]">Estoque Residual (Un.)</Label>
                  <Input
                    type="number"
                    min={0}
                    step={1}
                    value={residualQty}
                    onChange={(e) => setResidualQty(Math.max(0, Number(e.target.value)))}
                    className="h-8 font-mono text-xs"
                  />
                  <div className="text-[10px] text-muted-foreground">
                    Valor: {formatCurrency(residualTotalValue)}
                  </div>
                </div>

                <div className="space-y-1">
                  <Label className="text-[11px]">Nova Entrada (Un.)</Label>
                  <Input
                    type="number"
                    min={0}
                    step={1}
                    placeholder="Ex.: 100"
                    value={newEntryQty || ''}
                    onChange={(e) => setNewEntryQty(Math.max(0, Number(e.target.value)))}
                    className="h-8 font-mono text-xs"
                  />
                  <div className="text-[10px] text-muted-foreground">
                    Novo saldo: {formatNumber(combinedStockQty)} un.
                  </div>
                </div>

                <div className="space-y-1">
                  <Label className="text-[11px]">Novo Custo Compra (R$)</Label>
                  <Input
                    type="number"
                    min={0}
                    step="0.01"
                    placeholder="Ex.: 10,00"
                    value={newEntryCost || ''}
                    onChange={(e) => setNewEntryCost(Math.max(0, Number(e.target.value)))}
                    className="h-8 font-mono text-xs"
                  />
                  <div className="text-[10px] text-muted-foreground">
                    Lote: {formatCurrency(newEntryTotalValue)}
                  </div>
                </div>

                <div className="space-y-1 rounded-lg border bg-background/80 p-2">
                  <div className="text-[10px] text-muted-foreground">Valor Total Somado</div>
                  <div className="font-mono text-xs font-bold">
                    {formatCurrency(combinedStockValue)}
                  </div>
                  <div className="text-[10px] text-muted-foreground">
                    ÷ {formatNumber(combinedStockQty)} peças
                  </div>
                </div>

                <div className="space-y-1 rounded-lg border border-purple-500/40 bg-background p-2">
                  <div className="text-[10px] font-semibold text-purple-700 dark:text-purple-300">
                    Novo Custo Médio (CMV)
                  </div>
                  <div className="font-mono text-sm font-extrabold">
                    {formatCurrency(weightedAverageCost)}
                  </div>
                  <button
                    type="button"
                    onClick={() => setUnitCost(weightedAverageCost)}
                    className="text-[10px] font-semibold text-primary underline hover:no-underline"
                  >
                    Simular com esta média
                  </button>
                </div>

                <div className="flex flex-col justify-center gap-1">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={pending || newEntryQty <= 0}
                    onClick={handleRegisterWeightedEntry}
                    className="h-auto py-1.5 text-[11px] whitespace-normal leading-tight"
                  >
                    Lançar Entrada (+{formatNumber(newEntryQty)}) e Salvar Média
                  </Button>
                </div>
              </div>
            </div>

            {/* 3. Raio-X: O que o Preço Sugerido Cobre e Quanto Vai Sobrar */}
            <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
              <div className="rounded-xl border bg-card p-3.5">
                <div className="text-[11px] font-medium text-muted-foreground">
                  1. Custo Base Somado
                </div>
                <div className="mt-1 text-lg font-bold tabular-nums">
                  {formatCurrency(pricing.totalBaseCost)}
                </div>
                <div className="mt-1 text-[11px] text-muted-foreground">
                  Prod. {formatCurrency(pricing.unitCost)} + Frete {formatCurrency(pricing.shippingCost)}{' '}
                  + Sacola {formatCurrency(pricing.packagingCost)} + Trab.{' '}
                  {formatCurrency(pricing.laborCost)}
                </div>
              </div>

              <div className="rounded-xl border bg-card p-3.5">
                <div className="text-[11px] font-medium text-muted-foreground">
                  2. Custo Ajustado c/ Perda ({pricing.lossPercent}%)
                </div>
                <div className="mt-1 text-lg font-bold tabular-nums text-amber-600 dark:text-amber-400">
                  {formatCurrency(pricing.adjustedCost)}
                </div>
                <div className="mt-1 text-[11px] text-muted-foreground">
                  {formatCurrency(pricing.totalBaseCost)} ÷{' '}
                  {(1 - pricing.lossPercent / 100).toFixed(2).replace('.', ',')} (cobre +
                  {formatCurrency(pricing.lossReserveAmount)} de perda)
                </div>
              </div>

              <div className="rounded-xl border-2 border-primary/40 bg-primary/5 p-3.5">
                <div className="text-[11px] font-semibold text-primary">
                  3. Preço de Venda Sugerido ({pricing.targetMarginPercent}%)
                </div>
                <div className="mt-1 text-xl font-extrabold tabular-nums text-foreground">
                  {formatCurrency(pricing.suggestedPrice)}
                </div>
                <div className="mt-1 text-[11px] text-muted-foreground">
                  {formatCurrency(pricing.adjustedCost)} ÷{' '}
                  {(1 - pricing.targetMarginPercent / 100).toFixed(2).replace('.', ',')}
                  {pricing.marketplacePercent + pricing.taxPercent > 0 && (
                    <span className="block font-medium text-sky-600 dark:text-sky-400">
                      C/ taxas ({pricing.marketplacePercent + pricing.taxPercent}%):{' '}
                      {formatCurrency(pricing.suggestedPriceCoveringFees)}
                    </span>
                  )}
                </div>
              </div>

              <div className="rounded-xl border-2 border-emerald-500/40 bg-emerald-500/10 p-3.5">
                <div className="flex items-center gap-1 text-[11px] font-semibold text-emerald-700 dark:text-emerald-300">
                  <TrendingUp className="size-3.5" />
                  4. Quanto Sobra no Fim (Lucro/Un.)
                </div>
                <div className="mt-1 text-xl font-extrabold tabular-nums text-emerald-700 dark:text-emerald-300">
                  {formatCurrency(pricing.grossProfit)}
                </div>
                <div className="mt-1 text-[11px] text-muted-foreground">
                  {pricing.stockBalance > 0
                    ? `No estoque atual (${formatNumber(pricing.stockBalance)} un.): sobra ${formatCurrency(pricing.potentialStockProfit)}`
                    : `Preço atual cadastrado: ${formatCurrency(pricing.currentSalePrice)}`}
                </div>
              </div>
            </div>

            {/* 4. Tabela de Cenários (Mockup Comparativo Real deste Produto) */}
            <div className="rounded-xl border bg-card overflow-hidden">
              <div className="flex items-center justify-between border-b bg-muted/30 px-4 py-2.5">
                <div>
                  <h3 className="text-xs font-semibold">
                    Tabela de Cenários para {product.name} (Custo Base:{' '}
                    {formatCurrency(pricing.totalBaseCost)})
                  </h3>
                  <p className="text-[11px] text-muted-foreground">
                    Fórmula aplicada: Preço Sugerido = Custo Base ÷ (1 − Perda X) ÷ (1 − Margem
                    Desejada). Clique em uma linha para usar o cenário.
                  </p>
                </div>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b bg-muted/20 text-left text-[11px] text-muted-foreground">
                      <th className="px-3 py-2">Cenário</th>
                      <th className="px-3 py-2 text-right">Custo Base</th>
                      <th className="px-3 py-2 text-right">Perda Variável (X)</th>
                      <th className="px-3 py-2 text-right">Custo Ajustado</th>
                      <th className="px-3 py-2 text-right">Margem Desejada</th>
                      <th className="px-3 py-2 text-right">Preço Sugerido</th>
                      <th className="px-3 py-2 text-right">Quanto Sobra (R$)</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {pricing.scenarios.map((row) => (
                      <tr
                        key={row.id}
                        onClick={() => {
                          setLossPercent(row.lossPercent)
                          setTargetMarginPercent(row.targetMarginPercent)
                        }}
                        className={cn(
                          'cursor-pointer transition-colors hover:bg-muted/50',
                          row.isCurrent && 'bg-emerald-500/10 font-semibold',
                        )}
                      >
                        <td className="px-3 py-2">{row.label}</td>
                        <td className="px-3 py-2 text-right tabular-nums">
                          {formatCurrency(row.baseCost)}
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums">{row.lossPercent}%</td>
                        <td className="px-3 py-2 text-right tabular-nums text-amber-600 dark:text-amber-400">
                          {formatCurrency(row.adjustedCost)}
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums">
                          {row.targetMarginPercent}%
                        </td>
                        <td className="px-3 py-2 text-right font-bold tabular-nums">
                          {formatCurrency(row.suggestedPrice)}
                        </td>
                        <td className="px-3 py-2 text-right font-bold tabular-nums text-emerald-600 dark:text-emerald-400">
                          +{formatCurrency(row.grossProfit)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {feedback && (
              <div
                className={cn(
                  'rounded-lg border px-3 py-2 text-xs',
                  feedback.ok
                    ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-800 dark:text-emerald-200'
                    : 'border-destructive/40 bg-destructive/10 text-destructive',
                )}
              >
                {feedback.text}
              </div>
            )}

            {/* Rodapé com Ações */}
            <div className="flex flex-wrap items-center justify-between gap-2 border-t pt-3">
              <Button type="button" variant="outline" size="sm" onClick={() => setOpen(false)}>
                Fechar
              </Button>
              <div className="flex flex-wrap items-center gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={pending}
                  onClick={() => handleSave(null)}
                >
                  <Check className="size-3.5" />
                  Salvar Margem ({pricing.targetMarginPercent}%) e Custos
                </Button>
                <Button
                  type="button"
                  size="sm"
                  disabled={pending}
                  onClick={() => handleSave(pricing.suggestedPrice)}
                >
                  <Sparkles className="size-3.5" />
                  Aplicar Preço Sugerido ({formatCurrency(pricing.suggestedPrice)}) no Produto
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
