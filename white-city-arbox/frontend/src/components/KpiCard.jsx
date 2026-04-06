export default function KpiCard({ label, value, sub, color = 'brand', icon }) {
  const colors = {
    brand:  'border-brand/30 bg-brand/5',
    green:  'border-green-500/30 bg-green-500/5',
    yellow: 'border-yellow-500/30 bg-yellow-500/5',
    red:    'border-red-500/30 bg-red-500/5',
    blue:   'border-blue-500/30 bg-blue-500/5',
  }
  const textColors = {
    brand:  'text-brand',
    green:  'text-green-400',
    yellow: 'text-yellow-400',
    red:    'text-red-400',
    blue:   'text-blue-400',
  }

  return (
    <div className={`rounded-xl border p-5 ${colors[color]}`}>
      <div className="flex items-center justify-between mb-3">
        <span className="text-gray-400 text-sm font-medium">{label}</span>
        {icon && <span className="text-xl">{icon}</span>}
      </div>
      <div className={`text-3xl font-black ${textColors[color]}`}>{value ?? '—'}</div>
      {sub && <div className="text-gray-500 text-xs mt-1">{sub}</div>}
    </div>
  )
}
