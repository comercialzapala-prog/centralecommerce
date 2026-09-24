import Link from 'next/link';
import { Home, List, TrendingUp, Tags, Settings } from 'lucide-react';

export function Sidebar() {
  return (
    <aside className="w-64 bg-white border-r border-gray-200 h-full flex flex-col">
      <div className="h-16 flex items-center px-6 border-b border-gray-200">
        <h1 className="text-xl font-bold text-gray-800">Central E-commerce</h1>
      </div>
      <nav className="flex-1 p-4 space-y-2">
        <Link href="/dashboard" className="flex items-center space-x-3 text-gray-700 p-2 rounded-lg hover:bg-gray-100">
          <Home size={20} />
          <span>Dashboard</span>
        </Link>
        <Link href="/lancamentos" className="flex items-center space-x-3 text-gray-700 p-2 rounded-lg hover:bg-gray-100">
          <List size={20} />
          <span>Lançamentos</span>
        </Link>
        <Link href="/investimentos" className="flex items-center space-x-3 text-gray-700 p-2 rounded-lg hover:bg-gray-100">
          <TrendingUp size={20} />
          <span>Investimentos</span>
        </Link>
        <Link href="/categorias" className="flex items-center space-x-3 text-gray-700 p-2 rounded-lg hover:bg-gray-100">
          <Tags size={20} />
          <span>Categorias</span>
        </Link>
        <Link href="/configuracoes" className="flex items-center space-x-3 text-gray-700 p-2 rounded-lg hover:bg-gray-100">
          <Settings size={20} />
          <span>Configurações</span>
        </Link>
      </nav>
    </aside>
  );
}
