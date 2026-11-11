'use client'

import { useState, useTransition } from 'react'
import {
  AlertCircle,
  Calendar,
  Check,
  ChevronRight,
  Flame,
  Fuel,
  Info,
  MapPin,
  Package,
  RotateCcw,
  Save,
  TrendingDown,
  TrendingUp,
  Truck,
} from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { formatCurrency, formatNumber, num, round2 } from '@/lib/format'
import { cn } from '@/lib/utils'

import {
  saveLogisticsConfigAction,
  type LogisticsFleetConfig,
  type MonthlyLogisticsRecord,
} from './actions'

const VOLUME_BENCHMARKS = [50, 100, 250, 500, 1000, 1500, 2000, 3000, 5000]

export function LogisticsCalculator({ initialConfig }: { initialConfig: LogisticsFleetConfig }) {
  const [routeKm, setRouteKm] = useState<number>(initialConfig.defaultRouteKm || 8.2)
  const [costPerKm, setCostPerKm] = useState<number>(initialConfig.costPerKm || 0)
  const [monthlyTrips, setMonthlyTrips] = useState<number>(initialConfig.monthlyTrips || 0)
  const [monthlyBoxes, setMonthlyBoxes] = useState<number>(initialConfig.monthlyBoxes || 0)
  const [history, setHistory] = useState<MonthlyLogisticsRecord[]>(initialConfig.history || [])
  const [selectedMonth, setSelectedMonth] = useState<string>(() => {
    const d = new Date()
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
  })

  const [pending, startTransition] = useTransition()
  const [feedback, setFeedback] = useState<{ ok: boolean; text: string } | null>(null)

  // Cálculos matemáticos exatos
  const cleanRouteKm = Math.max(0, num(routeKm))
  const cleanCostPerKm = Math.max(0, num(costPerKm))
  const cleanTrips = Math.max(0, Math.round(num(monthlyTrips)))
  const cleanBoxes = Math.max(0, Math.round(num(monthlyBoxes)))

  const tripCost = round2(cleanRouteKm * cleanCostPerKm)
  const totalMonthlyKm = round2(cleanRouteKm * cleanTrips)
  const totalMonthlyCost = round2(tripCost * cleanTrips)
  const costPerBox = cleanBoxes > 0 ? round2(totalMonthlyCost / cleanBoxes) : 0

  function handleSaveCurrentConfig() {
    setFeedback(null)
    startTransition(async () => {
      const res = await saveLogisticsConfigAction({
        defaultRouteKm: cleanRouteKm,
        costPerKm: cleanCostPerKm,
        monthlyTrips: cleanTrips,
        monthlyBoxes: cleanBoxes,
        history,
      })
      setFeedback({ ok: res.ok, text: res.message })
    })
  }

  function handleSaveMonthToHistory() {
    setFeedback(null)
    const [year, month] = selectedMonth.split('-')
    const monthNames = [
      'Janeiro',
      'Fevereiro',
      'Março',
      'Abril',
      'Maio',
      'Junho',
      'Julho',
      'Agosto',
      'Setembro',
      'Outubro',
      'Novembro',
      'Dezembro',
    ]
    const monthLabel = `${monthNames[Number(month) - 1] ?? month}/${year}`

    const record: MonthlyLogisticsRecord = {
      monthKey: selectedMonth,
      monthLabel,
      routeDistanceKm: cleanRouteKm,
      costPerKm: cleanCostPerKm,
      tripsCount: cleanTrips,
      boxesShipped: cleanBoxes,
      totalTripCost: tripCost,
      totalMonthlyCost,
      costPerBox,
      updatedAt: new Date().toISOString(),
    }

    const nextHistory = [
      record,
      ...history.filter((h) => h.monthKey !== selectedMonth),
    ].sort((a, b) => b.monthKey.localeCompare(a.monthKey))

    setHistory(nextHistory)

    startTransition(async () => {
      const res = await saveLogisticsConfigAction({
        defaultRouteKm: cleanRouteKm,
        costPerKm: cleanCostPerKm,
        monthlyTrips: cleanTrips,
        monthlyBoxes: cleanBoxes,
        history: nextHistory,
      })
      setFeedback({
        ok: res.ok,
        text: res.ok
          ? `Fechamento de ${monthLabel} salvo com sucesso no histórico!`
          : res.message,
      })
    })
  }

  return (
    <div className="space-y-6">
      {/* CARDS DE RESUMO EM TEMPO REAL */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-xl border bg-card p-4 shadow-xs">
          <div className="flex items-center justify-between text-xs font-semibold text-muted-foreground">
            <span>Rota do Caminhão</span>
            <MapPin className="size-4 text-sky-600" />
          </div>
          <div className="mt-2 text-2xl font-black tabular-nums text-foreground">
            {formatNumber(cleanRouteKm)} km
          </div>
          <p className="mt-1 text-[11px] text-muted-foreground">
            Trajeto fixo ida e volta até o ponto ML
          </p>
        </div>

        <div className="rounded-xl border bg-card p-4 shadow-xs">
          <div className="flex items-center justify-between text-xs font-semibold text-muted-foreground">
            <span>Custo por Viagem</span>
            <Fuel className="size-4 text-amber-600" />
          </div>
          <div className="mt-2 text-2xl font-black tabular-nums text-amber-700 dark:text-amber-300">
            {formatCurrency(tripCost)}
          </div>
          <p className="mt-1 text-[11px] text-muted-foreground">
            {cleanCostPerKm > 0
              ? `${cleanRouteKm} km × ${formatCurrency(cleanCostPerKm)}/km`
              : 'Defina o custo por km do caminhão'}
          </p>
        </div>

        <div className="rounded-xl border bg-card p-4 shadow-xs">
          <div className="flex items-center justify-between text-xs font-semibold text-muted-foreground">
            <span>Gasto Total no Mês</span>
            <Truck className="size-4 text-rose-600" />
          </div>
          <div className="mt-2 text-2xl font-black tabular-nums text-foreground">
            {formatCurrency(totalMonthlyCost)}
          </div>
          <p className="mt-1 text-[11px] text-muted-foreground">
            {cleanTrips > 0
              ? `${cleanTrips} viagens (${formatNumber(totalMonthlyKm)} km rodados)`
              : 'Informe a quantidade de viagens no mês'}
          </p>
        </div>

        <div className="rounded-xl border-2 border-emerald-500/40 bg-emerald-500/10 p-4 shadow-xs">
          <div className="flex items-center justify-between text-xs font-bold text-emerald-800 dark:text-emerald-300">
            <span>Rateio por Caixa / Pedido</span>
            <Package className="size-4 text-emerald-600" />
          </div>
          <div className="mt-2 text-2xl font-black tabular-nums text-emerald-700 dark:text-emerald-300">
            {cleanBoxes > 0 ? formatCurrency(costPerBox) : 'R$ 0,00'}
          </div>
          <p className="mt-1 text-[11px] font-medium text-emerald-800 dark:text-emerald-300">
            {cleanBoxes > 0
              ? `Diluído em ${formatNumber(cleanBoxes)} caixas enviadas`
              : 'Defina o total de caixas no mês'}
          </p>
        </div>
      </div>

      {/* FORMULÁRIO DE ENTRADAS DA OPERAÇÃO */}
      <div className="rounded-xl border bg-card p-5 shadow-xs space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b pb-3">
          <div>
            <h2 className="text-base font-bold text-foreground flex items-center gap-2">
              <Truck className="size-5 text-sky-600" />
              Parâmetros de Deslocamento do Caminhão
            </h2>
            <p className="text-xs text-muted-foreground">
              Apenas a distância padrão já vem fixada em <strong>8,2 km</strong>. Preencha o custo/km do combustível e a frequência do mês.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={pending}
              onClick={() => {
                setRouteKm(8.2)
                setCostPerKm(0)
                setMonthlyTrips(0)
                setMonthlyBoxes(0)
              }}
            >
              <RotateCcw className="size-3.5" />
              Resetar
            </Button>
            <Button
              type="button"
              size="sm"
              disabled={pending}
              onClick={handleSaveCurrentConfig}
              className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold"
            >
              <Save className="size-3.5" />
              {pending ? 'Salvando...' : 'Salvar Parâmetros'}
            </Button>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {/* Campo 1: Distância fixa da rota */}
          <div className="rounded-xl border-2 border-sky-500/40 bg-sky-500/5 p-3.5 space-y-1.5">
            <div className="flex items-center justify-between">
              <Label htmlFor="route-km" className="text-xs font-bold text-sky-900 dark:text-sky-200">
                1. Distância da Rota (km)
              </Label>
              <span className="rounded bg-sky-600 text-white px-1.5 py-0.2 text-[10px] font-bold">
                Fixado
              </span>
            </div>
            <div className="relative">
              <Input
                id="route-km"
                type="number"
                step="0.1"
                min={0}
                value={routeKm || ''}
                onChange={(e) => setRouteKm(Math.max(0, Number(e.target.value)))}
                className="h-10 font-mono text-lg font-extrabold pr-9 bg-background"
              />
              <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs font-bold text-muted-foreground">
                km
              </span>
            </div>
            <p className="text-[11px] text-muted-foreground">
              Percurso de ida e volta da fábrica/depósito até o ponto de envio.
            </p>
          </div>

          {/* Campo 2: Custo por km do caminhão */}
          <div className="rounded-xl border-2 border-amber-500/40 bg-amber-500/5 p-3.5 space-y-1.5">
            <div className="flex items-center justify-between">
              <Label htmlFor="cost-km" className="text-xs font-bold text-amber-900 dark:text-amber-200">
                2. Custo do Caminhão por km
              </Label>
              <span className="text-[10px] font-medium text-muted-foreground">R$/km</span>
            </div>
            <div className="relative">
              <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-xs font-bold text-muted-foreground">
                R$
              </span>
              <Input
                id="cost-km"
                type="number"
                step="0.1"
                min={0}
                placeholder="Ex.: 6,00"
                value={costPerKm || ''}
                onChange={(e) => setCostPerKm(Math.max(0, Number(e.target.value)))}
                className="h-10 font-mono text-lg font-extrabold pl-9 bg-background"
              />
            </div>
            <p className="text-[11px] text-muted-foreground">
              Gasto médio de combustível e manutenção (ex.: R$ 6,00, R$ 7,00 ou R$ 8,00).
            </p>
          </div>

          {/* Campo 3: Viagens no mês */}
          <div className="rounded-xl border bg-muted/20 p-3.5 space-y-1.5">
            <div className="flex items-center justify-between">
              <Label htmlFor="trips-count" className="text-xs font-bold text-foreground">
                3. Viagens no Mês
              </Label>
              <span className="text-[10px] font-medium text-muted-foreground">Idas</span>
            </div>
            <div className="relative">
              <Input
                id="trips-count"
                type="number"
                step="1"
                min={0}
                placeholder="Ex.: 30"
                value={monthlyTrips || ''}
                onChange={(e) => setMonthlyTrips(Math.max(0, Number(e.target.value)))}
                className="h-10 font-mono text-lg font-extrabold pr-14 bg-background"
              />
              <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs font-bold text-muted-foreground">
                viagens
              </span>
            </div>
            <p className="text-[11px] text-muted-foreground">
              Quantas vezes o caminhão precisou levar pedidos no mês (ex.: 30 ou 60).
            </p>
          </div>

          {/* Campo 4: Caixas despachadas no mês */}
          <div className="rounded-xl border bg-muted/20 p-3.5 space-y-1.5">
            <div className="flex items-center justify-between">
              <Label htmlFor="boxes-count" className="text-xs font-bold text-foreground">
                4. Total de Caixas no Mês
              </Label>
              <span className="text-[10px] font-medium text-muted-foreground">Volume</span>
            </div>
            <div className="relative">
              <Input
                id="boxes-count"
                type="number"
                step="1"
                min={0}
                placeholder="Ex.: 1000"
                value={monthlyBoxes || ''}
                onChange={(e) => setMonthlyBoxes(Math.max(0, Number(e.target.value)))}
                className="h-10 font-mono text-lg font-extrabold pr-14 bg-background"
              />
              <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs font-bold text-muted-foreground">
                caixas
              </span>
            </div>
            <p className="text-[11px] text-muted-foreground">
              Total de caixas ou pedidos enviados somando todas as viagens do mês.
            </p>
          </div>
        </div>

        {/* FEEDBACK DE SUCESSO OU ERRO */}
        {feedback && (
          <div
            className={cn(
              'rounded-lg border px-3 py-2 text-xs flex items-center gap-2',
              feedback.ok
                ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-800 dark:text-emerald-300 font-semibold'
                : 'border-destructive/40 bg-destructive/10 text-destructive',
            )}
          >
            {feedback.ok ? <Check className="size-4" /> : <AlertCircle className="size-4" />}
            <span>{feedback.text}</span>
          </div>
        )}
      </div>

      {/* TABELA DE SENSIBILIDADE / RATEIO POR VOLUME DE CAIXAS */}
      <div className="rounded-xl border bg-card p-5 shadow-xs space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h3 className="text-sm font-bold text-foreground flex items-center gap-1.5">
              <TrendingDown className="size-4 text-emerald-600" />
              Tabela de Sensibilidade: Como o custo por caixa cai com o volume?
            </h3>
            <p className="text-xs text-muted-foreground">
              Veja exatamente quanto o caminhão custa por unidade em diferentes volumes mensais para o custo total de{' '}
              <strong className="text-foreground">{formatCurrency(totalMonthlyCost)}</strong> (
              {cleanTrips} viagens a {cleanCostPerKm > 0 ? formatCurrency(cleanCostPerKm) : 'R$ 0'}/km).
            </p>
          </div>
        </div>

        <div className="overflow-x-auto rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/30">
                <TableHead>Volume Mensal de Caixas</TableHead>
                <TableHead className="text-right">Média de Caixas / Viagem</TableHead>
                <TableHead className="text-right">Gasto Total do Caminhão</TableHead>
                <TableHead className="text-right font-bold text-emerald-800 dark:text-emerald-300">
                  Custo de Frete por Caixa
                </TableHead>
                <TableHead className="text-right">Impacto no Produto</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {VOLUME_BENCHMARKS.map((vol) => {
                const unitCost = totalMonthlyCost > 0 ? round2(totalMonthlyCost / vol) : 0
                const avgPerTrip = cleanTrips > 0 ? Math.round(vol / cleanTrips) : 0
                const isSelected = cleanBoxes === vol

                return (
                  <TableRow
                    key={vol}
                    className={cn(
                      'cursor-pointer transition-colors',
                      isSelected ? 'bg-emerald-500/15 font-bold' : 'hover:bg-muted/40',
                    )}
                    onClick={() => setMonthlyBoxes(vol)}
                    title="Clique para aplicar esta quantidade no formulário acima"
                  >
                    <TableCell className="font-medium">
                      {formatNumber(vol)} caixas / mês
                      {isSelected && (
                        <span className="ml-2 rounded bg-emerald-600 text-white px-1.5 py-0.2 text-[10px]">
                          Selecionado
                        </span>
                      )}
                    </TableCell>
                    <TableCell className="text-right tabular-nums text-muted-foreground">
                      {cleanTrips > 0 ? `~${avgPerTrip} cx/viagem` : '—'}
                    </TableCell>
                    <TableCell className="text-right tabular-nums text-muted-foreground">
                      {formatCurrency(totalMonthlyCost)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums font-black text-emerald-700 dark:text-emerald-300 text-sm">
                      {formatCurrency(unitCost)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums text-xs text-muted-foreground">
                      {unitCost > 0 ? `+${formatCurrency(unitCost)} por unidade vendida` : 'R$ 0,00'}
                    </TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
        </div>
      </div>

      {/* FECHAMENTO MENSAL E HISTÓRICO */}
      <div className="rounded-xl border bg-card p-5 shadow-xs space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b pb-3">
          <div>
            <h3 className="text-sm font-bold text-foreground flex items-center gap-1.5">
              <Calendar className="size-4 text-sky-600" />
              Fechamentos e Histórico Mensal da Logística
            </h3>
            <p className="text-xs text-muted-foreground">
              Guarde os valores reais de cada mês para acompanhar a evolução do combustível e o custo por caixa ao longo do ano.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <input
              type="month"
              value={selectedMonth}
              onChange={(e) => setSelectedMonth(e.target.value)}
              className="h-8 rounded-md border bg-background px-2.5 text-xs font-semibold"
            />
            <Button
              type="button"
              size="sm"
              disabled={pending}
              onClick={handleSaveMonthToHistory}
              className="bg-sky-600 hover:bg-sky-700 text-white font-bold"
            >
              <Save className="size-3.5" />
              {pending ? 'Salvando...' : 'Salvar Fechamento do Mês'}
            </Button>
          </div>
        </div>

        {history.length === 0 ? (
          <div className="py-6 text-center text-xs text-muted-foreground">
            Nenhum mês fechado no histórico ainda. Quando terminar o mês, clique em{' '}
            <strong>Salvar Fechamento do Mês</strong> para arquivar os valores.
          </div>
        ) : (
          <div className="overflow-x-auto rounded-lg border">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/30">
                  <TableHead>Mês / Ano</TableHead>
                  <TableHead className="text-right">Distância</TableHead>
                  <TableHead className="text-right">Custo / km</TableHead>
                  <TableHead className="text-right">Viagens</TableHead>
                  <TableHead className="text-right">Custo / Viagem</TableHead>
                  <TableHead className="text-right">Gasto Total Mês</TableHead>
                  <TableHead className="text-right">Caixas Enviadas</TableHead>
                  <TableHead className="text-right font-bold text-emerald-800 dark:text-emerald-300">
                    Custo Médio / Caixa
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {history.map((item) => (
                  <TableRow key={item.monthKey}>
                    <TableCell className="font-bold">{item.monthLabel}</TableCell>
                    <TableCell className="text-right tabular-nums text-muted-foreground">
                      {formatNumber(item.routeDistanceKm)} km
                    </TableCell>
                    <TableCell className="text-right tabular-nums text-muted-foreground">
                      {formatCurrency(item.costPerKm)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatNumber(item.tripsCount)} viag.
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatCurrency(item.totalTripCost)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums font-bold">
                      {formatCurrency(item.totalMonthlyCost)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatNumber(item.boxesShipped)} cx.
                    </TableCell>
                    <TableCell className="text-right tabular-nums font-black text-emerald-700 dark:text-emerald-300">
                      {formatCurrency(item.costPerBox)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </div>
    </div>
  )
}
