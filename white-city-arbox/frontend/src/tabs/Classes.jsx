import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import KpiCard from '../components/KpiCard'

const DAYS = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat']
const HOURS = [6,7,8,9,10,11,12,13,14,15,16,17,18,19,20]

export default function Classes({ boxId }) {
  const [data, setData]     = useState(null)
  const [heatmap, setHeatmap] = useState({})
  const [coaches, setCoaches] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    supabase.from('mart_classes').select('*').eq('box_id', boxId).single()
      .then(({ data }) => {
        if (data) {
          setData(data)
          // Build heatmap lookup
          const map = {}
          const raw = data.heatmap_data || []
          raw.forEach(r => { map[`${r.day}-${r.hour}`] = r.attendees })
          setHeatmap(map)
          // Coach summary
          const cs = data.coach_summary || []
          setCoaches([...cs].sort((a, b) => b.total_attendees - a.total_attendees))
        }
        setLoading(false)
      })
  }, [boxId])

  if (loading) return <Skeleton />

  const maxVal = Math.max(...Object.values(heatmap), 1)

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-black text-white">Classes &amp; Attendance</h1>
        <p className="text-gray-500 text-sm mt-1">Utilisation, coaches and peak times</p>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard label="Classes (30d)"     value={data?.total_classes}       color="brand" icon="📅" />
        <KpiCard label="Avg Attendance"    value={data?.avg_attendance}      color="blue"  icon="👥" />
        <KpiCard label="Avg Fill Rate"     value={`${data?.avg_fill_rate_pct ?? 0}%`} color="green" icon="📈" />
        <KpiCard label="Busiest Day"       value={data?.busiest_day?.trim()} color="yellow" icon="🔥" />
      </div>

      {/* Heatmap */}
      <div className="bg-gray-900 rounded-xl p-6 border border-gray-800 overflow-x-auto">
        <h2 className="text-sm font-semibold text-gray-400 mb-5">Attendance Heatmap — Day × Hour</h2>
        <div className="inline-block min-w-full">
          {/* Hour headers */}
          <div className="flex gap-1 ml-10 mb-1">
            {HOURS.map(h => (
              <div key={h} className="w-8 text-center text-xs text-gray-600">{h}</div>
            ))}
          </div>
          {DAYS.map((day, d) => (
            <div key={d} className="flex items-center gap-1 mb-1">
              <div className="w-9 text-xs text-gray-500 text-right pr-1">{day}</div>
              {HOURS.map(h => {
                const val = heatmap[`${d}-${h}`] || 0
                const intensity = val / maxVal
                return (
                  <div
                    key={h}
                    title={`${day} ${h}:00 — ${val} check-ins`}
                    className="w-8 h-7 rounded-sm transition-colors"
                    style={{
                      background: val === 0
                        ? '#1f2937'
                        : `rgba(232,74,39,${0.15 + intensity * 0.85})`
                    }}
                  />
                )
              })}
            </div>
          ))}
        </div>
        <div className="flex items-center gap-2 mt-4 text-xs text-gray-500">
          <div className="w-4 h-4 rounded-sm bg-gray-800" /> Low
          <div className="w-4 h-4 rounded-sm bg-brand/50 ml-2" /> Medium
          <div className="w-4 h-4 rounded-sm bg-brand ml-2" /> High
        </div>
      </div>

      {/* Coaches */}
      {coaches.length > 0 && (
        <div className="bg-gray-900 rounded-xl border border-gray-800 overflow-hidden">
          <div className="p-5 border-b border-gray-800">
            <h2 className="text-sm font-semibold text-gray-400">Coach Performance</h2>
          </div>
          <div className="divide-y divide-gray-800">
            {coaches.map((c, i) => (
              <div key={i} className="flex items-center justify-between px-5 py-3">
                <div className="flex items-center gap-3">
                  <div className="w-7 h-7 rounded-full bg-brand/20 text-brand text-xs font-bold flex items-center justify-center">
                    {i + 1}
                  </div>
                  <span className="text-white font-medium">{c.coach}</span>
                </div>
                <span className="text-gray-400 text-sm">{c.total_attendees} attendees</span>
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
      <div className="h-64 bg-gray-800 rounded-xl" />
    </div>
  )
}
