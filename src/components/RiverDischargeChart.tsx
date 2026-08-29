import { useId, useState } from 'react'
import type { HistoricalBaseline, TrendLabel } from '../services/riskTypes'
import {
  buildRiverOutlookPoints,
  historicalReferenceQuantiles,
  type RiverOutlookPoint,
} from '../services/riverOutlook'
import type { RiverData } from '../services/types'
import { riverModelLocationText } from '../services/riverSpatial'
import { IconRefresh, IconWaves } from './Icons'

interface RiverDischargeChartProps {
  river: RiverData | null
  historicalBaseline: HistoricalBaseline | null
  riverPercentile: number | null
  trendLabel: TrendLabel | null
  loading: boolean
  expired?: boolean
  demoUnavailable?: boolean
}

const WIDTH = 760
const HEIGHT = 286
const MARGIN = { top: 24, right: 24, bottom: 44, left: 58 }
const PLOT_WIDTH = WIDTH - MARGIN.left - MARGIN.right
const PLOT_HEIGHT = HEIGHT - MARGIN.top - MARGIN.bottom

function displayValue(value: number | null): string {
  return value === null ? 'Unavailable' : `${value.toFixed(1)} m³/s`
}

function displayDate(value: string): string {
  const parsed = Date.parse(`${value}T00:00:00Z`)
  if (!Number.isFinite(parsed)) return value
  return new Date(parsed).toLocaleDateString([], { day: 'numeric', month: 'short' })
}

function trendText(trend: TrendLabel | null, fallback: RiverData['trend']): string {
  const value = trend ?? (fallback === 'unavailable' ? null : fallback)
  return value ? value[0].toUpperCase() + value.slice(1) : 'Unavailable'
}

function linePath(
  points: RiverOutlookPoint[],
  value: (point: RiverOutlookPoint) => number | null,
  x: (index: number) => number,
  y: (value: number) => number,
): string {
  let path = ''
  let drawing = false
  points.forEach((point, index) => {
    const current = value(point)
    if (current === null) {
      drawing = false
      return
    }
    path += `${drawing ? ' L' : ' M'} ${x(index).toFixed(2)} ${y(current).toFixed(2)}`
    drawing = true
  })
  return path.trim()
}

function uncertaintyPaths(
  points: RiverOutlookPoint[],
  x: (index: number) => number,
  y: (value: number) => number,
): string[] {
  const segments: Array<Array<{ index: number; low: number; high: number }>> = []
  let current: Array<{ index: number; low: number; high: number }> = []
  points.forEach((point, index) => {
    if (point.p25 === null || point.p75 === null) {
      if (current.length > 0) segments.push(current)
      current = []
      return
    }
    current.push({ index, low: point.p25, high: point.p75 })
  })
  if (current.length > 0) segments.push(current)
  return segments.filter(segment => segment.length >= 2).map(segment => {
    const upper = segment.map((point, index) => (
      `${index === 0 ? 'M' : 'L'} ${x(point.index).toFixed(2)} ${y(point.high).toFixed(2)}`
    )).join(' ')
    const lower = [...segment].reverse().map(point => (
      `L ${x(point.index).toFixed(2)} ${y(point.low).toFixed(2)}`
    )).join(' ')
    return `${upper} ${lower} Z`
  })
}

function EmptyState({ loading, detail }: { loading: boolean; detail?: string }) {
  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-5">
      <div className="flex items-center gap-2 text-gray-900">
        {loading ? <IconRefresh size={18} className="animate-spin text-blue-700" /> : <IconWaves size={18} className="text-blue-700" />}
        <h2 className="font-semibold">Modeled river discharge outlook</h2>
      </div>
      <p className="mt-4 text-sm text-gray-600">
        {loading ? 'Loading river discharge outlook…' : 'River discharge outlook unavailable.'}
      </p>
      {detail && <p className="mt-1 text-xs text-gray-500">{detail}</p>}
    </div>
  )
}

