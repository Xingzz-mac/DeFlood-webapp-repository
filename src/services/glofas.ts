import type {
  RiverData,
  RiverDay,
  RiverTrend,
  SourceMetadata,
  RiverEnsembleAvailability,
  EnsembleFieldAvailability,
  GeographicCoordinate,
  RiverLookupMode,
} from './types'
import { FLOOD_BASE, RIVER_FORECAST_DAYS, RIVER_PAST_DAYS } from './config'
import { coordFingerprint } from './cache'
import { haversineDistanceKm } from './riverSpatial'

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

export interface FloodResponse {
  latitude?: number
  longitude?: number
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

export function buildRiverSeries(
  daily: FloodDaily | undefined,
  pastDays = RIVER_PAST_DAYS,
): { recentDays: RiverDay[]; forecastDays: RiverDay[] } {
  const dates = daily?.time ?? []
  const allDays = dates.slice(0, pastDays + RIVER_FORECAST_DAYS).map((date, index) => ({
    date,
    discharge: finiteValue(daily?.river_discharge, index),
    mean: finiteValue(daily?.river_discharge_mean, index),
    median: finiteValue(daily?.river_discharge_median, index),
    maximum: finiteValue(daily?.river_discharge_max, index),
    p25: finiteValue(daily?.river_discharge_p25, index),
    p75: finiteValue(daily?.river_discharge_p75, index),
  }))
  return {
    recentDays: allDays.slice(0, pastDays),
    forecastDays: allDays.slice(pastDays, pastDays + RIVER_FORECAST_DAYS),
  }
}

export const PRIMARY_RIVER_REQUIRED_VALID_DAYS = 2

export function usablePrimaryRiverDays(
  days: RiverDay[],
): (RiverDay & { discharge: number })[] {
  return days.slice(0, 3).filter(
    (day): day is RiverDay & { discharge: number } => (
      typeof day.date === 'string'
      && day.date.trim().length > 0
      && Number.isFinite(Date.parse(day.date))
      && typeof day.discharge === 'number'
      && Number.isFinite(day.discharge)
    ),
  )
}

export function primaryRiverValidDays(days: RiverDay[]): number {
  return usablePrimaryRiverDays(days).length
}

export function isPrimaryRiverUsable(days: RiverDay[]): boolean {
  return primaryRiverValidDays(days) >= PRIMARY_RIVER_REQUIRED_VALID_DAYS
}

export function computeThreeDayPeak(days: RiverDay[]): { peak: number | null; date: string | null } {
  const usable = usablePrimaryRiverDays(days)
  if (usable.length === 0) return { peak: null, date: null }
  const peakDay = usable.reduce((peak, day) => day.discharge > peak.discharge ? day : peak)
  return { peak: peakDay.discharge, date: peakDay.date }
}

export function computeNearTermTrend(days: RiverDay[]): RiverTrend {
  const usable = usablePrimaryRiverDays(days)
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

function returnedCoordinate(
  data: FloodResponse,
  requestedCoordinate: GeographicCoordinate,
): GeographicCoordinate {
  return {
    latitude: typeof data.latitude === 'number' && Number.isFinite(data.latitude)
      ? data.latitude
      : requestedCoordinate.latitude,
    longitude: typeof data.longitude === 'number' && Number.isFinite(data.longitude)
      ? data.longitude
      : requestedCoordinate.longitude,
  }
}

export function buildRiverData(
  data: FloodResponse,
  requestedCoordinate: GeographicCoordinate,
  communityCoordinate: GeographicCoordinate,
  lookupMode: Exclude<RiverLookupMode, 'UNAVAILABLE'>,
): RiverData {
  const coordinateFingerprint = coordFingerprint(
    communityCoordinate.latitude,
    communityCoordinate.longitude,
  )
  const { recentDays, forecastDays: days } = buildRiverSeries(data.daily)
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
  const modelCoordinate = returnedCoordinate(data, requestedCoordinate)

  return {
    unit: 'm³/s',
    recentDays,
    days,
    primaryValidDays: validPrimaryDays,
    primaryUsable,
    peakDischarge: peak,
    peakDate: date,
    trend: computeNearTermTrend(days),
    ensembleAvailability: buildEnsembleAvailability(days),
    communityCoordinate,
    riverModelCoordinate: primaryUsable ? modelCoordinate : null,
    riverModelDistanceKm: primaryUsable
      ? haversineDistanceKm(communityCoordinate, modelCoordinate)
      : null,
    riverLookupMode: primaryUsable ? lookupMode : 'UNAVAILABLE',
    metadata: buildMetadata(status, coordinateFingerprint, error, primaryUsable),
  }
}

function requestParameters(coordinates: GeographicCoordinate[]): URLSearchParams {
  return new URLSearchParams({
    latitude: coordinates.map(coordinate => coordinate.latitude).join(','),
    longitude: coordinates.map(coordinate => coordinate.longitude).join(','),
    daily: DAILY_VARS,
    past_days: String(RIVER_PAST_DAYS),
    forecast_days: String(RIVER_FORECAST_DAYS),
    timezone: coordinates.length === 1 ? 'auto' : 'GMT',
  })
}

export async function fetchRiverDischarge(
  latitude: number,
  longitude: number,
  signal?: AbortSignal,
): Promise<RiverData> {
  const coordinate = { latitude, longitude }
  const params = requestParameters([coordinate])
  const response = await fetch(`${FLOOD_BASE}?${params}`, { signal })
  if (!response.ok) throw new Error(`Flood API returned ${response.status}`)
  const data: FloodResponse = await response.json()
  if (data.error) throw new Error(data.reason ?? 'Flood API error')

  return buildRiverData(data, coordinate, coordinate, 'EXACT_QUERY')
}

export async function fetchRiverDischargeCandidates(
  coordinates: GeographicCoordinate[],
  communityCoordinate: GeographicCoordinate,
  signal?: AbortSignal,
): Promise<RiverData[]> {
  if (coordinates.length === 0) return []
  const response = await fetch(`${FLOOD_BASE}?${requestParameters(coordinates)}`, { signal })
  if (!response.ok) throw new Error(`Flood API returned ${response.status}`)
  const payload: FloodResponse | FloodResponse[] = await response.json()
  const responses = Array.isArray(payload) ? payload : [payload]
  if (responses.length !== coordinates.length) {
    throw new Error('Flood API returned an unexpected number of coordinate results')
  }
  return responses.map((data, index) => {
    if (data.error) throw new Error(data.reason ?? 'Flood API error')
    return buildRiverData(data, coordinates[index], communityCoordinate, 'NEARBY_SEARCH')
  })
}
