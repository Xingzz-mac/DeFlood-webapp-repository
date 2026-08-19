import type { ReactNode } from 'react'
import type { Section } from '../App'
import { useCommunity } from '../context/CommunityContext'
import { useEnvironmentalData } from '../hooks/useEnvironmentalData'
import type {
  RiverData,
  SourceMetadata,
  SourceStatus,
  TerrainData,
  WeatherModelData,
} from '../services/types'
import {
  IconAlertTriangle,
  IconDroplets,
  IconMountain,
  IconRefresh,
  IconWaves,
} from './Icons'

interface RiskAssessmentProps {
  onNavigate: (section: Section) => void
}

function fmtNumber(value: number | null, unit: string, digits = 1): string {
  return value === null ? 'Unavailable' : `${value.toFixed(digits)} ${unit}`
}

function fmtTime(iso: string | null): string {
  if (!iso) return 'Unavailable'
  const date = new Date(iso)
  if (!Number.isFinite(date.getTime())) return 'Unavailable'
  return date.toLocaleString([], {
    hour: '2-digit',
    minute: '2-digit',
    day: 'numeric',
    month: 'short',
  })
}

function fmtAge(ageMs: number | null): string {
  if (ageMs === null) return 'Unavailable'
  if (ageMs < 60_000) return 'less than 1 minute'
  if (ageMs < 3_600_000) return `${Math.floor(ageMs / 60_000)} minutes`
  return `${(ageMs / 3_600_000).toFixed(1)} hours`
}

function statusBadge(status: SourceStatus): ReactNode {
  const styles: Record<SourceStatus, string> = {
    live: 'bg-green-50 text-green-700',
    cached: 'bg-blue-50 text-blue-700',
    incomplete: 'bg-amber-50 text-amber-700',
    unavailable: 'bg-gray-100 text-gray-600',
    error: 'bg-red-50 text-red-700',
  }
  return (
    <span className={`rounded-full px-2.5 py-1 text-xs font-semibold capitalize ${styles[status]}`}>
      {status}
    </span>
  )
}

function SourceHeader({
  icon,
  title,
  metadata,
}: {
  icon: ReactNode
  title: string
  metadata: SourceMetadata
}) {
  return (
    <div className="border-b border-gray-100 pb-3">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <span className="text-blue-700">{icon}</span>
          <div>
            <h3 className="text-sm font-semibold text-gray-900">{title}</h3>
            <p className="text-xs text-gray-400">
              Retrieved {fmtTime(metadata.retrievedAt)}
              {metadata.cached ? ` · source age ${fmtAge(metadata.ageMs)}` : ''}
            </p>
          </div>
        </div>
        {statusBadge(metadata.status)}
      </div>
      {metadata.refreshAttempt && (
        <p className="mt-2 text-xs text-amber-700">
          Latest refresh was {metadata.refreshAttempt.status} at {fmtTime(metadata.refreshAttempt.retrievedAt)}.
          The last usable cached source is retained.
        </p>
      )}
    </div>
  )
}

function WeatherCard({ model }: { model: WeatherModelData }) {
  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-5">
      <SourceHeader icon={<IconDroplets size={18} />} title={model.label} metadata={model.metadata} />
      <div className="mt-4 grid gap-3 sm:grid-cols-3">
        {model.horizons.map(horizon => (
          <div key={horizon.hours} className="rounded-xl bg-gray-50 p-3">
            <div className="text-xs font-medium text-gray-500">Next {horizon.hours} hours</div>
            <div className="mt-1 font-mono text-base font-bold text-gray-900">
              {fmtNumber(horizon.total, model.unit)}
            </div>
            <div className="mt-1 text-xs text-gray-500">
              {horizon.validHours}/{horizon.expectedHours} valid hours · {horizon.coverage.toFixed(1)}% coverage
            </div>
          </div>
        ))}
      </div>
      {model.metadata.error && (
        <p className="mt-3 text-xs text-amber-700">{model.metadata.error}</p>
      )}
      <p className="mt-3 text-xs text-gray-400">
        Last successful response: {fmtTime(model.metadata.lastSuccessfulAt)} · Model: {model.model}
      </p>
    </div>
  )
}

