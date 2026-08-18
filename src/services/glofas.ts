import type { RiverData, RiverDay, RiverTrend, SourceMetadata } from './types'
import { FLOOD_BASE, RIVER_FORECAST_DAYS } from './config'
import { coordFingerprint } from './cache'

const DAILY_VARS = [
  'river_discharge',
  'river_discharge_mean',
  'river_discharge_median',
  'river_discharge_max',
  'river_discharge_p25',
  'river_discharge_p75',
].join(',')

interface FloodResponse {
  daily?: {
    time?: string[]
    river_discharge?: (number | null)[]
    river_discharge_mean?: (number | null)[]
    river_discharge_median?: (number | null)[]
    river_discharge_max?: (number | null)[]
    river_discharge_p25?: (number | null)[]
    river_discharge_p75?: (number | null)[]
  }
  error?: boolean
  reason?: string
}

function buildMetadata(
  status: SourceMetadata['status'],
  coordinateFingerprint: string,
  error: string | null,
  successful: boolean,
): SourceMetadata {
  const now = new Date().toISOString()
  return {
    status,
    retrievedAt: now,
    lastSuccessfulAt: successful ? now : null,
    cached: false,
    coordinateFingerprint,
    error,
  }
}

function finiteValue(values: (number | null)[] | undefined, index: number): number | null {
  const value = values?.[index]
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

function buildDays(data: FloodResponse): RiverDay[] {
  const dates = (data.daily?.time ?? []).slice(0, RIVER_FORECAST_DAYS)
  return dates.map((date, index) => ({
    date,
    discharge: finiteValue(data.daily?.river_discharge, index),
    mean: finiteValue(data.daily?.river_discharge_mean, index),
    median: finiteValue(data.daily?.river_discharge_median, index),
    maximum: finiteValue(data.daily?.river_discharge_max, index),
    p25: finiteValue(data.daily?.river_discharge_p25, index),
    p75: finiteValue(data.daily?.river_discharge_p75, index),
  }))
}

function computeThreeDayPeak(days: RiverDay[]): { peak: number | null; date: string | null } {
  const usable = days.slice(0, 3).filter(
    (day): day is RiverDay & { discharge: number } => day.discharge !== null,
  )
  if (usable.length === 0) return { peak: null, date: null }
  const peakDay = usable.reduce((peak, day) => day.discharge > peak.discharge ? day : peak)
  return { peak: peakDay.discharge, date: peakDay.date }
}

function computeNearTermTrend(days: RiverDay[]): RiverTrend {
  const usable = days.slice(0, 3).filter(
    (day): day is RiverDay & { discharge: number } => day.discharge !== null,
  )
  if (usable.length < 2) return 'unavailable'
  const first = usable[0].discharge
  const last = usable[usable.length - 1].discharge
  const difference = last - first
  const stableThreshold = Math.max(0.1, Math.abs(first) * 0.05)
  if (difference > stableThreshold) return 'rising'
  if (difference < -stableThreshold) return 'falling'
  return 'stable'
}

export async function fetchRiverDischarge(
  latitude: number,
  longitude: number,
  signal?: AbortSignal,
): Promise<RiverData> {
  const coordinateFingerprint = coordFingerprint(latitude, longitude)
  const params = new URLSearchParams({
    latitude: String(latitude),
    longitude: String(longitude),
    daily: DAILY_VARS,
    forecast_days: String(RIVER_FORECAST_DAYS),
    timezone: 'auto',
  })
  const response = await fetch(`${FLOOD_BASE}?${params}`, { signal })
  if (!response.ok) throw new Error(`Flood API returned ${response.status}`)
  const data: FloodResponse = await response.json()
  if (data.error) throw new Error(data.reason ?? 'Flood API error')

  const days = buildDays(data)
  const values = days.flatMap(day => [
    day.discharge,
    day.mean,
    day.median,
    day.maximum,
    day.p25,
    day.p75,
  ])
  const hasData = values.some(value => value !== null)
  const complete = days.length === RIVER_FORECAST_DAYS && values.every(value => value !== null)
  const status: SourceMetadata['status'] = !hasData
    ? 'unavailable'
    : complete
      ? 'live'
      : 'incomplete'
  const error = !hasData
    ? 'No finite modeled discharge values returned'
    : complete
      ? null
      : 'The seven-day discharge forecast contains missing values'
  const { peak, date } = computeThreeDayPeak(days)

  return {
    unit: 'm³/s',
    days,
    peakDischarge: peak,
    peakDate: date,
    trend: computeNearTermTrend(days),
    metadata: buildMetadata(status, coordinateFingerprint, error, hasData),
  }
}
