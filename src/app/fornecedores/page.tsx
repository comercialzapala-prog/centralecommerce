'use client'
import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';

export default function Fornecedores() {
  const [suppliers, setSuppliers] = useState<any[]>([]);

  useEffect(() => {
    const fetchSuppliers = async () => {
      const { data } = await supabase.from('suppliers').select('*');
      setSuppliers(data || []);
    };
    fetchSuppliers();
  }, []);

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-gray-900">Fornecedores</h1>
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden shadow-sm">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Nome</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Documento</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Total Pago</th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
             {suppliers.length === 0 && <tr><td colSpan={3} className="p-4 text-center">Nenhum fornecedor. Configure o Supabase para carregar os dados reais.</td></tr>}
             {suppliers.map(s => (
               <tr key={s.id}>
                 <td className="px-6 py-4">{s.name}</td>
                 <td className="px-6 py-4">{s.document}</td>
                 <td className="px-6 py-4">R$ 0,00</td>
               </tr>
             ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
