'use client'

import { useStore, Category } from "@/store/useStore";
import { useState, useEffect } from "react";

export default function Categorias() {
  const { categories, addCategory } = useStore();
  const [mounted, setMounted] = useState(false);
  const [isAdding, setIsAdding] = useState(false);
  const [newName, setNewName] = useState("");
  const [newType, setNewType] = useState<Category['type']>('SAIDA');

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) return null;

  const handleSave = () => {
    if (!newName.trim()) return;
    addCategory({ name: newName, type: newType, active: true });
    setNewName("");
    setIsAdding(false);
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-2xl font-bold text-gray-900">Categorias (Centros de Custo)</h1>
        <button 
          onClick={() => setIsAdding(true)}
          className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg font-medium"
        >
          + Nova Categoria
        </button>
      </div>

      {isAdding && (
        <div className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm flex gap-4 items-end">
          <div className="flex-1">
            <label className="block text-sm font-medium text-gray-700 mb-1">Nome da Categoria</label>
            <input 
              type="text" 
              className="block w-full rounded-md border-gray-300 shadow-sm sm:text-sm border p-2" 
              value={newName}
              onChange={e => setNewName(e.target.value)}
              placeholder="Ex: Aluguel"
            />
          </div>
          <div className="flex-1">
            <label className="block text-sm font-medium text-gray-700 mb-1">Tipo</label>
            <select 
              className="block w-full rounded-md border-gray-300 shadow-sm sm:text-sm border p-2 bg-white"
              value={newType}
              onChange={e => setNewType(e.target.value as Category['type'])}
            >
              <option value="ENTRADA">ENTRADA (Receitas)</option>
              <option value="SAIDA">SAÍDA (Despesas/Custos)</option>
              <option value="INVESTIMENTO">INVESTIMENTO (Inicial)</option>
              <option value="APORTE">APORTE</option>
            </select>
          </div>
          <button 
            onClick={handleSave}
            className="bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-lg font-medium h-[38px]"
          >
            Salvar
          </button>
          <button 
            onClick={() => setIsAdding(false)}
            className="bg-gray-200 hover:bg-gray-300 text-gray-800 px-4 py-2 rounded-lg font-medium h-[38px]"
          >
            Cancelar
          </button>
        </div>
      )}

      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden shadow-sm">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Nome</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Tipo</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {categories.map(cat => (
              <tr key={cat.id}>
                <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">{cat.name}</td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{cat.type}</td>
                <td className="px-6 py-4 whitespace-nowrap text-sm">
                  <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${cat.active ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>
                    {cat.active ? 'Ativo' : 'Inativo'}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
