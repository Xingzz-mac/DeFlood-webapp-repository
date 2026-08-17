import type { ReactNode } from 'react'
import type { AppUser, Section } from '../App'
import { useCommunity } from '../context/CommunityContext'
import RiskBadge from './RiskBadge'
import {
  IconAlertTriangle, IconDroplets, IconWaves, IconCloud,
  IconMountain, IconUsers, IconTruck, IconPhone, IconClock,
  IconRefresh, IconChevronRight,
} from './Icons'

interface DashboardProps {
  user: AppUser
  onNavigate: (s: Section) => void
}

export default function Dashboard({ user: _user, onNavigate }: DashboardProps) {
  const { community } = useCommunity()
  const vulnerable = community.children + community.elderly + community.disabled + community.otherVulnerable
  const shelterPct = community.population > 0
    ? Math.round((community.shelterCapacity / community.population) * 100)
    : 0

  return (
    <div className="p-4 md:p-6 max-w-5xl mx-auto">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-3 mb-5">
        <div>
          <h1 className="text-xl md:text-2xl font-bold text-gray-900">{community.name}</h1>
          <div className="flex flex-wrap items-center gap-3 mt-1.5 text-xs text-gray-500">
            <span className="flex items-center gap-1">
              <IconClock size={12} />
              Updated: 14:32 today
            </span>
            <span className="text-gray-300">|</span>
            <span className="flex items-center gap-1">
              <IconRefresh size={12} />
              Next update: 17:00
            </span>
          </div>
        </div>
        <RiskBadge level="HIGH" size="lg" />
      </div>

      {/* HIGH RISK Card */}
      <div className="bg-red-600 text-white rounded-2xl p-5 md:p-6 mb-4">
        <div className="flex items-start gap-3 mb-4">
          <div className="w-9 h-9 bg-white/20 rounded-lg flex items-center justify-center shrink-0">
            <IconAlertTriangle size={20} />
          </div>
          <div>
            <div className="font-bold text-lg md:text-xl leading-tight mb-1">
              HIGH RISK — Immediate Action Required
            </div>
            <p className="text-red-100 text-sm leading-relaxed">
              Begin evacuation preparations now. Move vulnerable residents — elderly, children, and people with disabilities — first.
            </p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2.5">
          <button
            onClick={() => onNavigate('risk')}
            className="bg-white text-red-700 font-semibold px-4 py-2 rounded-lg text-sm hover:bg-red-50 transition-colors"
          >
            View Risk Details
          </button>
          <button
            onClick={() => onNavigate('evacuation')}
            className="bg-red-700 hover:bg-red-800 text-white font-semibold px-4 py-2 rounded-lg text-sm border border-red-400/50 transition-colors"
          >
            Prepare Evacuation
          </button>
          <button
            onClick={() => onNavigate('support')}
            className="bg-red-700 hover:bg-red-800 text-white font-semibold px-4 py-2 rounded-lg text-sm border border-red-400/50 transition-colors"
          >
            Request Assistance
          </button>
        </div>
      </div>

      {/* Confidence bar */}
      <div className="bg-amber-50 border border-amber-200 rounded-xl px-5 py-3 mb-4">
        <div className="flex flex-wrap items-center gap-4 text-sm">
          <div>
            <span className="text-gray-500">Confidence: </span>
            <span className="font-bold text-amber-700 font-mono">87%</span>
          </div>
          <div>
            <span className="text-gray-500">Based on: </span>
            <span className="font-medium text-gray-800">Rainfall, River Level, Forecast, Elevation</span>
          </div>
        </div>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
        <StatCard icon={<IconDroplets size={18} />} label="Rainfall (24h)" value="87 mm" sub="Heavy — warning threshold: 50mm" color="blue" />
        <StatCard icon={<IconWaves size={18} />} label="River Level" value="4.8 m" sub="Danger level: 5.0 m" color="red" />
        <StatCard icon={<IconCloud size={18} />} label="Forecast" value="Rain" sub="Heavy rain next 24–48h" color="gray" />
        <StatCard icon={<IconMountain size={18} />} label="Elevation" value="1.2 m" sub="Low-lying area" color="gray" />
        <StatCard icon={<IconUsers size={18} />} label="Population at Risk" value={community.population.toLocaleString()} sub={`${vulnerable.toLocaleString()} vulnerable residents`} color="orange" />
        <StatCard icon={<IconTruck size={18} />} label="Shelter Capacity" value={community.shelterCapacity.toLocaleString()} sub={`${shelterPct}% of total population`} color="amber" />
        <StatCard icon={<IconPhone size={18} />} label="Active Requests" value="3" sub="Pending response" color="red" />
        <StatCard icon={<IconClock size={18} />} label="Previous Floods" value="2021, 2022" sub="High impact both events" color="gray" />
      </div>

      {/* Active requests preview */}
      <div className="bg-white border border-gray-200 rounded-2xl p-5">
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-semibold text-gray-900 text-sm">Active Assistance Requests</h2>
          <button
            onClick={() => onNavigate('support')}
            className="text-xs text-blue-700 hover:underline flex items-center gap-1 font-medium"
          >
            View all <IconChevronRight size={13} />
          </button>
        </div>
        <div className="space-y-0">
          <RequestRow type="Rescue boats (5 units)" priority="HIGH" status="Pending" time="13:45" />
          <RequestRow type="Emergency food supplies" priority="HIGH" status="In Progress" time="12:10" />
          <RequestRow type="Medical support kits" priority="MEDIUM" status="Accepted" time="11:30" />
        </div>
      </div>
    </div>
  )
}

function StatCard({ icon, label, value, sub, color }: {
  icon: ReactNode
  label: string
  value: string
  sub: string
  color: 'blue' | 'red' | 'orange' | 'amber' | 'gray'
}) {
  const iconColor = {
    blue: 'text-blue-600',
    red: 'text-red-600',
    orange: 'text-orange-600',
    amber: 'text-amber-600',
    gray: 'text-gray-400',
  }[color]

  return (
    <div className="bg-white border border-gray-200 rounded-xl p-4">
      <div className={`mb-2 ${iconColor}`}>{icon}</div>
      <div className="text-xs text-gray-500 mb-0.5 leading-tight">{label}</div>
      <div className="text-lg font-bold text-gray-900 font-mono leading-tight">{value}</div>
      <div className="text-xs text-gray-400 mt-0.5 leading-tight">{sub}</div>
    </div>
  )
}

function RequestRow({ type, priority, status, time }: {
  type: string
  priority: 'HIGH' | 'MEDIUM' | 'LOW'
  status: string
  time: string
}) {
  const pColor = priority === 'HIGH'
    ? 'text-red-700 bg-red-50'
    : priority === 'MEDIUM'
    ? 'text-amber-700 bg-amber-50'
    : 'text-green-700 bg-green-50'

  const sColor = status === 'In Progress'
    ? 'text-blue-700 font-semibold'
    : status === 'Accepted'
    ? 'text-green-700'
    : 'text-gray-600'

  return (
    <div className="flex items-center justify-between py-2.5 border-b border-gray-100 last:border-0">
      <div className="flex items-center gap-2.5">
        <span className={`text-xs font-bold px-2 py-0.5 rounded shrink-0 ${pColor}`}>{priority}</span>
        <span className="text-sm text-gray-800">{type}</span>
      </div>
      <div className="flex items-center gap-3 text-sm shrink-0">
        <span className={sColor}>{status}</span>
        <span className="text-gray-400 text-xs font-mono">{time}</span>
      </div>
    </div>
  )
}
