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

function buildMetadata(
  status: SourceMetadata['status'],
  fingerprint: string,
  error: string | null = null,
): SourceMetadata {
  const now = new Date().toISOString()
  return {
    status,
    retrievedAt: now,
    lastSuccessfulAt: status === 'live' ? now : null,
    cached: false,
    fingerprint,
    error,
  }
}

function buildHorizons(series: { time: string; value: number | null }[]): PrecipitationHorizon[] {
  const horizons = [24, 48, 72]
  return horizons.map(hours => {
    const slice = series.slice(0, hours)
    const expectedHours = hours
    const validHours = slice.filter(p => p.value !== null).length
    const coverage = expectedHours > 0 ? (validHours / expectedHours) * 100 : 0
    const meetsCoverage = coverage >= MIN_COVERAGE_PCT
    const total = meetsCoverage
      ? slice.reduce<number>((acc, p) => acc + (p.value ?? 0), 0)
      : null
    return { hours, total, expectedHours, validHours, coverage }
  })
}

async function fetchModel(
  latitude: number,
  longitude: number,
  model: string,
  label: string,
): Promise<WeatherModelData> {
  const fingerprint = coordFingerprint(latitude, longitude)
  const params = new URLSearchParams({
    latitude: String(latitude),
    longitude: String(longitude),
    hourly: 'precipitation',
    models: model,
    forecast_hours: String(FORECAST_HOURS),
    timezone: 'auto',
  })
  const res = await fetch(`${ECMWF_BASE}?${params}`)
  if (!res.ok) throw new Error(`ECMWF ${model} returned ${res.status}`)
  const data: EcmwfResponse = await res.json()
  if (data.error) throw new Error(data.reason ?? `ECMWF ${model} API error`)

  const times = data.hourly?.time ?? []
  const values = data.hourly?.precipitation ?? []
  const series = times.map((time, i) => ({ time, value: values[i] ?? null }))

  const hasData = series.length > 0 && series.some(p => p.value !== null)
  const status: SourceMetadata['status'] = hasData ? 'live' : 'unavailable'
  const metadata = buildMetadata(status, fingerprint, hasData ? null : 'No precipitation values returned')

  return {
    label,
    model,
    horizons: buildHorizons(series),
    series,
    metadata,
  }
}

export async function fetchAifs(latitude: number, longitude: number): Promise<WeatherModelData> {
  return fetchModel(latitude, longitude, AIFS_MODEL, 'ECMWF AIFS — AI Forecast')
}

export async function fetchIfs(latitude: number, longitude: number): Promise<WeatherModelData> {
  return fetchModel(latitude, longitude, IFS_MODEL, 'ECMWF IFS — Physics-Based Forecast')
}
