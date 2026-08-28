import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { writeCache } from './cache'
import {
  AIFS_MODEL,
  ENVIRONMENTAL_REQUEST_TIMEOUT_MS,
  IFS_MODEL,
} from './config'
import { fetchEnvironmentalData } from './environmentalData'
import type {
  EnvironmentalData,
  RiverData,
  RiverDay,
  SourceMetadata,
  TerrainData,
  WeatherModelData,
} from './types'

const now = '2026-08-19T00:00:00.000Z'
const latitude = 16.5
const longitude = 95
const fingerprint = '16.5000,95.0000'

class MemoryStorage implements Storage {
  private values = new Map<string, string>()
  get length() { return this.values.size }
  clear() { this.values.clear() }
  getItem(key: string) { return this.values.get(key) ?? null }
  key(index: number) { return [...this.values.keys()][index] ?? null }
  removeItem(key: string) { this.values.delete(key) }
  setItem(key: string, value: string) { this.values.set(key, value) }
}

function metadata(lastSuccessfulAt = now): SourceMetadata {
  return {
    status: 'live',
    retrievedAt: lastSuccessfulAt,
    lastSuccessfulAt,
    cachedAt: lastSuccessfulAt,
    ageMs: 0,
    cached: false,
    coordinateFingerprint: fingerprint,
    error: null,
    refreshAttempt: null,
  }
}

function weather(model: string, label: string, lastSuccessfulAt = now): WeatherModelData {
  return {
    label,
    model,
    unit: 'mm',
    series: [],
    horizons: ([24, 48, 72] as const).map(hours => ({
      hours,
      total: hours,
      expectedHours: hours,
      validHours: hours,
      coverage: 100,
      complete: true,
    })),
    metadata: metadata(lastSuccessfulAt),
  }
}

function riverDays(): RiverDay[] {
  return Array.from({ length: 7 }, (_, index) => {
    const discharge = 70 + index * 5
    return {
      date: `2026-08-${String(index + 19).padStart(2, '0')}`,
      discharge,
      mean: discharge,
      median: discharge,
      maximum: discharge * 1.2,
      p25: discharge * 0.9,
      p75: discharge * 1.1,
    }
  })
}

function river(lastSuccessfulAt = now): RiverData {
  const days = riverDays()
  return {
    unit: 'm³/s',
    days,
    primaryValidDays: 3,
    primaryUsable: true,
    peakDischarge: 80,
    peakDate: '2026-08-21',
    trend: 'rising',
    ensembleAvailability: {
      mean: { available: true, complete: true, validDays: 7, expectedDays: 7 },
      median: { available: true, complete: true, validDays: 7, expectedDays: 7 },
      maximum: { available: true, complete: true, validDays: 7, expectedDays: 7 },
      p25: { available: true, complete: true, validDays: 7, expectedDays: 7 },
      p75: { available: true, complete: true, validDays: 7, expectedDays: 7 },
    },
    metadata: metadata(lastSuccessfulAt),
  }
}

function terrain(lastSuccessfulAt = now): TerrainData {
  return { unit: 'm', elevation: 8, metadata: metadata(lastSuccessfulAt) }
}

function cachedEnvironmental(): EnvironmentalData {
  const cachedAt = new Date(Date.parse(now) - 60 * 60 * 1000).toISOString()
  return {
    location: { latitude, longitude },
    fingerprint,
    weatherModels: {
      aifs: weather(AIFS_MODEL, 'ECMWF AIFS — AI Forecast', cachedAt),
      ifs: weather(IFS_MODEL, 'ECMWF IFS — Physics-Based Forecast', cachedAt),
    },
    river: river(cachedAt),
    terrain: terrain(cachedAt),
    retrievedAt: cachedAt,
    status: 'live',
    stale: false,
  }
}

function forecastResponse(): Response {
  const start = Date.parse(now)
  const time = Array.from(
    { length: 96 },
    (_, index) => new Date(start + index * 60 * 60 * 1000).toISOString(),
  )
  return new Response(JSON.stringify({
    hourly: { time, precipitation: Array(96).fill(1) },
  }), { status: 200 })
}

