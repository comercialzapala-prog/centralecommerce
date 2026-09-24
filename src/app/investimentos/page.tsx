import { MetricCard } from "@/components/MetricCard";

export default function Investimentos() {
  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-2xl font-bold text-gray-900">Investimentos Iniciais</h1>
        <button className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg font-medium">
          + Novo Investimento
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <MetricCard title="INVESTIMENTO TOTAL" value="R$ 25.000,00" type="neutral" />
        <MetricCard title="VALOR RECUPERADO" value="R$ 10.000,00" type="positive" />
        <MetricCard title="VALOR A RECUPERAR" value="R$ 15.000,00" type="negative" />
      </div>

      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden shadow-sm">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Data</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Descrição</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Categoria</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Valor</th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            <tr>
              <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">01/08/2026</td>
              <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">Reforma da Sala</td>
              <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">Reforma</td>
              <td className="px-6 py-4 whitespace-nowrap text-sm text-red-600 font-medium">R$ 5.000,00</td>
            </tr>
            <tr>
              <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">05/08/2026</td>
              <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">Computadores e Estantes</td>
              <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">Móveis / Equipamentos</td>
              <td className="px-6 py-4 whitespace-nowrap text-sm text-red-600 font-medium">R$ 8.000,00</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}
