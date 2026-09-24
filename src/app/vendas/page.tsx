export default function Vendas() {
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-gray-900">Vendas (Pedidos)</h1>
      <div className="bg-yellow-50 p-4 border border-yellow-200 rounded-lg text-yellow-800">
        Este módulo buscará os pedidos da tabela 'orders' e 'order_items' no Supabase.
      </div>
    </div>
  );
}\n