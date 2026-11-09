'use client'

import {
  ArrowDownRight,
  ArrowRight,
  ArrowUpRight,
  Check,
  ChevronLeft,
  ChevronRight,
  MapPin,
  Pin,
  Sparkles,
} from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useMemo, useState, useTransition } from 'react'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { formatCurrency, formatNumber, formatPercent, num } from '@/lib/format'
import { buildDefaultMonthlyTrack, computeMonthlyCarouselChain } from '@/lib/pricing'
import type { MonthlyCmvTrackEntry, ProductStats } from '@/lib/types'
import { cn } from '@/lib/utils'

import { saveProductMonthlyCmvTrackAction } from './actions'

export function MonthlyResidualCarousel({
  product,
  extraUnitCosts = 0,
  lossPercent = 0,
  targetMarginPercent = 30,
  onApplyWeightedCost,
}: {
  product: ProductStats
  extraUnitCosts?: number
  lossPercent?: number
  targetMarginPercent?: number
  onApplyWeightedCost?: (newCost: number, suggestedPrice: number) => void
}) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [feedback, setFeedback] = useState<{ ok: boolean; text: string } | null>(null)

  const [entries, setEntries] = useState<MonthlyCmvTrackEntry[]>(() =>
    buildDefaultMonthlyTrack({
      initialStock: Math.max(0, num(product.stock_balance)),
      unitCost: num(product.unit_cost),
      salePrice: num(product.sale_price),
      existingTrack: product.monthly_cmv_track,
    }),
  )

  // Card da esquerda (Parado / Fixo) vs Card da direita (Carrossel que o usuário puxa)
  const [pinnedIndex, setPinnedIndex] = useState<number>(0) // Ex: Janeiro (0)
  const [activeIndex, setActiveIndex] = useState<number>(1) // Ex: Fevereiro (1 - Mês vigente)

  const cards = useMemo(
    () =>
      computeMonthlyCarouselChain(entries, {
        extraUnitCosts,
        lossPercent,
        targetMarginPercent,
      }),
    [entries, extraUnitCosts, lossPercent, targetMarginPercent],
  )

  const pinnedCard = cards[pinnedIndex] ?? cards[0]
  const activeCard = cards[activeIndex] ?? cards[1] ?? cards[0]

  function updateEntry(index: number, patch: Partial<MonthlyCmvTrackEntry>) {
    setEntries((prev) =>
      prev.map((item, idx) => (idx === index ? { ...item, ...patch } : item)),
    )
  }

  function handlePrevMonth() {
    setActiveIndex((prev) => (prev > 0 ? prev - 1 : cards.length - 1))
  }

  function handleNextMonth() {
    setActiveIndex((prev) => (prev < cards.length - 1 ? prev + 1 : 0))
  }

  function handleLoadUserExample() {
    // Carrega o fluxo completo no próprio mês: Inicia com 100 pçs a R$ 5 = 500 -> Sai/Vende 50 -> Sobra 50 Residual = 250 -> Entra +100 a R$ 10 = 1000 -> Total 1250 / 150 = R$ 8,33
    setEntries((prev) =>
      prev.map((item, idx) => {
        if (idx === 0) {
          return {
            ...item,
            initialOverrideQty: 100,
            initialOverrideCost: 5,
            soldQty: 50,
            salePrice: 12,
            entryQty: 100,
            entryUnitCost: 10,
          }
        }
        if (idx === 1) {
          return {
            ...item,
            soldQty: 60,
            salePrice: 16,
            entryQty: 0,
            entryUnitCost: 0,
          }
        }
        return item
      }),
    )
    setPinnedIndex(0)
    setActiveIndex(0)
  }

  function handleSaveTrack(applyActiveToProduct = false) {
    setFeedback(null)
    startTransition(async () => {
      const res = await saveProductMonthlyCmvTrackAction({
        productId: product.product_id,
        monthlyTrack: entries,
        applyUnitCost: applyActiveToProduct ? activeCard.newWeightedCost : null,
        applySalePrice: applyActiveToProduct ? activeCard.suggestedSalePrice : null,
      })
      setFeedback({ ok: res.ok, text: res.message })
      if (res.ok) {
        if (applyActiveToProduct && onApplyWeightedCost) {
          onApplyWeightedCost(activeCard.newWeightedCost, activeCard.suggestedSalePrice)
        }
        router.refresh()
      }
    })
  }

  const diffVsPinned = Number((activeCard.newWeightedCost - pinnedCard.newWeightedCost).toFixed(2))

  return (
    <div className="rounded-2xl border-2 border-purple-500/30 bg-purple-500/5 p-4 space-y-4">
      {/* Cabeçalho + Barra de Meses Deslizante (Onde estamos no momento) */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <div className="flex items-center gap-2">
            <span className="inline-flex items-center gap-1 rounded-md bg-purple-600 px-2 py-0.5 text-[11px] font-bold text-white">
              <MapPin className="size-3" />
              Carrossel Mensal: CMV, VM &amp; Estoque Residual
            </span>
            <span className="text-xs text-muted-foreground">
              Esquerda parada (base) · Direita você puxa mês a mês
            </span>
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            O que sobra de um mês passa automaticamente como <strong>Estoque Residual</strong> para
            o próximo mês, somando com a nova entrada para formar a nova média.
          </p>
        </div>

        <Button type="button" variant="outline" size="sm" onClick={handleLoadUserExample}>
          Carregar Exemplo (100 a R$ 5 → +100 a R$ 10 = R$ 8,33)
        </Button>
      </div>

      {/* Trilho Horizontal de Meses (Indicador de onde estamos no momento) */}
      <div className="flex items-center gap-1.5 overflow-x-auto rounded-xl border bg-background p-2">
        <button
          type="button"
          onClick={handlePrevMonth}
          className="inline-flex size-8 shrink-0 items-center justify-center rounded-lg border hover:bg-muted"
          title="Puxar mês anterior"
        >
          <ChevronLeft className="size-4" />
        </button>

        <div className="flex flex-1 items-center gap-1.5 overflow-x-auto py-0.5">
          {cards.map((c) => {
            const isPinned = c.index === pinnedIndex
            const isActive = c.index === activeIndex
            return (
              <button
                key={c.monthKey}
                type="button"
                onClick={() => setActiveIndex(c.index)}
                className={cn(
                  'group relative flex shrink-0 flex-col items-start rounded-lg border px-2.5 py-1.5 text-left transition-all',
                  isActive
                    ? 'border-purple-600 bg-purple-600 text-white shadow-sm'
                    : isPinned
                      ? 'border-amber-500/60 bg-amber-500/10 text-foreground'
                      : 'bg-card hover:bg-muted',
                )}
              >
                <div className="flex items-center gap-1 text-[11px] font-bold">
                  {isActive && <MapPin className="size-3 shrink-0" />}
                  {isPinned && !isActive && <Pin className="size-3 shrink-0 text-amber-600" />}
                  <span>{c.label}</span>
                </div>
                <div
                  className={cn(
                    'font-mono text-[10px]',
                    isActive ? 'text-purple-100' : 'text-muted-foreground',
                  )}
                >
                  CMV {formatCurrency(c.newWeightedCost)} · Sobra {c.closingResidualQty}
                </div>
              </button>
            )
          })}
        </div>

        <button
          type="button"
          onClick={handleNextMonth}
          className="inline-flex size-8 shrink-0 items-center justify-center rounded-lg border hover:bg-muted"
          title="Puxar próximo mês"
        >
          <ChevronRight className="size-4" />
        </button>
      </div>

      {/* CARROSSEL SPLIT: ESQUERDA PARADA (FIXA) vs DIREITA DESLIZANTE (MÊS ATUAL) */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-12">
        {/* COLUNA ESQUERDA (5 cols): CARD PARADO / BASE FIXA */}
        <div className="lg:col-span-5 flex flex-col justify-between rounded-xl border-2 border-amber-500/40 bg-background p-4 space-y-3">
          <div className="space-y-2">
            <div className="flex items-center justify-between gap-2 border-b pb-2">
              <div className="flex items-center gap-1.5">
                <span className="inline-flex items-center gap-1 rounded-md bg-amber-500/20 px-2 py-0.5 text-[11px] font-bold text-amber-800 dark:text-amber-300">
                  <Pin className="size-3" />
                  PARADO (BASE FIXA)
                </span>
                <select
                  value={pinnedIndex}
                  onChange={(e) => setPinnedIndex(Number(e.target.value))}
                  className="h-7 rounded-md border bg-card px-2 text-xs font-bold"
                >
                  {cards.map((c) => (
                    <option key={c.monthKey} value={c.index}>
                      {c.label}
                    </option>
                  ))}
                </select>
              </div>
              <span className="font-mono text-[11px] text-muted-foreground">
                Mês #{pinnedCard.index + 1}
              </span>
            </div>

            {pinnedCard.index === 0 ? (
              <div className="grid grid-cols-2 gap-2 rounded-lg border bg-muted/20 p-2.5">
                <div>
                  <Label className="text-[10px]">Estoque Inicial (Un.)</Label>
                  <Input
                    type="number"
                    min={0}
                    value={entries[0]?.initialOverrideQty ?? 100}
                    onChange={(e) =>
                      updateEntry(0, { initialOverrideQty: Math.max(0, Number(e.target.value)) })
                    }
                    className="mt-0.5 h-7 font-mono text-xs"
                  />
                </div>
                <div>
                  <Label className="text-[10px]">Valor Inicial por Peça (R$)</Label>
                  <Input
                    type="number"
                    min={0}
                    step="0.01"
                    value={entries[0]?.initialOverrideCost ?? 5}
                    onChange={(e) =>
                      updateEntry(0, { initialOverrideCost: Math.max(0, Number(e.target.value)) })
                    }
                    className="mt-0.5 h-7 font-mono text-xs"
                  />
                </div>
              </div>
            ) : null}

            <div className="space-y-1.5 text-xs">
              <div className="flex justify-between rounded-md bg-muted/30 px-2.5 py-1.5">
                <span className="text-muted-foreground">Estoque Residual / Inicial:</span>
                <span className="font-mono font-semibold">
                  {formatNumber(pinnedCard.residualQty)} pçs ×{' '}
                  {formatCurrency(pinnedCard.residualUnitCost)} ={' '}
                  {formatCurrency(pinnedCard.residualValue)}
                </span>
              </div>

              <div className="flex justify-between rounded-md bg-muted/30 px-2.5 py-1.5">
                <span className="text-muted-foreground">+ Nova Entrada ({pinnedCard.label}):</span>
                <span className="font-mono font-semibold">
                  +{formatNumber(pinnedCard.entryQty)} pçs ×{' '}
                  {formatCurrency(pinnedCard.entryUnitCost)} ={' '}
                  {formatCurrency(pinnedCard.entryValue)}
                </span>
              </div>

              <div className="flex justify-between rounded-md border border-amber-500/30 bg-amber-500/10 px-2.5 py-1.5">
                <span className="font-semibold">Custo Médio ({pinnedCard.label}):</span>
                <span className="font-mono font-bold text-amber-800 dark:text-amber-300">
                  {formatCurrency(pinnedCard.availableValue)} ÷{' '}
                  {formatNumber(pinnedCard.availableQty)} ={' '}
                  {formatCurrency(pinnedCard.newWeightedCost)}/un.
                </span>
              </div>

              <div className="grid grid-cols-2 gap-2 pt-1">
                <div>
                  <Label className="text-[10px]">Peças Vendidas ({pinnedCard.label})</Label>
                  <Input
                    type="number"
                    min={0}
                    value={entries[pinnedCard.index]?.soldQty ?? 0}
                    onChange={(e) =>
                      updateEntry(pinnedCard.index, {
                        soldQty: Math.max(0, Number(e.target.value)),
                      })
                    }
                    className="mt-0.5 h-7 font-mono text-xs"
                  />
                </div>
                <div>
                  <Label className="text-[10px]">CMV das Vendas</Label>
                  <div className="mt-0.5 flex h-7 items-center rounded-md border bg-muted/30 px-2 font-mono text-xs font-semibold">
                    {formatCurrency(pinnedCard.cmvSold)}
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-2.5 text-xs">
            <div className="flex items-center justify-between font-semibold text-emerald-800 dark:text-emerald-300">
              <span>Sobra Residual p/ o mês seguinte:</span>
              <span className="font-mono text-sm">
                {formatNumber(pinnedCard.closingResidualQty)} pçs (
                {formatCurrency(pinnedCard.closingResidualValue)})
              </span>
            </div>
          </div>
        </div>

        {/* COLUNA DIREITA (7 cols): CARD QUE VOCÊ VAI PUXANDO (MÊS VIGENTE / EM FOCO) */}
        <div className="lg:col-span-7 flex flex-col justify-between rounded-xl border-2 border-purple-600 bg-background p-4 shadow-md space-y-3">
          <div className="space-y-3">
            {/* Barra de Topo do Card Deslizante */}
            <div className="flex flex-wrap items-center justify-between gap-2 border-b pb-2.5">
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handlePrevMonth}
                  className="inline-flex size-7 items-center justify-center rounded-md border hover:bg-muted"
                  title="Puxar mês anterior"
                >
                  <ChevronLeft className="size-4" />
                </button>
                <div>
                  <div className="flex items-center gap-1.5">
                    <span className="inline-flex items-center gap-1 rounded-md bg-purple-600 px-2 py-0.5 text-[11px] font-bold text-white">
                      <MapPin className="size-3" />
                      ONDE ESTAMOS: {activeCard.label.toUpperCase()}
                    </span>
                    {activeCard.index !== pinnedIndex && (
                      <button
                        type="button"
                        onClick={() => setPinnedIndex(activeCard.index)}
                        className="text-[11px] font-medium text-muted-foreground underline hover:text-foreground"
                      >
                        Fixar na esquerda
                      </button>
                    )}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={handleNextMonth}
                  className="inline-flex size-7 items-center justify-center rounded-md border hover:bg-muted"
                  title="Puxar próximo mês"
                >
                  <ChevronRight className="size-4" />
                </button>
              </div>

              {/* Badge se a Nova Média é Maior, Menor ou Igual */}
              <div
                className={cn(
                  'inline-flex items-center gap-1 rounded-lg px-2.5 py-1 text-xs font-bold',
                  activeCard.averageStatus === 'HIGHER'
                    ? 'bg-amber-500/20 text-amber-800 dark:text-amber-300'
                    : activeCard.averageStatus === 'LOWER'
                      ? 'bg-emerald-500/20 text-emerald-800 dark:text-emerald-300'
                      : 'bg-muted text-muted-foreground',
                )}
              >
                {activeCard.averageStatus === 'HIGHER' && <ArrowUpRight className="size-3.5" />}
                {activeCard.averageStatus === 'LOWER' && <ArrowDownRight className="size-3.5" />}
                <span>
                  {activeCard.averageStatus === 'HIGHER'
                    ? `Nova média SUBIU +${formatCurrency(activeCard.costDelta)} (+${formatPercent(activeCard.costDeltaPercent)})`
                    : activeCard.averageStatus === 'LOWER'
                      ? `Nova média CAIU ${formatCurrency(activeCard.costDelta)} (${formatPercent(activeCard.costDeltaPercent)})`
                      : 'Média igual ao residual anterior'}
                </span>
              </div>
            </div>

            {/* Passo 1: Saídas / Vendas do Mês e Sobra Residual */}
            <div className="rounded-lg border border-rose-500/30 bg-rose-500/5 p-3 space-y-2">
              <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                <span className="font-semibold text-rose-800 dark:text-rose-300">
                  1. Estoque que Iniciou ({formatNumber(activeCard.residualQty + activeCard.soldQty)}{' '}
                  pçs a {formatCurrency(activeCard.residualUnitCost)}) &amp; Saídas / Vendas de{' '}
                  {activeCard.label}
                </span>
                <span className="font-mono text-[11px]">
                  Valor Inicial:{' '}
                  <strong>
                    {formatCurrency(
                      (activeCard.residualQty + activeCard.soldQty) * activeCard.residualUnitCost,
                    )}
                  </strong>
                </span>
              </div>

              <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-5">
                <div>
                  <Label className="text-[10px]">(-) Saídas / Vendas (Peças)</Label>
                  <Input
                    type="number"
                    min={0}
                    value={entries[activeCard.index]?.soldQty ?? 0}
                    onChange={(e) =>
                      updateEntry(activeCard.index, {
                        soldQty: Math.max(0, Number(e.target.value)),
                      })
                    }
                    className="mt-0.5 h-7 font-mono text-xs"
                  />
                </div>

                <div>
                  <Label className="text-[10px]">Preço Vendido (R$)</Label>
                  <Input
                    type="number"
                    min={0}
                    step="0.01"
                    value={entries[activeCard.index]?.salePrice ?? activeCard.suggestedSalePrice}
                    onChange={(e) =>
                      updateEntry(activeCard.index, {
                        salePrice: Math.max(0, Number(e.target.value)),
                      })
                    }
                    className="mt-0.5 h-7 font-mono text-xs"
                  />
                </div>

                <div>
                  <Label className="text-[10px]">CMV das Saídas</Label>
                  <div className="mt-0.5 flex h-7 items-center rounded-md border bg-background px-2 font-mono text-xs font-semibold text-rose-700 dark:text-rose-300">
                    {formatCurrency(activeCard.cmvSold)}
                  </div>
                </div>

                <div>
                  <Label className="text-[10px]">Lucro das Vendas</Label>
                  <div className="mt-0.5 flex h-7 items-center rounded-md border bg-background px-2 font-mono text-xs font-bold text-emerald-600 dark:text-emerald-400">
                    {formatCurrency(activeCard.grossProfit)}
                  </div>
                </div>

                <div>
                  <Label className="text-[10px]">(=) Sobrou Residual</Label>
                  <div className="mt-0.5 flex h-7 items-center justify-between rounded-md border border-amber-500/40 bg-amber-500/10 px-2 font-mono text-xs font-bold text-amber-800 dark:text-amber-300">
                    <span>{formatNumber(activeCard.residualQty)} pçs</span>
                    <span>{formatCurrency(activeCard.residualValue)}</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Passo 2 + Passo 3: Estoque Residual que Sobrou + Nova Entrada = Novo Custo Médio */}
            <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-3">
              <div className="rounded-lg border bg-amber-500/5 p-2.5">
                <div className="text-[10px] font-semibold uppercase text-amber-700 dark:text-amber-300">
                  2. Estoque Residual (Sobrou)
                </div>
                <div className="mt-1 font-mono text-sm font-bold">
                  {formatNumber(activeCard.residualQty)} pçs
                </div>
                <div className="text-[11px] text-muted-foreground">
                  a {formatCurrency(activeCard.residualUnitCost)} ={' '}
                  <strong>{formatCurrency(activeCard.residualValue)}</strong>
                </div>
              </div>

              <div className="rounded-lg border bg-sky-500/5 p-2.5 space-y-1.5">
                <div className="text-[10px] font-semibold uppercase text-sky-700 dark:text-sky-300">
                  3. (+) Nova Entrada em {activeCard.label}
                </div>
                <div className="grid grid-cols-2 gap-1.5">
                  <div>
                    <Label className="text-[10px]">Qtd Nova</Label>
                    <Input
                      type="number"
                      min={0}
                      value={entries[activeCard.index]?.entryQty ?? 0}
                      onChange={(e) =>
                        updateEntry(activeCard.index, {
                          entryQty: Math.max(0, Number(e.target.value)),
                        })
                      }
                      className="h-7 font-mono text-xs"
                    />
                  </div>
                  <div>
                    <Label className="text-[10px]">Novo Custo (R$)</Label>
                    <Input
                      type="number"
                      min={0}
                      step="0.01"
                      value={entries[activeCard.index]?.entryUnitCost ?? 0}
                      onChange={(e) =>
                        updateEntry(activeCard.index, {
                          entryUnitCost: Math.max(0, Number(e.target.value)),
                        })
                      }
                      className="h-7 font-mono text-xs"
                    />
                  </div>
                </div>
                <div className="text-[10px] text-muted-foreground">
                  Valor Entrada: <strong>{formatCurrency(activeCard.entryValue)}</strong>
                </div>
              </div>

              <div className="rounded-lg border-2 border-purple-500/40 bg-purple-500/10 p-2.5">
                <div className="text-[10px] font-semibold uppercase text-purple-800 dark:text-purple-200">
                  4. (=) Novo Custo Médio (VM)
                </div>
                <div className="mt-1 font-mono text-base font-extrabold text-foreground">
                  {formatCurrency(activeCard.newWeightedCost)} / pç
                </div>
                <div className="text-[11px] text-muted-foreground">
                  {formatCurrency(activeCard.availableValue)} ÷{' '}
                  {formatNumber(activeCard.availableQty)} pçs
                </div>
                {diffVsPinned !== 0 && (
                  <div className="mt-0.5 text-[10px] font-semibold text-purple-700 dark:text-purple-300">
                    vs. {pinnedCard.label}: {diffVsPinned > 0 ? '+' : ''}
                    {formatCurrency(diffVsPinned)}/pç
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Rodapé do Card Deslizante */}
          <div className="flex flex-wrap items-center justify-between gap-2 border-t pt-2.5">
            <span className="text-[11px] text-muted-foreground">
              Residual que passa p/ {cards[activeCard.index + 1]?.label ?? 'Próximo ciclo'}:{' '}
              <strong>
                {formatNumber(activeCard.closingResidualQty)} pçs ={' '}
                {formatCurrency(activeCard.closingResidualValue)}
              </strong>
            </span>

            <div className="flex flex-wrap items-center gap-1.5">
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={pending}
                onClick={() => handleSaveTrack(false)}
              >
                <Check className="size-3.5" />
                Salvar Carrossel
              </Button>
              <Button
                type="button"
                size="sm"
                disabled={pending}
                onClick={() => handleSaveTrack(true)}
              >
                <Sparkles className="size-3.5" />
                Usar Média de {activeCard.label} ({formatCurrency(activeCard.newWeightedCost)}) no
                Produto
              </Button>
            </div>
          </div>
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
    </div>
  )
}
