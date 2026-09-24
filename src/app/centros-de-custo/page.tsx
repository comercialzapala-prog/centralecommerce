'use client'
import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';

export default function CentrosDeCusto() {
  const [centers, setCenters] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchCenters();
  }, []);

  async function fetchCenters() {
    try {
      const { data, error } = await supabase.from('cost_centers').select('*').order('name');
      if (error) throw error;
      setCenters(data || []);
    } catch (error) {
      console.error('Error:', error);
    } finally {
      setLoading(false);
    }
  }

  const rootCenters = centers.filter(c => !c.parent_id);

  const renderTree = (parentId: string | null, depth = 0) => {
    const children = centers.filter(c => c.parent_id === parentId);
    if (!children.length) return null;

    return (
      <div className="space-y-1" style={{ marginLeft: depth > 0 ? '1.5rem' : '0' }}>
        {children.map(child => (
          <div key={child.id}>
            <div className="flex items-center justify-between p-3 bg-white border border-gray-100 rounded-lg shadow-sm hover:bg-gray-50 cursor-pointer">
              <div className="flex items-center gap-2">
                <span className="text-gray-400">▼</span>
                <span className="font-medium text-gray-800">{child.name}</span>
              </div>
              <div className="flex gap-2">
                <button className="text-sm text-blue-600 hover:underline">+ Subcentro</button>
              </div>
            </div>
            {renderTree(child.id, depth + 1)}
          </div>
        ))}
      </div>
    );
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-2xl font-bold text-gray-900">Centros de Custo</h1>
        <button className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg font-medium">+ Novo Centro Raiz</button>
      </div>

      <div className="bg-gray-50 p-6 rounded-xl border border-gray-200 shadow-sm min-h-[400px]">
        {loading ? (
          <p>Carregando dados do Supabase...</p>
        ) : (
          renderTree(null)
        )}
      </div>
    </div>
  );
}
