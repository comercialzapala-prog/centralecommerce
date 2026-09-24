'use client'

import { useStore } from "@/store/useStore";
import { Progress50 } from "@/components/Progress50";
import { MetricCard } from "@/components/MetricCard";
import { useEffect, useState } from "react";

export default function Dashboard() {
  const { transactions, settings, categories } = useStore();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) return null; // Previne hidration mismatch com localStorage

  // Cálculos financeiros
  const receitas = transactions
    .filter(t => t.type === 'ENTRADA' && t.status === 'PAGO')
    .reduce((acc, t) => acc + t.amount, 0);

  const despesas = transactions
    .filter(t => t.type === 'SAIDA' && t.status === 'PAGO')
    .reduce((acc, t) => acc + t.amount, 0);

  const investimentos = transactions
    .filter(t => t.type === 'INVESTIMENTO' && t.status === 'PAGO')
    .reduce((acc, t) => acc + t.amount, 0);

  const aportes = transactions
    .filter(t => t.type === 'APORTE' && t.status === 'PAGO')
    .reduce((acc, t) => acc + t.amount, 0);

  const resultadoMes = receitas - despesas;
  
  // Caixa = Entradas + Aportes - Saidas - Investimentos
  const caixa = receitas + aportes - despesas - investimentos;

  // Progresso 0/50: 
  // O alvo do break-even é o que configuramos nas settings + qualquer despesa/investimento extra que não foi pago por receitas?
  // O usuário disse: "Investimento inicial = X. Objetivo é chegar a 0,00 de resultado acumulado."
  // Se resultado é negativo, o valor recuperado é (Investimento Inicial - abs(ResultadoAcumulado))?
  // Na verdade: Resultado Acumulado = Receitas - Despesas - Investimentos.
  // Valor Alvo (Déficit Máximo) = BreakEvenTarget
  // Valor já recuperado = BreakEvenTarget - Abs(ResultadoAcumulado)
  
  const resultadoAcumulado = receitas - despesas - (settings.breakEvenTarget + investimentos);
  
  const deficitAtual = Math.abs(Math.min(0, resultadoAcumulado));
  // Total que precisa ser pago = Alvo inicial + Investimentos adicionais 
  const deficitMaximo = settings.breakEvenTarget + investimentos; 
  
  const recuperado = deficitMaximo > 0 ? (deficitMaximo - deficitAtual) : (resultadoAcumulado >= 0 ? deficitMaximo : 0);

  // Calcula total por categorias (Saídas)
  const gastosPorCategoria = categories
    .filter(c => c.type === 'SAIDA')
    .map(c => {
      const total = transactions
        .filter(t => t.category_id === c.id && t.type === 'SAIDA')
        .reduce((sum, t) => sum + t.amount, 0);
      return { ...c, total };
    })
    .filter(c => c.total > 0)
    .sort((a, b) => b.total - a.total);

  const formatCurrency = (val: number) => 
    val.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-gray-900">Dashboard Executivo</h1>
      
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <MetricCard title="RECEITA" value={formatCurrency(receitas)} type="positive" />
        <MetricCard title="DESPESAS" value={formatCurrency(despesas)} type="negative" />
        <MetricCard title="RESULTADO" value={formatCurrency(resultadoMes)} type={resultadoMes >= 0 ? "positive" : "negative"} />
        <MetricCard title="CAIXA ATUAL" value={formatCurrency(caixa)} type="neutral" />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm flex flex-col justify-center">
          <h2 className="text-lg font-semibold text-gray-800 mb-4">PROGRESSO 0/50</h2>
          <Progress50 current={recuperado} target={deficitMaximo === 0 ? 1 : deficitMaximo} />
        </div>
        <div className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm">
          <h2 className="text-lg font-semibold text-gray-800 mb-4">Métricas de Recuperação</h2>
          <div className="space-y-4">
            <div className="flex justify-between">
              <span className="text-gray-600">Investimento e Alvo Break-even</span>
              <span className="font-semibold text-gray-900">{formatCurrency(deficitMaximo)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-600">Valor Já Recuperado</span>
              <span className="font-semibold text-green-600">{formatCurrency(recuperado)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-600">Restante para Break-even</span>
              <span className="font-semibold text-red-600">{formatCurrency(deficitAtual)}</span>
            </div>
          </div>
        </div>
      </div>
      
      <div className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm">
        <h2 className="text-lg font-semibold text-gray-800 mb-4">Despesas por Categoria</h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {gastosPorCategoria.length === 0 && (
            <div className="col-span-full text-gray-500 text-sm">Nenhuma despesa registrada ainda.</div>
          )}
          {gastosPorCategoria.map(cat => (
            <div key={cat.id} className="p-4 bg-gray-50 rounded-lg">
              <div className="text-sm text-gray-500">{cat.name}</div>
              <div className="text-lg font-bold text-gray-900">{formatCurrency(cat.total)}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
