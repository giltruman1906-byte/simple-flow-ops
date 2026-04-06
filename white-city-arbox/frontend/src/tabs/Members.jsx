import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import KpiCard from '../components/KpiCard'

export default function Members({ boxId }) {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    supabase.from('mart_retention').select('*').eq('box_id', boxId).single()
      .then(({ data }) => { setData(data); setLoading(false) })
  }, [boxId])

  if (loading) return <Skeleton />

  const retentionColor = data?.retention_rate_pct >= 80 ? 'green' : data?.retention_rate_pct >= 60 ? 'yellow' : 'red'

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-black text-white">Members</h1>
        <p className="text-gray-500 text-sm mt-1">Retention, growth and churn</p>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard label="Active Members"     value={data?.total_active}       color="green"  icon="✅" />
        <KpiCard label="New This Month"     value={data?.new_this_month}     color="blue"   icon="🆕" />
        <KpiCard label="Churned (90d)"      value={data?.churned_90d}        color="red"    icon="📉" />
        <KpiCard label="Retention Rate"     value={`${data?.retention_rate_pct ?? 0}%`} color={retentionColor} icon="🔄" />
      </div>

      {/* Health tier breakdown */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="bg-green-500/10 border border-green-500/20 rounded-xl p-6 text-center">
          <div className="text-4xl font-black text-green-400">{data?.healthy_count ?? 0}</div>
          <div className="text-green-400 font-semibold mt-1">Healthy</div>
          <div className="text-gray-500 text-xs mt-1">Score ≥ 75</div>
        </div>
        <div className="bg-yellow-500/10 border border-yellow-500/20 rounded-xl p-6 text-center">
          <div className="text-4xl font-black text-yellow-400">{data?.at_risk_count ?? 0}</div>
          <div className="text-yellow-400 font-semibold mt-1">At Risk</div>
          <div className="text-gray-500 text-xs mt-1">Score 40–74</div>
        </div>
        <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-6 text-center">
          <div className="text-4xl font-black text-red-400">{data?.critical_count ?? 0}</div>
          <div className="text-red-400 font-semibold mt-1">Critical</div>
          <div className="text-gray-500 text-xs mt-1">Score &lt; 40</div>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 gap-4">
        <KpiCard label="Avg Check-ins / Month" value={data?.avg_checkins_per_month} color="brand" icon="📅" />
        <KpiCard label="Avg Health Score"      value={data?.avg_health_score}       color="brand" icon="💪" sub="out of 100" />
      </div>
    </div>
  )
}

function Skeleton() {
  return (
    <div className="space-y-6 animate-pulse">
      <div className="h-8 w-48 bg-gray-800 rounded" />
      <div className="grid grid-cols-4 gap-4">{[...Array(4)].map((_, i) => <div key={i} className="h-28 bg-gray-800 rounded-xl" />)}</div>
      <div className="grid grid-cols-3 gap-4">{[...Array(3)].map((_, i) => <div key={i} className="h-32 bg-gray-800 rounded-xl" />)}</div>
    </div>
  )
}
