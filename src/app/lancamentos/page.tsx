'use client'

import { useStore, Transaction } from "@/store/useStore";
import { useState, useEffect } from "react";

export default function Lancamentos() {
  const { transactions, categories, addTransaction } = useStore();
  const [mounted, setMounted] = useState(false);
  
  const [isAdding, setIsAdding] = useState(false);
  const [desc, setDesc] = useState("");
  const [amount, setAmount] = useState("");
  const [type, setType] = useState<Transaction['type']>('SAIDA');
  const [categoryId, setCategoryId] = useState("");
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) return null;

  const validCategories = categories.filter(c => c.type === type);

  const handleSave = () => {
    if (!desc || !amount || !categoryId) return alert("Preencha os campos!");
    
    addTransaction({
      description: desc,
      amount: parseFloat(amount),
      type,
      category_id: categoryId,
      date,
      payment_method: 'PIX', // simplificado para MVP
      status: 'PAGO'
    });
    
    setIsAdding(false);
    setDesc("");
    setAmount("");
  };

  const getCategoryName = (id: string) => categories.find(c => c.id === id)?.name || "Desconhecida";

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-2xl font-bold text-gray-900">Lançamentos</h1>
        <button 
          onClick={() => setIsAdding(true)}
          className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg font-medium"
        >
          + Novo Lançamento
        </button>
      </div>

      {isAdding && (
        <div className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="col-span-full border-b pb-2 mb-2 font-semibold text-lg">Novo Registro</div>
          
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Tipo</label>
            <select 
              className="block w-full rounded-md border-gray-300 border p-2 bg-white"
              value={type}
              onChange={e => {
                setType(e.target.value as Transaction['type']);
                setCategoryId("");
              }}
            >
              <option value="ENTRADA">Entrada Operacional</option>
              <option value="SAIDA">Saída / Despesa</option>
              <option value="INVESTIMENTO">Investimento</option>
              <option value="APORTE">Aporte</option>
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Categoria (Centro de Custo)</label>
            <select 
              className="block w-full rounded-md border-gray-300 border p-2 bg-white"
              value={categoryId}
              onChange={e => setCategoryId(e.target.value)}
            >
              <option value="">Selecione...</option>
              {validCategories.map(c => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Descrição</label>
            <input 
              type="text" 
              className="block w-full rounded-md border-gray-300 border p-2" 
              value={desc}
              onChange={e => setDesc(e.target.value)}
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Valor (R$)</label>
            <input 
              type="number" 
              className="block w-full rounded-md border-gray-300 border p-2" 
              value={amount}
              onChange={e => setAmount(e.target.value)}
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Data</label>
            <input 
              type="date" 
              className="block w-full rounded-md border-gray-300 border p-2" 
              value={date}
              onChange={e => setDate(e.target.value)}
            />
          </div>

          <div className="col-span-full flex justify-end gap-2 mt-4">
            <button 
              onClick={() => setIsAdding(false)}
              className="bg-gray-200 hover:bg-gray-300 px-4 py-2 rounded-lg font-medium"
            >
              Cancelar
            </button>
            <button 
              onClick={handleSave}
              className="bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-lg font-medium"
            >
              Salvar
            </button>
          </div>
        </div>
      )}

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
            {transactions.length === 0 && (
              <tr><td colSpan={5} className="p-4 text-center text-gray-500">Nenhum lançamento registrado.</td></tr>
            )}
            {transactions.map(t => (
              <tr key={t.id}>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                  {new Date(t.date).toLocaleDateString('pt-BR')}
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{t.description}</td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                  {t.type} / {getCategoryName(t.category_id)}
                </td>
                <td className={`px-6 py-4 whitespace-nowrap text-sm font-medium ${t.type === 'SAIDA' || t.type === 'INVESTIMENTO' ? 'text-red-600' : 'text-green-600'}`}>
                  {t.type === 'SAIDA' || t.type === 'INVESTIMENTO' ? '-' : ''}
                  {t.amount.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm">
                  <span className="px-2 inline-flex text-xs leading-5 font-semibold rounded-full bg-green-100 text-green-800">
                    {t.status}
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