export default function RiverDischargeChart({
  river,
  historicalBaseline,
  riverPercentile,
  trendLabel,
  loading,
  expired = false,
  demoUnavailable = false,
}: RiverDischargeChartProps) {
  const [activeIndex, setActiveIndex] = useState<number | null>(null)
  const clipId = `river-chart-${useId().replace(/:/g, '')}`

  if (demoUnavailable) {
    return <EmptyState loading={false} detail="Demo risk fixtures do not include a verified daily river-discharge series." />
  }
  if (!river) return <EmptyState loading={loading} />
  if (expired) {
    return <EmptyState loading={false} detail="The last usable current GloFAS response has exceeded its freshness limit." />
  }

  const points = buildRiverOutlookPoints(river)
  const hasDischarge = points.some(point => point.recent !== null || point.forecast !== null)
  if (!hasDischarge || river.metadata.status === 'error' || river.metadata.status === 'unavailable') {
    return <EmptyState loading={loading} detail={river.metadata.error ?? undefined} />
  }

  const references = historicalReferenceQuantiles(historicalBaseline)
  const values = points.flatMap(point => [point.recent, point.forecast, point.p25, point.p75])
    .filter((value): value is number => value !== null)
  if (references) values.push(references.p85, references.p95)
  const minimum = Math.min(...values)
  const maximum = Math.max(...values)
  const yMin = Math.max(0, minimum - Math.max(1, (maximum - minimum) * 0.12))
  const yMax = maximum + Math.max(1, (maximum - minimum) * 0.12)
  const range = Math.max(1, yMax - yMin)
  const x = (index: number) => MARGIN.left + (points.length === 1 ? PLOT_WIDTH / 2 : index * PLOT_WIDTH / (points.length - 1))
  const y = (value: number) => MARGIN.top + ((yMax - value) / range) * PLOT_HEIGHT
  const recentPath = linePath(points, point => point.recent, x, y)
  const forecastPath = linePath(points, point => point.forecast, x, y)
  const bands = uncertaintyPaths(points, x, y)
  const hasRecentHistory = points.some(point => !point.isToday && point.recent !== null)
  const todayIndex = points.findIndex(point => point.isToday)
  const labelStep = Math.max(1, Math.ceil(points.length / 7))
  const yTickDigits = range < 10 ? 1 : 0
  const activePoint = activeIndex === null ? null : points[activeIndex]
  const currentDischarge = river.days[0]?.discharge ?? null
  const currentStatus = river.metadata.cached
    ? 'Cached source'
    : river.metadata.status === 'incomplete'
      ? 'Incomplete source'
      : loading
        ? 'Refreshing'
        : 'Current source'

  return (
    <section className="mb-5 rounded-2xl border border-gray-200 bg-white p-4 md:p-5" aria-labelledby="river-outlook-title">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 id="river-outlook-title" className="flex items-center gap-2 font-semibold text-gray-900">
            <IconWaves size={18} className="text-blue-700" /> Modeled river discharge outlook
          </h2>
          <p className="mt-1 text-xs text-gray-500">Recent modeled conditions and the current seven-day GloFAS forecast.</p>
        </div>
        <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${river.metadata.cached ? 'bg-blue-50 text-blue-700' : river.metadata.status === 'incomplete' ? 'bg-amber-50 text-amber-700' : 'bg-green-50 text-green-700'}`}>
          {currentStatus}
        </span>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-2 md:grid-cols-4">
        <Metric label="Current modeled discharge" value={displayValue(currentDischarge)} />
        <Metric label="3-day forecast peak" value={displayValue(river.peakDischarge)} />
        <Metric label="River trend" value={trendText(trendLabel, river.trend)} />
        <Metric label="Historical comparison" value={riverPercentile === null ? 'Unavailable' : `Percentile ${riverPercentile.toFixed(1)}`} />
      </div>

      <div className="mt-3 rounded-xl bg-blue-50 px-3 py-2.5 text-xs leading-relaxed text-blue-900">
        <div className="font-semibold">{riverModelLocationText(river)}</div>
        <div className="mt-1 text-blue-800">
          GloFAS uses an approximately 5 km river grid. A nearby modeled river point may be used when the exact community coordinate has no usable discharge series.
        </div>
      </div>

      <div className="mt-4 flex flex-wrap gap-x-5 gap-y-2 text-xs text-gray-600" aria-label="Chart legend">
        {hasRecentHistory && <Legend color="#1e3a5f" label="Recent modeled" />}
        <Legend color="#2563eb" label="Forecast" dashed />
        {bands.length > 0 && <Legend color="#93c5fd" label="Forecast p25–p75 uncertainty" band />}
        {references && <Legend color="#b45309" label="Historical percentile references" dashed />}
      </div>

      <div className="relative mt-2 overflow-x-auto">
        <svg
          viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
          className="min-w-[520px] w-full md:min-w-[640px]"
          role="img"
          aria-label="Modeled river discharge chart with recent and forecast daily values"
          onMouseLeave={() => setActiveIndex(null)}
        >
          <defs>
            <clipPath id={clipId}>
              <rect x={MARGIN.left} y={MARGIN.top} width={PLOT_WIDTH} height={PLOT_HEIGHT} />
            </clipPath>
          </defs>
          {[0, 0.25, 0.5, 0.75, 1].map(fraction => {
            const value = yMax - fraction * range
            const yPosition = MARGIN.top + fraction * PLOT_HEIGHT
            return (
              <g key={fraction}>
                <line x1={MARGIN.left} x2={WIDTH - MARGIN.right} y1={yPosition} y2={yPosition} stroke="#e5e7eb" strokeWidth="1" />
                <text x={MARGIN.left - 8} y={yPosition + 4} textAnchor="end" fontSize="11" fill="#6b7280">{value.toFixed(yTickDigits)}</text>
              </g>
            )
          })}
          <text transform={`translate(15 ${MARGIN.top + PLOT_HEIGHT / 2}) rotate(-90)`} textAnchor="middle" fontSize="11" fill="#6b7280">
            River discharge (m³/s)
          </text>

          <g clipPath={`url(#${clipId})`}>
            {bands.map(path => <path key={path} d={path} fill="#93c5fd" opacity="0.28" />)}
            {references && (
              <>
                <line x1={MARGIN.left} x2={WIDTH - MARGIN.right} y1={y(references.p85)} y2={y(references.p85)} stroke="#d97706" strokeWidth="1.25" strokeDasharray="5 5" />
                <line x1={MARGIN.left} x2={WIDTH - MARGIN.right} y1={y(references.p95)} y2={y(references.p95)} stroke="#92400e" strokeWidth="1.25" strokeDasharray="3 4" />
              </>
            )}
            {todayIndex >= 0 && (
              <line x1={x(todayIndex)} x2={x(todayIndex)} y1={MARGIN.top} y2={MARGIN.top + PLOT_HEIGHT} stroke="#64748b" strokeWidth="1.5" strokeDasharray="4 4" />
            )}
            {recentPath && <path d={recentPath} fill="none" stroke="#1e3a5f" strokeWidth="3" strokeLinejoin="round" strokeLinecap="round" />}
            {forecastPath && <path d={forecastPath} fill="none" stroke="#2563eb" strokeWidth="3" strokeDasharray="7 6" strokeLinejoin="round" strokeLinecap="round" />}
          </g>

          {todayIndex >= 0 && (
            <text x={x(todayIndex)} y={15} textAnchor="middle" fontSize="11" fontWeight="700" fill="#475569">Today</text>
          )}
          {points.map((point, index) => {
            const value = point.forecast ?? point.recent
            return (
              <g
                key={`${point.date}-${index}`}
                tabIndex={value === null ? undefined : 0}
                role={value === null ? undefined : 'button'}
                aria-label={value === null ? `${point.date}: unavailable` : `${point.date}: ${value.toFixed(1)} cubic metres per second`}
                onMouseEnter={() => setActiveIndex(index)}
                onFocus={() => setActiveIndex(index)}
                onBlur={() => setActiveIndex(null)}
              >
                {value !== null && <circle cx={x(index)} cy={y(value)} r="10" fill="transparent" />}
                {value !== null && <circle cx={x(index)} cy={y(value)} r="3.5" fill={point.forecast !== null ? '#2563eb' : '#1e3a5f'} stroke="white" strokeWidth="1.5" />}
                {(index % labelStep === 0 || point.isToday || index === points.length - 1) && (
                  <text x={x(index)} y={HEIGHT - 15} textAnchor="middle" fontSize="10.5" fill="#6b7280">{displayDate(point.date)}</text>
                )}
              </g>
            )
          })}
        </svg>

        <p className="px-1 pb-1 text-[11px] text-gray-400 md:hidden">Scroll the chart horizontally to view later forecast days.</p>

        {activePoint && (
          <div
            className="pointer-events-none absolute top-8 z-10 min-w-40 -translate-x-1/2 rounded-lg border border-gray-200 bg-white px-3 py-2 text-xs shadow-lg"
            style={{ left: `${(x(activeIndex!) / WIDTH) * 100}%` }}
          >
            <div className="font-semibold text-gray-900">{displayDate(activePoint.date)}</div>
            <div className="mt-1 text-gray-700">Discharge: {displayValue(activePoint.forecast ?? activePoint.recent)}</div>
            {activePoint.p25 !== null && activePoint.p75 !== null && (
              <div className="mt-0.5 text-gray-500">Forecast p25–p75: {activePoint.p25.toFixed(1)}–{activePoint.p75.toFixed(1)} m³/s</div>
            )}
          </div>
        )}
      </div>

      {references && (
        <div className="mt-2 flex flex-wrap gap-x-5 gap-y-1 text-xs text-amber-800">
          <span>Historical 85th percentile reference: {references.p85.toFixed(1)} m³/s</span>
          <span>Historical 95th percentile reference: {references.p95.toFixed(1)} m³/s</span>
        </div>
      )}
      <p className="mt-3 text-xs leading-relaxed text-gray-500">
        Source: GloFAS via Open-Meteo. Modeled river discharge at approximately 5 km resolution; not a local gauge measurement.
        {references ? ' Historical percentile references are display context, not official flood thresholds.' : ''}
      </p>
    </section>
  )
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl bg-gray-50 px-3 py-2.5">
      <div className="text-[11px] leading-tight text-gray-500">{label}</div>
      <div className="mt-1 text-sm font-semibold text-gray-900">{value}</div>
    </div>
  )
}

function Legend({ color, label, dashed = false, band = false }: {
  color: string
  label: string
  dashed?: boolean
  band?: boolean
}) {
  return (
    <span className="inline-flex items-center gap-2">
      <svg width="24" height="8" aria-hidden="true">
        {band
          ? <rect x="1" y="1" width="22" height="6" rx="3" fill={color} opacity="0.4" />
          : <line x1="1" x2="23" y1="4" y2="4" stroke={color} strokeWidth="2.5" strokeDasharray={dashed ? '5 4' : undefined} />}
      </svg>
      {label}
    </span>
  )
}
