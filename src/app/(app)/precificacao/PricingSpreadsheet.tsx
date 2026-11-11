'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useMemo, useState, useTransition } from 'react'
import {
  AlertTriangle,
  ArrowRight,
  Calculator,
  Check,
  ChevronDown,
  ChevronUp,
  Download,
  PackagePlus,
  Plus,
  RotateCcw,
  Save,
  Search,
  Sparkles,
  Trash2,
  TrendingUp,
} from 'lucide-react'

import { savePricingSheetBatchAction, createProductFromSimulationAction } from '@/app/(app)/produtos/actions'
import { MetricCard } from '@/components/MetricCard'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { NativeSelect } from '@/components/ui/native-select'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { formatCurrency, formatNumber, formatPercent, num, round2 } from '@/lib/format'
import {
  calculateMlPricingRow,
  ML_THRESHOLD_FREE_FIXED_FEE,
  type MlFixedFeeMode,
  type MlListingType,
  type MlPricingRowResult,
} from '@/lib/pricing'
import type { ProductStats } from '@/lib/types'
import { cn } from '@/lib/utils'

export type SpreadsheetRowState = {
  id: string
  isSimulatedOnly?: boolean
  name: string
  sku: string
  category: string
  voltage: string | null
  grossWeightGrams: number | null
  linkedPackagingName: string | null
  stockBalance: number
  qtySold: number
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
  dirty: boolean
}

function buildInitialRow(product: ProductStats): SpreadsheetRowState {
  const mktPct = num(product.marketplace_percent)
  const savedListingType: MlListingType =
    product.ml_listing_type === 'PREMIUM'
      ? 'PREMIUM'
      : product.ml_listing_type === 'CLASSICO'
        ? 'CLASSICO'
        : mktPct >= 15.5
          ? 'PREMIUM'
          : 'CLASSICO'

  const classicPct =
    product.ml_classic_percent !== undefined && num(product.ml_classic_percent) > 0
      ? num(product.ml_classic_percent)
      : savedListingType === 'CLASSICO' && mktPct > 0
        ? mktPct
        : 12

  const premiumPct =
    product.ml_premium_percent !== undefined && num(product.ml_premium_percent) > 0
      ? num(product.ml_premium_percent)
      : savedListingType === 'PREMIUM' && mktPct > 0
        ? mktPct
        : 17

  const fixedFeeMode: MlFixedFeeMode = product.ml_fixed_fee_mode ?? 'AUTO_79'
  const fixedFeeAmount =
    product.ml_fixed_fee !== undefined && num(product.ml_fixed_fee) >= 0
      ? num(product.ml_fixed_fee)
      : 6

  const taxPct = num(product.tax_percent) > 0 ? num(product.tax_percent) : 6
  const targetMargin =
    num(product.target_margin_percent) > 0 ? num(product.target_margin_percent) : 20

  return {
    id: product.product_id,
    isSimulatedOnly: false,
    name: product.name,
    sku: product.sku ?? '',
    category: product.category ?? '',
    voltage: product.voltage ?? null,
    grossWeightGrams: product.gross_weight_grams ?? null,
    linkedPackagingName: product.linked_packaging_name ?? null,
    stockBalance: Math.max(0, num(product.stock_balance)),
    qtySold: Math.max(0, num(product.qty_sold)),
    unitCost: Math.max(0, num(product.unit_cost)),
    packagingCost: Math.max(0, num(product.packaging_cost)),
    laborCost: Math.max(0, num(product.labor_cost)),
    lossPercent: Math.max(0, num(product.loss_percent ?? 0)),
    taxPercent: taxPct,
    mlListingType: savedListingType,
    mlClassicPercent: classicPct,
    mlPremiumPercent: premiumPct,
    mlFixedFeeMode: fixedFeeMode,
    mlFixedFeeAmount: fixedFeeAmount,
    shippingCost: Math.max(0, num(product.shipping_cost)),
    targetMarginPercent: targetMargin,
    salePrice: Math.max(0, num(product.sale_price)),
    dirty: false,
  }
}

const TAX_PRESETS = [4, 6, 8.5, 10, 12]
const TARGET_MARGIN_PRESETS = [15, 20, 25, 30, 35]

type FilterStatus = 'ALL' | 'HEALTHY' | 'BELOW_TARGET' | 'NEGATIVE' | 'EMPTY'

