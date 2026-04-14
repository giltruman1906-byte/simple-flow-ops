import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'

const TIER_CONFIG = {
  healthy:  { label: 'Healthy',  bg: 'bg-green-500/10',  border: 'border-green-500/20',  text: 'text-green-400',  badge: 'bg-green-500/20 text-green-300' },
  at_risk:  { label: 'At Risk',  bg: 'bg-yellow-500/10', border: 'border-yellow-500/20', text: 'text-yellow-400', badge: 'bg-yellow-500/20 text-yellow-300' },
  critical: { label: 'Critical', bg: 'bg-red-500/10',    border: 'border-red-500/20',    text: 'text-red-400',    badge: 'bg-red-500/20 text-red-300' },
}

// ── Score factors (single source of truth — mirrors the dbt formula) ──────
const SCORE_FACTORS = [
  {
    label: 'Utilization',
    max: 40,
    color: 'text-blue-400',
    bar: 'bg-blue-500',
    description: 'Check-ins last 30 days ÷ plan monthly capacity × 40',
    detail: 'Relative to your plan — a 5-cap member attending 4× scores 80%, same as a 16-cap member attending 13×. Unlimited plan benchmark = 28 visits/month (7×/week).',
  },
  {
    label: 'Payment',
    max: 30,
    color: 'text-green-400',
    bar: 'bg-green-500',
    description: 'No outstanding debt = 30pts · Any overdue = 0pts',
    detail: 'Full score requires zero overdue payments. One missed payment drops this component to 0 immediately.',
  },
  {
    label: 'Membership Validity',
    max: 20,
    color: 'text-yellow-400',
    bar: 'bg-yellow-500',
    description: 'Active + >14 days left = 20pts · Active expiring = 8pts · Expired = 0pts',
    detail: 'Members with fewer than 14 days remaining on their plan get a partial score as a renewal warning signal.',
  },
  {
    label: 'Tenure',
    max: 10,
    color: 'text-purple-400',
    bar: 'bg-purple-500',
    description: 'Days as member ÷ 180 × 10 (capped at 10)',
    detail: 'Loyalty bonus — a member reaching 6 months earns full points. New members start at 0 and build gradually.',
  },
]

const TIERS = [
  { key: 'healthy',  range: '70 – 100', color: 'text-green-400',  dot: 'bg-green-400',  desc: 'Engaged, paying, active. No action needed.' },
  { key: 'at_risk',  range: '35 – 69',  color: 'text-yellow-400', dot: 'bg-yellow-400', desc: 'One or more factors are weak. Worth a check-in.' },
  { key: 'critical', range: '0 – 34',   color: 'text-red-400',    dot: 'bg-red-400',    desc: 'Multiple red flags. Immediate outreach recommended.' },
]

const ALERTS = [
  { icon: '🚫', label: 'Inactive',         desc: 'No check-in for 14+ days. Strongest early churn signal.' },
  { icon: '💸', label: 'Payment overdue',  desc: 'At least one outstanding payment on the account.' },
  { icon: '⏰', label: 'Expiring soon',    desc: 'Membership ends within 14 days — renewal window.' },
]

function Glossary() {
  const [open, setOpen] = useState(false)
  return (
    <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
      <button
        onClick={() => setOpen(v => !v)}
        className="w-full flex items-center justify-between px-5 py-4 text-left hover:bg-gray-800/50 transition-colors"
      >
        <div className="flex items-center gap-2">
          <span className="text-base">ℹ️</span>
          <span className="text-sm font-semibold text-gray-300">How is the health score calculated?</span>
        </div>
        <span className="text-gray-500 text-xs">{open ? '▲ hide' : '▼ show'}</span>
      </button>

      {open && (
        <div className="px-5 pb-6 space-y-6 border-t border-gray-800">

          {/* Score factors */}
          <div className="pt-4">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">Score factors (100 pts total)</p>
            <div className="space-y-3">
              {SCORE_FACTORS.map(f => (
                <div key={f.label}>
                  <div className="flex items-center justify-between mb-1">
                    <span className={`text-sm font-semibold ${f.color}`}>{f.label}</span>
                    <span className="text-xs text-gray-500">{f.max} pts</span>
                  </div>
                  {/* Weight bar */}
                  <div className="h-1.5 bg-gray-800 rounded-full mb-1.5">
                    <div className={`h-full rounded-full ${f.bar}`} style={{ width: `${f.max}%` }} />
                  </div>
                  <p className="text-xs text-gray-400">{f.description}</p>
                  <p className="text-xs text-gray-600 mt-0.5">{f.detail}</p>
                </div>
              ))}
            </div>
          </div>

          {/* Tiers */}
          <div>
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">Health tiers</p>
            <div className="space-y-2">
              {TIERS.map(t => (
                <div key={t.key} className="flex items-start gap-3">
                  <div className={`w-2.5 h-2.5 rounded-full mt-0.5 shrink-0 ${t.dot}`} />
                  <div>
                    <span className={`text-sm font-semibold ${t.color}`}>{t.key.charAt(0).toUpperCase() + t.key.slice(1).replace('_',' ')}</span>
                    <span className="text-gray-600 text-xs ml-2">{t.range}</span>
                    <p className="text-xs text-gray-500">{t.desc}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Alerts */}
          <div>
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">Alert badges</p>
            <div className="space-y-2">
              {ALERTS.map(a => (
                <div key={a.label} className="flex items-start gap-2">
                  <span className="text-base leading-none">{a.icon}</span>
                  <div>
                    <span className="text-xs font-semibold text-gray-300">{a.label}</span>
                    <p className="text-xs text-gray-500">{a.desc}</p>
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

      <Glossary />

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
              <div className="mt-3 pt-3 border-t border-white/5 grid grid-cols-4 gap-3 text-xs text-gray-500">
                <div>
                  Check-ins (30d):
                  <span className="text-gray-300 font-medium ml-1">{m.checkins_last_30d} / {m.plan_monthly_capacity}</span>
                </div>
                <div>
                  Utilization:
                  <span className={`font-medium ml-1 ${
                    m.utilization_pct >= 75 ? 'text-green-400' :
                    m.utilization_pct >= 40 ? 'text-yellow-400' : 'text-red-400'
                  }`}>{m.utilization_pct ?? 0}%</span>
                </div>
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
