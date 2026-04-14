import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import KpiCard from '../components/KpiCard'
import {
  BarChart, Bar, LineChart, Line,
  XAxis, YAxis, Tooltip, ResponsiveContainer, Cell, CartesianGrid, Legend
} from 'recharts'

const FUNNEL = [
  { key: 'new_leads',    label: 'New',          color: '#6B7280' },
  { key: 'in_progress',  label: 'In Progress',  color: '#3B82F6' },
  { key: 'trial_booked', label: 'Trial Booked', color: '#F59E0B' },
  { key: 'converted',    label: 'Converted',    color: '#10B981' },
  { key: 'lost',         label: 'Lost',         color: '#EF4444' },
]

const PERIODS = [
  { key: 'last_30d', label: '30 days' },
  { key: 'last_60d', label: '60 days' },
  { key: 'last_90d', label: '90 days' },
  { key: 'all_time', label: 'All time' },
]

const PERIOD_DAYS = {
  last_30d: 30,
  last_60d: 60,
  last_90d: 90,
  all_time: null,
}

const CONVERT_BUCKETS = [
  { key: 'same_day', label: 'Same day' },
  { key: '1_3d',     label: '1–3 days' },
  { key: '4_7d',     label: '4–7 days' },
  { key: '8_30d',    label: '8–30 days' },
  { key: '30plus',   label: '30+ days' },
]

const fmt = n => n == null ? '—' : `₪${Number(n).toLocaleString()}`

