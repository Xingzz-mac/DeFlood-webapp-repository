import { useState } from 'react'
import type { Role, Section } from '../App'
import { isCommunityRole } from '../services/rolePresentation'
import { alertCommunityId, loadGovernmentAlerts, type AlertCommunity } from '../services/governmentAlerts'

export default function CommunityAlerts({ role, community, onNavigate }: { role: Role; community: AlertCommunity; onNavigate: (section: Section) => void }) {
  const [alerts] = useState(loadGovernmentAlerts)
  if (!isCommunityRole(role)) return null
  return <div className="space-y-3">{alerts.filter(a => a.targets.some(t => t.id === alertCommunityId(community))).map(a => <article key={a.id} className={`mb-4 rounded-xl border-l-4 p-4 ${a.severity === 'Emergency' ? 'border-red-700 bg-red-50' : a.severity === 'Warning' ? 'border-amber-600 bg-amber-50' : 'border-blue-600 bg-blue-50'}`}><h2 className="font-bold">{a.type} · {a.severity}</h2><p className="text-xs text-gray-600">Government alert · {new Date(a.issuedAt).toLocaleString()}</p><p className="mt-2 whitespace-pre-wrap break-words text-sm">{a.message}</p><button type="button" className="mt-3 font-semibold text-blue-800" onClick={() => onNavigate('evacuation')}>View Evacuation Guidance</button></article>)}</div>
}
