import { Progress50 } from "@/components/Progress50";
import { MetricCard } from "@/components/MetricCard";

export default function Dashboard() {
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-gray-900">Dashboard Executivo</h1>
      
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <MetricCard title="RECEITA" value="R$ 15.000,00" type="positive" />
        <MetricCard title="DESPESAS" value="R$ 12.000,00" type="negative" />
        <MetricCard title="RESULTADO DO MÊS" value="R$ 3.000,00" type="positive" />
        <MetricCard title="CAIXA ATUAL" value="R$ 33.000,00" type="neutral" />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm">
          <h2 className="text-lg font-semibold text-gray-800 mb-4">PROGRESSO 0/50</h2>
          <Progress50 current={20000} target={50000} />
        </div>
        <div className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm">
          <h2 className="text-lg font-semibold text-gray-800 mb-4">Métricas de Recuperação</h2>
          <div className="space-y-4">
            <div className="flex justify-between">
              <span className="text-gray-600">Investimento Inicial</span>
              <span className="font-semibold text-gray-900">R$ 25.000,00</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-600">Valor Já Recuperado</span>
              <span className="font-semibold text-green-600">R$ 10.000,00</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-600">Restante para Break-even</span>
              <span className="font-semibold text-red-600">R$ 15.000,00</span>
            </div>
          </div>
        </div>
      </div>
      
      <div className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm">
        <h2 className="text-lg font-semibold text-gray-800 mb-4">Despesas por Categoria</h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="p-4 bg-gray-50 rounded-lg">
            <div className="text-sm text-gray-500">Marketing</div>
            <div className="text-lg font-bold">R$ 2.500,00</div>
          </div>
          <div className="p-4 bg-gray-50 rounded-lg">
            <div className="text-sm text-gray-500">Operacional</div>
            <div className="text-lg font-bold">R$ 4.000,00</div>
          </div>
          <div className="p-4 bg-gray-50 rounded-lg">
            <div className="text-sm text-gray-500">Logística</div>
            <div className="text-lg font-bold">R$ 1.200,00</div>
          </div>
          <div className="p-4 bg-gray-50 rounded-lg">
            <div className="text-sm text-gray-500">Tecnologia</div>
            <div className="text-lg font-bold">R$ 800,00</div>
          </div>
        </div>
      </div>
    </div>
  );
}
