import type {
  PrecipitationHorizon,
  SourceMetadata,
  WeatherModelData,
  WeatherModelKey,
} from './types'
import {
  AIFS_MODEL,
  ECMWF_BASE,
  FORECAST_HOURS,
  GFS_BASE,
  GFS_MODEL,
  IFS_MODEL,
  MIN_COVERAGE_PCT,
  REQUIRED_WEATHER_HORIZONS,
  UKMO_BASE,
  UKMO_MODEL,
} from './config'
import { coordFingerprint } from './cache'

interface WeatherApiResponse {
  hourly?: {
    time?: string[]
    precipitation?: (number | null)[]
  }
  error?: boolean
  reason?: string
}

export interface WeatherModelDefinition {
  key: WeatherModelKey
  endpoint: string
  model: string
  label: string
  timeoutLabel: string
}

export const WEATHER_MODEL_KEYS: readonly WeatherModelKey[] = [
  'aifs',
  'ifs',
  'gfs',
  'ukmo',
]

export const WEATHER_MODEL_DEFINITIONS: Readonly<Record<WeatherModelKey, WeatherModelDefinition>> = {
  aifs: {
    key: 'aifs',
    endpoint: ECMWF_BASE,
    model: AIFS_MODEL,
    label: 'ECMWF AIFS Single — AI Forecast',
    timeoutLabel: 'AIFS',
  },
  ifs: {
    key: 'ifs',
    endpoint: ECMWF_BASE,
    model: IFS_MODEL,
    label: 'ECMWF IFS HRES — Physics-Based Forecast',
    timeoutLabel: 'IFS HRES',
  },
  gfs: {
    key: 'gfs',
    endpoint: GFS_BASE,
    model: GFS_MODEL,
    label: 'NOAA GFS Global — Physics-Based Forecast',
    timeoutLabel: 'GFS',
  },
  ukmo: {
    key: 'ukmo',
    endpoint: UKMO_BASE,
    model: UKMO_MODEL,
    label: 'UKMO Global 10 km — Physics-Based Forecast',
    timeoutLabel: 'UKMO',
  },
}

export interface ForecastPoint {
  time: string
  value: number | null
}

function buildMetadata(
  status: SourceMetadata['status'],
  coordinateFingerprint: string,
  error: string | null,
): SourceMetadata {
  const now = new Date().toISOString()
  return {
    status,
    retrievedAt: now,
    lastSuccessfulAt: null,
    cachedAt: null,
    ageMs: null,
    cached: false,
    coordinateFingerprint,
    error,
    refreshAttempt: null,
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

export function buildPrecipitationHorizons(series: ForecastPoint[]): PrecipitationHorizon[] {
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

export function normalizePrecipitationSeries(
  times: string[],
  values: (number | null | undefined)[],
): ForecastPoint[] {
  return times.map((time, index) => {
    const rawValue = values[index]
    return {
      time,
      value: typeof rawValue === 'number' && Number.isFinite(rawValue) ? rawValue : null,
    }
  })
}

export function isWeatherHorizonUsable(
  data: WeatherModelData | undefined,
  hours: number,
): boolean {
  const horizon = data?.horizons.find(candidate => candidate.hours === hours)
  return Boolean(
    horizon
    && horizon.complete
    && horizon.total !== null
    && Number.isFinite(horizon.total)
    && horizon.expectedHours === hours
    && horizon.coverage >= MIN_COVERAGE_PCT,
  )
}

export function isWeatherModelUsable(data: WeatherModelData | undefined): boolean {
  return Boolean(data && REQUIRED_WEATHER_HORIZONS.every(hours =>
    isWeatherHorizonUsable(data, hours)))
}

export async function fetchWeatherModel(
  key: WeatherModelKey,
  latitude: number,
  longitude: number,
  signal?: AbortSignal,
): Promise<WeatherModelData> {
  const definition = WEATHER_MODEL_DEFINITIONS[key]
  const coordinateFingerprint = coordFingerprint(latitude, longitude)
  const params = new URLSearchParams({
    latitude: String(latitude),
    longitude: String(longitude),
    hourly: 'precipitation',
    models: definition.model,
    forecast_hours: String(FORECAST_HOURS),
    timezone: 'auto',
  })
  const response = await fetch(`${definition.endpoint}?${params}`, { signal })
  if (!response.ok) throw new Error(`${definition.model} returned ${response.status}`)
  const data: WeatherApiResponse = await response.json()
  if (data.error) throw new Error(data.reason ?? `${definition.model} API error`)

  const times = data.hourly?.time ?? []
  const values = data.hourly?.precipitation ?? []
  const series = normalizePrecipitationSeries(times, values)
  const horizons = buildPrecipitationHorizons(series)
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

  const result: WeatherModelData = {
    label: definition.label,
    model: definition.model,
    unit: 'mm',
    horizons,
    series,
    metadata: buildMetadata(status, coordinateFingerprint, error),
  }
  const usable = isWeatherModelUsable(result)
  result.metadata.lastSuccessfulAt = usable ? result.metadata.retrievedAt : null
  result.metadata.ageMs = usable ? 0 : null
  return result
}

export function fetchAifs(latitude: number, longitude: number, signal?: AbortSignal) {
  return fetchWeatherModel('aifs', latitude, longitude, signal)
}

export function fetchIfs(latitude: number, longitude: number, signal?: AbortSignal) {
  return fetchWeatherModel('ifs', latitude, longitude, signal)
}

export function fetchGfs(latitude: number, longitude: number, signal?: AbortSignal) {
  return fetchWeatherModel('gfs', latitude, longitude, signal)
}

export function fetchUkmo(latitude: number, longitude: number, signal?: AbortSignal) {
  return fetchWeatherModel('ukmo', latitude, longitude, signal)
}