function riverResponse(): Response {
  const forecastDays = riverDays()
  const recentDays = Array.from({ length: 7 }, (_, index) => ({
    ...forecastDays[0],
    date: `2026-08-${String(index + 12).padStart(2, '0')}`,
    discharge: 60 + index,
    mean: 60 + index,
    median: 60 + index,
    maximum: 70 + index,
    p25: 55 + index,
    p75: 65 + index,
  }))
  const days = [...recentDays, ...forecastDays]
  return new Response(JSON.stringify({
    daily: {
      time: days.map(day => day.date),
      river_discharge: days.map(day => day.discharge),
      river_discharge_mean: days.map(day => day.mean),
      river_discharge_median: days.map(day => day.median),
      river_discharge_max: days.map(day => day.maximum),
      river_discharge_p25: days.map(day => day.p25),
      river_discharge_p75: days.map(day => day.p75),
    },
  }), { status: 200 })
}

function rejectWhenAborted(signal: AbortSignal | null | undefined): Promise<Response> {
  return new Promise((_resolve, reject) => {
    const rejectAbort = () => reject(new DOMException('Aborted', 'AbortError'))
    if (signal?.aborted) rejectAbort()
    else signal?.addEventListener('abort', rejectAbort, { once: true })
  })
}

function fetchMockWithTimeout(source: 'aifs' | 'river') {
  return vi.fn((input: string | URL | Request, init?: RequestInit): Promise<Response> => {
    const url = new URL(input instanceof Request ? input.url : String(input))
    if (url.pathname.endsWith('/ecmwf')) {
      if (source === 'aifs' && url.searchParams.get('models') === AIFS_MODEL) {
        return rejectWhenAborted(init?.signal)
      }
      return Promise.resolve(forecastResponse())
    }
    if (url.pathname.endsWith('/flood')) {
      return source === 'river'
        ? rejectWhenAborted(init?.signal)
        : Promise.resolve(riverResponse())
    }
    if (url.pathname.endsWith('/elevation')) {
      return Promise.resolve(new Response(JSON.stringify({ elevation: [8] }), { status: 200 }))
    }
    return Promise.reject(new Error(`Unexpected request: ${url}`))
  })
}

describe('environmental request timeouts', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(now))
    vi.stubGlobal('localStorage', new MemoryStorage())
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
  })

  it('times out AIFS without blocking usable IFS, GloFAS, or elevation and uses valid cache', async () => {
    writeCache(latitude, longitude, cachedEnvironmental(), undefined, now)
    vi.stubGlobal('fetch', fetchMockWithTimeout('aifs'))

    const pending = fetchEnvironmentalData(latitude, longitude)
    await vi.advanceTimersByTimeAsync(ENVIRONMENTAL_REQUEST_TIMEOUT_MS)
    const result = await pending

    expect(result.weatherModels.aifs.metadata.status).toBe('cached')
    expect(result.weatherModels.aifs.metadata.refreshAttempt?.error).toContain('AIFS request timed out')
    expect(result.weatherModels.ifs.metadata.status).toBe('live')
    expect(result.river.metadata.status).toBe('live')
    expect(result.terrain.metadata.status).toBe('live')
    expect(result.status).toBe('partial')
    expect(vi.getTimerCount()).toBe(0)
  })

  it('handles a timed-out current GloFAS request as unavailable while preserving other results', async () => {
    vi.stubGlobal('fetch', fetchMockWithTimeout('river'))

    const pending = fetchEnvironmentalData(latitude, longitude)
    await vi.advanceTimersByTimeAsync(ENVIRONMENTAL_REQUEST_TIMEOUT_MS)
    const result = await pending

    expect(result.river.primaryUsable).toBe(false)
    expect(result.river.metadata.status).toBe('error')
    expect(result.river.metadata.error).toContain('Current GloFAS request timed out')
    expect(result.weatherModels.aifs.metadata.status).toBe('live')
    expect(result.weatherModels.ifs.metadata.status).toBe('live')
    expect(result.terrain.metadata.status).toBe('live')
    expect(result.status).toBe('partial')
    expect(vi.getTimerCount()).toBe(0)
  })
})
