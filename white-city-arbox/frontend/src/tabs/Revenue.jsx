import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import {
  LineChart, Line, PieChart, Pie, Cell, BarChart, Bar,
  XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid
} from 'recharts'

const fmt  = (n) => n != null ? `₪${Number(n).toLocaleString()}` : '—'
const pct  = (a, b) => b && b > 0 ? Math.round((a - b) / b * 100) : null

// Month name for the label (last complete month)
const lastMonthName = new Date(new Date().getFullYear(), new Date().getMonth() - 1, 1)
  .toLocaleDateString('en-GB', { month: 'long' })
const prevMonthName = new Date(new Date().getFullYear(), new Date().getMonth() - 2, 1)
  .toLocaleDateString('en-GB', { month: 'short' })

const PLAN_COLORS = [
  '#10B981','#3B82F6','#F59E0B','#8B5CF6',
  '#EC4899','#14B8A6','#F97316','#6366F1','#84CC16','#E84A27',
]

// Cohort retention table columns: periods to show (month numbers)
const COHORT_PERIODS = [0, 1, 2, 3, 4, 5, 6, 9, 12]

// Color a cell based on retention % (0 = gray, 100 = bright green)
function cohortCellStyle(pct) {
  if (pct == null) return { background: '#111827', color: '#374151' }
  const alpha = 0.1 + (pct / 100) * 0.85
  return {
    background: pct === 0 ? '#111827' : `rgba(16,185,129,${alpha.toFixed(2)})`,
    color: pct >= 60 ? '#fff' : pct >= 30 ? '#d1fae5' : '#6b7280',
  }
}

