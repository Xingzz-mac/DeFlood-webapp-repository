import type { ReactNode } from 'react'
import type { AppUser, Section } from '../App'
import { useCommunity } from '../context/CommunityContext'
import { useRisk } from '../context/RiskContext'
import {
  IconAlertTriangle,
  IconChevronRight,
  IconMap,
  IconTruck,
  IconUsers,
} from './Icons'

interface DashboardProps {
  user: AppUser
  onNavigate: (section: Section) => void
}

export default function Dashboard({ user: _user, onNavigate }: DashboardProps) {
  const { community } = useCommunity()
  const risk = useRisk()
  const vulnerable = community.children + community.elderly + community.disabled + community.otherVulnerable
  const shelterPct = community.population > 0
    ? Math.round((community.shelterCapacity / community.population) * 100)
    : 0
  const hazardLabel = risk.calculationStatus === 'COMPLETE'
    ? risk.hazardLevel
    : risk.calculationStatus
  const hazardColor = risk.hazardLevel === 'HIGH'
    ? 'text-red-700'
    : risk.hazardLevel === 'MEDIUM'
      ? 'text-amber-700'
      : risk.hazardLevel === 'LOW'
        ? 'text-green-700'
        : 'text-gray-700'
  const lastUpdate = risk.lastMeaningfulDataUpdate
    ? new Date(risk.lastMeaningfulDataUpdate).toLocaleString()
    : 'Unavailable'

  return (
    <div className="mx-auto max-w-5xl p-4 md:p-6">
      <div className="mb-5">
        <h1 className="text-xl font-bold text-gray-900 md:text-2xl">{community.name}</h1>
        <p className="mt-1 text-xs text-gray-500">
          Saved coordinates: {community.latitude.toFixed(4)}, {community.longitude.toFixed(4)} ({community.locationSource})
        </p>
      </div>

      <div className="mb-4 grid gap-4 md:grid-cols-2">
        <div className="rounded-2xl border border-blue-200 bg-blue-50 p-5">
          <div className="flex items-start gap-3">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-blue-100 text-blue-700">
              <IconAlertTriangle size={20} />
            </div>
            <div className="min-w-0">
              <div className="text-xs font-semibold uppercase tracking-wide text-blue-700">Flood Hazard</div>
              <div className={`mt-1 text-2xl font-bold ${hazardColor}`}>
                {risk.loading && risk.calculationStatus === 'NOT_CALCULATED' ? 'Calculating…' : hazardLabel}
              </div>
              <p className="mt-1 text-sm text-gray-600">
                {risk.hazardScore === null
                  ? 'Core rainfall and historical river evidence are required; missing evidence is never classified LOW.'
                  : `Deterministic prototype hazard score: ${risk.hazardScore.toFixed(1)} / 100.`}
              </p>
            </div>
          </div>
        </div>
        <div className="rounded-2xl border border-gray-200 bg-white p-5">
          <div className="text-xs font-semibold uppercase tracking-wide text-gray-500">Data Confidence</div>
          <div className="mt-1 text-2xl font-bold text-gray-900">
            {risk.calculationStatus === 'NOT_CALCULATED' ? 'Unavailable' : `${risk.confidenceScore.toFixed(1)} / 100`}
          </div>
          <p className="mt-1 text-sm text-gray-600">
            Confidence describes evidence completeness, consistency, and freshness. It is not flood probability.
          </p>
          <p className="mt-2 text-xs text-gray-400">Last meaningful data update: {lastUpdate}</p>
        </div>
      </div>

      {(risk.stale || risk.degraded || risk.error) && (
        <div className="mb-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          {risk.stale ? 'Cached source data is contributing to this result. ' : ''}
          {risk.degraded ? 'At least one evidence or consistency component is degraded or unavailable. ' : ''}
          {risk.error ?? ''}
        </div>
      )}

      <div className="mb-4 rounded-2xl border border-gray-200 bg-white p-5">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-sm font-semibold text-gray-900">Key contributing factors</h2>
          <button
            onClick={() => onNavigate('risk')}
            className="inline-flex items-center gap-1 text-sm font-semibold text-blue-700 hover:underline"
          >
            Full assessment <IconChevronRight size={14} />
          </button>
        </div>
        <ul className="mt-3 space-y-2 text-sm text-gray-600">
          {risk.contributingFactors.map(factor => (
            <li key={factor} className="flex gap-2">
              <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-blue-600" />
              <span>{factor}</span>
            </li>
          ))}
        </ul>
      </div>

      <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatCard
          icon={<IconUsers size={18} />}
          label="Saved Population"
          value={community.population.toLocaleString()}
          sub={`${vulnerable.toLocaleString()} saved as vulnerable residents`}
        />
        <StatCard
          icon={<IconTruck size={18} />}
          label="Shelter Capacity"
          value={community.shelterCapacity.toLocaleString()}
          sub={`${shelterPct}% of saved population`}
        />
        <StatCard
          icon={<IconUsers size={18} />}
          label="Available Volunteers"
          value={community.volunteers.toLocaleString()}
          sub="Community-entered resource count"
        />
        <StatCard
          icon={<IconMap size={18} />}
          label="Available Boats"
          value={community.boats.toLocaleString()}
          sub="Community-entered resource count"
        />
      </div>

      <div className="rounded-2xl border border-gray-200 bg-white p-5">
        <h2 className="text-sm font-semibold text-gray-900">Prototype tools</h2>
        <p className="mt-1 text-sm text-gray-500">
          Evacuation and support screens are interface prototypes and are not driven by a risk engine.
        </p>
        <div className="mt-4 flex flex-wrap gap-3">
          <button
            onClick={() => onNavigate('evacuation')}
            className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50"
          >
            Open Evacuation Prototype
          </button>
          <button
            onClick={() => onNavigate('support')}
            className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50"
          >
            Open Support Prototype
          </button>
        </div>
      </div>
    </div>
  )
}

function StatCard({ icon, label, value, sub }: {
  icon: ReactNode
  label: string
  value: string
  sub: string
}) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4">
      <div className="mb-2 text-blue-700">{icon}</div>
      <div className="mb-0.5 text-xs leading-tight text-gray-500">{label}</div>
      <div className="font-mono text-lg font-bold leading-tight text-gray-900">{value}</div>
      <div className="mt-0.5 text-xs leading-tight text-gray-400">{sub}</div>
    </div>
  )
}
