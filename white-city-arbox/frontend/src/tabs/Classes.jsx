import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import {
  BarChart, Bar, LineChart, Line,
  XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid,
} from 'recharts'

const DAYS  = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const HOURS = [6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21]

const pct = (n) => n != null ? `${Number(n).toFixed(1)}%` : '—'

export default function Classes({ boxId }) {
  const [summary, setSummary]       = useState(null)
  const [coaches, setCoaches]       = useState([])
  const [classTypes, setClassTypes] = useState([])
  const [weekly, setWeekly]         = useState([])
  const [heatmap, setHeatmap]       = useState({})   // "dow-hour" → { checkins, fill_rate }
  const [loading, setLoading]       = useState(true)
  const [classSort, setClassSort]   = useState('checkins') // 'checkins' | 'fill_rate'

  useEffect(() => {
    async function load() {
      const { data } = await supabase
        .from('mart_classes')
        .select('*')
        .eq('box_id', boxId)

      if (!data) { setLoading(false); return }

      setSummary(data.find(r => r.record_type === 'summary'))

      setCoaches(
        data.filter(r => r.record_type === 'by_coach')
          .sort((a, b) => b.avg_fill_rate - a.avg_fill_rate)
      )

      setClassTypes(
        data.filter(r => r.record_type === 'by_class_type')
          .sort((a, b) => b.total_checkins - a.total_checkins)
      )

      setWeekly(
        data.filter(r => r.record_type === 'weekly_trend')
          .sort((a, b) => new Date(a.period_start) - new Date(b.period_start))
          .map(r => ({
            label:    new Date(r.period_start).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' }),
            sessions: Number(r.total_sessions),
            checkins: Number(r.total_checkins),
            fill:     Number(r.avg_fill_rate),
          }))
      )

      const hmap = {}
      data.filter(r => r.record_type === 'heatmap').forEach(r => {
        hmap[`${r.day_of_week}-${r.hour_of_day}`] = {
          checkins:  Number(r.total_checkins),
          fill_rate: Number(r.avg_fill_rate),
          sessions:  Number(r.total_sessions),
        }
      })
      setHeatmap(hmap)
      setLoading(false)
    }
    load()
  }, [boxId])

  if (loading) return <Skeleton />

  const sortedClassTypes = [...classTypes].sort((a, b) =>
    classSort === 'fill_rate'
      ? b.avg_fill_rate - a.avg_fill_rate
      : b.total_checkins - a.total_checkins
  )

  const maxFill = Math.max(...Object.values(heatmap).map(v => v.fill_rate), 1)

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-black text-white">Classes</h1>
        <p className="text-gray-500 text-sm mt-1">
          Sessions, fill rate and coach performance — YTD
        </p>
      </div>

      {/* KPI cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard label="Sessions YTD"      value={Number(summary?.total_sessions).toLocaleString()}  color="brand"  icon="📅" sub="unique class occurrences" />
        <KpiCard label="Total Check-ins"   value={Number(summary?.total_checkins).toLocaleString()}   color="green"  icon="✅" sub="members who showed up" />
        <KpiCard label="Avg Fill Rate"     value={pct(summary?.avg_fill_rate)}                        color="blue"   icon="📊" sub="check-ins ÷ capacity" />
        <KpiCard label="First-timers YTD"  value={Number(summary?.total_first_timers).toLocaleString()} color="yellow" icon="🆕" sub="first class ever" />
      </div>

      {/* Weekly trend */}
      <div className="bg-gray-900 rounded-xl p-6 border border-gray-800">
        <h2 className="text-sm font-semibold text-gray-400 mb-1">Weekly Check-ins &amp; Fill Rate</h2>
        <p className="text-xs text-gray-600 mb-4">Bars = check-ins · Line = avg fill rate %</p>
        <ResponsiveContainer width="100%" height={220}>
          <LineChart data={weekly}>
            <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" />
            <XAxis dataKey="label" tick={{ fill: '#6b7280', fontSize: 10 }} />
            <YAxis yAxisId="left"  tick={{ fill: '#6b7280', fontSize: 11 }} allowDecimals={false} />
            <YAxis yAxisId="right" orientation="right" tick={{ fill: '#6b7280', fontSize: 11 }}
                   tickFormatter={v => `${v}%`} domain={[0, 120]} />
            <Tooltip
              contentStyle={{ background: '#111827', border: '1px solid #374151', borderRadius: 8 }}
              formatter={(v, name) => [
                name === 'fill' ? `${v}%` : v,
                name === 'fill' ? 'Avg fill rate' : name === 'checkins' ? 'Check-ins' : 'Sessions',
              ]}
            />
            <Bar  yAxisId="left"  dataKey="checkins" fill="#3B82F6" radius={[3,3,0,0]} name="checkins" />
            <Line yAxisId="right" type="monotone" dataKey="fill" stroke="#10B981" strokeWidth={2} dot={false} name="fill" />
          </LineChart>
        </ResponsiveContainer>
      </div>

      {/* Coach leaderboard + Class type side by side */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

        {/* Coach leaderboard */}
        <div className="bg-gray-900 rounded-xl border border-gray-800 overflow-hidden">
          <div className="p-5 border-b border-gray-800">
            <h2 className="text-sm font-semibold text-gray-400">Coach Leaderboard</h2>
            <p className="text-xs text-gray-600 mt-0.5">Sorted by avg fill rate (check-ins ÷ capacity)</p>
          </div>
          <div className="overflow-y-auto max-h-80">
            {coaches.map((c, i) => (
              <div key={i} className="flex items-center gap-3 px-5 py-3 border-b border-gray-800/50 hover:bg-gray-800/30">
                <div className="w-7 h-7 shrink-0 rounded-full bg-brand/15 text-brand text-xs font-bold flex items-center justify-center">
                  {i + 1}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-white text-sm font-medium truncate">{c.label}</div>
                  <div className="text-gray-500 text-xs truncate">{c.top_class}</div>
                </div>
                <div className="text-right shrink-0">
                  <div className="text-green-400 font-bold text-sm">{pct(c.avg_fill_rate)}</div>
                  <div className="text-gray-600 text-xs">{Number(c.total_sessions)} sessions</div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Class types bar chart */}
        <div className="bg-gray-900 rounded-xl p-6 border border-gray-800">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-semibold text-gray-400">Class Types</h2>
            <div className="flex items-center gap-1 bg-gray-800 rounded-lg p-1">
              {[
                { id: 'checkins',  label: 'Volume' },
                { id: 'fill_rate', label: 'Fill Rate' },
              ].map(opt => (
                <button
                  key={opt.id}
                  onClick={() => setClassSort(opt.id)}
                  className={`px-2.5 py-1 rounded-md text-xs font-semibold transition-colors ${
                    classSort === opt.id ? 'bg-brand text-white' : 'text-gray-400 hover:text-white'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>
          <div className="space-y-2">
            {sortedClassTypes.slice(0, 10).map((ct, i) => {
              const val     = classSort === 'fill_rate' ? ct.avg_fill_rate : ct.total_checkins
              const maxVal  = classSort === 'fill_rate'
                ? Math.max(...sortedClassTypes.map(x => x.avg_fill_rate))
                : sortedClassTypes[0].total_checkins
              const barPct  = Math.round(val / maxVal * 100)
              return (
                <div key={i} className="flex items-center gap-3">
                  <div className="text-gray-400 text-xs w-36 truncate shrink-0" title={ct.label}>{ct.label}</div>
                  <div className="flex-1 bg-gray-800 rounded-full h-2">
                    <div className="h-2 rounded-full bg-brand" style={{ width: `${barPct}%` }} />
                  </div>
                  <div className="text-gray-300 text-xs w-16 text-right shrink-0">
                    {classSort === 'fill_rate' ? pct(val) : Number(val).toLocaleString()}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      </div>

      {/* Fill rate heatmap — day × hour */}
      <div className="bg-gray-900 rounded-xl p-6 border border-gray-800 overflow-x-auto">
        <h2 className="text-sm font-semibold text-gray-400 mb-1">Fill Rate Heatmap</h2>
        <p className="text-xs text-gray-600 mb-5">
          Avg fill rate (check-ins ÷ capacity) per day × hour — darker = fuller sessions
        </p>
        <div className="inline-block min-w-full">
          {/* Hour headers */}
          <div className="flex gap-1 ml-10 mb-1">
            {HOURS.map(h => (
              <div key={h} className="w-9 text-center text-xs text-gray-600">{h}</div>
            ))}
          </div>
          {DAYS.map((day, d) => (
            <div key={d} className="flex items-center gap-1 mb-1">
              <div className="w-9 text-xs text-gray-500 text-right pr-1 shrink-0">{day}</div>
              {HOURS.map(h => {
                const cell = heatmap[`${d}-${h}`]
                const fill = cell?.fill_rate ?? 0
                const intensity = fill / maxFill
                return (
                  <div
                    key={h}
                    title={cell ? `${day} ${h}:00 — ${cell.sessions} sessions · ${fill}% fill · ${cell.checkins} check-ins` : `${day} ${h}:00 — no sessions`}
                    className="w-9 h-7 rounded-sm transition-colors"
                    style={{
                      background: fill === 0
                        ? '#1f2937'
                        : `rgba(16,185,129,${0.12 + intensity * 0.88})`
                    }}
                  />
                )
              })}
            </div>
          ))}
        </div>
        <div className="flex items-center gap-3 mt-4 text-xs text-gray-500">
          <div className="flex items-center gap-1.5"><div className="w-4 h-4 rounded-sm bg-gray-800" /> No sessions</div>
          <div className="flex items-center gap-1.5"><div className="w-4 h-4 rounded-sm" style={{ background: 'rgba(16,185,129,0.2)' }} /> Low fill</div>
          <div className="flex items-center gap-1.5"><div className="w-4 h-4 rounded-sm" style={{ background: 'rgba(16,185,129,0.6)' }} /> Medium</div>
          <div className="flex items-center gap-1.5"><div className="w-4 h-4 rounded-sm bg-green-500" /> High fill</div>
        </div>
      </div>

      {/* Peak hours bar */}
      <div className="bg-gray-900 rounded-xl p-6 border border-gray-800">
        <h2 className="text-sm font-semibold text-gray-400 mb-4">Check-ins by Hour</h2>
        <ResponsiveContainer width="100%" height={180}>
          <BarChart
            data={HOURS.map(h => {
              const vals = DAYS.map((_, d) => heatmap[`${d}-${h}`]?.checkins ?? 0)
              return { hour: `${h}:00`, checkins: vals.reduce((a, b) => a + b, 0) }
            })}
          >
            <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" />
            <XAxis dataKey="hour" tick={{ fill: '#6b7280', fontSize: 11 }} />
            <YAxis tick={{ fill: '#6b7280', fontSize: 11 }} />
            <Tooltip
              contentStyle={{ background: '#111827', border: '1px solid #374151', borderRadius: 8 }}
              formatter={v => [v, 'Total check-ins']}
            />
            <Bar dataKey="checkins" fill="#10B981" radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}

function KpiCard({ label, value, color, icon, sub }) {
  const colors = {
    green:  'border-green-500/20  bg-green-500/5  text-green-400',
    blue:   'border-blue-500/20   bg-blue-500/5   text-blue-400',
    yellow: 'border-yellow-500/20 bg-yellow-500/5 text-yellow-400',
    red:    'border-red-500/20    bg-red-500/5    text-red-400',
    brand:  'border-brand/20      bg-brand/5      text-brand',
  }
  const [border, bg, text] = (colors[color] || colors.brand).split(' ')
  return (
    <div className={`rounded-xl border ${border} ${bg} p-5`}>
      <div className="flex items-center justify-between mb-3">
        <span className="text-gray-400 text-sm font-medium">{label}</span>
        <span className="text-xl">{icon}</span>
      </div>
      <div className={`text-3xl font-black ${text}`}>{value ?? '—'}</div>
      {sub && <div className="text-gray-500 text-xs mt-1">{sub}</div>}
    </div>
  )
}

function Skeleton() {
  return (
    <div className="space-y-6 animate-pulse">
      <div className="h-8 w-48 bg-gray-800 rounded" />
      <div className="grid grid-cols-4 gap-4">{[...Array(4)].map((_, i) => <div key={i} className="h-28 bg-gray-800 rounded-xl" />)}</div>
      <div className="h-56 bg-gray-800 rounded-xl" />
      <div className="grid grid-cols-2 gap-6"><div className="h-64 bg-gray-800 rounded-xl" /><div className="h-64 bg-gray-800 rounded-xl" /></div>
      <div className="h-48 bg-gray-800 rounded-xl" />
    </div>
  )
}