export default function Revenue({ boxId }) {
  const [summary, setSummary]   = useState(null)
  const [weekly, setWeekly]     = useState([])
  const [monthly, setMonthly]   = useState([])
  const [byPlan, setByPlan]     = useState([])
  const [granularity, setGranularity] = useState('monthly')
  const [cohortData, setCohortData]   = useState([])   // pivoted: [{cohort_month, cohort_size, p0, p1…}]
  const [ltvData, setLtvData]         = useState([])
  const [loading, setLoading]   = useState(true)

  useEffect(() => {
    async function load() {
      const [{ data }, { data: cohortRaw }, { data: ltv }] = await Promise.all([
        supabase.from('mart_monetization').select('*').eq('box_id', boxId),
        supabase.from('mart_cohort_retention').select('*').eq('box_id', boxId),
        supabase.from('mart_ltv_by_plan').select('*').eq('box_id', boxId),
      ])

      if (data) {
        setSummary(data.find(r => r.record_type === 'summary'))

        const toChartRow = (r, fmtOpts) => ({
          label:   new Date(r.period_start).toLocaleDateString('en-GB', fmtOpts),
          revenue: Number(r.period_revenue),
        })

        setWeekly(
          data.filter(r => r.record_type === 'weekly_revenue')
            .sort((a, b) => new Date(a.period_start) - new Date(b.period_start))
            .map(r => toChartRow(r, { day: '2-digit', month: 'short' }))
        )
        setMonthly(
          data.filter(r => r.record_type === 'monthly_revenue')
            .sort((a, b) => new Date(a.period_start) - new Date(b.period_start))
            .map(r => toChartRow(r, { month: 'short', year: '2-digit' }))
        )
        setByPlan(
          data.filter(r => r.record_type === 'by_plan')
            .map(r => ({
              name:    r.plan_type,
              value:   Number(r.plan_revenue),
              members: Number(r.plan_member_count),
              arpu:    r.plan_member_count > 0
                ? Math.round(Number(r.plan_revenue) / Number(r.plan_member_count))
                : 0,
            }))
            .sort((a, b) => b.arpu - a.arpu)
        )
      }

      // Pivot cohort rows into one object per cohort_month
      if (cohortRaw && cohortRaw.length > 0) {
        const map = {}
        cohortRaw.forEach(r => {
          const key = r.cohort_month
          if (!map[key]) map[key] = { cohort_month: key, cohort_size: r.cohort_size }
          map[key][`p${r.period_number}`] = Number(r.retention_pct)
        })
        setCohortData(
          Object.values(map)
            .sort((a, b) => new Date(b.cohort_month) - new Date(a.cohort_month))
        )
      }

      if (ltv) {
        setLtvData(ltv.sort((a, b) => b.avg_ltv - a.avg_ltv))
      }

      setLoading(false)
    }
    load()
  }, [boxId])

  if (loading) return <Skeleton />

  const lastMo   = Number(summary?.last_month_collected  ?? 0)
  const prevMo   = Number(summary?.prev_month_collected  ?? 0)
  const newMrr   = Number(summary?.new_member_mrr        ?? 0)
  const newCount = Number(summary?.new_member_count      ?? 0)
  const frozen   = Number(summary?.frozen_revenue_impact ?? 0)
  const pending  = Number(summary?.pending_this_month    ?? 0)
  const moDelta  = pct(lastMo, prevMo)

  return (
    <div className="space-y-8">

      {/* ── Header ── */}
      <div>
        <h1 className="text-2xl font-black text-white">Revenue</h1>
        <p className="text-gray-500 text-sm mt-1">
          {lastMonthName} actuals vs {prevMonthName} — rolling view
        </p>
      </div>

      {/* ── 1. KPI cards ── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">

        <div className={`rounded-xl border p-5 ${lastMo >= prevMo ? 'border-green-500/30 bg-green-500/5' : 'border-red-500/30 bg-red-500/5'}`}>
          <div className="flex items-center justify-between mb-3">
            <span className="text-gray-400 text-sm font-medium">{lastMonthName} Revenue</span>
            <span className="text-xl">💰</span>
          </div>
          <div className={`text-3xl font-black ${lastMo >= prevMo ? 'text-green-400' : 'text-red-400'}`}>
            {fmt(lastMo)}
          </div>
          <div className="text-gray-500 text-xs mt-1 flex items-center gap-1">
            {moDelta !== null && (
              <span className={moDelta >= 0 ? 'text-green-500' : 'text-red-500'}>
                {moDelta >= 0 ? '▲' : '▼'} {Math.abs(moDelta)}%
              </span>
            )}
            <span>vs {prevMonthName}: {fmt(prevMo)}</span>
          </div>
        </div>

        <div className="rounded-xl border border-green-500/20 bg-green-500/5 p-5">
          <div className="flex items-center justify-between mb-3">
            <span className="text-gray-400 text-sm font-medium">New Members MRR</span>
            <span className="text-xl">🆕</span>
          </div>
          <div className="text-3xl font-black text-green-300">{fmt(newMrr)}</div>
          <div className="text-gray-500 text-xs mt-1">{newCount} new memberships in {lastMonthName}</div>
        </div>

        <div className="rounded-xl border border-blue-500/30 bg-blue-500/5 p-5">
          <div className="flex items-center justify-between mb-3">
            <span className="text-gray-400 text-sm font-medium">Frozen MRR</span>
            <span className="text-xl">❄️</span>
          </div>
          <div className="text-3xl font-black text-blue-400">{fmt(frozen)}</div>
          <div className="text-gray-500 text-xs mt-1">
            {summary?.frozen_count ?? 0} members on hold · see Freezes tab
          </div>
        </div>

        <div className="rounded-xl border border-yellow-500/30 bg-yellow-500/5 p-5">
          <div className="flex items-center justify-between mb-3">
            <span className="text-gray-400 text-sm font-medium">Pending</span>
            <span className="text-xl">⏳</span>
          </div>
          <div className="text-3xl font-black text-yellow-400">{fmt(pending)}</div>
          <div className="text-gray-500 text-xs mt-1">payments not yet collected this month</div>
        </div>

      </div>

      {/* ── 2. Revenue by Plan — full width, all plans ── */}
      <div className="bg-gray-900 rounded-xl p-6 border border-gray-800">
        <h2 className="text-sm font-semibold text-gray-400 mb-1">Revenue by Plan</h2>
        <p className="text-xs text-gray-600 mb-4">All active subscription plans — sorted by avg revenue per member (ARPU)</p>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-center">
          {/* Donut */}
          <ResponsiveContainer width="100%" height={280}>
            <PieChart>
              <Pie
                data={byPlan} dataKey="value" nameKey="name"
                cx="50%" cy="50%" innerRadius={70} outerRadius={120}
              >
                {byPlan.map((_, i) => <Cell key={i} fill={PLAN_COLORS[i % PLAN_COLORS.length]} />)}
              </Pie>
              <Tooltip
                contentStyle={{ background: '#111827', border: '1px solid #374151', borderRadius: 8 }}
                formatter={(v, n) => [fmt(v), n]}
              />
            </PieChart>
          </ResponsiveContainer>
          {/* Legend — all plans */}
          <div className="space-y-2 max-h-72 overflow-y-auto">
            {byPlan.map((p, i) => (
              <div key={i} className="flex items-center justify-between gap-3 rounded-lg bg-gray-800/40 px-3 py-2">
                <div className="flex items-center gap-2 min-w-0">
                  <div className="w-2.5 h-2.5 shrink-0 rounded-full" style={{ background: PLAN_COLORS[i % PLAN_COLORS.length] }} />
                  <span className="text-gray-300 text-xs truncate" title={p.name}>{p.name}</span>
                </div>
                <div className="flex items-center gap-3 shrink-0 text-xs text-right">
                  <span className="text-gray-500">{p.members} mbr</span>
                  <span className="text-gray-400">{fmt(p.value)}</span>
                  <span className="text-white font-bold w-16 text-right">₪{p.arpu.toLocaleString()}/mbr</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ── 3. Revenue trend — full width ── */}
      <div className="bg-gray-900 rounded-xl p-6 border border-gray-800">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-sm font-semibold text-gray-400">
            Revenue Trend — {granularity === 'weekly' ? '12 Weeks' : '12 Months'}
          </h2>
          <div className="flex items-center gap-1 bg-gray-800 rounded-lg p-1">
            {['weekly', 'monthly'].map(g => (
              <button
                key={g}
                onClick={() => setGranularity(g)}
                className={`px-3 py-1 rounded-md text-xs font-semibold transition-colors ${
                  granularity === g ? 'bg-brand text-white' : 'text-gray-400 hover:text-white'
                }`}
              >
                {g === 'weekly' ? 'Weekly' : 'Monthly'}
              </button>
            ))}
          </div>
        </div>
        <ResponsiveContainer width="100%" height={240}>
          <LineChart data={granularity === 'weekly' ? weekly : monthly}>
            <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" />
            <XAxis dataKey="label" tick={{ fill: '#6b7280', fontSize: 11 }} />
            <YAxis tick={{ fill: '#6b7280', fontSize: 11 }} tickFormatter={v => `₪${v / 1000}k`} />
            <Tooltip
              contentStyle={{ background: '#111827', border: '1px solid #374151', borderRadius: 8 }}
              formatter={v => [fmt(v), 'Revenue']}
            />
            <Line type="monotone" dataKey="revenue" stroke="#10B981" strokeWidth={2} dot={false} />
          </LineChart>
        </ResponsiveContainer>
      </div>

      {/* ── 4. Cohort Retention ── */}
      {cohortData.length > 0 && (
        <div className="bg-gray-900 rounded-xl p-6 border border-gray-800 overflow-x-auto">
          <div className="mb-4">
            <h2 className="text-sm font-semibold text-gray-400">Cohort Retention</h2>
            <p className="text-xs text-gray-600 mt-0.5">
              Each row = members who joined that month. Each column = % who were still active (checked in) N months later.
              M0 = 100% by definition (baseline). Gaps mean no check-in data yet for that period.
            </p>
          </div>
          <table className="text-xs w-full min-w-[600px]">
            <thead>
              <tr>
                <th className="text-left text-gray-500 font-medium pb-2 pr-4 whitespace-nowrap">Cohort</th>
                <th className="text-center text-gray-500 font-medium pb-2 pr-3 whitespace-nowrap">Members</th>
                {COHORT_PERIODS.map(p => (
                  <th key={p} className="text-center text-gray-500 font-medium pb-2 px-1.5 whitespace-nowrap w-14">
                    M{p}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-800/50">
              {cohortData.map((row, i) => (
                <tr key={i}>
                  <td className="text-gray-300 pr-4 py-1.5 whitespace-nowrap font-semibold">
                    {new Date(row.cohort_month).toLocaleDateString('en-GB', { month: 'long', year: 'numeric' })}
                  </td>
                  <td className="text-center text-gray-500 pr-3 py-1.5">{row.cohort_size}</td>
                  {COHORT_PERIODS.map(p => {
                    const val = row[`p${p}`]
                    return (
                      <td key={p} className="px-1 py-1.5">
                        <div
                          className="rounded text-center font-semibold py-1 text-xs w-14"
                          style={cohortCellStyle(val)}
                          title={val != null ? `${val}% retained at month ${p}` : 'No check-in data for this period'}
                        >
                          {val != null ? `${val}%` : '—'}
                        </div>
                      </td>
                    )
                  })}
                </tr>
              ))}
            </tbody>
          </table>
          <div className="flex items-center gap-5 mt-4 text-xs text-gray-500">
            <div className="flex items-center gap-1.5"><div className="w-4 h-4 rounded" style={{ background: '#111827', border: '1px solid #374151' }} /> No data yet</div>
            <div className="flex items-center gap-1.5"><div className="w-4 h-4 rounded" style={{ background: 'rgba(16,185,129,0.2)' }} /> &lt;30%</div>
            <div className="flex items-center gap-1.5"><div className="w-4 h-4 rounded" style={{ background: 'rgba(16,185,129,0.55)' }} /> 30–60%</div>
            <div className="flex items-center gap-1.5"><div className="w-4 h-4 rounded" style={{ background: 'rgba(16,185,129,0.95)' }} /> 60%+</div>
          </div>
        </div>
      )}

      {/* ── 5. Lifetime Value by Plan ── */}
      {ltvData.length > 0 && (
        <div className="bg-gray-900 rounded-xl p-6 border border-gray-800">
          <div className="mb-5">
            <h2 className="text-sm font-semibold text-gray-400">Lifetime Value by Plan</h2>
            <p className="text-xs text-gray-600 mt-0.5">
              Avg LTV = avg monthly price × avg months on plan — all subscription plans
            </p>
          </div>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <ResponsiveContainer width="100%" height={Math.max(200, ltvData.length * 44)}>
              <BarChart data={ltvData} layout="vertical" margin={{ left: 8, right: 70 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" horizontal={false} />
                <XAxis type="number" tick={{ fill: '#6b7280', fontSize: 11 }}
                       tickFormatter={v => `₪${v.toLocaleString()}`} />
                <YAxis
                  type="category" dataKey="plan_type"
                  tick={{ fill: '#6b7280', fontSize: 10 }}
                  width={150}
                  tickFormatter={v => v?.length > 22 ? v.slice(0, 22) + '…' : v}
                />
                <Tooltip
                  contentStyle={{ background: '#111827', border: '1px solid #374151', borderRadius: 8 }}
                  formatter={(v, _n, p) => [
                    `₪${Number(v).toLocaleString()} LTV  ·  ₪${p.payload.avg_price}/mo × ${p.payload.avg_tenure_months}mo`,
                    p.payload.plan_type,
                  ]}
                />
                <Bar dataKey="avg_ltv" fill="#10B981" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
            <div className="space-y-2">
              {ltvData.map((p, i) => (
                <div key={i} className="flex items-center justify-between bg-gray-800/50 rounded-lg px-3 py-2 gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="text-gray-300 text-xs font-medium truncate" title={p.plan_type}>{p.plan_type}</div>
                    <div className="text-gray-600 text-xs mt-0.5">
                      {p.member_count} members · ₪{Number(p.avg_price).toLocaleString()}/mo · {p.avg_tenure_months}mo avg tenure
                    </div>
                  </div>
                  <div className="shrink-0 text-right">
                    <div className="text-green-400 font-black text-sm">₪{Number(p.avg_ltv).toLocaleString()}</div>
                    <div className="text-gray-600 text-xs">avg LTV</div>
                  </div>
                </div>
              ))}
            </div>
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
      <div className="h-72 bg-gray-800 rounded-xl" />
    </div>
  )
}
