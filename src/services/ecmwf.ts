import type { WeatherModelData, PrecipitationHorizon, SourceMetadata } from './types'
import { ECMWF_BASE, AIFS_MODEL, IFS_MODEL, FORECAST_HOURS, MIN_COVERAGE_PCT } from './config'
import { coordFingerprint } from './cache'

interface EcmwfResponse {
  hourly?: {
    time?: string[]
    precipitation?: (number | null)[]
  }
  error?: boolean
  reason?: string
}

interface ForecastPoint {
  time: string
  value: number | null
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

function forecastTimestamp(value: string): number | null {
  if (/[zZ]$|[+-]\d{2}:\d{2}$/.test(value)) {
    const parsed = Date.parse(value)
    return Number.isFinite(parsed) ? parsed : null
  }
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?$/.exec(value)
  if (!match) return null
  return Date.UTC(
    Number(match[1]),
    Number(match[2]) - 1,
    Number(match[3]),
    Number(match[4]),
    Number(match[5]),
    Number(match[6] ?? 0),
  )
}

function buildHorizons(series: ForecastPoint[]): PrecipitationHorizon[] {
  const valuesByTimestamp = new Map<number, number | null>()
  for (const point of series) {
    const timestamp = forecastTimestamp(point.time)
    if (timestamp !== null) valuesByTimestamp.set(timestamp, point.value)
  }
  const timestamps = [...valuesByTimestamp.keys()].sort((a, b) => a - b)
  const start = timestamps[0] ?? null

  return [24, 48, 72].map(hours => {
    const expectedHours = hours
    if (start === null) {
      return { hours, total: null, expectedHours, validHours: 0, coverage: 0, complete: false }
    }

    const end = start + hours * 60 * 60 * 1000
    const windowValues = timestamps
      .filter(timestamp => timestamp >= start && timestamp < end)
      .map(timestamp => valuesByTimestamp.get(timestamp) ?? null)
    const validValues = windowValues.filter((value): value is number => value !== null)
    const validHours = validValues.length
    const coverage = Math.round(Math.min(100, (validHours / expectedHours) * 100) * 10) / 10
    const complete = coverage >= MIN_COVERAGE_PCT
    const total = complete
      ? validValues.reduce((sum, value) => sum + value, 0)
      : null

    return { hours, total, expectedHours, validHours, coverage, complete }
  })
}

async function fetchModel(
  latitude: number,
  longitude: number,
  model: string,
  label: string,
  signal?: AbortSignal,
): Promise<WeatherModelData> {
  const coordinateFingerprint = coordFingerprint(latitude, longitude)
  const params = new URLSearchParams({
    latitude: String(latitude),
    longitude: String(longitude),
    hourly: 'precipitation',
    models: model,
    forecast_hours: String(FORECAST_HOURS),
    timezone: 'auto',
  })
  const response = await fetch(`${ECMWF_BASE}?${params}`, { signal })
  if (!response.ok) throw new Error(`ECMWF ${model} returned ${response.status}`)
  const data: EcmwfResponse = await response.json()
  if (data.error) throw new Error(data.reason ?? `ECMWF ${model} API error`)

  const times = data.hourly?.time ?? []
  const values = data.hourly?.precipitation ?? []
  const series = times.map((time, index) => {
    const rawValue = values[index]
    return {
      time,
      value: typeof rawValue === 'number' && Number.isFinite(rawValue) ? rawValue : null,
    }
  })
  const horizons = buildHorizons(series)
  const hasData = series.some(point => point.value !== null)
  const complete = horizons.every(horizon => horizon.complete)
  const status: SourceMetadata['status'] = !hasData
    ? 'unavailable'
    : complete
      ? 'live'
      : 'incomplete'
  const incompleteHorizons = horizons
    .filter(horizon => !horizon.complete)
    .map(horizon => `${horizon.hours}h`)
    .join(', ')
  const error = !hasData
    ? 'No finite precipitation values returned'
    : complete
      ? null
      : `Forecast coverage below ${MIN_COVERAGE_PCT}% for ${incompleteHorizons}`

  return {
    label,
    model,
    unit: 'mm',
    horizons,
    series,
    metadata: buildMetadata(status, coordinateFingerprint, error, hasData),
  }
}

export async function fetchAifs(
  latitude: number,
  longitude: number,
  signal?: AbortSignal,
): Promise<WeatherModelData> {
  return fetchModel(latitude, longitude, AIFS_MODEL, 'ECMWF AIFS — AI Forecast', signal)
}

export async function fetchIfs(
  latitude: number,
  longitude: number,
  signal?: AbortSignal,
): Promise<WeatherModelData> {
  return fetchModel(latitude, longitude, IFS_MODEL, 'ECMWF IFS — Physics-Based Forecast', signal)
}
