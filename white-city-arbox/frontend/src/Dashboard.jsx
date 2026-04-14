import { useState, useEffect } from 'react'
import { useParams } from 'react-router-dom'
import { supabase } from './lib/supabase'
import Revenue from './tabs/Revenue'
import Members from './tabs/Members'
import Classes from './tabs/Classes'
import Leads from './tabs/Leads'
import HealthAlerts from './tabs/HealthAlerts'
import Freezes from './tabs/Freezes'

const TABS = [
  { id: 'revenue',  label: 'Revenue',       icon: '💰' },
  { id: 'members',  label: 'Members',        icon: '👥' },
  { id: 'freezes',  label: 'Freezes',        icon: '❄️' },
  { id: 'classes',  label: 'Classes',        icon: '🏋️' },
  { id: 'leads',    label: 'Sales Funnel',   icon: '📊' },
  { id: 'health',   label: 'Health Alerts',  icon: '🚨' },
]

export default function Dashboard() {
  const { token } = useParams()
  const [boxId, setBoxId] = useState(null)
  const [boxName, setBoxName] = useState('')
  const [activeTab, setActiveTab] = useState('revenue')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    async function resolveToken() {
      const { data, error } = await supabase
        .from('boxes')
        .select('id, name')
        .eq('access_token', token)
        .single()

      if (error || !data) {
        setError('Invalid token')
      } else {
        setBoxId(data.id)
        setBoxName(data.name)
      }
      setLoading(false)
    }
    resolveToken()
  }, [token])

  if (loading) return <Spinner />
  if (error) return <AccessDenied />

  return (
    <div className="flex h-screen bg-gray-950 overflow-hidden">
      {/* Sidebar */}
      <aside className="w-64 bg-gray-900 border-r border-gray-800 flex flex-col shrink-0">
        <div className="p-6 border-b border-gray-800">
          <div className="text-brand font-black text-lg tracking-tight">⚡ CrossFit</div>
          <div className="text-white font-bold text-sm mt-1 truncate">{boxName}</div>
          <div className="text-gray-500 text-xs mt-1">Business Dashboard</div>
        </div>

        <nav className="flex-1 p-4 space-y-1">
          {TABS.map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-medium transition-all ${
                activeTab === tab.id
                  ? 'bg-brand text-white shadow-lg shadow-brand/20'
                  : 'text-gray-400 hover:text-white hover:bg-gray-800'
              }`}
            >
              <span>{tab.icon}</span>
              <span>{tab.label}</span>
            </button>
          ))}
        </nav>

        <div className="p-4 border-t border-gray-800">
          <div className="text-xs text-gray-600 text-center">Powered by SimpleFlow</div>
        </div>
      </aside>

      {/* Main content */}
      <main className="flex-1 overflow-y-auto">
        <div className="p-8">
          {activeTab === 'revenue'  && <Revenue  boxId={boxId} />}
          {activeTab === 'members'  && <Members  boxId={boxId} />}
          {activeTab === 'freezes'  && <Freezes  boxId={boxId} />}
          {activeTab === 'classes'  && <Classes  boxId={boxId} />}
          {activeTab === 'leads'    && <Leads    boxId={boxId} />}
          {activeTab === 'health'   && <HealthAlerts boxId={boxId} />}
        </div>
      </main>
    </div>
  )
}

function Spinner() {
  return (
    <div className="min-h-screen bg-gray-950 flex items-center justify-center">
      <div className="w-10 h-10 border-4 border-brand border-t-transparent rounded-full animate-spin" />
    </div>
  )
}

function AccessDenied() {
  return (
    <div className="min-h-screen bg-gray-950 flex items-center justify-center">
      <div className="text-center">
        <div className="text-6xl font-black text-brand mb-4">403</div>
        <div className="text-xl text-gray-400">Access Denied</div>
      </div>
    </div>
  )
}
