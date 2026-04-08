import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import KpiCard from '../components/KpiCard'
import {
  LineChart, Line, BarChart, Bar,
  XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid
} from 'recharts'

const HEALTH_SCORE_EXPLANATION = [
  { label: 'Attendance',         max: 40, desc: '12+ check-ins/month = full score' },
  { label: 'Payment status',     max: 30, desc: 'No overdue payments = full score' },
  { label: 'Membership validity',max: 20, desc: 'Active + >14 days left = full score' },
  { label: 'Tenure loyalty',     max: 10, desc: '6+ months as member = full score' },
]

export default function Members({ boxId }) {
  const [data, setData]     = useState(null)
  const [trends, setTrends] = useState([])
  const [loading, setLoading] = useState(true)
  const [showScoreInfo, setShowScoreInfo] = useState(false)

  useEffect(() => {
    async function load() {
      const [{ data: snap }, { data: trend }] = await Promise.all([
        supabase.from('mart_retention').select('*').eq('box_id', boxId).single(),
        supabase.from('mart_member_trends').select('*').eq('box_id', boxId).order('week_start'),
      ])
      setData(snap)
      setTrends((trend || []).map(r => ({
        week:       new Date(r.week_start).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' }),
        new:        Number(r.new_members),
        cumulative: Number(r.cumulative_active),
      })))
      setLoading(false)
    }
    load()
  }, [boxId])

  if (loading) return <Skeleton />

  const retentionColor = data?.retention_rate_pct >= 80 ? 'green' : data?.retention_rate_pct >= 60 ? 'yellow' : 'red'

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-black text-white">Members</h1>
        <p className="text-gray-500 text-sm mt-1">Retention, growth and churn</p>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard label="Active Members"  value={data?.total_active}                          color="green"        icon="✅" />
        <KpiCard label="New This Month"  value={data?.new_this_month}                        color="blue"         icon="🆕" />
        <KpiCard label="Churned (90d)"   value={data?.churned_90d}                           color="red"          icon="📉" />
        <KpiCard label="Retention Rate"  value={`${data?.retention_rate_pct ?? 0}%`}         color={retentionColor} icon="🔄" />
      </div>

      {/* Growth trends */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* New members per week */}
        <div className="bg-gray-900 rounded-xl p-6 border border-gray-800">
          <h2 className="text-sm font-semibold text-gray-400 mb-4">New Members — Weekly</h2>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={trends}>
              <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" />
              <XAxis dataKey="week" tick={{ fill: '#6b7280', fontSize: 10 }} />
              <YAxis allowDecimals={false} tick={{ fill: '#6b7280', fontSize: 11 }} />
              <Tooltip
                contentStyle={{ background: '#111827', border: '1px solid #374151', borderRadius: 8 }}
                formatter={v => [v, 'New members']}
              />
              <Bar dataKey="new" fill="#3B82F6" radius={[3, 3, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Cumulative active members */}
        <div className="bg-gray-900 rounded-xl p-6 border border-gray-800">
          <h2 className="text-sm font-semibold text-gray-400 mb-4">Active Members — Growth</h2>
          <ResponsiveContainer width="100%" height={200}>
            <LineChart data={trends}>
              <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" />
              <XAxis dataKey="week" tick={{ fill: '#6b7280', fontSize: 10 }} />
              <YAxis allowDecimals={false} tick={{ fill: '#6b7280', fontSize: 11 }} />
              <Tooltip
                contentStyle={{ background: '#111827', border: '1px solid #374151', borderRadius: 8 }}
                formatter={v => [v, 'Active members']}
              />
              <Line type="monotone" dataKey="cumulative" stroke="#10B981" strokeWidth={2} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Health tier breakdown */}
      <div>
        <div className="flex items-center gap-2 mb-3">
          <h2 className="text-sm font-semibold text-gray-400">Member Health</h2>
          <button
            onClick={() => setShowScoreInfo(v => !v)}
            className="text-xs text-gray-600 hover:text-gray-400 border border-gray-700 rounded-full w-5 h-5 flex items-center justify-center transition-colors"
            title="How is the score calculated?"
          >
            ?
          </button>
        </div>

        {/* Score explanation panel */}
        {showScoreInfo && (
          <div className="mb-4 bg-gray-900 border border-gray-700 rounded-xl p-4 text-xs space-y-2">
            <p className="text-gray-400 font-semibold mb-3">
              Health Score (0–100) — 4 components:
            </p>
            {HEALTH_SCORE_EXPLANATION.map((c, i) => (
              <div key={i} className="flex items-center justify-between">
                <span className="text-gray-300">{c.label}</span>
                <div className="flex items-center gap-3">
                  <span className="text-gray-500">{c.desc}</span>
                  <span className="text-brand font-bold w-8 text-right">{c.max}pts</span>
                </div>
              </div>
            ))}
            <div className="pt-2 border-t border-gray-800 text-gray-500 space-y-0.5">
              <div>Healthy ≥ 75 &nbsp;·&nbsp; At Risk 40–74 &nbsp;·&nbsp; Critical &lt; 40</div>
              <div className="text-gray-600">
                Calculated in{' '}
                <span className="font-mono text-gray-500">int_member_activity.sql</span>
              </div>
            </div>
          </div>
        )}

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
      </div>

      {/* Avg stats */}
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
      <div className="grid grid-cols-2 gap-4">{[...Array(2)].map((_, i) => <div key={i} className="h-56 bg-gray-800 rounded-xl" />)}</div>
      <div className="grid grid-cols-3 gap-4">{[...Array(3)].map((_, i) => <div key={i} className="h-32 bg-gray-800 rounded-xl" />)}</div>
    </div>
  )
}
