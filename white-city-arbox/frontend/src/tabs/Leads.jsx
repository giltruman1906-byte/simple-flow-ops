import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import KpiCard from '../components/KpiCard'
import {
  BarChart, Bar, LineChart, Line,
  XAxis, YAxis, Tooltip, ResponsiveContainer, Cell, CartesianGrid
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

// How many days back each period covers (for the drill-down query)
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

export default function Leads({ boxId }) {
  const [rows, setRows]           = useState({})   // keyed by record_type
  const [weeklyTrend, setWeeklyTrend] = useState([])
  const [period, setPeriod]       = useState('last_30d')
  const [loading, setLoading]     = useState(true)

  // Drill-down drawer state
  const [drawer, setDrawer]       = useState(null)
  const [drillData, setDrillData] = useState([])
  const [drillLoading, setDrillLoading] = useState(false)

  useEffect(() => {
    async function load() {
      const [{ data: martData }, { data: trendData }] = await Promise.all([
        supabase.from('mart_leads').select('*').eq('box_id', boxId),
        supabase.from('mart_leads_weekly_trend').select('*').eq('box_id', boxId).order('week_start'),
      ])
      if (martData) {
        const map = {}
        martData.forEach(r => { map[r.record_type] = r })
        setRows(map)
      }
      setWeeklyTrend((trendData || []).map(r => ({
        week:            new Date(r.week_start).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' }),
        conversion_rate: Number(r.conversion_rate_pct),
        total:           Number(r.total_leads),
        converted:       Number(r.converted),
      })))
      setLoading(false)
    }
    load()
  }, [boxId])

  const data = rows[period] ?? null
  const sources = (data?.source_breakdown || []).sort((a, b) => b.total - a.total)
  const reasons = data?.lost_reasons || []
  const trials  = rows['all_time']?.upcoming_trials || []   // always lifetime

  const funnelData = FUNNEL.map(f => ({
    name:  f.label,
    value: data?.[f.key] ?? 0,
    color: f.color,
    stageKey: f.key,
  }))

  // ── Drill-down: fetch individual leads for a stage ──────
  async function openDrillDown(chartData) {
    const entry = chartData?.activePayload?.[0]?.payload
    if (!entry?.stageKey) return

    const days = PERIOD_DAYS[period]

    // stageKey is e.g. 'new_leads' — strip '_leads' suffix to get the DB status
    const statusMap = {
      'new_leads':    'new',
      'in_progress':  'in_progress',
      'trial_booked': 'trial_booked',
      'converted':    'converted',
      'lost':         'lost',
    }
    const status = statusMap[entry.stageKey]
    if (!status) return

    setDrawer({ stage: status, label: entry.name, color: entry.color })
    setDrillLoading(true)
    setDrillData([])

    let query = supabase
      .from('mart_leads_detail')
      .select('full_name, first_name, last_name, phone, email, source, status, trial_date, created_at, lost_reason, days_in_pipeline')
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

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard label="Total Leads"       value={data?.total_leads}                          color="brand" icon="👤" />
        <KpiCard label="Converted"         value={data?.converted}                            color="green" icon="✅" />
        <KpiCard label="Conversion Rate"   value={`${data?.conversion_rate_pct ?? 0}%`}       color="blue"  icon="📈" />
        <KpiCard label="Avg Days to Close" value={`${data?.avg_days_to_convert ?? 0}d`}       color="yellow" icon="⏱️" />
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
              <XAxis type="number" tick={{ fill:'#6b7280', fontSize:11 }} />
              <YAxis type="category" dataKey="name" tick={{ fill:'#9ca3af', fontSize:12 }} width={90} />
              <Tooltip
                contentStyle={{ background:'#111827', border:'1px solid #374151', borderRadius:8 }}
                cursor={{ fill: 'rgba(255,255,255,0.05)' }}
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

      {/* Conversion trend + time-to-convert breakdown */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

        {/* Weekly conversion rate trend */}
        <div className="bg-gray-900 rounded-xl p-6 border border-gray-800">
          <h2 className="text-sm font-semibold text-gray-400 mb-1">Conversion Rate — Weekly Trend</h2>
          <p className="text-xs text-gray-600 mb-4">% of leads created that week who converted</p>
          <ResponsiveContainer width="100%" height={200}>
            <LineChart data={weeklyTrend}>
              <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" />
              <XAxis dataKey="week" tick={{ fill: '#6b7280', fontSize: 10 }} />
              <YAxis
                tick={{ fill: '#6b7280', fontSize: 11 }}
                tickFormatter={v => `${v}%`}
                domain={[0, 100]}
              />
              <Tooltip
                contentStyle={{ background: '#111827', border: '1px solid #374151', borderRadius: 8 }}
                formatter={(v, _, props) => [
                  `${v}% (${props.payload.converted}/${props.payload.total})`,
                  'Conversion rate'
                ]}
              />
              <Line type="monotone" dataKey="conversion_rate" stroke="#10B981" strokeWidth={2} dot={{ r: 3, fill: '#10B981' }} />
            </LineChart>
          </ResponsiveContainer>
        </div>

        {/* Time-to-convert breakdown */}
        <div className="bg-gray-900 rounded-xl p-6 border border-gray-800">
          <h2 className="text-sm font-semibold text-gray-400 mb-1">Time to Convert</h2>
          <p className="text-xs text-gray-600 mb-4">Converted leads by days in pipeline · {PERIODS.find(p => p.key === period)?.label}</p>
          <ResponsiveContainer width="100%" height={200}>
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

      {/* Upcoming trials — always lifetime */}
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
  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/50 z-40"
        onClick={onClose}
      />

      {/* Panel */}
      <div className="fixed right-0 top-0 h-full w-full max-w-lg bg-gray-950 border-l border-gray-800 z-50 flex flex-col shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-800">
          <div>
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 rounded-full" style={{ background: drawer.color }} />
              <h2 className="text-white font-bold text-lg">{drawer.label}</h2>
            </div>
            <p className="text-gray-500 text-xs mt-1">Last {period}</p>
          </div>
          <button
            onClick={onClose}
            className="text-gray-500 hover:text-white text-xl leading-none"
          >
            ✕
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-6">
          {loading ? (
            <div className="space-y-3 animate-pulse">
              {[...Array(5)].map((_, i) => <div key={i} className="h-16 bg-gray-800 rounded-lg" />)}
            </div>
          ) : data.length === 0 ? (
            <p className="text-gray-500 text-center mt-16">No leads in this stage for this period.</p>
          ) : (
            <div className="space-y-2">
              <p className="text-gray-500 text-xs mb-4">{data.length} people</p>
              {data.map((lead, i) => (
                <LeadRow key={i} lead={lead} stage={drawer.stage} />
              ))}
            </div>
          )}
        </div>
      </div>
    </>
  )
}

function LeadRow({ lead, stage }) {
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
          <div className="text-xs text-gray-500 bg-gray-800 rounded px-2 py-0.5">{lead.source}</div>
          {daysAgo !== null && (
            <div className="text-gray-600 text-xs mt-1">{daysAgo}d ago</div>
          )}
        </div>
      </div>

      {/* Extra fields per stage */}
      {stage === 'converted' && lead.days_in_pipeline != null && (
        <div className="mt-2 pt-2 border-t border-gray-800 text-xs text-green-400">
          Converted in {lead.days_in_pipeline}d
        </div>
      )}
      {stage === 'trial_booked' && lead.trial_date && (
        <div className="mt-2 pt-2 border-t border-gray-800 text-xs text-yellow-400">
          Trial: {lead.trial_date}
        </div>
      )}
      {stage === 'lost' && lead.lost_reason && (
        <div className="mt-2 pt-2 border-t border-gray-800 text-xs text-red-400">
          Reason: {lead.lost_reason}
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