export function PricingSpreadsheet({ products }: { products: ProductStats[] }) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [feedback, setFeedback] = useState<{ ok: boolean; text: string } | null>(null)

  const initialRows = useMemo(() => products.map(buildInitialRow), [products])
  const [rows, setRows] = useState<SpreadsheetRowState[]>(initialRows)
  const [expandedRowIds, setExpandedRowIds] = useState<Record<string, boolean>>({})

  // Controles de aplicação em massa (Barra de Simulação Rápida ML)
  const [bulkTaxPercent, setBulkTaxPercent] = useState<number>(6)
  const [bulkClassicPercent, setBulkClassicPercent] = useState<number>(12)
  const [bulkPremiumPercent, setBulkPremiumPercent] = useState<number>(17)
  const [bulkFixedFeeMode, setBulkFixedFeeMode] = useState<MlFixedFeeMode>('AUTO_79')
  const [bulkFixedFeeAmount, setBulkFixedFeeAmount] = useState<number>(6)
  const [bulkTargetMargin, setBulkTargetMargin] = useState<number>(20)

  // Busca e filtro da planilha
  const [searchTerm, setSearchTerm] = useState('')
  const [statusFilter, setStatusFilter] = useState<FilterStatus>('ALL')

  // Calcula em tempo real os resultados de todas as linhas
  const computedRows = useMemo(() => {
    return rows.map((row) => ({
      row,
      calc: calculateMlPricingRow({
        unitCost: row.unitCost,
        packagingCost: row.packagingCost,
        laborCost: row.laborCost,
        lossPercent: row.lossPercent,
        taxPercent: row.taxPercent,
        mlListingType: row.mlListingType,
        mlClassicPercent: row.mlClassicPercent,
        mlPremiumPercent: row.mlPremiumPercent,
        mlFixedFeeMode: row.mlFixedFeeMode,
        mlFixedFeeAmount: row.mlFixedFeeAmount,
        shippingCost: row.shippingCost,
        targetMarginPercent: row.targetMarginPercent,
        salePrice: row.salePrice,
        stockBalance: row.stockBalance,
      }),
    }))
  }, [rows])

  const filteredRows = useMemo(() => {
    const q = searchTerm.trim().toLowerCase()
    return computedRows.filter(({ row, calc }) => {
      if (statusFilter !== 'ALL' && calc.marginHealth !== statusFilter) {
        return false
      }
      if (!q) return true
      return (
        row.name.toLowerCase().includes(q) ||
        row.sku.toLowerCase().includes(q) ||
        row.category.toLowerCase().includes(q) ||
        (row.voltage && row.voltage.toLowerCase().includes(q))
      )
    })
  }, [computedRows, searchTerm, statusFilter])

  // KPIs agregados em tempo real
  const summary = useMemo(() => {
    const valid = computedRows.filter(({ calc }) => calc.active.salePrice > 0 || calc.unitCost > 0)
    const count = computedRows.length
    const healthyCount = computedRows.filter(({ calc }) => calc.marginHealth === 'HEALTHY').length
    const belowCount = computedRows.filter(({ calc }) => calc.marginHealth === 'BELOW_TARGET').length
    const negativeCount = computedRows.filter(({ calc }) => calc.marginHealth === 'NEGATIVE').length
    const emptyCount = computedRows.filter(({ calc }) => calc.marginHealth === 'EMPTY').length

    const avgNetMarginPercent =
      valid.length > 0
        ? round2(
            valid.reduce((acc, item) => acc + item.calc.active.netMarginPercent, 0) / valid.length,
          )
        : 0

    const avgNetProfitPerUnit =
      valid.length > 0
        ? round2(valid.reduce((acc, item) => acc + item.calc.active.netProfit, 0) / valid.length)
        : 0

    const avgTaxAndMlPercent =
      valid.length > 0
        ? round2(
            valid.reduce(
              (acc, item) => acc + item.calc.taxPercent + item.calc.active.mlPercent,
              0,
            ) / valid.length,
          )
        : 0

    const totalStockPotentialRevenue = round2(
      computedRows.reduce((acc, item) => acc + item.calc.potentialStockRevenue, 0),
    )
    const totalStockPotentialProfit = round2(
      computedRows.reduce((acc, item) => acc + item.calc.potentialStockNetProfit, 0),
    )

    const dirtyCount = rows.filter((r) => r.dirty && !r.isSimulatedOnly).length

    return {
      count,
      healthyCount,
      belowCount,
      negativeCount,
      emptyCount,
      avgNetMarginPercent,
      avgNetProfitPerUnit,
      avgTaxAndMlPercent,
      totalStockPotentialRevenue,
      totalStockPotentialProfit,
      dirtyCount,
    }
  }, [computedRows, rows])

  function updateRow(id: string, patch: Partial<SpreadsheetRowState>) {
    setRows((prev) =>
      prev.map((row) => (row.id === id ? { ...row, ...patch, dirty: true } : row)),
    )
  }

  function toggleExpand(id: string) {
    setExpandedRowIds((prev) => ({ ...prev, [id]: !prev[id] }))
  }

  function applyBulkToAll(patcher: (row: SpreadsheetRowState, calc: MlPricingRowResult) => Partial<SpreadsheetRowState>) {
    setRows((prev) =>
      prev.map((row) => {
        const calc = calculateMlPricingRow({
          unitCost: row.unitCost,
          packagingCost: row.packagingCost,
          laborCost: row.laborCost,
          lossPercent: row.lossPercent,
          taxPercent: row.taxPercent,
          mlListingType: row.mlListingType,
          mlClassicPercent: row.mlClassicPercent,
          mlPremiumPercent: row.mlPremiumPercent,
          mlFixedFeeMode: row.mlFixedFeeMode,
          mlFixedFeeAmount: row.mlFixedFeeAmount,
          shippingCost: row.shippingCost,
          targetMarginPercent: row.targetMarginPercent,
          salePrice: row.salePrice,
          stockBalance: row.stockBalance,
        })
        return {
          ...row,
          ...patcher(row, calc),
          dirty: true,
        }
      }),
    )
  }

  function handleAddSimulatedRow() {
    const newId = `sim-${Date.now()}`
    const newRow: SpreadsheetRowState = {
      id: newId,
      isSimulatedOnly: true,
      name: `Produto Simulado #${rows.length + 1}`,
      sku: `SIM-${rows.length + 1}`,
      category: 'Simulação ML',
      voltage: null,
      grossWeightGrams: 500,
      linkedPackagingName: null,
      stockBalance: 50,
      qtySold: 0,
      unitCost: 35,
      packagingCost: 1.5,
      laborCost: 0,
      lossPercent: 0,
      taxPercent: bulkTaxPercent,
      mlListingType: 'CLASSICO',
      mlClassicPercent: bulkClassicPercent,
      mlPremiumPercent: bulkPremiumPercent,
      mlFixedFeeMode: bulkFixedFeeMode,
      mlFixedFeeAmount: bulkFixedFeeAmount,
      shippingCost: 0,
      targetMarginPercent: bulkTargetMargin,
      salePrice: 78.9,
      dirty: true,
    }
    setRows((prev) => [newRow, ...prev])
    setExpandedRowIds((prev) => ({ ...prev, [newId]: true }))
  }

  function handleRemoveSimulatedRow(id: string) {
    setRows((prev) => prev.filter((r) => r.id !== id))
  }

  function handleResetChanges() {
    setRows(initialRows)
    setFeedback(null)
  }

  function handleSaveSingleRow(row: SpreadsheetRowState, calc: MlPricingRowResult) {
    setFeedback(null)
    const effectiveSalePrice = row.salePrice > 0 ? row.salePrice : calc.active.suggestedPrice

    if (row.isSimulatedOnly) {
      startTransition(async () => {
        const res = await createProductFromSimulationAction({
          name: row.name,
          sku: row.sku,
          category: row.category,
          unitCost: row.unitCost,
          salePrice: effectiveSalePrice,
          shippingCost: row.shippingCost,
          packagingCost: row.packagingCost,
          laborCost: row.laborCost,
          lossPercent: row.lossPercent,
          targetMarginPercent: row.targetMarginPercent,
          taxPercent: row.taxPercent,
          mlListingType: row.mlListingType,
          mlClassicPercent: row.mlClassicPercent,
          mlPremiumPercent: row.mlPremiumPercent,
          mlFixedFeeMode: row.mlFixedFeeMode,
          mlFixedFeeAmount: row.mlFixedFeeAmount,
        })
        setFeedback({ ok: res.ok, text: res.message })
        if (res.ok && res.productId) {
          setRows((prev) =>
            prev.map((r) =>
              r.id === row.id
                ? {
                    ...r,
                    id: res.productId!,
                    isSimulatedOnly: false,
                    salePrice: effectiveSalePrice,
                    dirty: false,
                  }
                : r,
            ),
          )
          router.refresh()
        }
      })
      return
    }

    startTransition(async () => {
      const res = await savePricingSheetBatchAction([
        {
          productId: row.id,
          sku: row.sku || null,
          unitCost: row.unitCost,
          salePrice: effectiveSalePrice,
          shippingCost: row.shippingCost,
          packagingCost: row.packagingCost,
          laborCost: row.laborCost,
          lossPercent: row.lossPercent,
          targetMarginPercent: row.targetMarginPercent,
          taxPercent: row.taxPercent,
          mlListingType: row.mlListingType,
          mlClassicPercent: row.mlClassicPercent,
          mlPremiumPercent: row.mlPremiumPercent,
          mlFixedFeeMode: row.mlFixedFeeMode,
          mlFixedFeeAmount: row.mlFixedFeeAmount,
        },
      ])
      setFeedback({ ok: res.ok, text: res.message })
      if (res.ok) {
        setRows((prev) =>
          prev.map((r) =>
            r.id === row.id ? { ...r, salePrice: effectiveSalePrice, dirty: false } : r,
          ),
        )
        router.refresh()
      }
    })
  }

  function handleSaveAllCatalogRows() {
    const catalogRowsToSave = computedRows.filter(({ row }) => !row.isSimulatedOnly)
    if (catalogRowsToSave.length === 0) return

    setFeedback(null)
    startTransition(async () => {
      const payload = catalogRowsToSave.map(({ row, calc }) => ({
        productId: row.id,
        sku: row.sku || null,
        unitCost: row.unitCost,
        salePrice: row.salePrice > 0 ? row.salePrice : calc.active.suggestedPrice,
        shippingCost: row.shippingCost,
        packagingCost: row.packagingCost,
        laborCost: row.laborCost,
        lossPercent: row.lossPercent,
        targetMarginPercent: row.targetMarginPercent,
        taxPercent: row.taxPercent,
        mlListingType: row.mlListingType,
        mlClassicPercent: row.mlClassicPercent,
        mlPremiumPercent: row.mlPremiumPercent,
        mlFixedFeeMode: row.mlFixedFeeMode,
        mlFixedFeeAmount: row.mlFixedFeeAmount,
      }))

      const res = await savePricingSheetBatchAction(payload)
      setFeedback({ ok: res.ok, text: res.message })
      if (res.ok) {
        setRows((prev) =>
          prev.map((r) => (r.isSimulatedOnly ? r : { ...r, dirty: false })),
        )
        router.refresh()
      }
    })
  }

  function handleExportCsv() {
    const headers = [
      'SKU',
      'Produto',
      'Voltagem',
      'Estoque Atual',
      'Custo Aquisicao (R$)',
      'Embalagem/Sacola (R$)',
      'Mao de Obra (R$)',
      'Perda (%)',
      'Custo Ajustado (R$)',
      'Imposto NF (%)',
      'Imposto NF (R$)',
      'Anuncio ML',
      'Comissao ML (%)',
      'Comissao ML (R$)',
      'Taxa Fixa ML (R$)',
      'Frete Unitario (R$)',
      'Preco Minimo Zero Prejuizo (R$)',
      'Meta Margem Liquida (%)',
      'Preco Sugerido Clássico (R$)',
      'Preco Sugerido Premium (R$)',
      'Preco Venda Simulado (R$)',
      'Repasse Liquido ML (R$)',
      'Lucro Liquido / Unid (R$)',
      'Margem Liquida Real (%)',
      'Markup / ROI s/ Custo (%)',
    ]

    const fmtNum = (n: number) => n.toFixed(2).replace('.', ',')

    const csvLines = [
      headers.join(';'),
      ...computedRows.map(({ row, calc }) =>
        [
          `"${(row.sku || '').replace(/"/g, '""')}"`,
          `"${row.name.replace(/"/g, '""')}"`,
          `"${row.voltage ?? ''}"`,
          row.stockBalance,
          fmtNum(calc.unitCost),
          fmtNum(calc.packagingCost),
          fmtNum(calc.laborCost),
          fmtNum(calc.lossPercent),
          fmtNum(calc.adjustedAcquisitionCost),
          fmtNum(calc.taxPercent),
          fmtNum(calc.active.taxAmount),
          row.mlListingType,
          fmtNum(calc.active.mlPercent),
          fmtNum(calc.active.commissionAmount),
          fmtNum(calc.active.fixedFeeAmount),
          fmtNum(calc.shippingCost),
          fmtNum(calc.active.breakEvenPrice),
          fmtNum(calc.targetMarginPercent),
          fmtNum(calc.classic.suggestedPrice),
          fmtNum(calc.premium.suggestedPrice),
          fmtNum(calc.active.salePrice),
          fmtNum(calc.active.mlNetPayout),
          fmtNum(calc.active.netProfit),
          fmtNum(calc.active.netMarginPercent),
          fmtNum(calc.active.roiOnCostPercent),
        ].join(';'),
      ),
    ]

    const blob = new Blob(['\uFEFF' + csvLines.join('\n')], {
      type: 'text/csv;charset=utf-8;',
    })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `planilha-precificacao-ml-${new Date().toISOString().slice(0, 10)}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="space-y-5">
      {/* 1. KPIs Executivos da Planilha em Tempo Real */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <MetricCard
          title="Produtos na Planilha"
          value={`${summary.count} SKU(s)`}
          hint={`${summary.healthyCount} na meta · ${summary.belowCount} atenção · ${summary.negativeCount} prejuízo`}
          tone={
            summary.negativeCount > 0
              ? 'negative'
              : summary.healthyCount > 0
                ? 'positive'
                : 'neutral'
          }
          icon={Calculator}
        />
        <MetricCard
          title="Carga Média (NF + Comissão ML)"
          value={formatPercent(summary.avgTaxAndMlPercent)}
          hint="Soma média de Imposto NF (%) + Tarifa ML (%)"
          tone="warning"
          icon={AlertTriangle}
        />
        <MetricCard
          title="Margem Líquida Simulada (Média)"
          value={`${formatPercent(summary.avgNetMarginPercent)} (${formatCurrency(summary.avgNetProfitPerUnit)}/un.)`}
          hint="O que sobra limpo após Custo, NF, ML, Taxa Fixa e Frete"
          tone={
            summary.avgNetMarginPercent >= 15
              ? 'positive'
              : summary.avgNetMarginPercent > 0
                ? 'warning'
                : 'negative'
          }
          icon={TrendingUp}
        />
        <MetricCard
          title="Lucro Projetado no Estoque"
          value={formatCurrency(summary.totalStockPotentialProfit)}
          hint={`Faturamento potencial: ${formatCurrency(summary.totalStockPotentialRevenue)}`}
          tone={summary.totalStockPotentialProfit > 0 ? 'positive' : 'neutral'}
          icon={Sparkles}
        />
      </div>

      {/* 2. Barra de Parâmetros Rápidos do Mercado Livre & Impostos (Simulador em Massa) */}
      <section className="rounded-xl border bg-card p-4 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b pb-3">
          <div>
            <div className="flex items-center gap-2">
              <span className="inline-flex items-center gap-1 rounded-md bg-amber-500/15 px-2 py-0.5 text-xs font-semibold text-amber-700 dark:text-amber-300">
                <Calculator className="size-3.5" />
                Simulador Rápido Mercado Livre &amp; Impostos
              </span>
              <span className="text-xs text-muted-foreground">
                Altere qualquer célula na planilha abaixo ou aplique parâmetros em massa para todos os produtos na hora.
              </span>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={handleAddSimulatedRow}
            >
              <Plus className="size-3.5" />
              Simular Produto Avulso
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={handleExportCsv}
            >
              <Download className="size-3.5" />
              Exportar Excel (.CSV)
            </Button>
            {summary.dirtyCount > 0 && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={handleResetChanges}
              >
                <RotateCcw className="size-3.5" />
                Desfazer edições
              </Button>
            )}
            <Button
              type="button"
              size="sm"
              disabled={pending}
              onClick={handleSaveAllCatalogRows}
            >
              <Save className="size-3.5" />
              Salvar Planilha no Catálogo
              {summary.dirtyCount > 0 ? ` (${summary.dirtyCount})` : ''}
            </Button>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
          {/* Bloco 1: Imposto NF */}
          <div className="rounded-xl border bg-muted/20 p-3 space-y-2">
            <div className="flex items-center justify-between">
              <Label className="text-xs font-semibold">1. Imposto Nota Fiscal (%)</Label>
              <button
                type="button"
                onClick={() =>
                  applyBulkToAll(() => ({ taxPercent: bulkTaxPercent }))
                }
                className="text-[11px] font-semibold text-primary hover:underline"
              >
                Aplicar {bulkTaxPercent}% em todos
              </button>
            </div>
            <div className="flex items-center gap-2">
              <Input
                type="number"
                step="0.1"
                min={0}
                max={50}
                value={bulkTaxPercent}
                onChange={(e) => setBulkTaxPercent(Number(e.target.value))}
                className="h-8 w-20 font-mono text-xs font-bold"
              />
              <div className="flex flex-wrap gap-1">
                {TAX_PRESETS.map((pct) => (
                  <button
                    key={pct}
                    type="button"
                    onClick={() => {
                      setBulkTaxPercent(pct)
                      applyBulkToAll(() => ({ taxPercent: pct }))
                    }}
                    className={cn(
                      'rounded px-1.5 py-0.5 text-[11px] font-medium transition-colors',
                      bulkTaxPercent === pct
                        ? 'bg-primary text-primary-foreground'
                        : 'border bg-background hover:bg-muted',
                    )}
                  >
                    {String(pct).replace('.', ',')}%
                  </button>
                ))}
              </div>
            </div>
            <p className="text-[11px] text-muted-foreground">
              Clique em uma alíquota para simular Simples/Regime em todos os SKUs na hora.
            </p>
          </div>

          {/* Bloco 2: Taxas do Mercado Livre (Clássico vs Premium) */}
          <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-3 space-y-2">
            <div className="flex items-center justify-between">
              <Label className="text-xs font-semibold text-amber-800 dark:text-amber-300">
                2. Taxas Mercado Livre (%)
              </Label>
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() =>
                    applyBulkToAll(() => ({
                      mlListingType: 'CLASSICO',
                      mlClassicPercent: bulkClassicPercent,
                      mlPremiumPercent: bulkPremiumPercent,
                    }))
                  }
                  className="rounded border border-amber-500/40 bg-background px-1.5 py-0.5 text-[10px] font-semibold hover:bg-amber-500/15"
                >
                  Todos Clássico
                </button>
                <button
                  type="button"
                  onClick={() =>
                    applyBulkToAll(() => ({
                      mlListingType: 'PREMIUM',
                      mlClassicPercent: bulkClassicPercent,
                      mlPremiumPercent: bulkPremiumPercent,
                    }))
                  }
                  className="rounded border border-amber-500/40 bg-background px-1.5 py-0.5 text-[10px] font-semibold hover:bg-amber-500/15"
                >
                  Todos Premium
                </button>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <span className="text-[10px] text-muted-foreground">Clássico (%)</span>
                <Input
                  type="number"
                  step="0.5"
                  min={0}
                  max={40}
                  value={bulkClassicPercent}
                  onChange={(e) => {
                    const v = Number(e.target.value)
                    setBulkClassicPercent(v)
                    applyBulkToAll(() => ({ mlClassicPercent: v }))
                  }}
                  className="h-8 font-mono text-xs font-bold"
                />
              </div>
              <div>
                <span className="text-[10px] text-muted-foreground">Premium s/ Juros (%)</span>
                <Input
                  type="number"
                  step="0.5"
                  min={0}
                  max={40}
                  value={bulkPremiumPercent}
                  onChange={(e) => {
                    const v = Number(e.target.value)
                    setBulkPremiumPercent(v)
                    applyBulkToAll(() => ({ mlPremiumPercent: v }))
                  }}
                  className="h-8 font-mono text-xs font-bold"
                />
              </div>
            </div>
            <p className="text-[11px] text-muted-foreground">
              Ex.: Clássico 11,5% a 14% · Premium 16,5% a 19%.
            </p>
          </div>

          {/* Bloco 3: Taxa Fixa ML (< R$ 79,00) */}
          <div className="rounded-xl border bg-muted/20 p-3 space-y-2">
            <div className="flex items-center justify-between">
              <Label className="text-xs font-semibold">
                3. Taxa Fixa ML (&lt; R$ {ML_THRESHOLD_FREE_FIXED_FEE})
              </Label>
              <button
                type="button"
                onClick={() =>
                  applyBulkToAll(() => ({
                    mlFixedFeeMode: bulkFixedFeeMode,
                    mlFixedFeeAmount: bulkFixedFeeAmount,
                  }))
                }
                className="text-[11px] font-semibold text-primary hover:underline"
              >
                Aplicar regra
              </button>
            </div>
            <div className="grid grid-cols-3 gap-2">
              <div className="col-span-2">
                <NativeSelect
                  value={bulkFixedFeeMode}
                  onChange={(e) => {
                    const mode = e.target.value as MlFixedFeeMode
                    setBulkFixedFeeMode(mode)
                    applyBulkToAll(() => ({ mlFixedFeeMode: mode }))
                  }}
                  className="h-8 text-xs"
                >
                  <option value="AUTO_79">Auto (&lt; R$ 79 cobra fixa)</option>
                  <option value="MANUAL">Fixa sempre cobrada</option>
                  <option value="EXEMPT">Isento (R$ 0,00)</option>
                </NativeSelect>
              </div>
              <div>
                <Input
                  type="number"
                  step="0.5"
                  min={0}
                  value={bulkFixedFeeAmount}
                  onChange={(e) => {
                    const v = Number(e.target.value)
                    setBulkFixedFeeAmount(v)
                    applyBulkToAll(() => ({ mlFixedFeeAmount: v }))
                  }}
                  className="h-8 font-mono text-xs font-bold"
                  title="Valor da taxa fixa ML em R$ (ex.: R$ 6,00)"
                />
              </div>
            </div>
            <p className="text-[11px] text-muted-foreground">
              No ML, vendas abaixo de R$ 79 pagam taxa fixa (R$ 6,00/un.). Acima de R$ 79 zera a taxa fixa.
            </p>
          </div>

          {/* Bloco 4: Margem Líquida Alvo & Preço Sugerido */}
          <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/5 p-3 space-y-2">
            <div className="flex items-center justify-between">
              <Label className="text-xs font-semibold text-emerald-800 dark:text-emerald-300">
                4. Meta de Margem Líquida (%)
              </Label>
              <button
                type="button"
                onClick={() =>
                  applyBulkToAll((_row, calc) => ({
                    salePrice: calc.active.suggestedPrice,
                  }))
                }
                className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-700 underline hover:no-underline dark:text-emerald-300"
              >
                <Sparkles className="size-3" />
                Usar Preço Sugerido em todos
              </button>
            </div>
            <div className="flex items-center gap-2">
              <Input
                type="number"
                step="1"
                min={0}
                max={75}
                value={bulkTargetMargin}
                onChange={(e) => {
                  const v = Number(e.target.value)
                  setBulkTargetMargin(v)
                  applyBulkToAll(() => ({ targetMarginPercent: v }))
                }}
                className="h-8 w-20 font-mono text-xs font-bold"
              />
              <div className="flex flex-wrap gap-1">
                {TARGET_MARGIN_PRESETS.map((pct) => (
                  <button
                    key={pct}
                    type="button"
                    onClick={() => {
                      setBulkTargetMargin(pct)
                      applyBulkToAll(() => ({ targetMarginPercent: pct }))
                    }}
                    className={cn(
                      'rounded px-1.5 py-0.5 text-[11px] font-medium transition-colors',
                      bulkTargetMargin === pct
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
              Calcula o Preço Sugerido já descontando Custo + NF + Comissão ML + Taxa Fixa + Frete.
            </p>
          </div>
        </div>

        {feedback && (
          <div
            className={cn(
              'rounded-lg border px-3.5 py-2 text-xs font-medium',
              feedback.ok
                ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-800 dark:text-emerald-200'
                : 'border-destructive/40 bg-destructive/10 text-destructive',
            )}
          >
            {feedback.text}
          </div>
        )}
      </section>

      {/* 3. Barra de Filtro e Busca da Planilha */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="relative flex-1 min-w-[240px] max-w-md">
          <Search className="pointer-events-none absolute left-2.5 top-2.5 size-4 text-muted-foreground" />
          <Input
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Filtrar produto por nome, SKU, voltagem ou categoria..."
            className="h-9 pl-8 text-xs"
          />
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          {(
            [
              { id: 'ALL', label: `Todos (${summary.count})` },
              { id: 'HEALTHY', label: `Na Meta (${summary.healthyCount})` },
              { id: 'BELOW_TARGET', label: `Abaixo da Meta (${summary.belowCount})` },
              { id: 'NEGATIVE', label: `Prejuízo (${summary.negativeCount})` },
              { id: 'EMPTY', label: `Pendente Custo (${summary.emptyCount})` },
            ] as const
          ).map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setStatusFilter(tab.id)}
              className={cn(
                'rounded-lg px-2.5 py-1.5 text-xs font-medium transition-colors',
                statusFilter === tab.id
                  ? 'bg-primary text-primary-foreground'
                  : 'border bg-card text-muted-foreground hover:bg-muted hover:text-foreground',
              )}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* 4. Tabela / Planilha Interativa de Precificação */}
      <div className="overflow-x-auto rounded-xl border bg-card shadow-xs">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/30 text-[11px]">
              <TableHead className="min-w-[210px]">Produto / SKU</TableHead>
              <TableHead className="w-[115px] text-right">Custo Aquisição</TableHead>
              <TableHead className="w-[105px] text-right">Sacola / Emb.</TableHead>
              <TableHead className="w-[100px] text-right">Imposto NF</TableHead>
              <TableHead className="min-w-[165px] text-center">Anúncio &amp; Taxa ML</TableHead>
              <TableHead className="w-[105px] text-right">Frete Unit.</TableHead>
              <TableHead className="w-[95px] text-right">Meta Líq.</TableHead>
              <TableHead className="min-w-[145px] text-right">Preço Sugerido ML</TableHead>
              <TableHead className="w-[125px] text-right">Preço de Venda</TableHead>
              <TableHead className="w-[110px] text-right">Repasse ML</TableHead>
              <TableHead className="min-w-[140px] text-right">Margem na Hora</TableHead>
              <TableHead className="w-[110px] text-right">Ações</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredRows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={12} className="py-8 text-center text-sm text-muted-foreground">
                  Nenhum produto encontrado para o filtro selecionado.
                </TableCell>
              </TableRow>
            ) : (
              filteredRows.map(({ row, calc }) => {
                const isExpanded = Boolean(expandedRowIds[row.id])
                const activeMlPct =
                  row.mlListingType === 'PREMIUM' ? row.mlPremiumPercent : row.mlClassicPercent

                const healthBadge =
                  calc.marginHealth === 'EMPTY' ? (
                    <Badge variant="outline" className="text-[10px]">
                      Informe Custo / Preço
                    </Badge>
                  ) : calc.marginHealth === 'NEGATIVE' ? (
                    <span className="inline-flex items-center rounded-md bg-rose-500/15 px-1.5 py-0.5 text-[10px] font-bold text-rose-700 dark:text-rose-300">
                      PREJUÍZO ({formatPercent(calc.active.netMarginPercent)})
                    </span>
                  ) : calc.marginHealth === 'BELOW_TARGET' ? (
                    <span className="inline-flex items-center rounded-md bg-amber-500/15 px-1.5 py-0.5 text-[10px] font-bold text-amber-700 dark:text-amber-300">
                      Abaixo da Meta ({formatPercent(calc.active.netMarginPercent)})
                    </span>
                  ) : (
                    <span className="inline-flex items-center rounded-md bg-emerald-500/15 px-1.5 py-0.5 text-[10px] font-bold text-emerald-700 dark:text-emerald-300">
                      Na Meta ({formatPercent(calc.active.netMarginPercent)})
                    </span>
                  )

                return (
                  <SpreadsheetProductRowGroup
                    key={row.id}
                    row={row}
                    calc={calc}
                    activeMlPct={activeMlPct}
                    isExpanded={isExpanded}
                    pending={pending}
                    healthBadge={healthBadge}
                    onUpdate={(patch) => updateRow(row.id, patch)}
                    onToggleExpand={() => toggleExpand(row.id)}
                    onSave={() => handleSaveSingleRow(row, calc)}
                    onRemoveSimulated={() => handleRemoveSimulatedRow(row.id)}
                  />
                )
              })
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  )
}

function SpreadsheetProductRowGroup({
  row,
  calc,
  activeMlPct,
  isExpanded,
  pending,
  healthBadge,
  onUpdate,
  onToggleExpand,
  onSave,
  onRemoveSimulated,
}: {
  row: SpreadsheetRowState
  calc: MlPricingRowResult
  activeMlPct: number
  isExpanded: boolean
  pending: boolean
  healthBadge: React.ReactNode
  onUpdate: (patch: Partial<SpreadsheetRowState>) => void
  onToggleExpand: () => void
  onSave: () => void
  onRemoveSimulated: () => void
}) {
  return (
    <>
      <TableRow
        className={cn(
          'align-top transition-colors',
          row.dirty && 'bg-amber-500/[0.03]',
          calc.marginHealth === 'NEGATIVE' && 'bg-rose-500/[0.04]',
        )}
      >
        {/* 1. Produto / SKU */}
        <TableCell className="py-2.5">
          {row.isSimulatedOnly ? (
            <div className="space-y-1">
              <Input
                value={row.name}
                onChange={(e) => onUpdate({ name: e.target.value })}
                placeholder="Nome do produto..."
                className="h-7 text-xs font-semibold"
              />
              <div className="flex items-center gap-1">
                <Input
                  value={row.sku}
                  onChange={(e) => onUpdate({ sku: e.target.value })}
                  placeholder="SKU"
                  className="h-6 w-24 font-mono text-[11px]"
                />
                <span className="rounded bg-amber-500/15 px-1.5 py-0.5 text-[10px] font-medium text-amber-700 dark:text-amber-300">
                  Simulação
                </span>
              </div>
            </div>
          ) : (
            <div>
              <Link
                href={`/produtos/${row.id}`}
                className="font-semibold text-xs text-foreground hover:underline leading-snug block"
              >
                {row.name}
              </Link>
              <div className="mt-0.5 flex flex-wrap items-center gap-1 text-[11px] text-muted-foreground">
                {row.sku && <span className="font-mono">SKU {row.sku}</span>}
                {row.voltage && (
                  <span className="rounded bg-muted px-1 py-0.2 font-medium text-foreground text-[10px]">
                    {row.voltage}
                  </span>
                )}
                {row.grossWeightGrams ? <span>· {row.grossWeightGrams}g</span> : null}
                <span>· Est.: {formatNumber(row.stockBalance)}</span>
              </div>
              {row.linkedPackagingName && (
                <div className="mt-0.5 text-[10px] text-sky-600 dark:text-sky-400">
                  Sacola: {row.linkedPackagingName}
                </div>
              )}
            </div>
          )}
        </TableCell>

        {/* 2. Custo de Aquisição (R$) */}
        <TableCell className="py-2.5 text-right">
          <div className="flex flex-col items-end gap-1">
            <div className="relative w-24">
              <span className="pointer-events-none absolute left-2 top-1.5 text-[10px] text-muted-foreground">
                R$
              </span>
              <Input
                type="number"
                step="0.01"
                min={0}
                value={row.unitCost}
                onChange={(e) => onUpdate({ unitCost: Number(e.target.value) })}
                className="h-7 pl-6 pr-1.5 text-right font-mono text-xs font-semibold tabular-nums"
              />
            </div>
            {calc.adjustedAcquisitionCost > calc.unitCost && (
              <span
                className="text-[10px] text-muted-foreground tabular-nums"
                title="Custo somado (Aquisição + Embalagem + Operação + Perda)"
              >
                Total: {formatCurrency(calc.adjustedAcquisitionCost)}
              </span>
            )}
          </div>
        </TableCell>

        {/* 3. Embalagem / Sacola (R$) */}
        <TableCell className="py-2.5 text-right">
          <div className="flex flex-col items-end gap-1">
            <div className="relative w-20">
              <span className="pointer-events-none absolute left-1.5 top-1.5 text-[10px] text-muted-foreground">
                R$
              </span>
              <Input
                type="number"
                step="0.01"
                min={0}
                value={row.packagingCost}
                onChange={(e) => onUpdate({ packagingCost: Number(e.target.value) })}
                className="h-7 pl-5 pr-1.5 text-right font-mono text-xs tabular-nums"
              />
            </div>
            {(row.laborCost > 0 || row.lossPercent > 0) && (
              <span className="text-[10px] text-muted-foreground tabular-nums">
                +{formatCurrency(row.laborCost)} op. / {row.lossPercent}% perda
              </span>
            )}
          </div>
        </TableCell>

        {/* 4. Imposto NF (% e R$) */}
        <TableCell className="py-2.5 text-right">
          <div className="flex flex-col items-end gap-1">
            <div className="relative w-20">
              <Input
                type="number"
                step="0.1"
                min={0}
                max={50}
                value={row.taxPercent}
                onChange={(e) => onUpdate({ taxPercent: Number(e.target.value) })}
                className="h-7 pr-5 text-right font-mono text-xs tabular-nums"
              />
              <span className="pointer-events-none absolute right-1.5 top-1.5 text-[10px] text-muted-foreground">
                %
              </span>
            </div>
            <span className="text-[10px] font-medium text-rose-600/90 dark:text-rose-400 tabular-nums">
              −{formatCurrency(calc.active.taxAmount)}
            </span>
          </div>
        </TableCell>

        {/* 5. Anúncio & Taxa ML (% + Taxa Fixa) */}
        <TableCell className="py-2.5">
          <div className="flex flex-col items-center gap-1">
            <div className="flex items-center gap-1">
              <div className="inline-flex rounded-md border bg-muted/40 p-0.5">
                <button
                  type="button"
                  onClick={() => onUpdate({ mlListingType: 'CLASSICO' })}
                  className={cn(
                    'rounded px-1.5 py-0.5 text-[10px] font-semibold transition-colors',
                    row.mlListingType === 'CLASSICO'
                      ? 'bg-amber-500 text-white shadow-2xs'
                      : 'text-muted-foreground hover:text-foreground',
                  )}
                >
                  Clássico
                </button>
                <button
                  type="button"
                  onClick={() => onUpdate({ mlListingType: 'PREMIUM' })}
                  className={cn(
                    'rounded px-1.5 py-0.5 text-[10px] font-semibold transition-colors',
                    row.mlListingType === 'PREMIUM'
                      ? 'bg-amber-600 text-white shadow-2xs'
                      : 'text-muted-foreground hover:text-foreground',
                  )}
                >
                  Premium
                </button>
              </div>
              <div className="relative w-16">
                <Input
                  type="number"
                  step="0.5"
                  min={0}
                  max={45}
                  value={activeMlPct}
                  onChange={(e) => {
                    const val = Number(e.target.value)
                    if (row.mlListingType === 'PREMIUM') {
                      onUpdate({ mlPremiumPercent: val })
                    } else {
                      onUpdate({ mlClassicPercent: val })
                    }
                  }}
                  className="h-7 pr-4 text-right font-mono text-xs font-semibold tabular-nums"
                />
                <span className="pointer-events-none absolute right-1 top-1.5 text-[10px] text-muted-foreground">
                  %
                </span>
              </div>
            </div>

            <div className="flex flex-wrap items-center justify-center gap-1 text-[10px] tabular-nums">
              <span className="font-medium text-rose-600/90 dark:text-rose-400">
                −{formatCurrency(calc.active.totalMlFeesAmount)}
              </span>
              {calc.active.fixedFeeAmount > 0 ? (
                <span
                  className="rounded bg-amber-500/15 px-1 py-0.2 text-[9px] font-medium text-amber-800 dark:text-amber-300"
                  title="Abaixo de R$ 79,00 o Mercado Livre cobra taxa fixa por unidade além da comissão percentual."
                >
                  c/ +{formatCurrency(calc.active.fixedFeeAmount)} fixa
                </span>
              ) : (
                <span
                  className="rounded bg-emerald-500/10 px-1 py-0.2 text-[9px] text-emerald-700 dark:text-emerald-300"
                  title="A partir de R$ 79,00 fica isento da taxa fixa por unidade do Mercado Livre."
                >
                  s/ taxa fixa
                </span>
              )}
            </div>
          </div>
        </TableCell>

        {/* 6. Frete Unitário ML (R$) */}
        <TableCell className="py-2.5 text-right">
          <div className="flex flex-col items-end gap-1">
            <div className="relative w-22">
              <span className="pointer-events-none absolute left-1.5 top-1.5 text-[10px] text-muted-foreground">
                R$
              </span>
              <Input
                type="number"
                step="0.01"
                min={0}
                value={row.shippingCost}
                onChange={(e) => onUpdate({ shippingCost: Number(e.target.value) })}
                className="h-7 pl-5 pr-1.5 text-right font-mono text-xs tabular-nums"
              />
            </div>
            <span className="text-[10px] text-muted-foreground">
              {row.shippingCost > 0 ? 'Mercado Envios' : 'Sem frete vendedor'}
            </span>
          </div>
        </TableCell>

        {/* 7. Meta de Margem Líquida (%) */}
        <TableCell className="py-2.5 text-right">
          <div className="flex flex-col items-end gap-1">
            <div className="relative w-18">
              <Input
                type="number"
                step="1"
                min={0}
                max={75}
                value={row.targetMarginPercent}
                onChange={(e) => onUpdate({ targetMarginPercent: Number(e.target.value) })}
                className="h-7 pr-4 text-right font-mono text-xs font-semibold tabular-nums"
              />
              <span className="pointer-events-none absolute right-1 top-1.5 text-[10px] text-muted-foreground">
                %
              </span>
            </div>
            <span
              className="text-[10px] text-muted-foreground tabular-nums"
              title="Preço mínimo (Margem 0%) para não ter prejuízo no ML"
            >
              Mín: {formatCurrency(calc.active.breakEvenPrice)}
            </span>
          </div>
        </TableCell>

        {/* 8. Preço Sugerido ML (Clássico / Premium) */}
        <TableCell className="py-2.5 text-right">
          <div className="flex flex-col items-end gap-1">
            <div className="flex items-center gap-1">
              <span className="font-mono text-xs font-bold tabular-nums text-foreground">
                {formatCurrency(calc.active.suggestedPrice)}
              </span>
              {calc.active.suggestedPrice > 0 &&
                Math.abs(row.salePrice - calc.active.suggestedPrice) > 0.01 && (
                  <button
                    type="button"
                    onClick={() => onUpdate({ salePrice: calc.active.suggestedPrice })}
                    className="inline-flex items-center gap-0.5 rounded bg-primary/15 px-1.5 py-0.5 text-[10px] font-semibold text-primary hover:bg-primary/25"
                    title="Aplicar Preço Sugerido no Preço de Venda Simulado"
                  >
                    Usar
                    <ArrowRight className="size-2.5" />
                  </button>
                )}
            </div>
            <span className="text-[10px] text-muted-foreground tabular-nums">
              {row.mlListingType === 'CLASSICO'
                ? `Premium (${row.mlPremiumPercent}%): ${formatCurrency(calc.premium.suggestedPrice)}`
                : `Clássico (${row.mlClassicPercent}%): ${formatCurrency(calc.classic.suggestedPrice)}`}
            </span>
          </div>
        </TableCell>

        {/* 9. Preço de Venda Simulado (R$) */}
        <TableCell className="py-2.5 text-right">
          <div className="flex flex-col items-end gap-1">
            <div className="relative w-26">
              <span className="pointer-events-none absolute left-2 top-1.5 text-[10px] font-semibold text-primary">
                R$
              </span>
              <Input
                type="number"
                step="0.10"
                min={0}
                value={row.salePrice}
                placeholder={
                  calc.active.suggestedPrice > 0
                    ? calc.active.suggestedPrice.toFixed(2)
                    : '0.00'
                }
                onChange={(e) => onUpdate({ salePrice: Number(e.target.value) })}
                className="h-7 border-primary/40 bg-primary/5 pl-6 pr-1.5 text-right font-mono text-xs font-extrabold tabular-nums"
              />
            </div>
            {row.salePrice === 0 && calc.active.suggestedPrice > 0 && (
              <span className="text-[9px] text-amber-600 dark:text-amber-400">
                Simulando c/ sugerido
              </span>
            )}
          </div>
        </TableCell>

        {/* 10. Repasse Líquido do ML (R$) */}
        <TableCell className="py-2.5 text-right tabular-nums">
          <div className="font-mono text-xs font-semibold text-sky-700 dark:text-sky-300">
            {formatCurrency(calc.active.mlNetPayout)}
          </div>
          <div className="text-[10px] text-muted-foreground">
            Venda − ML − Frete
          </div>
        </TableCell>

        {/* 11. Margem Líquida na Hora (R$ e %) */}
        <TableCell className="py-2.5 text-right tabular-nums">
          <div
            className={cn(
              'font-mono text-sm font-extrabold',
              calc.active.netProfit > 0
                ? 'text-emerald-600 dark:text-emerald-400'
                : calc.active.netProfit < 0
                  ? 'text-rose-600 dark:text-rose-400'
                  : 'text-muted-foreground',
            )}
          >
            {calc.active.netProfit >= 0 ? '+' : ''}
            {formatCurrency(calc.active.netProfit)}
          </div>
          <div className="mt-0.5 flex flex-col items-end gap-0.5">
            {healthBadge}
            <span className="text-[10px] text-muted-foreground">
              ROI Custo: {formatPercent(calc.active.roiOnCostPercent)}
            </span>
          </div>
        </TableCell>

        {/* 12. Ações da Linha */}
        <TableCell className="py-2.5 text-right">
          <div className="flex items-center justify-end gap-1">
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              onClick={onToggleExpand}
              title="Abrir Raio-X: Comparativo Clássico vs Premium e Simulador de Lote"
            >
              {isExpanded ? <ChevronUp className="size-4" /> : <ChevronDown className="size-4" />}
            </Button>
            <Button
              type="button"
              variant={row.dirty ? 'default' : 'outline'}
              size="icon-sm"
              disabled={pending}
              onClick={onSave}
              title={
                row.isSimulatedOnly
                  ? 'Cadastrar este produto simulado no Catálogo'
                  : 'Salvar custos, taxas do ML e preço deste produto'
              }
            >
              {row.isSimulatedOnly ? (
                <PackagePlus className="size-3.5" />
              ) : (
                <Check className="size-3.5" />
              )}
            </Button>
            {row.isSimulatedOnly && (
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                onClick={onRemoveSimulated}
                title="Remover linha de simulação"
              >
                <Trash2 className="size-3.5 text-destructive" />
              </Button>
            )}
          </div>
        </TableCell>
      </TableRow>

      {/* Linha Expandida: Raio-X Completo Clássico vs Premium + Simulador de Volume */}
      {isExpanded && (
        <TableRow className="bg-muted/25">
          <TableCell colSpan={12} className="p-4">
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
              {/* Coluna 1: Decomposição Completa Centavo a Centavo */}
              <div className="rounded-xl border bg-background p-3.5 space-y-2.5">
                <div className="flex items-center justify-between border-b pb-2">
                  <span className="text-xs font-bold">
                    Cascata do Preço ({calc.active.label})
                  </span>
                  <span className="font-mono text-xs font-bold text-primary">
                    Venda: {formatCurrency(calc.active.salePrice)}
                  </span>
                </div>
                <div className="space-y-1.5 text-xs">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Preço de Venda no ML:</span>
                    <span className="font-mono font-semibold">
                      {formatCurrency(calc.active.salePrice)}
                    </span>
                  </div>
                  <div className="flex justify-between text-rose-600 dark:text-rose-400">
                    <span>(−) Comissão ML ({calc.active.mlPercent}%):</span>
                    <span className="font-mono">
                      −{formatCurrency(calc.active.commissionAmount)}
                    </span>
                  </div>
                  <div className="flex justify-between text-rose-600 dark:text-rose-400">
                    <span>
                      (−) Taxa Fixa ML ({calc.active.isExemptFromFixedFee ? 'Isento ≥ R$ 79' : '< R$ 79'}):
                    </span>
                    <span className="font-mono">
                      −{formatCurrency(calc.active.fixedFeeAmount)}
                    </span>
                  </div>
                  <div className="flex justify-between text-rose-600 dark:text-rose-400">
                    <span>(−) Frete Unitário (Mercado Envios):</span>
                    <span className="font-mono">
                      −{formatCurrency(calc.active.shippingAmount)}
                    </span>
                  </div>
                  <div className="flex justify-between border-t pt-1 font-semibold text-sky-700 dark:text-sky-300">
                    <span>(=) Repasse Líquido do Mercado Livre:</span>
                    <span className="font-mono">{formatCurrency(calc.active.mlNetPayout)}</span>
                  </div>
                  <div className="flex justify-between text-rose-600 dark:text-rose-400">
                    <span>(−) Imposto Nota Fiscal ({calc.taxPercent}%):</span>
                    <span className="font-mono">−{formatCurrency(calc.active.taxAmount)}</span>
                  </div>
                  <div className="flex justify-between text-muted-foreground">
                    <span>(−) Custo de Aquisição do Produto:</span>
                    <span className="font-mono">−{formatCurrency(calc.unitCost)}</span>
                  </div>
                  <div className="flex justify-between text-muted-foreground">
                    <span>(−) Sacola / Embalagem + Operação + Perda:</span>
                    <span className="font-mono">
                      −{formatCurrency(calc.packagingCost + calc.laborCost + calc.lossReserveAmount)}
                    </span>
                  </div>
                  <div className="flex justify-between border-t pt-1.5 text-sm font-extrabold text-emerald-700 dark:text-emerald-300">
                    <span>(=) Lucro Líquido Real / Unid.:</span>
                    <span className="font-mono">
                      {formatCurrency(calc.active.netProfit)} ({formatPercent(calc.active.netMarginPercent)})
                    </span>
                  </div>
                </div>
              </div>

              {/* Coluna 2: Comparativo Lado a Lado ML Clássico vs ML Premium */}
              <div className="rounded-xl border bg-background p-3.5 space-y-2.5">
                <div className="flex items-center justify-between border-b pb-2">
                  <span className="text-xs font-bold">
                    Comparativo: Anúncio Clássico vs Premium
                  </span>
                  <span className="text-[11px] text-muted-foreground">
                    Meta: {row.targetMarginPercent}% líq.
                  </span>
                </div>
                <div className="grid grid-cols-2 gap-2.5 text-xs">
                  {([calc.classic, calc.premium] as const).map((tier) => (
                    <div
                      key={tier.listingType}
                      className={cn(
                        'rounded-lg border p-2.5 space-y-1.5',
                        row.mlListingType === tier.listingType
                          ? 'border-amber-500/50 bg-amber-500/5'
                          : 'bg-muted/20',
                      )}
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-bold">{tier.label}</span>
                        <Badge variant="outline" className="text-[10px]">
                          {tier.mlPercent}%
                        </Badge>
                      </div>
                      <div className="text-[11px] text-muted-foreground">
                        Vendendo a <strong>{formatCurrency(tier.salePrice)}</strong>:
                      </div>
                      <div className="flex justify-between text-[11px]">
                        <span>Tarifas ML:</span>
                        <span className="font-mono text-rose-600 dark:text-rose-400">
                          −{formatCurrency(tier.totalMlFeesAmount)}
                        </span>
                      </div>
                      <div className="flex justify-between text-[11px]">
                        <span>Sobra Líquida:</span>
                        <span
                          className={cn(
                            'font-mono font-bold',
                            tier.netProfit >= 0
                              ? 'text-emerald-600 dark:text-emerald-400'
                              : 'text-rose-600 dark:text-rose-400',
                          )}
                        >
                          {formatCurrency(tier.netProfit)} ({formatPercent(tier.netMarginPercent)})
                        </span>
                      </div>
                      <div className="border-t pt-1.5">
                        <div className="text-[10px] text-muted-foreground">
                          Preço Sugerido p/ {row.targetMarginPercent}%:
                        </div>
                        <div className="mt-0.5 flex items-center justify-between">
                          <span className="font-mono text-xs font-bold">
                            {formatCurrency(tier.suggestedPrice)}
                          </span>
                          <button
                            type="button"
                            onClick={() =>
                              onUpdate({
                                mlListingType: tier.listingType,
                                salePrice: tier.suggestedPrice,
                              })
                            }
                            className="rounded bg-primary/15 px-1.5 py-0.5 text-[10px] font-semibold text-primary hover:bg-primary/25"
                          >
                            Aplicar
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Coluna 3: Ajustes Finos da Linha & Projeção por Volume de Vendas */}
              <div className="rounded-xl border bg-background p-3.5 space-y-3">
                <div className="border-b pb-2">
                  <span className="text-xs font-bold">
                    Ajustes Operacionais &amp; Simulação de Lote
                  </span>
                </div>
                <div className="grid grid-cols-3 gap-2">
                  <div>
                    <Label className="text-[10px]">Mão de Obra (R$)</Label>
                    <Input
                      type="number"
                      step="0.10"
                      min={0}
                      value={row.laborCost}
                      onChange={(e) => onUpdate({ laborCost: Number(e.target.value) })}
                      className="h-7 font-mono text-xs"
                    />
                  </div>
                  <div>
                    <Label className="text-[10px]">Perda / Devol. (%)</Label>
                    <Input
                      type="number"
                      step="0.5"
                      min={0}
                      max={80}
                      value={row.lossPercent}
                      onChange={(e) => onUpdate({ lossPercent: Number(e.target.value) })}
                      className="h-7 font-mono text-xs"
                    />
                  </div>
                  <div>
                    <Label className="text-[10px]">Regra Fixa ML</Label>
                    <NativeSelect
                      value={row.mlFixedFeeMode}
                      onChange={(e) =>
                        onUpdate({ mlFixedFeeMode: e.target.value as MlFixedFeeMode })
                      }
                      className="h-7 text-[11px]"
                    >
                      <option value="AUTO_79">Auto &lt; R$ 79</option>
                      <option value="MANUAL">Fixa Sempre</option>
                      <option value="EXEMPT">Isento</option>
                    </NativeSelect>
                  </div>
                </div>

                <div className="rounded-lg border bg-muted/20 p-2.5 space-y-1.5">
                  <div className="text-[11px] font-semibold text-muted-foreground">
                    Quanto sobra no bolso por volume vendido (a {formatCurrency(calc.active.salePrice)}):
                  </div>
                  <div className="grid grid-cols-4 gap-1.5 text-center text-[11px]">
                    {[10, 30, 50, 100].map((qty) => (
                      <div key={qty} className="rounded border bg-background p-1.5">
                        <div className="font-semibold text-muted-foreground">{qty} un.</div>
                        <div
                          className={cn(
                            'font-mono text-xs font-bold tabular-nums',
                            calc.active.netProfit >= 0
                              ? 'text-emerald-600 dark:text-emerald-400'
                              : 'text-rose-600 dark:text-rose-400',
                          )}
                        >
                          {formatCurrency(round2(calc.active.netProfit * qty))}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </TableCell>
        </TableRow>
      )}
    </>
  )
}
