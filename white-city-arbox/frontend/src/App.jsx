import { Routes, Route, Navigate } from 'react-router-dom'
import Dashboard from './Dashboard'

export default function App() {
  return (
    <Routes>
      <Route path="/dashboard/:token" element={<Dashboard />} />
      <Route path="*" element={<AccessDenied />} />
    </Routes>
  )
}

function AccessDenied() {
  return (
    <div className="min-h-screen bg-gray-950 flex items-center justify-center">
      <div className="text-center">
        <div className="text-6xl font-black text-brand mb-4">403</div>
        <div className="text-xl text-gray-400">Access Denied</div>
        <div className="text-sm text-gray-600 mt-2">Invalid or missing dashboard token</div>
      </div>
    </div>
  )
}