function RiverCard({ river }: { river: RiverData }) {
  const trend = river.trend === 'unavailable'
    ? 'Unavailable'
    : river.trend[0].toUpperCase() + river.trend.slice(1)
  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-5">
      <SourceHeader icon={<IconWaves size={18} />} title="GloFAS modeled river discharge" metadata={river.metadata} />
      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <div className="rounded-xl bg-gray-50 p-3">
          <div className="text-xs font-medium text-gray-500">Three-day discharge peak</div>
          <div className="mt-1 font-mono text-base font-bold text-gray-900">
            {fmtNumber(river.peakDischarge, river.unit, 2)}
          </div>
          <div className="mt-1 text-xs text-gray-500">Date: {river.peakDate ?? 'Unavailable'}</div>
        </div>
        <div className="rounded-xl bg-gray-50 p-3">
          <div className="text-xs font-medium text-gray-500">First-three-day trend</div>
          <div className="mt-1 text-base font-bold text-gray-900">{trend}</div>
          <div className="mt-1 text-xs text-gray-500">Modeled discharge, not river height</div>
        </div>
      </div>
      <p className="mt-3 text-xs text-gray-500">
        Primary near-term availability: {river.primaryValidDays}/3 valid river_discharge days.
      </p>
      <div className="mt-4 overflow-x-auto">
        <table className="min-w-full text-left text-xs">
          <thead className="text-gray-500">
            <tr>
              {['Date', 'Discharge', 'Mean', 'Median', 'Maximum', 'P25', 'P75'].map(label => (
                <th key={label} className="whitespace-nowrap px-2 py-2 font-medium">{label}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100 font-mono text-gray-700">
            {river.days.map(day => (
              <tr key={day.date}>
                <td className="whitespace-nowrap px-2 py-2 font-sans">{day.date}</td>
                {[day.discharge, day.mean, day.median, day.maximum, day.p25, day.p75].map((value, index) => (
                  <td key={index} className="whitespace-nowrap px-2 py-2">
                    {value === null ? '—' : value.toFixed(2)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {river.days.length === 0 && <p className="mt-4 text-sm text-gray-500">No dated forecast days are available.</p>}
      <div className="mt-3 rounded-xl bg-gray-50 p-3 text-xs text-gray-600">
        <div className="mb-1 font-semibold text-gray-700">Ensemble availability (does not determine primary usability)</div>
        {Object.entries(river.ensembleAvailability).map(([field, availability]) => (
          <span key={field} className="mr-3 inline-block">
            {field}: {availability.validDays}/{availability.expectedDays}
          </span>
        ))}
      </div>
      {river.metadata.error && <p className="mt-3 text-xs text-amber-700">{river.metadata.error}</p>}
      <p className="mt-3 text-xs text-gray-400">
        All table values are modeled discharge in {river.unit}. Last successful response: {fmtTime(river.metadata.lastSuccessfulAt)}
      </p>
    </div>
  )
}

function TerrainCard({ terrain }: { terrain: TerrainData }) {
  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-5">
      <SourceHeader icon={<IconMountain size={18} />} title="Terrain elevation" metadata={terrain.metadata} />
      <div className="mt-4 font-mono text-lg font-bold text-gray-900">
        {fmtNumber(terrain.elevation, terrain.unit)}
      </div>
      {terrain.metadata.error && <p className="mt-2 text-xs text-amber-700">{terrain.metadata.error}</p>}
      <p className="mt-2 text-xs text-gray-400">
        Last successful response: {fmtTime(terrain.metadata.lastSuccessfulAt)}
      </p>
    </div>
  )
}

export default function RiskAssessment({ onNavigate }: RiskAssessmentProps) {
  const { community } = useCommunity()
  const { data, loading, error, stale, refresh } = useEnvironmentalData(
    community.latitude,
    community.longitude,
  )
  const statusLabel = data?.status === 'live'
    ? 'All sources live'
    : data?.status === 'partial'
      ? 'Partial source data'
      : data?.status === 'error'
        ? 'Sources unavailable'
        : 'Loading source data'

  return (
    <div className="mx-auto max-w-4xl p-4 md:p-6">
      <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-gray-900 md:text-2xl">Environmental Source Data</h1>
          <p className="mt-0.5 text-sm text-gray-500">
            {community.name} · {community.latitude.toFixed(4)}, {community.longitude.toFixed(4)}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <span className="rounded-full bg-gray-100 px-2.5 py-1 text-xs font-medium text-gray-700">
            {statusLabel}
          </span>
          <button
            type="button"
            onClick={refresh}
            disabled={loading}
            className="flex items-center gap-1.5 text-xs font-semibold text-blue-700 disabled:opacity-50"
          >
            <IconRefresh size={13} className={loading ? 'animate-spin' : ''} /> Refresh
          </button>
        </div>
      </div>

      <div className="mb-5 rounded-r-xl border-l-4 border-blue-600 bg-blue-50 px-5 py-4">
        <div className="flex items-start gap-3">
          <IconAlertTriangle size={19} className="mt-0.5 shrink-0 text-blue-700" />
          <div>
            <div className="font-bold text-gray-900">Risk calculation not implemented yet.</div>
            <p className="mt-1 text-sm leading-relaxed text-gray-600">
              The values below are raw environmental source data. They are not a LOW, MEDIUM, or HIGH flood-risk assessment.
            </p>
          </div>
        </div>
      </div>

      {stale && (
        <div className="mb-5 rounded-xl border border-amber-200 bg-amber-50 px-5 py-3 text-sm text-amber-800">
          At least one source is showing last-successful cached data for these coordinates.
        </div>
      )}
      {error && !loading && (
        <div className="mb-5 rounded-xl border border-amber-200 bg-amber-50 px-5 py-3 text-sm text-amber-800">
          {error}
        </div>
      )}
      {loading && !data && (
        <div className="mb-5 flex items-center gap-3 rounded-xl border border-blue-200 bg-blue-50 px-5 py-4 text-sm font-medium text-blue-700">
          <IconRefresh size={17} className="animate-spin" /> Fetching current-coordinate source data…
        </div>
      )}

      {data && (
        <div className="space-y-4">
          <WeatherCard model={data.weatherModels.aifs} />
          <WeatherCard model={data.weatherModels.ifs} />
          <RiverCard river={data.river} />
          <TerrainCard terrain={data.terrain} />
        </div>
      )}

      <div className="mt-6 flex flex-wrap gap-3">
        <button
          onClick={() => onNavigate('evacuation')}
          className="rounded-xl bg-[#1e3a5f] px-5 py-2.5 text-sm font-semibold text-white hover:bg-[#2d5282]"
        >
          Open Evacuation Prototype
        </button>
        <button
          onClick={() => onNavigate('support')}
          className="rounded-xl border border-gray-300 px-5 py-2.5 text-sm font-semibold text-gray-700 hover:bg-gray-50"
        >
          Open Support Prototype
        </button>
      </div>
    </div>
  )
}
