import Link from 'next/link';
import { Home, List, TrendingUp, Tags, Settings, Box, ShoppingCart, Users, FolderTree, Package } from 'lucide-react';

export function Sidebar() {
  return (
    <aside className="w-64 bg-white border-r border-gray-200 h-full flex flex-col overflow-y-auto">
      <div className="h-16 flex items-center px-6 border-b border-gray-200 shrink-0">
        <h1 className="text-xl font-bold text-gray-800">Control Center</h1>
      </div>
      <nav className="flex-1 p-4 space-y-6">
        
        <div>
          <div className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2 px-2">Visão Geral</div>
          <Link href="/dashboard" className="flex items-center space-x-3 text-gray-700 p-2 rounded-lg hover:bg-gray-100">
            <Home size={18} /><span>Dashboard</span>
          </Link>
        </div>

        <div>
          <div className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2 px-2">Financeiro</div>
          <Link href="/lancamentos" className="flex items-center space-x-3 text-gray-700 p-2 rounded-lg hover:bg-gray-100">
            <List size={18} /><span>Lançamentos</span>
          </Link>
          <Link href="/centros-de-custo" className="flex items-center space-x-3 text-gray-700 p-2 rounded-lg hover:bg-gray-100">
            <FolderTree size={18} /><span>Centros de Custo</span>
          </Link>
          <Link href="/investimentos" className="flex items-center space-x-3 text-gray-700 p-2 rounded-lg hover:bg-gray-100">
            <TrendingUp size={18} /><span>Investimentos</span>
          </Link>
        </div>

        <div>
          <div className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2 px-2">Comercial</div>
          <Link href="/vendas" className="flex items-center space-x-3 text-gray-700 p-2 rounded-lg hover:bg-gray-100">
            <ShoppingCart size={18} /><span>Vendas (Pedidos)</span>
          </Link>
          <Link href="/produtos" className="flex items-center space-x-3 text-gray-700 p-2 rounded-lg hover:bg-gray-100">
            <Package size={18} /><span>Produtos</span>
          </Link>
        </div>

        <div>
          <div className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2 px-2">Operação</div>
          <Link href="/movimentacoes" className="flex items-center space-x-3 text-gray-700 p-2 rounded-lg hover:bg-gray-100">
            <Box size={18} /><span>Movimentações</span>
          </Link>
          <Link href="/fornecedores" className="flex items-center space-x-3 text-gray-700 p-2 rounded-lg hover:bg-gray-100">
            <Users size={18} /><span>Fornecedores</span>
          </Link>
        </div>

        <div>
          <div className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2 px-2">Gestão</div>
          <Link href="/categorias" className="flex items-center space-x-3 text-gray-700 p-2 rounded-lg hover:bg-gray-100">
            <Tags size={18} /><span>Categorias</span>
          </Link>
          <Link href="/configuracoes" className="flex items-center space-x-3 text-gray-700 p-2 rounded-lg hover:bg-gray-100">
            <Settings size={18} /><span>Configurações</span>
          </Link>
        </div>
      </nav>
    </aside>
  );
}\n