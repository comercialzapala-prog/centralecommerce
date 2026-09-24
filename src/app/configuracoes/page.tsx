'use client'

import { useStore } from "@/store/useStore";
import { useEffect, useState } from "react";

export default function Configuracoes() {
  const { settings, updateSettings } = useStore();
  const [mounted, setMounted] = useState(false);
  const [target, setTarget] = useState(0);

  useEffect(() => {
    setTarget(settings.breakEvenTarget);
    setMounted(true);
  }, [settings.breakEvenTarget]);

  if (!mounted) return null;

  const handleSave = () => {
    updateSettings({ breakEvenTarget: target });
    alert("Configurações salvas com sucesso!");
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-2xl font-bold text-gray-900">Configurações</h1>
      </div>
      <div className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm space-y-6 max-w-2xl">
        <div>
          <h2 className="text-lg font-semibold border-b pb-2 mb-4">Informações do Projeto</h2>
          <label className="block text-sm font-medium text-gray-700 mb-1">Nome da Operação</label>
          <input 
            type="text" 
            className="block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm border p-2 bg-gray-100" 
            value={settings.operationName}
            readOnly
          />
        </div>
        
        <div>
          <h2 className="text-lg font-semibold border-b pb-2 mb-4">Metas Financeiras</h2>
          <label className="block text-sm font-medium text-gray-700 mb-1">Déficit Inicial (Meta de Break-even em R$)</label>
          <p className="text-xs text-gray-500 mb-2">Configure o valor inicial que você deseja zerar no indicador 0/50. Mude para 0 se o projeto começar sem dívidas passadas.</p>
          <input 
            type="number" 
            className="block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm border p-2" 
            value={target}
            onChange={(e) => setTarget(Number(e.target.value))}
          />
        </div>

        <button 
          onClick={handleSave}
          className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg font-medium"
        >
          Salvar Configurações
        </button>
      </div>
    </div>
  );
}
