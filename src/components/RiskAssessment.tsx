import type { ReactNode } from 'react'
import type { Section } from '../App'
import { useCommunity } from '../context/CommunityContext'
import { useEnvironmentalData } from '../hooks/useEnvironmentalData'
import type { EnvironmentalData, WeatherModelData, RiverData, TerrainData, SourceStatus } from '../services/types'
import RiskBadge from './RiskBadge'
import { IconDroplets, IconWaves, IconCloud, IconMountain, IconAlertTriangle, IconClock, IconRefresh } from './Icons'

interface RiskAssessmentProps {
  onNavigate: (s: Section) => void
}

function fmtMm(val: number | null): string {
  if (val === null) return '—'
  return val === 0 ? '0 mm' : `${val.toFixed(1)} mm`
}

function fmtDischarge(val: number | null): string {
  if (val === null) return '—'
  return `${val.toFixed(2)} m³/s`
}

function fmtElevation(val: number | null): string {
  if (val === null) return '—'
  return `${val.toFixed(1)} m`
}

function fmtTime(iso: string | null): string {
  if (!iso) return '—'
  try {
    return new Date(iso).toLocaleString([], {
      hour: '2-digit', minute: '2-digit', day: 'numeric', month: 'short',
    })
  } catch {
    return '—'
  }
}

function trendLabel(trend: string): string {
  if (trend === 'rising') return 'Rising'
  if (trend === 'falling') return 'Falling'
  return 'Stable'
}

function statusBadge(status: SourceStatus): ReactNode {
  if (status === 'ok') return null
  if (status === 'error') {
    return <span className="text-xs font-medium text-red-600 ml-2">Error</span>
  }
  if (status === 'demo') {
    return <span className="text-xs font-medium text-amber-600 ml-2">Demo</span>
  }
  return null
}

interface Factor {
  icon: ReactNode
  label: string
  value: string
  detail: string
  level: 'LOW' | 'MEDIUM' | 'HIGH'
  iconColor: string
  trailing?: ReactNode
}

function buildFactors(env: EnvironmentalData | null): Factor[] {
  const aifs: WeatherModelData | undefined = env?.weatherModels.aifs
  const ifs: WeatherModelData | undefined = env?.weatherModels.ifs
  const river: RiverData | undefined = env?.river
  const terrain: TerrainData | undefined = env?.terrain

  const aifs24 = aifs?.precipitation24h ?? null
  const aifs48 = aifs?.precipitation48h ?? null
  const ifs24 = ifs?.precipitation24h ?? null
  const ifs48 = ifs?.precipitation48h ?? null
  const riverDischarge = river?.discharge ?? null
  const riverTrend = river?.trend ?? 'stable'
  const elevation = terrain?.elevation ?? null

  return [
    {
      icon: <IconDroplets size={19} />,
      label: 'AIFS Forecast Rainfall',
      value: `${fmtMm(aifs24)} / ${fmtMm(aifs48)}`,
      detail: 'ECMWF AIFS — AI Forecast. 24h / 48h accumulated precipitation.',
      level: 'HIGH',
      iconColor: 'text-blue-600',
      trailing: aifs ? statusBadge(aifs.status) : null,
    },
    {
      icon: <IconDroplets size={19} />,
      label: 'IFS Forecast Rainfall',
      value: `${fmtMm(ifs24)} / ${fmtMm(ifs48)}`,
      detail: 'ECMWF IFS — Physics-Based Forecast. 24h / 48h accumulated precipitation.',
      level: 'HIGH',
      iconColor: 'text-blue-600',
      trailing: ifs ? statusBadge(ifs.status) : null,
    },
    {
      icon: <IconWaves size={19} />,
      label: 'GloFAS River Discharge',
      value: fmtDischarge(riverDischarge),
      detail: `River discharge from GloFAS v4. Trend: ${trendLabel(riverTrend)}.`,
      level: 'HIGH',
      iconColor: 'text-red-600',
      trailing: river ? statusBadge(river.status) : null,
    },
    {
      icon: <IconMountain size={19} />,
      label: 'Ground Elevation',
      value: fmtElevation(elevation),
      detail: 'Terrain elevation at community coordinates.',
      level: 'MEDIUM',
      iconColor: 'text-amber-600',
      trailing: terrain ? statusBadge(terrain.status) : null,
    },
    {
      icon: <IconCloud size={19} />,
      label: 'Weather System',
      value: 'Tropical Low',
      detail: 'Approaching from Bay of Bengal — landfall within 24–36 hours',
      level: 'HIGH',
      iconColor: 'text-gray-500',
    },
    {
      icon: <IconClock size={19} />,
      label: 'Previous Floods',
      value: '2021, 2022',
      detail: 'Both events caused significant displacement in this zone',
      level: 'MEDIUM',
      iconColor: 'text-amber-600',
    },
  ]
}

