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

function firstVal(arr: (number | null)[] | undefined, index: number): number | null {
  if (!arr || arr.length <= index) return null
  const v = arr[index]
  return v === null || v === undefined ? null : v
}

function buildDays(data: FloodResponse): RiverDay[] {
  const dates = data.daily?.time ?? []
  return dates.map((date, i) => ({
    date,
    discharge: firstVal(data.daily?.river_discharge, i),
    mean: firstVal(data.daily?.river_discharge_mean, i),
    median: firstVal(data.daily?.river_discharge_median, i),
    maximum: firstVal(data.daily?.river_discharge_max, i),
    p25: firstVal(data.daily?.river_discharge_p25, i),
    p75: firstVal(data.daily?.river_discharge_p75, i),
  }))
}

function computePeak(days: RiverDay[]): { peak: number | null; date: string | null } {
  const valid = days.filter(d => d.discharge !== null)
  if (valid.length === 0) return { peak: null, date: null }
  let peakDay = valid[0]
  for (const d of valid) {
    if ((d.discharge as number) > (peakDay.discharge as number)) peakDay = d
  }
  return { peak: peakDay.discharge, date: peakDay.date }
}

function computeTrend(days: RiverDay[]): RiverTrend {
  const valid = days.slice(0, 3).filter(d => d.discharge !== null)
  if (valid.length < 2) return 'unavailable'
  const series = valid.map(d => d.discharge as number)
  const first = series[0]
  const last = series[series.length - 1]
  const diff = last - first
  const threshold = Math.max(0.1, first * 0.05)
  if (diff > threshold) return 'rising'
  if (diff < -threshold) return 'falling'
  return 'stable'
}

export async function fetchRiverDischarge(
  latitude: number,
  longitude: number,
): Promise<RiverData> {
  const fingerprint = coordFingerprint(latitude, longitude)
  const params = new URLSearchParams({
    latitude: String(latitude),
    longitude: String(longitude),
    daily: DAILY_VARS,
    forecast_days: String(RIVER_FORECAST_DAYS),
    timezone: 'auto',
  })
  const res = await fetch(`${FLOOD_BASE}?${params}`)
  if (!res.ok) throw new Error(`Flood API returned ${res.status}`)
  const data: FloodResponse = await res.json()
  if (data.error) throw new Error(data.reason ?? 'Flood API error')

  const days = buildDays(data)
  const hasData = days.some(d => d.discharge !== null)
  const status: SourceMetadata['status'] = hasData ? 'live' : 'unavailable'
  const metadata = buildMetadata(status, fingerprint, hasData ? null : 'No river discharge values returned')
  const { peak, date } = computePeak(days)
  const trend = computeTrend(days)

  return { days, peakDischarge: peak, peakDate: date, trend, metadata }
}
