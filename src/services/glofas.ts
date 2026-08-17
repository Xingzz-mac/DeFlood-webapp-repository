import type { RiverData, RiverTrend, SourceStatus } from './types'

const FLOOD_BASE = 'https://flood-api.open-meteo.com/v1/flood'

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

function computeTrend(series: number[]): RiverTrend {
  if (series.length < 3) return 'stable'
  const first = series[0]
  const last = series[series.length - 1]
  const diff = last - first
  const threshold = Math.max(0.1, first * 0.05)
  if (diff > threshold) return 'rising'
  if (diff < -threshold) return 'falling'
  return 'stable'
}

function firstVal(arr: (number | null)[] | undefined): number | null {
  if (!arr || arr.length === 0) return null
  const v = arr[0]
  return v === null ? null : v
}

export async function fetchRiverDischarge(
  latitude: number,
  longitude: number,
): Promise<RiverData> {
  const params = new URLSearchParams({
    latitude: String(latitude),
    longitude: String(longitude),
    daily: DAILY_VARS,
    forecast_days: '7',
  })
  const res = await fetch(`${FLOOD_BASE}?${params}`)
  if (!res.ok) throw new Error(`Flood API returned ${res.status}`)
  const data: FloodResponse = await res.json()
  if (data.error) throw new Error(data.reason ?? 'Flood API error')

  const dischargeSeries = (data.daily?.river_discharge ?? []).filter(
    (v): v is number => v !== null && v !== undefined,
  )
  const status: SourceStatus = dischargeSeries.length > 0 ? 'ok' : 'demo'
  const trend = computeTrend(dischargeSeries)

  return {
    discharge: firstVal(data.daily?.river_discharge),
    mean: firstVal(data.daily?.river_discharge_mean),
    median: firstVal(data.daily?.river_discharge_median),
    maximum: firstVal(data.daily?.river_discharge_max),
    p25: firstVal(data.daily?.river_discharge_p25),
    p75: firstVal(data.daily?.river_discharge_p75),
    trend,
    status,
  }
}
