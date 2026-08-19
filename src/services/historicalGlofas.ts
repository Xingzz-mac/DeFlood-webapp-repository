import { coordFingerprint } from './cache'
import { FLOOD_BASE } from './config'
import {
  HISTORICAL_CACHE_MAX_AGE_MS,
  HISTORICAL_MIN_SAMPLES,
  HISTORICAL_MIN_YEARS,
  HISTORICAL_SCHEMA_VERSION,
  HISTORICAL_SOURCE_ID,
  HISTORICAL_START_DATE,
} from './riskConfig'
import type { HistoricalBaseline } from './riskTypes'

interface HistoricalFloodResponse {
  daily?: {
    time?: string[]
    river_discharge?: (number | null)[]
  }
  error?: boolean
  reason?: string
}

interface HistoricalCacheEntry {
  schemaVersion: number
  coordinateFingerprint: string
  calendarMonth: number
  sourceId: string
  storedAt: string
  baseline: HistoricalBaseline
}

const inFlightRequests = new Map<string, Promise<HistoricalBaseline>>()

function availableStorage(storage?: Storage): Storage | null {
  if (storage) return storage
  return typeof localStorage === 'undefined' ? null : localStorage
}

function validCalendarMonth(month: number): boolean {
  return Number.isInteger(month) && month >= 1 && month <= 12
}

export function historicalCacheKey(fingerprint: string, calendarMonth: number): string {
  const month = String(calendarMonth).padStart(2, '0')
  return `deflood-historical:v${HISTORICAL_SCHEMA_VERSION}:${fingerprint}:month-${month}:${HISTORICAL_SOURCE_ID}`
}

export function readHistoricalBaseline(
  latitude: number,
  longitude: number,
  calendarMonth: number,
  storage?: Storage,
  nowMs = Date.now(),
): HistoricalBaseline | null {
  if (!validCalendarMonth(calendarMonth)) return null
  const fingerprint = coordFingerprint(latitude, longitude)
  try {
    const target = availableStorage(storage)
    if (!target) return null
    const raw = target.getItem(historicalCacheKey(fingerprint, calendarMonth))
    if (!raw) return null
    const entry = JSON.parse(raw) as HistoricalCacheEntry
    if (
      entry.schemaVersion !== HISTORICAL_SCHEMA_VERSION
      || entry.coordinateFingerprint !== fingerprint
      || entry.calendarMonth !== calendarMonth
      || entry.sourceId !== HISTORICAL_SOURCE_ID
    ) return null
    const storedAtMs = Date.parse(entry.storedAt)
    if (!Number.isFinite(storedAtMs) || nowMs - storedAtMs > HISTORICAL_CACHE_MAX_AGE_MS) {
      return null
    }
    return {
      ...entry.baseline,
      cached: true,
      cachedAt: entry.storedAt,
    }
  } catch {
    return null
  }
}

export function writeHistoricalBaseline(
  baseline: HistoricalBaseline,
  storage?: Storage,
  storedAt = new Date().toISOString(),
): void {
  try {
    const target = availableStorage(storage)
    if (!target) return
    const entry: HistoricalCacheEntry = {
      schemaVersion: HISTORICAL_SCHEMA_VERSION,
      coordinateFingerprint: baseline.coordinateFingerprint,
      calendarMonth: baseline.calendarMonth,
      sourceId: HISTORICAL_SOURCE_ID,
      storedAt,
      baseline,
    }
    target.setItem(
      historicalCacheKey(baseline.coordinateFingerprint, baseline.calendarMonth),
      JSON.stringify(entry),
    )
  } catch {
    // local caching is best effort
  }
}