export default function RiskAssessment({ onNavigate }: RiskAssessmentProps) {
  const { community } = useCommunity()
  const { data, loading, error, refresh } = useEnvironmentalData(community.latitude, community.longitude)

  const factors = buildFactors(data)
  const lastUpdated = fmtTime(data?.lastUpdated ?? null)
  const statusLabel = data?.status === 'live' ? 'Live data'
    : data?.status === 'partial' ? 'Partial data'
    : data?.status === 'demo' ? 'Demo data'
    : data?.status === 'error' ? 'Data error'
    : 'Loading'

  return (
    <div className="p-4 md:p-6 max-w-4xl mx-auto">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3 mb-5">
        <div>
          <h1 className="text-xl md:text-2xl font-bold text-gray-900">Risk Assessment</h1>
          <p className="text-gray-500 text-sm mt-0.5">{community.name} — Updated {lastUpdated}</p>
        </div>
        <div className="flex items-center gap-3">
          <span className={`text-xs font-medium px-2.5 py-1 rounded-full ${
            data?.status === 'live' ? 'bg-green-50 text-green-700' :
            data?.status === 'partial' ? 'bg-amber-50 text-amber-700' :
            data?.status === 'demo' ? 'bg-amber-50 text-amber-700' :
            data?.status === 'error' ? 'bg-red-50 text-red-700' :
            'bg-gray-100 text-gray-500'
          }`}>{statusLabel}</span>
          <RiskBadge level="HIGH" size="lg" />
        </div>
      </div>

      {/* Plain-language explanation */}
      <div className="bg-red-50 border-l-4 border-red-600 rounded-r-xl px-5 py-4 mb-5">
        <div className="flex items-start gap-3">
          <IconAlertTriangle size={20} className="text-red-600 shrink-0 mt-0.5" />
          <div>
            <div className="font-bold text-gray-900 mb-1.5">Why is the risk HIGH?</div>
            <p className="text-gray-700 text-sm leading-relaxed">
              Heavy rainfall over the past 24 hours has saturated the ground and the nearby river is approaching its danger level.
              More heavy rain is forecast over the next 48 hours and a tropical weather system is approaching.
              This community sits at low elevation with a history of significant flooding.
              These conditions together indicate a HIGH likelihood of serious flooding within 24–36 hours.
            </p>
            <p className="text-gray-500 text-xs mt-2">
              This assessment is based on observed data — not a prediction. The evidence is shown below.
            </p>
          </div>
        </div>
      </div>

      {/* Confidence */}
      <div className="bg-white border border-gray-200 rounded-xl px-5 py-4 mb-5">
        <div className="flex items-center justify-between mb-2">
          <span className="text-sm font-medium text-gray-700">Confidence Level</span>
          <span className="text-sm font-bold text-gray-900 font-mono">87%</span>
        </div>
        <div className="w-full bg-gray-200 rounded-full h-2">
          <div className="bg-red-500 h-2 rounded-full transition-all" style={{ width: '87%' }} />
        </div>
        <p className="text-xs text-gray-400 mt-2">
          Based on 6 data sources. Higher confidence = more reliable assessment. This is not a guarantee.
        </p>
      </div>

      {/* Loading state */}
      {loading && (
        <div className="bg-blue-50 border border-blue-200 rounded-xl px-5 py-4 mb-5 flex items-center gap-3">
          <IconRefresh size={18} className="text-blue-600 animate-spin shrink-0" />
          <span className="text-sm text-blue-700 font-medium">
            Fetching environmental forecast data from ECMWF, GloFAS, and elevation APIs…
          </span>
        </div>
      )}

      {/* Error state (non-blocking) */}
      {error && !loading && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl px-5 py-4 mb-5 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <IconAlertTriangle size={18} className="text-amber-600 shrink-0" />
            <span className="text-sm text-amber-800">
              Some data sources could not be reached. Cached or partial data is shown below.
            </span>
          </div>
          <button
            onClick={refresh}
            className="text-xs font-semibold text-amber-700 hover:text-amber-900 flex items-center gap-1 shrink-0"
          >
            <IconRefresh size={13} /> Retry
          </button>
        </div>
      )}

      {/* Factors */}
      <div className="flex items-center justify-between mb-3">
        <h2 className="font-semibold text-gray-900 text-sm">Contributing Factors</h2>
        <button
          onClick={refresh}
          className="text-xs text-blue-700 hover:underline flex items-center gap-1 font-medium"
        >
          <IconRefresh size={13} /> Refresh
        </button>
      </div>
      <div className="space-y-2.5 mb-6">
        {factors.map((f, i) => (
          <div key={i} className="bg-white border border-gray-200 rounded-xl p-4 flex items-start gap-4">
            <div className={`shrink-0 mt-0.5 ${f.iconColor}`}>{f.icon}</div>
            <div className="flex-1 min-w-0">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="font-semibold text-gray-900 text-sm flex items-center">
                  {f.label}{f.trailing}
                </span>
                <span className="font-bold text-gray-800 font-mono text-sm">{f.value}</span>
              </div>
              <p className="text-xs text-gray-500 mt-0.5 leading-relaxed">{f.detail}</p>
            </div>
            <RiskBadge level={f.level} size="sm" />
          </div>
        ))}
      </div>

      {/* Actions */}
      <div className="flex flex-wrap gap-3">
        <button
          onClick={() => onNavigate('evacuation')}
          className="bg-red-600 hover:bg-red-700 text-white font-semibold px-5 py-2.5 rounded-xl text-sm transition-colors"
        >
          Prepare Evacuation Plan
        </button>
        <button
          onClick={() => onNavigate('support')}
          className="border border-gray-300 hover:bg-gray-50 text-gray-700 font-semibold px-5 py-2.5 rounded-xl text-sm transition-colors"
        >
          Request Assistance
        </button>
      </div>
    </div>
  )
}