export default function Leads({ boxId }) {
  const [rows, setRows]               = useState({})
  const [weeklyTrend, setWeeklyTrend] = useState([])
  const [monthlyTrend, setMonthlyTrend] = useState([])
  const [trendView, setTrendView]     = useState('weekly')  // 'weekly' | 'monthly'
  const [period, setPeriod]           = useState('last_30d')
  const [loading, setLoading]         = useState(true)

  // Drill-down drawer state
  const [drawer, setDrawer]           = useState(null)
  const [drillData, setDrillData]     = useState([])
  const [drillLoading, setDrillLoading] = useState(false)

  useEffect(() => {
    async function load() {
      const [{ data: martData }, { data: weekData }, { data: monthData }] = await Promise.all([
        supabase.from('mart_leads').select('*').eq('box_id', boxId),
        supabase.from('mart_leads_weekly_trend').select('*').eq('box_id', boxId).order('week_start'),
        supabase.from('mart_leads_monthly_trend').select('*').eq('box_id', boxId).order('month_start'),
      ])

      if (martData) {
        const map = {}
        martData.forEach(r => { map[r.record_type] = r })
        setRows(map)
      }

      setWeeklyTrend((weekData || []).map(r => ({
        label:           new Date(r.week_start).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' }),
        conversion_rate: Number(r.conversion_rate_pct),
        total:           Number(r.total_leads),
        converted:       Number(r.converted),
        won_revenue:     0,
        lost_revenue:    0,
      })))

      setMonthlyTrend((monthData || []).map(r => ({
        label:           new Date(r.month_start).toLocaleDateString('en-GB', { month: 'short', year: '2-digit' }),
        conversion_rate: Number(r.conversion_rate_pct),
        total:           Number(r.total_leads),
        converted:       Number(r.converted),
        lost:            Number(r.lost),
        won_revenue:     Number(r.won_revenue),
        lost_revenue:    Number(r.lost_revenue_est),
      })))

      setLoading(false)
    }
    load()
  }, [boxId])

  const data    = rows[period] ?? null
  const sources = (data?.source_breakdown || []).sort((a, b) => b.total - a.total)
  const reasons = data?.lost_reasons || []
  const trials  = rows['all_time']?.upcoming_trials || []
  const avgMrr  = Number(data?.avg_mrr ?? 0)

  const funnelData = FUNNEL.map(f => ({
    name:     f.label,
    value:    data?.[f.key] ?? 0,
    color:    f.color,
    stageKey: f.key,
  }))

  const trendData = trendView === 'weekly' ? weeklyTrend : monthlyTrend

  // ── Drill-down: fetch individual leads for a stage ──────
  async function openDrillDown(chartData) {
    const entry = chartData?.activePayload?.[0]?.payload
    if (!entry?.stageKey) return

    const days = PERIOD_DAYS[period]
    const statusMap = {
      'new_leads':    'new',
      'in_progress':  'in_progress',
      'trial_booked': 'trial_booked',
      'converted':    'converted',
      'lost':         'lost',
    }
    const status = statusMap[entry.stageKey]
    if (!status) return

    setDrawer({ stage: status, label: entry.name, color: entry.color, avgMrr })
    setDrillLoading(true)
    setDrillData([])

    let query = supabase
      .from('mart_leads_detail')
      .select('full_name, phone, email, source, status, trial_date, created_at, lost_reason, days_in_pipeline')
      .eq('box_id', boxId)
      .eq('status', status)
      .order('created_at', { ascending: false })

    if (days) {
      const since = new Date()
      since.setDate(since.getDate() - days)
      query = query.gte('created_at', since.toISOString())
    }

    const { data: leads } = await query
    setDrillData(leads || [])
    setDrillLoading(false)
  }

  if (loading) return <Skeleton />

  return (
    <div className="space-y-8">
      {/* Header + period toggle */}
      <div className="flex items-start justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-black text-white">Sales Funnel</h1>
          <p className="text-gray-500 text-sm mt-1">Lead pipeline &amp; conversion</p>
        </div>
        <div className="flex items-center gap-1 bg-gray-900 border border-gray-800 rounded-lg p-1">
          {PERIODS.map(p => (
            <button
              key={p.key}
              onClick={() => setPeriod(p.key)}
              className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-colors ${
                period === p.key
                  ? 'bg-brand text-white'
                  : 'text-gray-400 hover:text-white'
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>

      {/* KPI row 1 — pipeline counts */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard label="Total Leads"       value={data?.total_leads}                    color="brand"  icon="👤" />
        <KpiCard label="Trial Booked"      value={data?.trial_booked}                   color="yellow" icon="📅" />
        <KpiCard label="Converted"         value={data?.converted}                      color="green"  icon="✅" />
        <KpiCard label="Lost"              value={data?.lost}                            color="red"    icon="❌" />
      </div>

      {/* KPI row 2 — revenue */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-gray-900 rounded-xl p-5 border border-gray-800">
          <p className="text-xs text-gray-500 mb-1">Pipeline Value</p>
          <p className="text-2xl font-black text-yellow-400">{fmt(data?.pipeline_value)}</p>
          <p className="text-xs text-gray-600 mt-1">Trial booked × avg MRR</p>
        </div>
        <div className="bg-gray-900 rounded-xl p-5 border border-green-900/40 border">
          <p className="text-xs text-gray-500 mb-1">Won Revenue</p>
          <p className="text-2xl font-black text-green-400">{fmt(data?.won_revenue)}</p>
          <p className="text-xs text-gray-600 mt-1">Converted × avg MRR (₪{avgMrr})</p>
        </div>
        <div className="bg-gray-900 rounded-xl p-5 border border-red-900/40 border">
          <p className="text-xs text-gray-500 mb-1">Lost Revenue (est.)</p>
          <p className="text-2xl font-black text-red-400">{fmt(data?.lost_revenue_est)}</p>
          <p className="text-xs text-gray-600 mt-1">Lost leads × avg MRR (₪{avgMrr})</p>
        </div>
      </div>

      {/* Secondary KPIs */}
      <div className="grid grid-cols-2 gap-4">
        <KpiCard label="Conversion Rate"   value={`${data?.conversion_rate_pct ?? 0}%`} color="blue"   icon="📈" />
        <KpiCard label="Avg Days to Close" value={`${data?.avg_days_to_convert ?? 0}d`} color="brand"  icon="⏱️" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Funnel chart — clickable bars */}
        <div className="bg-gray-900 rounded-xl p-6 border border-gray-800">
          <h2 className="text-sm font-semibold text-gray-400 mb-1">Pipeline Stages</h2>
          <p className="text-xs text-gray-600 mb-4">Click a bar to see the people in that stage</p>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart
              data={funnelData}
              layout="vertical"
              style={{ cursor: 'pointer' }}
              onClick={openDrillDown}
            >
              <XAxis type="number" tick={{ fill: '#6b7280', fontSize: 11 }} />
              <YAxis type="category" dataKey="name" tick={{ fill: '#9ca3af', fontSize: 12 }} width={90} />
              <Tooltip
                contentStyle={{ background: '#111827', border: '1px solid #374151', borderRadius: 8 }}
                cursor={{ fill: 'rgba(255,255,255,0.05)' }}
              />
              <Bar dataKey="value" radius={[0, 4, 4, 0]}>
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
            {sources.length === 0 && (
              <p className="text-gray-600 text-sm px-5 py-4">No source data for this period.</p>
            )}
            {sources.map((s, i) => {
              const rate = s.total > 0 ? Math.round((s.converted / s.total) * 100) : 0
              return (
                <div key={i} className="flex items-center justify-between px-5 py-3">
                  <span className="text-white text-sm">{s.source || '—'}</span>
                  <div className="flex items-center gap-3 text-xs">
                    <span className="text-gray-400">{s.total} leads</span>
                    <span className="text-green-400 font-medium">{s.converted} won</span>
                    <span className="text-gray-600">{rate}%</span>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      </div>

      {/* Trend chart + time-to-convert */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

        {/* Trend chart with week/month toggle */}
        <div className="bg-gray-900 rounded-xl p-6 border border-gray-800">
          <div className="flex items-center justify-between mb-1">
            <h2 className="text-sm font-semibold text-gray-400">
              {trendView === 'weekly' ? 'Weekly' : 'Monthly'} Trend
            </h2>
            <div className="flex gap-1 bg-gray-800 rounded-md p-0.5">
              {['weekly', 'monthly'].map(v => (
                <button
                  key={v}
                  onClick={() => setTrendView(v)}
                  className={`px-2.5 py-1 rounded text-xs font-medium transition-colors ${
                    trendView === v ? 'bg-gray-700 text-white' : 'text-gray-500 hover:text-gray-300'
                  }`}
                >
                  {v === 'weekly' ? 'Week' : 'Month'}
                </button>
              ))}
            </div>
          </div>
          <p className="text-xs text-gray-600 mb-4">
            {trendView === 'weekly' ? 'Last 12 weeks' : 'Last 12 months'} — leads volume &amp; conversion rate
          </p>
          {trendData.length === 0 ? (
            <p className="text-gray-600 text-sm text-center py-12">No trend data yet.</p>
          ) : (
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={trendData} barSize={trendView === 'monthly' ? 18 : 10}>
                <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" />
                <XAxis dataKey="label" tick={{ fill: '#6b7280', fontSize: 10 }} />
                <YAxis yAxisId="left" tick={{ fill: '#6b7280', fontSize: 11 }} />
                <YAxis yAxisId="right" orientation="right" tick={{ fill: '#6b7280', fontSize: 11 }}
                       tickFormatter={v => `${v}%`} domain={[0, 100]} />
                <Tooltip
                  contentStyle={{ background: '#111827', border: '1px solid #374151', borderRadius: 8 }}
                  formatter={(v, name) => {
                    if (name === 'Conversion %') return [`${v}%`, name]
                    return [v, name]
                  }}
                />
                <Legend wrapperStyle={{ fontSize: 11, color: '#9ca3af' }} />
                <Bar yAxisId="left" dataKey="total" name="Total Leads" fill="#3B82F6" opacity={0.5} />
                <Bar yAxisId="left" dataKey="converted" name="Converted" fill="#10B981" />
                {trendView === 'monthly' && (
                  <Bar yAxisId="left" dataKey="lost" name="Lost" fill="#EF4444" opacity={0.7} />
                )}
                <Line yAxisId="right" type="monotone" dataKey="conversion_rate"
                      name="Conversion %" stroke="#F59E0B" strokeWidth={2} dot={{ r: 2, fill: '#F59E0B' }} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>

        {/* Time-to-convert breakdown */}
        <div className="bg-gray-900 rounded-xl p-6 border border-gray-800">
          <h2 className="text-sm font-semibold text-gray-400 mb-1">Time to Convert</h2>
          <p className="text-xs text-gray-600 mb-4">
            Converted leads by days in pipeline · {PERIODS.find(p => p.key === period)?.label}
          </p>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart
              data={CONVERT_BUCKETS.map(b => ({
                label: b.label,
                count: data?.convert_time_buckets?.[b.key] ?? 0,
              }))}
              layout="vertical"
            >
              <XAxis type="number" allowDecimals={false} tick={{ fill: '#6b7280', fontSize: 11 }} />
              <YAxis type="category" dataKey="label" tick={{ fill: '#9ca3af', fontSize: 11 }} width={70} />
              <Tooltip
                contentStyle={{ background: '#111827', border: '1px solid #374151', borderRadius: 8 }}
                formatter={v => [v, 'Leads']}
              />
              <Bar dataKey="count" fill="#10B981" radius={[0, 4, 4, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Upcoming trials */}
      {trials.length > 0 && (
        <div className="bg-yellow-500/10 border border-yellow-500/20 rounded-xl p-5">
          <h2 className="text-sm font-semibold text-yellow-400 mb-3">Upcoming Trials (next 7 days)</h2>
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
                <span className="text-gray-300 text-sm">{r.reason || 'Unknown'}</span>
                <div className="flex items-center gap-3 text-xs">
                  <span className="text-red-400 font-bold">{r.count} leads</span>
                  <span className="text-gray-600">{fmt(r.count * avgMrr)} est.</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Drill-down drawer */}
      {drawer && (
        <DrillDrawer
          drawer={drawer}
          data={drillData}
          loading={drillLoading}
          period={PERIODS.find(p => p.key === period)?.label}
          onClose={() => setDrawer(null)}
        />
      )}
    </div>
  )
}

// ── Drill-down slide-in drawer ──────────────────────────────
function DrillDrawer({ drawer, data, loading, period, onClose }) {
  const totalValue = drawer.stage === 'converted'
    ? fmt(data.length * drawer.avgMrr)
    : drawer.stage === 'lost'
    ? fmt(data.length * drawer.avgMrr)
    : null

  return (
    <>
      <div className="fixed inset-0 bg-black/50 z-40" onClick={onClose} />
      <div className="fixed right-0 top-0 h-full w-full max-w-lg bg-gray-950 border-l border-gray-800 z-50 flex flex-col shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-800">
          <div>
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 rounded-full" style={{ background: drawer.color }} />
              <h2 className="text-white font-bold text-lg">{drawer.label}</h2>
            </div>
            <p className="text-gray-500 text-xs mt-1">Last {period}</p>
            {totalValue && (
              <p className="text-xs mt-1" style={{ color: drawer.color }}>
                {drawer.stage === 'converted' ? 'Won' : 'Lost'}: {totalValue} total est.
              </p>
            )}
          </div>
          <button onClick={onClose} className="text-gray-500 hover:text-white text-xl leading-none">✕</button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-6">
          {loading ? (
            <div className="space-y-3 animate-pulse">
              {[...Array(5)].map((_, i) => <div key={i} className="h-20 bg-gray-800 rounded-lg" />)}
            </div>
          ) : data.length === 0 ? (
            <p className="text-gray-500 text-center mt-16">No leads in this stage for this period.</p>
          ) : (
            <div className="space-y-2">
              <p className="text-gray-500 text-xs mb-4">{data.length} people</p>
              {data.map((lead, i) => (
                <LeadRow key={i} lead={lead} stage={drawer.stage} avgMrr={drawer.avgMrr} />
              ))}
            </div>
          )}
        </div>
      </div>
    </>
  )
}

function LeadRow({ lead, stage, avgMrr }) {
  const daysAgo = lead.created_at
    ? Math.floor((Date.now() - new Date(lead.created_at)) / 86400000)
    : null

  return (
    <div className="bg-gray-900 rounded-lg px-4 py-3 border border-gray-800">
      <div className="flex items-start justify-between gap-2">
        <div>
          <div className="text-white font-semibold text-sm">{lead.full_name}</div>
          <div className="text-gray-400 text-xs mt-0.5">{lead.phone}</div>
          {lead.email && <div className="text-gray-500 text-xs">{lead.email}</div>}
        </div>
        <div className="text-right shrink-0">
          <div className="text-xs text-gray-500 bg-gray-800 rounded px-2 py-0.5">{lead.source || '—'}</div>
          {daysAgo !== null && (
            <div className="text-gray-600 text-xs mt-1">{daysAgo}d ago</div>
          )}
        </div>
      </div>

      {/* Stage-specific extra info */}
      <div className="mt-2 pt-2 border-t border-gray-800 flex items-center justify-between text-xs">
        {stage === 'converted' && (
          <>
            <span className="text-green-400">
              {lead.days_in_pipeline != null ? `Converted in ${lead.days_in_pipeline}d` : 'Converted'}
            </span>
            <span className="text-green-300 font-semibold">₪{avgMrr}/mo est.</span>
          </>
        )}
        {stage === 'lost' && (
          <>
            <span className="text-red-400">{lead.lost_reason || 'No reason recorded'}</span>
            <span className="text-red-300 font-semibold">−₪{avgMrr}/mo est.</span>
          </>
        )}
        {stage === 'trial_booked' && (
          <>
            <span className="text-yellow-400">
              {lead.trial_date ? `Trial: ${lead.trial_date}` : 'Trial pending'}
            </span>
            <span className="text-yellow-300 font-semibold">₪{avgMrr}/mo potential</span>
          </>
        )}
        {stage === 'in_progress' && (
          <span className="text-blue-400">
            {lead.days_in_pipeline != null ? `${lead.days_in_pipeline}d in pipeline` : 'In progress'}
          </span>
        )}
        {stage === 'new' && (
          <span className="text-gray-400">New lead</span>
        )}
      </div>
    </div>
  )
}

function Skeleton() {
  return (
    <div className="space-y-6 animate-pulse">
      <div className="h-8 w-48 bg-gray-800 rounded" />
      <div className="grid grid-cols-4 gap-4">{[...Array(4)].map((_, i) => <div key={i} className="h-28 bg-gray-800 rounded-xl" />)}</div>
      <div className="grid grid-cols-3 gap-4">{[...Array(3)].map((_, i) => <div key={i} className="h-24 bg-gray-800 rounded-xl" />)}</div>
      <div className="grid grid-cols-2 gap-4">{[...Array(2)].map((_, i) => <div key={i} className="h-64 bg-gray-800 rounded-xl" />)}</div>
    </div>
  )
}
