import { describe, expect, it } from 'vitest'
import type { SourceMetadata, WeatherModelData } from './types'
import {
  selectWeatherSource,
  sourceAgeMs,
} from './environmentalData'
import { readStaleCache, writeCache } from './cache'
import { WEATHER_MAX_STALE_MS } from './config'

const fingerprint = '16.5000,95.0000'
const nowMs = Date.parse('2026-08-19T00:00:00.000Z')

function metadata(overrides: Partial<SourceMetadata> = {}): SourceMetadata {
  return {
    status: 'live',
    retrievedAt: '2026-08-18T22:00:00.000Z',
    lastSuccessfulAt: '2026-08-18T22:00:00.000Z',
    cachedAt: '2026-08-18T22:01:00.000Z',
    ageMs: 0,
    cached: false,
    coordinateFingerprint: fingerprint,
    error: null,
    refreshAttempt: null,
    ...overrides,
  }
}

function weather(usable: boolean, overrides: Partial<SourceMetadata> = {}): WeatherModelData {
  return {
    label: 'Test weather',
    model: 'test',
    unit: 'mm',
    series: [{ time: '2026-08-19T00:00', value: usable ? 1 : null }],
    horizons: [24, 48, 72].map(hours => ({
      hours,
      expectedHours: hours,
      validHours: usable ? hours : Math.max(0, hours - 10),
      coverage: usable ? 100 : 70,
      complete: usable,
      total: usable ? hours : null,
    })),
    metadata: metadata(overrides),
  }
}

class MemoryStorage implements Storage {
  private values = new Map<string, string>()
  get length() { return this.values.size }
  clear() { this.values.clear() }
  getItem(key: string) { return this.values.get(key) ?? null }
  key(index: number) { return [...this.values.keys()][index] ?? null }
  removeItem(key: string) { this.values.delete(key) }
  setItem(key: string, value: string) { this.values.set(key, value) }
}

describe('source quality and coordinate-safe cache', () => {
  it('does not replace usable cached weather with incomplete fresh weather', () => {
    const fresh = weather(false, {
      status: 'incomplete',
      retrievedAt: '2026-08-19T00:00:00.000Z',
      lastSuccessfulAt: null,
      cachedAt: null,
      error: '72h coverage below threshold',
    })
    const cached = weather(true)

    const selected = selectWeatherSource(fresh, cached, fingerprint, nowMs)

    expect(selected.usedCache).toBe(true)
    expect(selected.data.horizons[2].total).toBe(72)
    expect(selected.data.metadata.refreshAttempt?.status).toBe('incomplete')
  })

  it('preserves lastSuccessfulAt after a failed refresh', () => {
    const fresh = weather(false, {
      status: 'error',
      retrievedAt: '2026-08-19T00:00:00.000Z',
      lastSuccessfulAt: null,
      cachedAt: null,
      error: 'network failure',
    })
    const cached = weather(true)

    const selected = selectWeatherSource(fresh, cached, fingerprint, nowMs)

    expect(selected.data.metadata.lastSuccessfulAt).toBe('2026-08-18T22:00:00.000Z')
    expect(selected.data.metadata.refreshAttempt?.error).toBe('network failure')
  })

  it('does not make an old cached source newer when another aggregate source succeeds', () => {
    const fresh = weather(false, {
      status: 'error',
      retrievedAt: '2026-08-19T00:00:00.000Z',
      lastSuccessfulAt: null,
      cachedAt: null,
    })
    const cached = weather(true)

    const selected = selectWeatherSource(fresh, cached, fingerprint, nowMs)

    expect(selected.data.metadata.retrievedAt).toBe('2026-08-18T22:00:00.000Z')
    expect(selected.data.metadata.cachedAt).toBe('2026-08-18T22:01:00.000Z')
    expect(selected.data.metadata.ageMs).toBe(2 * 3_600_000)
    expect(sourceAgeMs(selected.data.metadata, nowMs)).toBe(2 * 3_600_000)
  })

  it('rejects cached weather older than its source-specific maximum stale age', () => {
    const fresh = weather(false, { status: 'error', lastSuccessfulAt: null, cachedAt: null })
    const cached = weather(true, {
      retrievedAt: new Date(nowMs - WEATHER_MAX_STALE_MS - 1).toISOString(),
      lastSuccessfulAt: new Date(nowMs - WEATHER_MAX_STALE_MS - 1).toISOString(),
    })

    const selected = selectWeatherSource(fresh, cached, fingerprint, nowMs)

    expect(selected.usedCache).toBe(false)
    expect(selected.data).toBe(fresh)
  })

  it('never returns coordinate A cache data for coordinate B', () => {
    const storage = new MemoryStorage()
    writeCache(16.5, 95, { marker: 'A' }, storage, '2026-08-19T00:00:00.000Z')

    expect(readStaleCache(16.5, 95, storage)).toEqual({ marker: 'A' })
    expect(readStaleCache(17.5, 96, storage)).toBeNull()
  })
})
