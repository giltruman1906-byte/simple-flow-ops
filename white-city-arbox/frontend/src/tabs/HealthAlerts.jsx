import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'

const TIER_CONFIG = {
  healthy:  { label: 'Healthy',  bg: 'bg-green-500/10',  border: 'border-green-500/20',  text: 'text-green-400',  badge: 'bg-green-500/20 text-green-300' },
  at_risk:  { label: 'At Risk',  bg: 'bg-yellow-500/10', border: 'border-yellow-500/20', text: 'text-yellow-400', badge: 'bg-yellow-500/20 text-yellow-300' },
  critical: { label: 'Critical', bg: 'bg-red-500/10',    border: 'border-red-500/20',    text: 'text-red-400',    badge: 'bg-red-500/20 text-red-300' },
}

export default function HealthAlerts({ boxId }) {
  const [members, setMembers] = useState([])
  const [filter, setFilter]   = useState('all')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    supabase.from('mart_health_scores').select('*').eq('box_id', boxId).order('health_score')
      .then(({ data }) => { setMembers(data || []); setLoading(false) })
  }, [boxId])

  if (loading) return <Skeleton />

  const filtered = filter === 'all' ? members : members.filter(m => m.health_tier === filter)
  const counts = {
    all:      members.length,
    critical: members.filter(m => m.health_tier === 'critical').length,
    at_risk:  members.filter(m => m.health_tier === 'at_risk').length,
    healthy:  members.filter(m => m.health_tier === 'healthy').length,
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-black text-white">Health Alerts</h1>
        <p className="text-gray-500 text-sm mt-1">Member health scores — who needs attention</p>
      </div>

      {/* Filter tabs */}
      <div className="flex gap-2 flex-wrap">
        {[
          { key: 'all',      label: `All (${counts.all})`,            style: 'bg-gray-800 text-white' },
          { key: 'critical', label: `🔴 Critical (${counts.critical})`, style: 'bg-red-500/20 text-red-300' },
          { key: 'at_risk',  label: `🟡 At Risk (${counts.at_risk})`,   style: 'bg-yellow-500/20 text-yellow-300' },
          { key: 'healthy',  label: `🟢 Healthy (${counts.healthy})`,   style: 'bg-green-500/20 text-green-300' },
        ].map(f => (
          <button
            key={f.key}
            onClick={() => setFilter(f.key)}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
              filter === f.key ? f.style + ' ring-2 ring-white/20' : 'bg-gray-800/50 text-gray-400 hover:text-white'
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {/* Member cards */}
      <div className="space-y-3">
        {filtered.map((m, i) => {
          const tier = TIER_CONFIG[m.health_tier] || TIER_CONFIG.healthy
          return (
            <div key={i} className={`rounded-xl border p-4 ${tier.bg} ${tier.border}`}>
              <div className="flex items-center justify-between flex-wrap gap-3">
                <div className="flex items-center gap-4">
                  {/* Score circle */}
                  <div className={`w-12 h-12 rounded-full flex items-center justify-center text-lg font-black border-2 ${tier.border} ${tier.text}`}>
                    {m.health_score}
                  </div>
                  <div>
                    <div className="text-white font-semibold">{m.name}</div>
                    <div className="text-gray-400 text-xs">{m.plan_type} · {m.tenure_days}d tenure</div>
                  </div>
                </div>

                {/* Alert badges */}
                <div className="flex items-center gap-2 flex-wrap">
                  {m.alert_inactive && (
                    <span className="px-2 py-1 rounded-full text-xs bg-red-500/20 text-red-300">
                      🚫 {m.days_since_last_checkin}d no check-in
                    </span>
                  )}
                  {m.alert_overdue && (
                    <span className="px-2 py-1 rounded-full text-xs bg-orange-500/20 text-orange-300">
                      💸 Payment overdue
                    </span>
                  )}
                  {m.alert_expiring && (
                    <span className="px-2 py-1 rounded-full text-xs bg-yellow-500/20 text-yellow-300">
                      ⏰ Expires in {m.days_until_expiry}d
                    </span>
                  )}
                  {!m.alert_inactive && !m.alert_overdue && !m.alert_expiring && (
                    <span className="px-2 py-1 rounded-full text-xs bg-green-500/20 text-green-300">✅ All good</span>
                  )}
                </div>

                {/* Actions */}
                <div className="flex gap-2">
                  <button
                    onClick={() => navigator.clipboard.writeText(m.email || '')}
                    className="px-3 py-1.5 rounded-lg bg-gray-700 hover:bg-gray-600 text-xs text-gray-300 transition-colors"
                    title="Copy email"
                  >
                    📋 Email
                  </button>
                  {m.phone && (
                    <a
                      href={`https://wa.me/972${m.phone?.replace(/^0/, '').replace(/[-\s]/g, '')}`}
                      target="_blank"
                      rel="noreferrer"
                      className="px-3 py-1.5 rounded-lg bg-green-700/50 hover:bg-green-600/50 text-xs text-green-300 transition-colors"
                    >
                      💬 WhatsApp
                    </a>
                  )}
                </div>
              </div>

              {/* Stats row */}
              <div className="mt-3 pt-3 border-t border-white/5 grid grid-cols-3 gap-3 text-xs text-gray-500">
                <div>Check-ins (30d): <span className="text-gray-300 font-medium">{m.checkins_last_30d}</span></div>
                <div>Last seen: <span className="text-gray-300 font-medium">{m.last_checkin_date ?? 'Never'}</span></div>
                <div>Payment: <span className={m.has_overdue ? 'text-red-400 font-medium' : 'text-green-400 font-medium'}>
                  {m.has_overdue ? 'Overdue' : 'Clear'}
                </span></div>
              </div>
            </div>
          )
        })}
      </div>

      {filtered.length === 0 && (
        <div className="text-center py-16 text-gray-600">No members in this category</div>
      )}
    </div>
  )
}

function Skeleton() {
  return (
    <div className="space-y-4 animate-pulse">
      <div className="h-8 w-48 bg-gray-800 rounded" />
      <div className="flex gap-2">{[...Array(4)].map((_, i) => <div key={i} className="h-9 w-28 bg-gray-800 rounded-lg" />)}</div>
      {[...Array(5)].map((_, i) => <div key={i} className="h-24 bg-gray-800 rounded-xl" />)}
    </div>
  )
}