export function buildHistoricalBaseline(
  daily: HistoricalFloodResponse['daily'],
  fingerprint: string,
  calendarMonth: number,
  retrievedAt = new Date().toISOString(),
): HistoricalBaseline {
  const samples = (daily?.time ?? []).flatMap((date, index) => {
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date)
    const value = daily?.river_discharge?.[index]
    if (
      !match
      || Number(match[2]) !== calendarMonth
      || typeof value !== 'number'
      || !Number.isFinite(value)
    ) return []
    return [{ date, year: Number(match[1]), value }]
  }).sort((a, b) => a.date.localeCompare(b.date))
  const distinctYears = new Set(samples.map(sample => sample.year)).size
  const validSampleCount = samples.length
  const available = distinctYears >= HISTORICAL_MIN_YEARS
    && validSampleCount >= HISTORICAL_MIN_SAMPLES
  const error = available
    ? null
    : `Historical baseline requires ${HISTORICAL_MIN_YEARS} distinct years and ${HISTORICAL_MIN_SAMPLES} same-month samples; received ${distinctYears} years and ${validSampleCount} samples`

  return {
    status: available ? 'available' : 'unavailable',
    coordinateFingerprint: fingerprint,
    calendarMonth,
    values: samples.map(sample => sample.value),
    validSampleCount,
    distinctYears,
    firstValidDate: samples[0]?.date ?? null,
    lastValidDate: samples[samples.length - 1]?.date ?? null,
    unit: 'm³/s',
    sourceId: HISTORICAL_SOURCE_ID,
    schemaVersion: HISTORICAL_SCHEMA_VERSION,
    retrievedAt,
    lastSuccessfulAt: available ? retrievedAt : null,
    cachedAt: null,
    cached: false,
    error,
  }
}

export function historicalErrorBaseline(
  latitude: number,
  longitude: number,
  calendarMonth: number,
  error: string,
): HistoricalBaseline {
  return {
    status: 'error',
    coordinateFingerprint: coordFingerprint(latitude, longitude),
    calendarMonth,
    values: [],
    validSampleCount: 0,
    distinctYears: 0,
    firstValidDate: null,
    lastValidDate: null,
    unit: 'm³/s',
    sourceId: HISTORICAL_SOURCE_ID,
    schemaVersion: HISTORICAL_SCHEMA_VERSION,
    retrievedAt: new Date().toISOString(),
    lastSuccessfulAt: null,
    cachedAt: null,
    cached: false,
    error,
  }
}

function historicalEndDate(forecastDate: string): string {
  const match = /^(\d{4})-\d{2}-\d{2}$/.exec(forecastDate)
  if (!match) throw new Error('Forecast date is invalid')
  return `${Number(match[1]) - 1}-12-31`
}

export function monthFromForecastDate(date: string): number | null {
  const match = /^\d{4}-(\d{2})-\d{2}$/.exec(date)
  if (!match) return null
  const month = Number(match[1])
  return validCalendarMonth(month) ? month : null
}

async function requestHistoricalBaseline(
  latitude: number,
  longitude: number,
  forecastDate: string,
  signal?: AbortSignal,
): Promise<HistoricalBaseline> {
  const calendarMonth = monthFromForecastDate(forecastDate)
  if (calendarMonth === null) throw new Error('Cannot determine forecast calendar month')
  const fingerprint = coordFingerprint(latitude, longitude)
  const params = new URLSearchParams({
    latitude: String(latitude),
    longitude: String(longitude),
    daily: 'river_discharge',
    start_date: HISTORICAL_START_DATE,
    end_date: historicalEndDate(forecastDate),
    timezone: 'GMT',
  })
  const response = await fetch(`${FLOOD_BASE}?${params}`, { signal })
  if (!response.ok) throw new Error(`Historical Flood API returned ${response.status}`)
  const data: HistoricalFloodResponse = await response.json()
  if (data.error) throw new Error(data.reason ?? 'Historical Flood API error')
  const baseline = buildHistoricalBaseline(data.daily, fingerprint, calendarMonth)
  writeHistoricalBaseline(baseline)
  return baseline
}

export function fetchHistoricalBaseline(
  latitude: number,
  longitude: number,
  forecastDate: string,
  signal?: AbortSignal,
): Promise<HistoricalBaseline> {
  const calendarMonth = monthFromForecastDate(forecastDate)
  if (calendarMonth === null) return Promise.reject(new Error('Cannot determine forecast calendar month'))
  const key = historicalCacheKey(coordFingerprint(latitude, longitude), calendarMonth)
  const existing = inFlightRequests.get(key)
  if (existing) return existing
  const request = requestHistoricalBaseline(latitude, longitude, forecastDate, signal)
    .finally(() => inFlightRequests.delete(key))
  inFlightRequests.set(key, request)
  return request
}
