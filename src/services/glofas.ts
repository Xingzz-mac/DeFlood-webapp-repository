import type {
  RiverData,
  RiverDay,
  RiverTrend,
  SourceMetadata,
  RiverEnsembleAvailability,
  EnsembleFieldAvailability,
} from './types'
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

export interface FloodDaily {
  time?: string[]
  river_discharge?: (number | null)[]
  river_discharge_mean?: (number | null)[]
  river_discharge_median?: (number | null)[]
  river_discharge_max?: (number | null)[]
  river_discharge_p25?: (number | null)[]
  river_discharge_p75?: (number | null)[]
}

interface FloodResponse {
  daily?: FloodDaily
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
    cachedAt: null,
    ageMs: successful ? 0 : null,
    cached: false,
    coordinateFingerprint,
    error,
    refreshAttempt: null,
  }
}

function finiteValue(values: (number | null)[] | undefined, index: number): number | null {
  const value = values?.[index]
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

export function buildRiverDays(daily: FloodDaily | undefined): RiverDay[] {
  const dates = (daily?.time ?? []).slice(0, RIVER_FORECAST_DAYS)
  return dates.map((date, index) => ({
    date,
    discharge: finiteValue(daily?.river_discharge, index),
    mean: finiteValue(daily?.river_discharge_mean, index),
    median: finiteValue(daily?.river_discharge_median, index),
    maximum: finiteValue(daily?.river_discharge_max, index),
    p25: finiteValue(daily?.river_discharge_p25, index),
    p75: finiteValue(daily?.river_discharge_p75, index),
  }))
}

export const PRIMARY_RIVER_REQUIRED_VALID_DAYS = 2

export function primaryRiverValidDays(days: RiverDay[]): number {
  return days.slice(0, 3).filter(day => day.discharge !== null).length
}

export function isPrimaryRiverUsable(days: RiverDay[]): boolean {
  return primaryRiverValidDays(days) >= PRIMARY_RIVER_REQUIRED_VALID_DAYS
}

export function computeThreeDayPeak(days: RiverDay[]): { peak: number | null; date: string | null } {
  const usable = days.slice(0, 3).filter(
    (day): day is RiverDay & { discharge: number } => day.discharge !== null,
  )
  if (usable.length === 0) return { peak: null, date: null }
  const peakDay = usable.reduce((peak, day) => day.discharge > peak.discharge ? day : peak)
  return { peak: peakDay.discharge, date: peakDay.date }
}

export function computeNearTermTrend(days: RiverDay[]): RiverTrend {
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

function fieldAvailability(days: RiverDay[], field: keyof Omit<RiverDay, 'date' | 'discharge'>): EnsembleFieldAvailability {
  const validDays = days.filter(day => day[field] !== null).length
  return {
    available: validDays > 0,
    complete: days.length === RIVER_FORECAST_DAYS && validDays === RIVER_FORECAST_DAYS,
    validDays,
    expectedDays: RIVER_FORECAST_DAYS,
  }
}

export function buildEnsembleAvailability(days: RiverDay[]): RiverEnsembleAvailability {
  return {
    mean: fieldAvailability(days, 'mean'),
    median: fieldAvailability(days, 'median'),
    maximum: fieldAvailability(days, 'maximum'),
    p25: fieldAvailability(days, 'p25'),
    p75: fieldAvailability(days, 'p75'),
  }
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

  const days = buildRiverDays(data.daily)
  const validPrimaryDays = primaryRiverValidDays(days)
  const primaryUsable = isPrimaryRiverUsable(days)
  const status: SourceMetadata['status'] = primaryUsable
    ? 'live'
    : validPrimaryDays > 0
      ? 'incomplete'
      : 'unavailable'
  const error = validPrimaryDays === 0
    ? 'No finite primary river_discharge values in the first three forecast days'
    : primaryUsable
      ? null
      : `Primary river forecast requires at least ${PRIMARY_RIVER_REQUIRED_VALID_DAYS} valid discharge days in the first three days`
  const { peak, date } = computeThreeDayPeak(days)

  return {
    unit: 'm³/s',
    days,
    primaryValidDays: validPrimaryDays,
    primaryUsable,
    peakDischarge: peak,
    peakDate: date,
    trend: computeNearTermTrend(days),
    ensembleAvailability: buildEnsembleAvailability(days),
    metadata: buildMetadata(status, coordinateFingerprint, error, primaryUsable),
  }
}
