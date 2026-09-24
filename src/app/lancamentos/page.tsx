export default function Lancamentos() {
  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-2xl font-bold text-gray-900">Lançamentos</h1>
        <button className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg font-medium">
          + Novo Lançamento
        </button>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden shadow-sm">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Data</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Descrição</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Categoria</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Valor</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            <tr>
              <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">24/09/2026</td>
              <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">Venda Site</td>
              <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">Entrada / Venda de Mercadoria</td>
              <td className="px-6 py-4 whitespace-nowrap text-sm text-green-600 font-medium">R$ 150,00</td>
              <td className="px-6 py-4 whitespace-nowrap text-sm">
                <span className="px-2 inline-flex text-xs leading-5 font-semibold rounded-full bg-green-100 text-green-800">Pago</span>
              </td>
            </tr>
            <tr>
              <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">23/09/2026</td>
              <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">Meta Ads</td>
              <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">Saída / Marketing</td>
              <td className="px-6 py-4 whitespace-nowrap text-sm text-red-600 font-medium">-R$ 1.000,00</td>
              <td className="px-6 py-4 whitespace-nowrap text-sm">
                <span className="px-2 inline-flex text-xs leading-5 font-semibold rounded-full bg-green-100 text-green-800">Pago</span>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}
