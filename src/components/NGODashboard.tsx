import { useState } from 'react'
import type { AppUser, Section } from '../App'
import RiskBadge from './RiskBadge'
import { IconFilter, IconUsers, IconClock } from './Icons'

interface NGODashboardProps {
  user: AppUser
  onNavigate: (s: Section) => void
}

interface CommunityRow {
  id: string
  name: string
  risk: 'LOW' | 'MEDIUM' | 'HIGH'
  population: number
  vulnerable: number
  assistance: string
  requestTime: string
  status: 'Pending' | 'Accepted' | 'In Progress' | 'Resolved'
}

const communities: CommunityRow[] = [
  { id: 'c1', name: 'Ayeyarwady Delta Zone 3', risk: 'HIGH', population: 2340, vulnerable: 420, assistance: 'Rescue boats, food, medicine', requestTime: '13:45', status: 'Pending' },
  { id: 'c2', name: 'Bogale Township', risk: 'HIGH', population: 4120, vulnerable: 780, assistance: 'Emergency shelter, clean water', requestTime: '12:10', status: 'In Progress' },
  { id: 'c3', name: 'Dedaye Township', risk: 'MEDIUM', population: 3100, vulnerable: 520, assistance: 'Food supplies', requestTime: '10:05', status: 'Accepted' },
  { id: 'c4', name: 'Mawlamyinegyun', risk: 'MEDIUM', population: 1870, vulnerable: 290, assistance: 'Monitoring only', requestTime: '09:30', status: 'Accepted' },
  { id: 'c5', name: 'Pyapon District', risk: 'LOW', population: 5400, vulnerable: 870, assistance: 'None', requestTime: '—', status: 'Resolved' },
  { id: 'c6', name: 'Wakema', risk: 'LOW', population: 2800, vulnerable: 410, assistance: 'None', requestTime: '—', status: 'Resolved' },
]

type FilterType = 'all' | 'high' | 'pending' | 'inprogress'

