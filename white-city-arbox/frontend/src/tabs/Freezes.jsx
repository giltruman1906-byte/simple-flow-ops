import { useEffect, useState, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import KpiCard from '../components/KpiCard'
import {
  LineChart, Line, BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid,
} from 'recharts'

const fmt    = (n) => n != null ? `₪${Number(n).toLocaleString()}` : '—'
const fmtDay = (d) => d ? new Date(d).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: '2-digit' }) : '—'

const COLORS = ['#3B82F6','#E84A27','#10B981','#F59E0B','#8B5CF6','#EC4899','#14B8A6','#F97316']

const HEALTH_COLOR = {
  healthy:  'bg-green-500/20 text-green-400',
  at_risk:  'bg-yellow-500/20 text-yellow-400',
  critical: 'bg-red-500/20 text-red-400',
}

export default function Freezes({ boxId }) {
  const [summary, setSummary]       = useState(null)
  const [weekly, setWeekly]         = useState([])   // { label, period_start, count }
  const [monthly, setMonthly]       = useState([])
  const [frozenMrr, setFrozenMrr]   = useState([])
  const [byReason, setByReason]     = useState([])
  const [byPlan, setByPlan]         = useState([])
  const [loading, setLoading]       = useState(true)

  // Raw events
  const today         = new Date().toISOString().slice(0, 10)
  const threeMonthsAgo = new Date(Date.now() - 90 * 86400000).toISOString().slice(0, 10)
  const [fromDate, setFromDate]     = useState(threeMonthsAgo)
  const [toDate, setToDate]         = useState(today)
  const [rawData, setRawData]       = useState([])
  const [rawLoading, setRawLoading] = useState(false)

  // Trend drill-down + currently frozen panel
  const [drillDown, setDrillDown]   = useState(null)  // { label }
  const [drillData, setDrillData]   = useState([])
  const [drillLoading, setDrillLoading] = useState(false)

  // Freeze outcomes (churn funnel)
  const [outcomes, setOutcomes]               = useState([])
  const [outcomeLoading, setOutcomeLoading]   = useState(true)
  const [outcomeTableOpen, setOutcomeTableOpen] = useState(false)
  const [funnelDrill, setFunnelDrill]         = useState(null) // 'returned' | 'at_risk' | 'churned' | null

  // Load currently frozen members (for KPI card click)
  const loadCurrentlyFrozen = useCallback(async () => {
    setDrillDown({ label: 'Currently Frozen — active today' })
    setDrillData([])
    setDrillLoading(true)
    const { data } = await supabase
      .from('mart_freeze_events')
      .select('member_name,plan_type,health_tier,health_score,freeze_start,freeze_end,total_days,reason,price,is_active')
      .eq('box_id', boxId)
      .eq('is_active', true)
      .order('freeze_start', { ascending: false })
    setDrillData(data || [])
    setDrillLoading(false)
  }, [boxId])

  // Load freeze outcomes (churn funnel)
  useEffect(() => {
    supabase
      .from('mart_freeze_outcomes')
      .select('*')
      .eq('box_id', boxId)
      .order('freeze_end', { ascending: false })
      .then(({ data }) => { setOutcomes(data || []); setOutcomeLoading(false) })
  }, [boxId])

  // Load mart aggregations
  useEffect(() => {
    async function loadMart() {
      const { data } = await supabase
        .from('mart_monetization')
        .select('*')
        .eq('box_id', boxId)

      if (data) {
        setSummary(data.find(r => r.record_type === 'summary'))

        setWeekly(
          data.filter(r => r.record_type === 'freeze_weekly')
            .sort((a, b) => new Date(a.period_start) - new Date(b.period_start))
            .map(r => ({
              label:        new Date(r.period_start).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' }),
              period_start: r.period_start,
              count:        Number(r.freeze_count),
            }))
        )

        setMonthly(
          data.filter(r => r.record_type === 'freeze_monthly')
            .sort((a, b) => new Date(a.period_start) - new Date(b.period_start))
            .map(r => ({
              label:        new Date(r.period_start).toLocaleDateString('en-GB', { month: 'short', year: '2-digit' }),
              period_start: r.period_start,
              count:        Number(r.freeze_count),
              days:         Number(r.total_days_frozen),
            }))
        )

        setFrozenMrr(
          data.filter(r => r.record_type === 'frozen_mrr_monthly')
            .sort((a, b) => new Date(a.period_start) - new Date(b.period_start))
            .map(r => ({
              label: new Date(r.period_start).toLocaleDateString('en-GB', { month: 'short', year: '2-digit' }),
              mrr:   Number(r.period_revenue),
              count: Number(r.freeze_count),
            }))
        )

        setByReason(
          data.filter(r => r.record_type === 'freeze_by_reason')
            .sort((a, b) => b.freeze_count - a.freeze_count)
            .map(r => ({
              name:    r.reason,
              value:   Number(r.freeze_count),
              avgDays: Number(r.avg_freeze_days),
            }))
        )

        setByPlan(
          data.filter(r => r.record_type === 'freeze_by_plan')
            .sort((a, b) => b.freeze_count - a.freeze_count)
            .map(r => ({
              name:    r.plan_type,
              count:   Number(r.freeze_count),
              avgDays: Number(r.avg_freeze_days),
              impact:  Number(r.plan_revenue),
            }))
        )
      }
      setLoading(false)
    }
    loadMart()
  }, [boxId])

  // Load raw events (date-filtered)
  useEffect(() => {
    async function loadRaw() {
      setRawLoading(true)
      const { data } = await supabase
        .from('mart_freeze_events')
        .select('member_name,plan_type,health_tier,health_score,freeze_start,freeze_end,total_days,reason,price,is_active')
        .eq('box_id', boxId)
        .gte('freeze_start', fromDate)
        .lte('freeze_start', toDate)
        .order('freeze_start', { ascending: false })
      setRawData(data || [])
      setRawLoading(false)
    }
    if (boxId) loadRaw()
  }, [boxId, fromDate, toDate])

  // Drill-down: click on a weekly bar
  const handleWeeklyBarClick = useCallback(async (barPayload) => {
    if (!barPayload || barPayload.count === 0) return
    const weekEnd = new Date(barPayload.period_start)
    weekEnd.setDate(weekEnd.getDate() + 6)
    const weekEndStr = weekEnd.toISOString().slice(0, 10)

    setDrillDown({ label: `Week of ${barPayload.label}` })
    setDrillData([])
    setDrillLoading(true)

    const { data } = await supabase
      .from('mart_freeze_events')
      .select('member_name,plan_type,health_tier,health_score,freeze_start,freeze_end,total_days,reason,price,is_active')
      .eq('box_id', boxId)
      .gte('freeze_start', barPayload.period_start)
      .lte('freeze_start', weekEndStr)
      .order('freeze_start', { ascending: false })

    setDrillData(data || [])
    setDrillLoading(false)
  }, [boxId])

  // Drill-down: click on a monthly bar
  const handleMonthlyBarClick = useCallback(async (barPayload) => {
    if (!barPayload || barPayload.count === 0) return
    const monthEnd = new Date(barPayload.period_start)
    monthEnd.setMonth(monthEnd.getMonth() + 1)
    monthEnd.setDate(0)
    const monthEndStr = monthEnd.toISOString().slice(0, 10)

    setDrillDown({ label: barPayload.label })
    setDrillData([])
    setDrillLoading(true)

    const { data } = await supabase
      .from('mart_freeze_events')
      .select('member_name,plan_type,health_tier,health_score,freeze_start,freeze_end,total_days,reason,price,is_active')
      .eq('box_id', boxId)
      .gte('freeze_start', barPayload.period_start)
      .lte('freeze_start', monthEndStr)
      .order('freeze_start', { ascending: false })

    setDrillData(data || [])
    setDrillLoading(false)
  }, [boxId])

  if (loading) return <Skeleton />

  const totalYtd = byReason.reduce((s, r) => s + r.value, 0)

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-black text-white">Membership Freezes</h1>
        <p className="text-gray-500 text-sm mt-1">
          Paused subscriptions — extensions added automatically on return
        </p>
      </div>

      {/* KPI row */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Clickable "Currently Frozen" card */}
        <button
          onClick={loadCurrentlyFrozen}
          className="rounded-xl border border-blue-500/30 bg-blue-500/5 p-5 text-left hover:border-blue-400/50 transition-colors group"
        >
          <div className="flex items-center justify-between mb-3">
            <span className="text-gray-400 text-sm font-medium">Currently Frozen</span>
            <span className="text-xl">❄️</span>
          </div>
          <div className="text-3xl font-black text-blue-400">{summary?.frozen_count ?? 0}</div>
          <div className="text-gray-500 text-xs mt-1 flex items-center justify-between">
            <span>active holds today</span>
            <span className="text-blue-500/60 group-hover:text-blue-400 text-xs">click to see →</span>
          </div>
        </button>
        <KpiCard label="Total This Year"      value={totalYtd}                                                        color="brand"  icon="📋"  sub="freeze events YTD" />
        <KpiCard label="Avg Freeze Duration"  value={summary?.avg_freeze_days ? `${summary.avg_freeze_days}d` : '—'}  color="yellow" icon="📅"  sub="days per event" />
        <KpiCard label="Revenue on Hold"      value={fmt(summary?.frozen_revenue_impact)}                              color="red"    icon="⏸"   sub="current frozen MRR" />
      </div>

      {/* Charts row 1: Weekly trend + Reason pie */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

        {/* Weekly freeze count */}
        <div className="lg:col-span-2 bg-gray-900 rounded-xl p-6 border border-gray-800">
          <div className="flex items-center justify-between mb-1">
            <h2 className="text-sm font-semibold text-gray-400">New Freezes by Week (last 12 weeks)</h2>
            <span className="text-xs text-gray-600">click bar to see members</span>
          </div>
          <p className="text-xs text-gray-600 mb-4">
            Bars = newly started that week · Currently active: <span className="text-blue-400 font-semibold">{summary?.frozen_count ?? 0}</span>
          </p>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={weekly}>
              <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" />
              <XAxis dataKey="label" tick={{ fill:'#6b7280', fontSize:11 }} />
              <YAxis allowDecimals={false} tick={{ fill:'#6b7280', fontSize:11 }} />
              <Tooltip
                contentStyle={{ background:'#111827', border:'1px solid #374151', borderRadius:8 }}
                formatter={v => [v, 'New freezes started']}
              />
              <Bar
                dataKey="count"
                fill="#3B82F6"
                radius={[4,4,0,0]}
                style={{ cursor: 'pointer' }}
                onClick={(barData) => handleWeeklyBarClick(barData)}
              />
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* By reason pie */}
        <div className="bg-gray-900 rounded-xl p-6 border border-gray-800">
          <h2 className="text-sm font-semibold text-gray-400 mb-4">Freeze Reasons</h2>
          <ResponsiveContainer width="100%" height={160}>
            <PieChart>
              <Pie data={byReason} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={40} outerRadius={65}>
                {byReason.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
              </Pie>
              <Tooltip
                contentStyle={{ background:'#111827', border:'1px solid #374151', borderRadius:8 }}
                formatter={(v, _n, p) => [`${v} freezes · avg ${p.payload.avgDays}d`, _n]}
              />
            </PieChart>
          </ResponsiveContainer>
          <div className="space-y-1 mt-2">
            {byReason.map((r, i) => (
              <div key={i} className="flex items-center justify-between text-xs">
                <div className="flex items-center gap-2 min-w-0">
                  <div className="w-2 h-2 shrink-0 rounded-full" style={{ background: COLORS[i % COLORS.length] }} />
                  <span className="text-gray-400 truncate max-w-[110px]" title={r.name}>{r.name}</span>
                </div>
                <span className="text-gray-300 shrink-0 ml-1">{r.value} · {r.avgDays}d</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ── Freeze → Return Funnel ── */}
      {!outcomeLoading && outcomes.length > 0 && <FreezeFunnel
        outcomes={outcomes}
        outcomeTableOpen={outcomeTableOpen}
        setOutcomeTableOpen={setOutcomeTableOpen}
        funnelDrill={funnelDrill}
        setFunnelDrill={setFunnelDrill}
        fmtDay={fmtDay}
      />}

      {/* Drill-down panel for trend bars */}
      {drillDown && (
        <div className="bg-gray-900 rounded-xl border border-blue-500/30 p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-semibold text-white">
              Freezes — <span className="text-brand">{drillDown.label}</span>
              {!drillLoading && <span className="text-gray-500 ml-2">({drillData.length})</span>}
            </h2>
            <button
              onClick={() => setDrillDown(null)}
              className="text-gray-500 hover:text-white text-xs border border-gray-700 rounded px-2 py-1"
            >
              close
            </button>
          </div>
          {drillLoading ? (
            <div className="text-gray-500 text-sm text-center py-4">Loading…</div>
          ) : drillData.length === 0 ? (
            <div className="text-gray-500 text-sm text-center py-4">No freeze events found.</div>
          ) : (
            <FreezeTable rows={drillData} />
          )}
        </div>
      )}

      {/* Charts row 2: Frozen MRR trend + By plan */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

        {/* Frozen MRR per month */}
        <div className="bg-gray-900 rounded-xl p-6 border border-gray-800">
          <h2 className="text-sm font-semibold text-gray-400 mb-1">Frozen MRR by Month</h2>
          <p className="text-xs text-gray-600 mb-4">Total subscription value on hold each month (all overlapping freezes)</p>
          <ResponsiveContainer width="100%" height={220}>
            <LineChart data={frozenMrr}>
              <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" />
              <XAxis dataKey="label" tick={{ fill:'#6b7280', fontSize:11 }} />
              <YAxis tick={{ fill:'#6b7280', fontSize:11 }} tickFormatter={v => `₪${v/1000}k`} />
              <Tooltip
                contentStyle={{ background:'#111827', border:'1px solid #374151', borderRadius:8 }}
                formatter={(v, name) => [
                  name === 'mrr' ? fmt(v) : `${v} events`,
                  name === 'mrr' ? 'Frozen MRR' : 'Freeze events',
                ]}
              />
              <Line type="monotone" dataKey="mrr"   stroke="#3B82F6" strokeWidth={2} dot={false} name="mrr" />
              <Line type="monotone" dataKey="count" stroke="#6b7280" strokeWidth={1} dot={false} strokeDasharray="4 4" name="count" />
            </LineChart>
          </ResponsiveContainer>
        </div>

        {/* By plan type */}
        <div className="bg-gray-900 rounded-xl p-6 border border-gray-800">
          <h2 className="text-sm font-semibold text-gray-400 mb-1">Freezes by Subscription Plan</h2>
          <p className="text-xs text-gray-600 mb-4">Which plans get frozen most</p>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={byPlan} layout="vertical" margin={{ left: 8, right: 30 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" horizontal={false} />
              <XAxis type="number" allowDecimals={false} tick={{ fill:'#6b7280', fontSize:11 }} />
              <YAxis
                type="category" dataKey="name"
                tick={{ fill:'#6b7280', fontSize:10 }}
                width={120}
                tickFormatter={v => v?.length > 18 ? v.slice(0, 18) + '…' : v}
              />
              <Tooltip
                contentStyle={{ background:'#111827', border:'1px solid #374151', borderRadius:8 }}
                formatter={(v, n, p) => [`${v} freezes · avg ${p.payload.avgDays}d · ${fmt(p.payload.impact)} impact`, '']}
              />
              <Bar dataKey="count" fill="#E84A27" radius={[0,4,4,0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Monthly trend — clickable */}
      <div className="bg-gray-900 rounded-xl p-6 border border-gray-800">
        <div className="flex items-center justify-between mb-1">
          <h2 className="text-sm font-semibold text-gray-400">Monthly Freeze Trend (last 12 months)</h2>
          <span className="text-xs text-gray-600">click bar to see members</span>
        </div>
        <div className="mb-4" />
        <ResponsiveContainer width="100%" height={200}>
          <BarChart data={monthly}>
            <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" />
            <XAxis dataKey="label" tick={{ fill:'#6b7280', fontSize:11 }} />
            <YAxis allowDecimals={false} tick={{ fill:'#6b7280', fontSize:11 }} />
            <Tooltip
              contentStyle={{ background:'#111827', border:'1px solid #374151', borderRadius:8 }}
              formatter={(v, name) => [v, name === 'count' ? 'New freezes' : 'Total days frozen']}
            />
            <Bar
              dataKey="count"
              fill="#3B82F6"
              radius={[4,4,0,0]}
              name="count"
              style={{ cursor: 'pointer' }}
              onClick={(barData) => handleMonthlyBarClick(barData)}
            />
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* Raw freeze events table */}
      <div className="bg-gray-900 rounded-xl border border-gray-800 overflow-hidden">
        <div className="p-5 border-b border-gray-800 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h2 className="text-sm font-semibold text-white">Raw Freeze Events</h2>
            <p className="text-xs text-gray-500 mt-0.5">{rawData.length} events · sorted by freeze start</p>
          </div>
          <div className="flex items-center gap-2 text-xs">
            <span className="text-gray-500">From</span>
            <input
              type="date" value={fromDate} onChange={e => setFromDate(e.target.value)}
              className="bg-gray-800 border border-gray-700 rounded-lg px-3 py-1.5 text-gray-300 text-xs focus:outline-none focus:border-brand"
            />
            <span className="text-gray-500">to</span>
            <input
              type="date" value={toDate} onChange={e => setToDate(e.target.value)}
              className="bg-gray-800 border border-gray-700 rounded-lg px-3 py-1.5 text-gray-300 text-xs focus:outline-none focus:border-brand"
            />
          </div>
        </div>

        {rawLoading ? (
          <div className="p-8 text-center text-gray-600 text-sm">Loading…</div>
        ) : rawData.length === 0 ? (
          <div className="p-8 text-center text-gray-600 text-sm">No freeze events in this date range.</div>
        ) : (
          <FreezeTable rows={rawData} showActive />
        )}
      </div>
    </div>
  )
}

const OUTCOME_CONFIG = {
  returned: { label: 'Returned (checked in)',     color: 'text-green-400',  bar: 'bg-green-500',  badge: 'bg-green-500/20 text-green-400',  hover: 'hover:border-green-500/40' },
  at_risk:  { label: 'At Risk (no check-in yet)', color: 'text-yellow-400', bar: 'bg-yellow-500', badge: 'bg-yellow-500/20 text-yellow-400', hover: 'hover:border-yellow-500/40' },
  churned:  { label: 'Churned',                   color: 'text-red-400',    bar: 'bg-red-500',    badge: 'bg-red-500/20 text-red-400',       hover: 'hover:border-red-500/40' },
}

function FreezeFunnel({ outcomes, outcomeTableOpen, setOutcomeTableOpen, funnelDrill, setFunnelDrill, fmtDay }) {
  const first      = outcomes[0]
  const total      = Number(first?.total_completed   || 0)
  const returned   = Number(first?.total_returned    || 0)
  const churned    = Number(first?.total_churned     || 0)
  const atRisk     = Number(first?.total_at_risk     || 0)
  const returnRate = Number(first?.return_rate_pct   || 0)

  const steps = [
    { key: null,        label: 'Completed Freezes', count: total,    color: 'text-gray-300',  bar: 'bg-gray-600',  pct: 100,  clickable: false },
    { key: 'returned',  ...OUTCOME_CONFIG.returned,  count: returned, pct: total ? Math.round(returned / total * 100) : 0, clickable: true },
    { key: 'at_risk',   ...OUTCOME_CONFIG.at_risk,   count: atRisk,   pct: total ? Math.round(atRisk   / total * 100) : 0, clickable: true },
    { key: 'churned',   ...OUTCOME_CONFIG.churned,   count: churned,  pct: total ? Math.round(churned  / total * 100) : 0, clickable: true },
  ]

  const drillRows = funnelDrill ? outcomes.filter(r => r.outcome === funnelDrill) : []
  const drillCfg  = funnelDrill ? OUTCOME_CONFIG[funnelDrill] : null

  return (
    <div className="bg-gray-900 rounded-xl p-6 border border-gray-800">
      <div className="flex items-start justify-between mb-5">
        <div>
          <h2 className="text-sm font-semibold text-gray-400">Freeze → Return Funnel</h2>
          <p className="text-xs text-gray-600 mt-0.5">What happened to members after their freeze ended · click a step to see members</p>
        </div>
        <div className="text-right">
          <div className="text-3xl font-black text-green-400">{returnRate}%</div>
          <div className="text-gray-500 text-xs">return rate</div>
        </div>
      </div>

      {/* Funnel steps — clickable rows */}
      <div className="space-y-2 mb-5">
        {steps.map((s, i) => (
          <div
            key={i}
            onClick={() => s.clickable && setFunnelDrill(funnelDrill === s.key ? null : s.key)}
            className={`rounded-lg border p-3 transition-colors ${
              s.clickable
                ? `cursor-pointer border-gray-800 ${s.hover} ${funnelDrill === s.key ? 'border-opacity-60 bg-gray-800/40' : 'bg-gray-800/20'}`
                : 'border-transparent'
            }`}
          >
            <div className="flex items-center justify-between mb-1.5">
              <span className={`text-xs font-medium ${s.color}`}>
                {s.label}
                {s.clickable && <span className="text-gray-600 ml-1.5 text-xs">{funnelDrill === s.key ? '▲' : '▼'}</span>}
              </span>
              <span className={`text-xs font-bold ${s.color}`}>{s.count} · {s.pct}%</span>
            </div>
            <div className="h-1.5 bg-gray-800 rounded-full">
              <div className={`h-1.5 rounded-full ${s.bar}`} style={{ width: `${s.pct}%` }} />
            </div>
          </div>
        ))}
      </div>

      {/* Inline drill-down panel */}
      {funnelDrill && drillRows.length > 0 && (
        <div className="mt-2 rounded-lg border border-gray-700 overflow-hidden">
          <div className="flex items-center justify-between px-4 py-2.5 bg-gray-800/60 border-b border-gray-700">
            <span className={`text-xs font-semibold ${drillCfg.color}`}>
              {drillCfg.label} — {drillRows.length} members
            </span>
            <button onClick={() => setFunnelDrill(null)} className="text-gray-500 hover:text-white text-xs">✕ close</button>
          </div>
          <div className="overflow-x-auto max-h-72 overflow-y-auto">
            <table className="w-full text-xs">
              <thead className="sticky top-0 bg-gray-900">
                <tr className="border-b border-gray-800">
                  {['Member','Plan','Freeze End','Days','Reason'].map(h => (
                    <th key={h} className="text-left py-2.5 px-3 text-gray-500 font-medium whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {drillRows.map((r, i) => (
                  <tr key={i} className="border-b border-gray-800/50 hover:bg-gray-800/30">
                    <td className="py-2 px-3 text-gray-200 font-medium whitespace-nowrap">{r.member_name || '—'}</td>
                    <td className="py-2 px-3 text-gray-400 max-w-[140px] truncate" title={r.plan_type}>{r.plan_type || '—'}</td>
                    <td className="py-2 px-3 text-gray-300 whitespace-nowrap">{fmtDay(r.freeze_end)}</td>
                    <td className="py-2 px-3 text-blue-400 font-semibold">{r.total_days}d</td>
                    <td className="py-2 px-3 text-gray-400 whitespace-nowrap">{r.reason || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Full outcomes table toggle */}
      <div className="mt-4">
        <button
          onClick={() => setOutcomeTableOpen(v => !v)}
          className="text-xs text-gray-500 hover:text-white border border-gray-700 rounded-lg px-3 py-1.5 transition-colors"
        >
          {outcomeTableOpen ? '▲ hide all outcomes' : '▼ show all outcomes'}
        </button>
      </div>

      {outcomeTableOpen && (
        <div className="mt-3 overflow-x-auto max-h-80 overflow-y-auto rounded-lg border border-gray-800">
          <table className="w-full text-xs">
            <thead className="sticky top-0 bg-gray-900">
              <tr className="border-b border-gray-800">
                {['Member','Plan','Freeze End','Days','Reason','Outcome'].map(h => (
                  <th key={h} className="text-left py-2.5 px-3 text-gray-500 font-medium whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {outcomes.map((r, i) => (
                <tr key={i} className="border-b border-gray-800/50 hover:bg-gray-800/30">
                  <td className="py-2 px-3 text-gray-200 font-medium whitespace-nowrap">{r.member_name || '—'}</td>
                  <td className="py-2 px-3 text-gray-400 max-w-[140px] truncate" title={r.plan_type}>{r.plan_type || '—'}</td>
                  <td className="py-2 px-3 text-gray-300 whitespace-nowrap">{fmtDay(r.freeze_end)}</td>
                  <td className="py-2 px-3 text-blue-400 font-semibold">{r.total_days}d</td>
                  <td className="py-2 px-3 text-gray-400 whitespace-nowrap">{r.reason || '—'}</td>
                  <td className="py-2 px-3">
                    <span className={`px-2 py-0.5 rounded-full font-semibold ${
                      r.outcome === 'returned' ? 'bg-green-500/20 text-green-400' :
                      r.outcome === 'churned'  ? 'bg-red-500/20 text-red-400' :
                      r.outcome === 'at_risk'  ? 'bg-yellow-500/20 text-yellow-400' :
                      'bg-gray-700 text-gray-400'
                    }`}>
                      {r.outcome}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

// Shared table component used by both raw view and drill-down
function FreezeTable({ rows, showActive = false }) {
  return (
    <div className="overflow-x-auto max-h-96 overflow-y-auto">
      <table className="w-full text-sm">
        <thead className="sticky top-0 bg-gray-900 z-10">
          <tr className="border-b border-gray-800">
            {['Member', 'Plan', 'Health', 'Start', 'End', 'Days', 'Reason', showActive && 'Active'].filter(Boolean).map(h => (
              <th key={h} className="text-left py-3 px-4 text-gray-500 font-medium text-xs whitespace-nowrap">{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={i} className={`border-b border-gray-800/50 hover:bg-gray-800/30 ${row.is_active ? 'bg-blue-500/5' : ''}`}>
              <td className="py-2.5 px-4 text-gray-200 font-medium whitespace-nowrap">{row.member_name || '—'}</td>
              <td className="py-2.5 px-4 text-gray-400 max-w-[150px] truncate" title={row.plan_type}>{row.plan_type || '—'}</td>
              <td className="py-2.5 px-4">
                {row.health_tier ? (
                  <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${HEALTH_COLOR[row.health_tier] || 'bg-gray-700/50 text-gray-400'}`}>
                    {row.health_tier.replace('_', ' ')} · {row.health_score}
                  </span>
                ) : '—'}
              </td>
              <td className="py-2.5 px-4 text-gray-300 whitespace-nowrap">{fmtDay(row.freeze_start)}</td>
              <td className="py-2.5 px-4 text-gray-300 whitespace-nowrap">{fmtDay(row.freeze_end)}</td>
              <td className="py-2.5 px-4 text-blue-400 font-semibold whitespace-nowrap">{row.total_days}d</td>
              <td className="py-2.5 px-4 text-gray-400 whitespace-nowrap">{row.reason || '—'}</td>
              {showActive && (
                <td className="py-2.5 px-4">
                  {row.is_active && (
                    <span className="text-xs px-2 py-0.5 rounded-full bg-blue-500/20 text-blue-400 font-medium">Active</span>
                  )}
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function Skeleton() {
  return (
    <div className="space-y-6 animate-pulse">
      <div className="h-8 w-48 bg-gray-800 rounded" />
      <div className="grid grid-cols-4 gap-4">{[...Array(4)].map((_, i) => <div key={i} className="h-28 bg-gray-800 rounded-xl" />)}</div>
      <div className="h-72 bg-gray-800 rounded-xl" />
      <div className="grid grid-cols-2 gap-6"><div className="h-64 bg-gray-800 rounded-xl" /><div className="h-64 bg-gray-800 rounded-xl" /></div>
    </div>
  )
}
