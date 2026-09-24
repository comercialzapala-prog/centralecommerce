export function MetricCard({ title, value, type = 'neutral' }: { title: string, value: string, type?: 'positive' | 'negative' | 'neutral' }) {
  const colorMap = {
    positive: 'text-green-600',
    negative: 'text-red-600',
    neutral: 'text-gray-900'
  };

  return (
    <div className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm">
      <h3 className="text-sm font-medium text-gray-500 mb-2">{title}</h3>
      <p className={`text-2xl font-bold ${colorMap[type]}`}>{value}</p>
    </div>
  );
}