export default function NGODashboard({ user }: NGODashboardProps) {
  const [filter, setFilter] = useState<FilterType>('all')
  const [selected, setSelected] = useState<CommunityRow | null>(communities[0])
  const [localData, setLocalData] = useState<CommunityRow[]>(communities)

  const filtered = localData.filter(c => {
    if (filter === 'high') return c.risk === 'HIGH'
    if (filter === 'pending') return c.status === 'Pending'
    if (filter === 'inprogress') return c.status === 'In Progress'
    return true
  })

  const updateStatus = (id: string, status: CommunityRow['status']) => {
    setLocalData(d => d.map(c => c.id === id ? { ...c, status } : c))
    setSelected(s => s?.id === id ? { ...s, status } : s)
  }

  const highCount = localData.filter(c => c.risk === 'HIGH').length
  const pendingCount = localData.filter(c => c.status === 'Pending').length
  const inProgressCount = localData.filter(c => c.status === 'In Progress').length

  return (
    <div className="p-4 md:p-6 max-w-6xl mx-auto">
      <div className="mb-5">
        <h1 className="text-xl md:text-2xl font-bold text-gray-900">Command Overview</h1>
        <p className="text-gray-500 text-sm mt-0.5">
          {user.role === 'government' ? 'Government Disaster Response' : 'NGO Coordinator'} — Ayeyarwady Region
        </p>
      </div>

      {/* Summary stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-5">
        <SummaryStat label="Communities" value={localData.length} color="gray" />
        <SummaryStat label="High Risk" value={highCount} color="red" />
        <SummaryStat label="Pending Requests" value={pendingCount} color="orange" />
        <SummaryStat label="In Progress" value={inProgressCount} color="blue" />
      </div>

      <div className="grid md:grid-cols-3 gap-5">
        {/* Community list */}
        <div className="md:col-span-2">
          <div className="flex items-center gap-2 mb-3 flex-wrap">
            <IconFilter size={13} className="text-gray-400" />
            {([
              { id: 'all' as FilterType, label: 'All' },
              { id: 'high' as FilterType, label: 'Highest Risk' },
              { id: 'pending' as FilterType, label: 'Pending' },
              { id: 'inprogress' as FilterType, label: 'In Progress' },
            ]).map(f => (
              <button
                key={f.id}
                onClick={() => setFilter(f.id)}
                className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${filter === f.id ? 'bg-[#1e3a5f] text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}
              >
                {f.label}
              </button>
            ))}
          </div>

          <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden">
            <div className="divide-y divide-gray-100">
              {filtered.map(c => (
                <button
                  key={c.id}
                  onClick={() => setSelected(c)}
                  className={`w-full text-left px-5 py-4 transition-colors ${selected?.id === c.id ? 'bg-blue-50' : 'hover:bg-gray-50'}`}
                >
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <div className="font-semibold text-gray-900 text-sm">{c.name}</div>
                      <div className="text-xs text-gray-500 mt-0.5">
                        Pop: <strong>{c.population.toLocaleString()}</strong> · Vulnerable: <strong>{c.vulnerable.toLocaleString()}</strong>
                      </div>
                      <div className="text-xs text-gray-600 mt-1 truncate">{c.assistance}</div>
                    </div>
                    <div className="flex flex-col items-end gap-1.5 shrink-0">
                      <RiskBadge level={c.risk} size="sm" />
                      <StatusPill status={c.status} />
                    </div>
                  </div>
                  {c.requestTime !== '—' && (
                    <div className="flex items-center gap-1 text-xs text-gray-400 mt-2">
                      <IconClock size={11} />
                      Request at {c.requestTime}
                    </div>
                  )}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Detail / action panel */}
        <div>
          {selected ? (
            <div className="bg-white border border-gray-200 rounded-2xl p-5">
              <div className="flex items-start justify-between gap-2 mb-4">
                <h2 className="font-bold text-gray-900 text-sm leading-tight">{selected.name}</h2>
                <RiskBadge level={selected.risk} size="sm" />
              </div>

              <div className="space-y-2.5 text-sm mb-5">
                <DetailRow label="Population" value={selected.population.toLocaleString()} />
                <DetailRow label="Vulnerable" value={selected.vulnerable.toLocaleString()} />
                <DetailRow label="Needs" value={selected.assistance} />
                <DetailRow label="Request time" value={selected.requestTime} />
                <div className="flex justify-between items-center">
                  <span className="text-gray-500">Status</span>
                  <StatusPill status={selected.status} />
                </div>
              </div>

              <div className="space-y-2">
                {selected.status === 'Pending' && (
                  <>
                    <button
                      onClick={() => updateStatus(selected.id, 'Accepted')}
                      className="w-full bg-green-600 hover:bg-green-700 text-white font-semibold py-2.5 rounded-xl text-sm transition-colors"
                    >
                      Accept Request
                    </button>
                    <button className="w-full border border-gray-300 text-gray-700 font-medium py-2.5 rounded-xl text-sm hover:bg-gray-50 transition-colors">
                      Assign to Field Team
                    </button>
                  </>
                )}
                {selected.status === 'Accepted' && (
                  <button
                    onClick={() => updateStatus(selected.id, 'In Progress')}
                    className="w-full bg-blue-600 hover:bg-blue-700 text-white font-semibold py-2.5 rounded-xl text-sm transition-colors"
                  >
                    Mark In Progress
                  </button>
                )}
                {selected.status === 'In Progress' && (
                  <button
                    onClick={() => updateStatus(selected.id, 'Resolved')}
                    className="w-full bg-green-600 hover:bg-green-700 text-white font-semibold py-2.5 rounded-xl text-sm transition-colors"
                  >
                    Mark Resolved
                  </button>
                )}
                {selected.status === 'Resolved' && (
                  <div className="text-center text-sm text-green-700 font-semibold py-2">
                    Resolved
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div className="bg-gray-50 border-2 border-dashed border-gray-200 rounded-2xl p-8 text-center">
              <IconUsers size={32} className="mx-auto mb-2 text-gray-300" />
              <p className="text-sm text-gray-400">Select a community to view details and respond</p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function SummaryStat({ label, value, color }: { label: string; value: number; color: 'red' | 'orange' | 'blue' | 'gray' }) {
  const textColor = color === 'red' ? 'text-red-600' : color === 'orange' ? 'text-amber-600' : color === 'blue' ? 'text-blue-600' : 'text-gray-800'
  return (
    <div className="bg-white border border-gray-200 rounded-xl p-4">
      <div className="text-xs text-gray-500 mb-1">{label}</div>
      <div className={`text-2xl font-bold font-mono ${textColor}`}>{value}</div>
    </div>
  )
}

function StatusPill({ status }: { status: string }) {
  const style = status === 'Pending' ? 'bg-gray-100 text-gray-700'
    : status === 'Accepted' ? 'bg-blue-50 text-blue-700'
    : status === 'In Progress' ? 'bg-blue-100 text-blue-800'
    : 'bg-green-50 text-green-700'
  return <span className={`text-xs font-semibold px-2 py-0.5 rounded ${style}`}>{status}</span>
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-2">
      <span className="text-gray-500 shrink-0">{label}</span>
      <span className="font-medium text-gray-900 text-right">{value}</span>
    </div>
  )
}
