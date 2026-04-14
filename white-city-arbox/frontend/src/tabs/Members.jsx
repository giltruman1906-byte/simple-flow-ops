import { useEffect, useState, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import {
  LineChart, Line, BarChart, Bar,
  XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid
} from 'recharts'

function fmt(n) {
  return n != null ? Number(n).toLocaleString() : '—'
}

function fmtMoney(n) {
  return n != null ? `₪${Number(n).toLocaleString()}` : '—'
}

function periodLabel(dateStr, type) {
  const d = new Date(dateStr)
  if (type === 'weekly') return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short' })
  return d.toLocaleDateString('en-GB', { month: 'short', year: '2-digit' })
}

export default function Members({ boxId }) {
  const [summary, setSummary]         = useState(null)
  const [trends, setTrends]           = useState([])
  const [healthCounts, setHealthCounts] = useState({ healthy: 0, at_risk: 0, critical: 0, avg: 0 })
  const [planChanges, setPlanChanges] = useState({ upgrades: 0, downgrades: 0, gain: 0, lost: 0, detail: [] })
  const [loading, setLoading]         = useState(true)
  const [granularity, setGranularity] = useState('weekly')
  const [drillDown, setDrillDown]     = useState(null)
  const [snapshot, setSnapshot]       = useState([])

  useEffect(() => {
    async function load() {
      const [
        { data: ret },
        { data: trend },
        { data: health },
        { data: changes },
        { data: snap },
      ] = await Promise.all([
        supabase.from('mart_retention').select('*').eq('box_id', boxId).single(),
        supabase.from('mart_member_trends').select('*').eq('box_id', boxId),
        supabase.from('mart_health_scores').select('health_tier,health_score').eq('box_id', boxId),
        supabase.from('mart_plan_changes').select('*').eq('box_id', boxId).order('changed_at', { ascending: false }),
        supabase.from('mart_members_snapshot').select('*').eq('box_id', boxId),
      ])

      setSummary(ret)
      setTrends(trend || [])
      setSnapshot(snap || [])

      // Health counts from mart_health_scores (matches Health Alerts tab)
      if (health) {
        const rows = health
        const counts = { healthy: 0, at_risk: 0, critical: 0, total: 0, scoreSum: 0 }
        rows.forEach(r => {
          counts[r.health_tier] = (counts[r.health_tier] || 0) + 1
          counts.total += 1
          counts.scoreSum += Number(r.health_score || 0)
        })
        setHealthCounts({
          healthy:  counts.healthy,
          at_risk:  counts.at_risk,
          critical: counts.critical,
          avg:      counts.total > 0 ? Math.round(counts.scoreSum / counts.total) : 0,
        })
      }

      // Plan changes summary
      if (changes && changes.length > 0) {
        const first = changes[0]
        setPlanChanges({
          upgrades:   Number(first.total_upgrades   || 0),
          downgrades: Number(first.total_downgrades || 0),
          gain:       Number(first.upgrade_revenue_gain   || 0),
          lost:       Number(first.downgrade_revenue_lost || 0),
          detail:     changes,
        })
      }

      setLoading(false)
    }
    load()
  }, [boxId])

  const activeTrend = trends
    .filter(r => r.period_type === granularity)
    .sort((a, b) => new Date(a.period_start) - new Date(b.period_start))
    .map(r => ({
      label:        periodLabel(r.period_start, granularity),
      period_start: r.period_start,
      cumulative:   Number(r.cumulative_active),
      new:          Number(r.new_members),
    }))

  const handleBarClick = useCallback(async (data) => {
    if (!data?.activePayload) return
    const bar = data.activePayload[0]?.payload
    if (!bar || bar.new === 0) return

    const col = granularity === 'weekly' ? 'join_week' : 'join_month'
    const { data: members } = await supabase
      .from('mart_members_snapshot')
      .select('name, plan_type, health_tier, health_score')
      .eq('box_id', boxId)
      .eq(col, bar.period_start)
      .order('name')

    setDrillDown({ label: bar.label, members: members || [] })
  }, [boxId, granularity])

  if (loading) return <Skeleton />

  return (
    <div className="space-y-8">

      {/* Header + period toggle */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-black text-white">Members</h1>
          <p className="text-gray-500 text-sm mt-1">Retention, growth and health</p>
        </div>
        <div className="flex items-center gap-1 bg-gray-800 rounded-lg p-1">
          {['weekly', 'monthly'].map(g => (
            <button
              key={g}
              onClick={() => setGranularity(g)}
              className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-colors ${
                granularity === g ? 'bg-brand text-white' : 'text-gray-400 hover:text-white'
              }`}
            >
              {g === 'weekly' ? 'Weekly' : 'Monthly'}
            </button>
          ))}
        </div>
      </div>

      {/* KPI cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard label="Active Members"  value={fmt(summary?.total_active)}   color="green"  icon="✅" />
        <KpiCard label="New This Month"  value={fmt(summary?.new_this_month)}  color="blue"   icon="🆕" />
        <KpiCard label="Cancelled"       value={fmt(summary?.cancelled_count)} color="red"    icon="📉" />
        <KpiCard
          label="Retention Rate"
          value={`${summary?.retention_rate_pct ?? 0}%`}
          color={summary?.retention_rate_pct >= 80 ? 'green' : summary?.retention_rate_pct >= 60 ? 'yellow' : 'red'}
          icon="🔄"
        />
      </div>

      {/* Charts row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

        {/* Active members trend — distinct checkins per period */}
        <div className="bg-gray-900 rounded-xl p-6 border border-gray-800">
          <h2 className="text-sm font-semibold text-gray-400 mb-1">
            Active Members — {granularity === 'weekly' ? '12 Weeks' : '12 Months'}
          </h2>
          <p className="text-xs text-gray-600 mb-4">Unique members who checked in each period</p>
          <ResponsiveContainer width="100%" height={200}>
            <LineChart data={activeTrend}>
              <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" />
              <XAxis dataKey="label" tick={{ fill: '#6b7280', fontSize: 10 }} />
              <YAxis allowDecimals={false} tick={{ fill: '#6b7280', fontSize: 11 }} domain={['auto', 'auto']} />
              <Tooltip
                contentStyle={{ background: '#111827', border: '1px solid #374151', borderRadius: 8 }}
                formatter={v => [v, 'Active members']}
              />
              <Line type="monotone" dataKey="cumulative" stroke="#10B981" strokeWidth={2} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>

        {/* New members per period — clickable */}
        <div className="bg-gray-900 rounded-xl p-6 border border-gray-800">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-semibold text-gray-400">
              New Members — {granularity === 'weekly' ? 'Weekly' : 'Monthly'}
            </h2>
            <span className="text-xs text-gray-600">click bar to see members</span>
          </div>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={activeTrend} onClick={handleBarClick} style={{ cursor: 'pointer' }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" />
              <XAxis dataKey="label" tick={{ fill: '#6b7280', fontSize: 10 }} />
              <YAxis allowDecimals={false} tick={{ fill: '#6b7280', fontSize: 11 }} />
              <Tooltip
                contentStyle={{ background: '#111827', border: '1px solid #374151', borderRadius: 8 }}
                formatter={v => [v, 'New members']}
              />
              <Bar dataKey="new" fill="#3B82F6" radius={[3, 3, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Drill-down panel */}
      {drillDown && (
        <div className="bg-gray-900 rounded-xl border border-blue-500/30 p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-semibold text-white">
              New members — <span className="text-brand">{drillDown.label}</span>
              <span className="text-gray-500 ml-2">({drillDown.members.length})</span>
            </h2>
            <button
              onClick={() => setDrillDown(null)}
              className="text-gray-500 hover:text-white text-xs border border-gray-700 rounded px-2 py-1"
            >
              close
            </button>
          </div>
          {drillDown.members.length === 0 ? (
            <p className="text-gray-500 text-sm">No members with a recorded join date for this period.</p>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-2 max-h-64 overflow-y-auto">
              {drillDown.members.map((m, i) => (
                <div key={i} className="flex items-center justify-between bg-gray-800 rounded-lg px-3 py-2 text-xs">
                  <div className="min-w-0">
                    <div className="text-white font-medium truncate">{m.name}</div>
                    <div className="text-gray-500 truncate">{m.plan_type || '—'}</div>
                  </div>
                  <span className={`shrink-0 ml-3 px-2 py-0.5 rounded-full font-semibold ${
                    m.health_tier === 'healthy'  ? 'bg-green-500/20 text-green-400' :
                    m.health_tier === 'at_risk'  ? 'bg-yellow-500/20 text-yellow-400' :
                    'bg-red-500/20 text-red-400'
                  }`}>
                    {m.health_score}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Member Health — sourced from mart_health_scores to match Health Alerts tab */}
      <div>
        <h2 className="text-sm font-semibold text-gray-400 mb-3">Member Health</h2>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="bg-green-500/10 border border-green-500/20 rounded-xl p-5 text-center">
            <div className="text-4xl font-black text-green-400">{healthCounts.healthy}</div>
            <div className="text-green-400 font-semibold mt-1">Healthy</div>
            <div className="text-gray-500 text-xs mt-1">Score ≥ 70</div>
          </div>
          <div className="bg-yellow-500/10 border border-yellow-500/20 rounded-xl p-5 text-center">
            <div className="text-4xl font-black text-yellow-400">{healthCounts.at_risk}</div>
            <div className="text-yellow-400 font-semibold mt-1">At Risk</div>
            <div className="text-gray-500 text-xs mt-1">Score 35–69</div>
          </div>
          <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-5 text-center">
            <div className="text-4xl font-black text-red-400">{healthCounts.critical}</div>
            <div className="text-red-400 font-semibold mt-1">Critical</div>
            <div className="text-gray-500 text-xs mt-1">Score &lt; 35</div>
          </div>
          <div className="bg-gray-800 border border-gray-700 rounded-xl p-5 text-center">
            <div className="text-4xl font-black text-white">{healthCounts.avg}</div>
            <div className="text-gray-400 font-semibold mt-1">Avg Score</div>
            <div className="text-gray-500 text-xs mt-1">out of 100</div>
          </div>
        </div>
      </div>

      {/* Plan changes — upgrades & downgrades */}
      <div>
        <h2 className="text-sm font-semibold text-gray-400 mb-3">Plan Changes</h2>

        {/* KPI row */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-4">
          <div className="bg-green-500/10 border border-green-500/20 rounded-xl p-5 text-center">
            <div className="text-3xl font-black text-green-400">{planChanges.upgrades}</div>
            <div className="text-green-400 font-semibold mt-1 text-sm">Upgrades</div>
            <div className="text-gray-500 text-xs mt-1">plan step-ups</div>
          </div>
          <div className="bg-green-500/10 border border-green-500/20 rounded-xl p-5 text-center">
            <div className="text-3xl font-black text-green-400">{fmtMoney(planChanges.gain)}</div>
            <div className="text-green-400 font-semibold mt-1 text-sm">Revenue Gained</div>
            <div className="text-gray-500 text-xs mt-1">from upgrades</div>
          </div>
          <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-5 text-center">
            <div className="text-3xl font-black text-red-400">{planChanges.downgrades}</div>
            <div className="text-red-400 font-semibold mt-1 text-sm">Downgrades</div>
            <div className="text-gray-500 text-xs mt-1">plan step-downs</div>
          </div>
          <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-5 text-center">
            <div className="text-3xl font-black text-red-400">{fmtMoney(planChanges.lost)}</div>
            <div className="text-red-400 font-semibold mt-1 text-sm">Revenue Lost</div>
            <div className="text-gray-500 text-xs mt-1">from downgrades</div>
          </div>
        </div>

        {/* Detail table */}
        {planChanges.detail.length > 0 ? (
          <div className="bg-gray-900 rounded-xl border border-gray-800 overflow-hidden">
            <div className="divide-y divide-gray-800">
              {planChanges.detail.map((r, i) => (
                <div key={i} className="flex items-center justify-between px-5 py-3 gap-4">
                  <div className="min-w-0">
                    <div className="text-white text-sm font-medium">{r.name}</div>
                    <div className="text-gray-500 text-xs mt-0.5">
                      <span className="text-gray-400 truncate">{r.prev_plan}</span>
                      <span className="text-gray-600 mx-2">→</span>
                      <span className="text-gray-400 truncate">{r.new_plan}</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-4 shrink-0 text-sm">
                    <span className="text-gray-500 text-xs">
                      {new Date(r.changed_at).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}
                    </span>
                    <span className={`font-bold ${r.change_type === 'upgrade' ? 'text-green-400' : 'text-red-400'}`}>
                      {r.revenue_delta > 0 ? '+' : ''}{fmtMoney(r.revenue_delta)}/mo
                    </span>
                    <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${
                      r.change_type === 'upgrade'
                        ? 'bg-green-500/20 text-green-400'
                        : 'bg-red-500/20 text-red-400'
                    }`}>
                      {r.change_type}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ) : (
          <div className="bg-gray-900 rounded-xl border border-gray-800 p-8 text-center text-gray-600 text-sm">
            No plan changes recorded yet
          </div>
        )}
      </div>

    </div>
  )
}

function KpiCard({ label, value, color, icon }) {
  const colors = {
    green:  'border-green-500/20  bg-green-500/5  text-green-400',
    blue:   'border-blue-500/20   bg-blue-500/5   text-blue-400',
    yellow: 'border-yellow-500/20 bg-yellow-500/5 text-yellow-400',
    red:    'border-red-500/20    bg-red-500/5    text-red-400',
    brand:  'border-brand/20      bg-brand/5      text-brand',
  }
  const cls = colors[color] || colors.brand
  const [border, bg, text] = cls.split(' ')
  return (
    <div className={`rounded-xl border ${border} ${bg} p-5`}>
      <div className="flex items-center justify-between mb-3">
        <span className="text-gray-400 text-sm font-medium">{label}</span>
        <span className="text-xl">{icon}</span>
      </div>
      <div className={`text-3xl font-black ${text}`}>{value ?? '—'}</div>
    </div>
  )
}

function Skeleton() {
  return (
    <div className="space-y-6 animate-pulse">
      <div className="h-8 w-48 bg-gray-800 rounded" />
      <div className="grid grid-cols-4 gap-4">{[...Array(4)].map((_, i) => <div key={i} className="h-28 bg-gray-800 rounded-xl" />)}</div>
      <div className="grid grid-cols-2 gap-4">{[...Array(2)].map((_, i) => <div key={i} className="h-56 bg-gray-800 rounded-xl" />)}</div>
      <div className="grid grid-cols-4 gap-4">{[...Array(4)].map((_, i) => <div key={i} className="h-28 bg-gray-800 rounded-xl" />)}</div>
    </div>
  )
}
