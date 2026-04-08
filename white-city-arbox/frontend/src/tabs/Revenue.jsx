import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import KpiCard from '../components/KpiCard'
import {
  LineChart, Line, BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid
} from 'recharts'

const fmt = (n) => n != null ? `₪${Number(n).toLocaleString()}` : '—'

export default function Revenue({ boxId }) {
  const [summary, setSummary] = useState(null)
  const [weekly, setWeekly]   = useState([])
  const [monthly, setMonthly] = useState([])
  const [byPlan, setByPlan]   = useState([])
  const [overdue, setOverdue] = useState([])
  const [granularity, setGranularity] = useState('weekly')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function load() {
      const { data } = await supabase
        .from('mart_monetization')
        .select('*')
        .eq('box_id', boxId)

      if (data) {
        setSummary(data.find(r => r.record_type === 'summary'))

        const toChartRow = (r, fmt) => ({
          label:   new Date(r.period_start).toLocaleDateString('en-GB', fmt),
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
        setByPlan(data.filter(r => r.record_type === 'by_plan').map(r => ({
          name: r.plan_type, value: Number(r.plan_revenue), members: r.plan_member_count
        })))
        setOverdue(data.filter(r => r.record_type === 'overdue_members'))
      }
      setLoading(false)
    }
    load()
  }, [boxId])

  if (loading) return <Skeleton />

  const COLORS = ['#E84A27','#3B82F6','#10B981','#F59E0B']

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-black text-white">Revenue</h1>
        <p className="text-gray-500 text-sm mt-1">Monthly recurring revenue &amp; payment health</p>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard label="MRR"              value={fmt(summary?.mrr)}                  color="brand" icon="💰" />
        <KpiCard label="Collected"        value={fmt(summary?.collected_this_month)} color="green" icon="✅" sub="this month" />
        <KpiCard label="Pending"          value={fmt(summary?.pending_this_month)}   color="yellow" icon="⏳" />
        <KpiCard label="Overdue"          value={fmt(summary?.overdue_total)}        color="red"   icon="🚨"
          sub={`${summary?.overdue_members_count ?? 0} members`} />
      </div>

      {/* Charts row */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Revenue trend — weekly / monthly toggle */}
        <div className="lg:col-span-2 bg-gray-900 rounded-xl p-6 border border-gray-800">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-semibold text-gray-400">
              Revenue — {granularity === 'weekly' ? '12 Weeks' : '12 Months'}
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
          <ResponsiveContainer width="100%" height={220}>
            <LineChart data={granularity === 'weekly' ? weekly : monthly}>
              <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" />
              <XAxis dataKey="label" tick={{ fill:'#6b7280', fontSize:11 }} />
              <YAxis tick={{ fill:'#6b7280', fontSize:11 }} tickFormatter={v => `₪${v/1000}k`} />
              <Tooltip
                contentStyle={{ background:'#111827', border:'1px solid #374151', borderRadius:8 }}
                formatter={v => [fmt(v), 'Revenue']}
              />
              <Line type="monotone" dataKey="revenue" stroke="#E84A27" strokeWidth={2} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>

        {/* By plan donut */}
        <div className="bg-gray-900 rounded-xl p-6 border border-gray-800">
          <h2 className="text-sm font-semibold text-gray-400 mb-4">Revenue by Plan</h2>
          <ResponsiveContainer width="100%" height={160}>
            <PieChart>
              <Pie data={byPlan} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={45} outerRadius={70}>
                {byPlan.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
              </Pie>
              <Tooltip
                contentStyle={{ background:'#111827', border:'1px solid #374151', borderRadius:8 }}
                formatter={(v, n) => [fmt(v), n]}
              />
            </PieChart>
          </ResponsiveContainer>
          <div className="space-y-1 mt-2">
            {byPlan.map((p, i) => (
              <div key={i} className="flex items-center justify-between text-xs">
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full" style={{ background: COLORS[i % COLORS.length] }} />
                  <span className="text-gray-400">{p.name}</span>
                </div>
                <span className="text-gray-300">{p.members} members</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Overdue table */}
      {overdue.length > 0 && (
        <div className="bg-gray-900 rounded-xl border border-gray-800 overflow-hidden">
          <div className="p-5 border-b border-gray-800">
            <h2 className="text-sm font-semibold text-red-400">🚨 Overdue Members</h2>
          </div>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-800">
                {['Name','Email','Phone','Amount','Since'].map(h => (
                  <th key={h} className="text-left py-3 px-5 text-gray-500 font-medium text-xs">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {overdue.map((m, i) => (
                <tr key={i} className="border-b border-gray-800/50 hover:bg-gray-800/30">
                  <td className="py-3 px-5 text-white font-medium">{m.member_name}</td>
                  <td className="py-3 px-5 text-gray-400">{m.member_email}</td>
                  <td className="py-3 px-5 text-gray-400">{m.member_phone}</td>
                  <td className="py-3 px-5 text-red-400 font-bold">{fmt(m.overdue_amount)}</td>
                  <td className="py-3 px-5 text-gray-500">{m.overdue_since}</td>
                </tr>
              ))}
            </tbody>
          </table>
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
