import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import KpiCard from '../components/KpiCard'
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from 'recharts'

const FUNNEL = [
  { key: 'new_leads',    label: 'New',          color: '#6B7280' },
  { key: 'in_progress',  label: 'In Progress',  color: '#3B82F6' },
  { key: 'trial_booked', label: 'Trial Booked', color: '#F59E0B' },
  { key: 'converted',    label: 'Converted',    color: '#10B981' },
  { key: 'lost',         label: 'Lost',         color: '#EF4444' },
]

export default function Leads({ boxId }) {
  const [data, setData]     = useState(null)
  const [sources, setSources] = useState([])
  const [reasons, setReasons] = useState([])
  const [trials, setTrials]   = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    supabase.from('mart_leads').select('*').eq('box_id', boxId).single()
      .then(({ data }) => {
        if (data) {
          setData(data)
          setSources((data.source_breakdown || []).sort((a, b) => b.total - a.total))
          setReasons(data.lost_reasons || [])
          setTrials(data.upcoming_trials || [])
        }
        setLoading(false)
      })
  }, [boxId])

  if (loading) return <Skeleton />

  const funnelData = FUNNEL.map(f => ({ name: f.label, value: data?.[f.key] ?? 0, color: f.color }))

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-black text-white">Sales Funnel</h1>
        <p className="text-gray-500 text-sm mt-1">Lead pipeline &amp; conversion</p>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard label="Total Leads"       value={data?.total_leads}          color="brand" icon="👤" />
        <KpiCard label="Converted"         value={data?.converted}            color="green" icon="✅" />
        <KpiCard label="Conversion Rate"   value={`${data?.conversion_rate_pct ?? 0}%`} color="blue" icon="📈" />
        <KpiCard label="Avg Days to Close" value={`${data?.avg_days_to_convert ?? 0}d`} color="yellow" icon="⏱️" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Funnel chart */}
        <div className="bg-gray-900 rounded-xl p-6 border border-gray-800">
          <h2 className="text-sm font-semibold text-gray-400 mb-4">Pipeline Stages</h2>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={funnelData} layout="vertical">
              <XAxis type="number" tick={{ fill:'#6b7280', fontSize:11 }} />
              <YAxis type="category" dataKey="name" tick={{ fill:'#9ca3af', fontSize:12 }} width={90} />
              <Tooltip
                contentStyle={{ background:'#111827', border:'1px solid #374151', borderRadius:8 }}
                cursor={{ fill: 'rgba(255,255,255,0.03)' }}
              />
              <Bar dataKey="value" radius={[0,4,4,0]}>
                {funnelData.map((entry, i) => <Cell key={i} fill={entry.color} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Source breakdown */}
        <div className="bg-gray-900 rounded-xl border border-gray-800 overflow-hidden">
          <div className="p-5 border-b border-gray-800">
            <h2 className="text-sm font-semibold text-gray-400">Lead Sources</h2>
          </div>
          <div className="divide-y divide-gray-800">
            {sources.map((s, i) => (
              <div key={i} className="flex items-center justify-between px-5 py-3">
                <span className="text-white">{s.source}</span>
                <div className="flex items-center gap-3 text-sm">
                  <span className="text-gray-400">{s.total} leads</span>
                  <span className="text-green-400 font-medium">{s.converted} converted</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Upcoming trials */}
      {trials.length > 0 && (
        <div className="bg-yellow-500/10 border border-yellow-500/20 rounded-xl p-5">
          <h2 className="text-sm font-semibold text-yellow-400 mb-3">⏰ Upcoming Trials (next 7 days)</h2>
          <div className="space-y-2">
            {trials.map((t, i) => (
              <div key={i} className="flex items-center justify-between bg-gray-900/50 rounded-lg px-4 py-2">
                <span className="text-white font-medium">{t.name}</span>
                <div className="flex items-center gap-4 text-sm">
                  <span className="text-gray-400">{t.source}</span>
                  <span className="text-yellow-400">{t.trial_date}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Lost reasons */}
      {reasons.length > 0 && (
        <div className="bg-gray-900 rounded-xl border border-gray-800 overflow-hidden">
          <div className="p-5 border-b border-gray-800">
            <h2 className="text-sm font-semibold text-red-400">Lost Reasons</h2>
          </div>
          <div className="divide-y divide-gray-800">
            {reasons.map((r, i) => (
              <div key={i} className="flex items-center justify-between px-5 py-3">
                <span className="text-gray-300">{r.reason}</span>
                <span className="text-red-400 font-bold">{r.count}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

function Skeleton() {
  return (
    <div className="space-y-6 animate-pulse">
      <div className="h-8 w-48 bg-gray-800 rounded" />
      <div className="grid grid-cols-4 gap-4">{[...Array(4)].map((_, i) => <div key={i} className="h-28 bg-gray-800 rounded-xl" />)}</div>
      <div className="grid grid-cols-2 gap-4">{[...Array(2)].map((_, i) => <div key={i} className="h-64 bg-gray-800 rounded-xl" />)}</div>
    </div>
  )
}
