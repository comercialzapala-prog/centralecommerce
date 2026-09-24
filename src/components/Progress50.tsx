export function Progress50({ current, target }: { current: number, target: number }) {
  const percentage = Math.min((current / target) * 100, 100);
  const isBreakEven = percentage >= 100;
  
  return (
    <div>
      <div className="flex justify-between mb-2">
        <span className="text-2xl font-bold text-gray-800">{Math.floor(percentage / 2)} / 50</span>
        <span className={`px-3 py-1 rounded-full text-sm font-semibold ${isBreakEven ? 'bg-green-100 text-green-800' : 'bg-blue-100 text-blue-800'}`}>
          {isBreakEven ? 'BREAK-EVEN ATINGIDO' : 'EM RECUPERAÇÃO'}
        </span>
      </div>
      <div className="w-full bg-gray-200 rounded-full h-4 mb-4 overflow-hidden">
        <div className="bg-blue-600 h-4 rounded-full transition-all duration-500" style={{ width: `${percentage}%` }}></div>
      </div>
      <p className="text-sm text-gray-600">
        R$ {current.toLocaleString('pt-BR', { minimumFractionDigits: 2 })} recuperados de R$ {target.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
      </p>
    </div>
  );
}
