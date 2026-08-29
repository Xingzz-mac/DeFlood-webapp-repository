import { describe, expect, it } from 'vitest'
import {
  buildRiskEvidence,
  calculateRiskWithCache,
  readRiskCache,
  riskCacheKey,
  writeRiskCache,
} from './riskCache'
import { calculateRisk } from './riskEngine'
import { RISK_CACHE_SCHEMA_VERSION } from './riskConfig'
import type { HistoricalBaseline } from './riskTypes'
import type { EnvironmentalData, RiverDay, SourceMetadata, WeatherModelData } from './types'

class MemoryStorage implements Storage {
  private values = new Map<string, string>()
  get length() { return this.values.size }
  clear() { this.values.clear() }
  getItem(key: string) { return this.values.get(key) ?? null }
  key(index: number) { return [...this.values.keys()][index] ?? null }
  removeItem(key: string) { this.values.delete(key) }
  setItem(key: string, value: string) { this.values.set(key, value) }
}

const fingerprint = '16.5000,95.0000'
const now = '2026-08-19T00:00:00.000Z'
const nowMs = Date.parse(now)

function metadata(coordinateFingerprint = fingerprint): SourceMetadata {
  return {
    status: 'live',
    retrievedAt: now,
    lastSuccessfulAt: now,
    cachedAt: null,
    ageMs: 0,
    cached: false,
    coordinateFingerprint,
    error: null,
    refreshAttempt: null,
  }
}

function weather(
  totals: [number, number, number],
  coordinateFingerprint = fingerprint,
): WeatherModelData {
  return {
    label: 'test',
    model: 'test-model',
    unit: 'mm',
    series: [],
    horizons: ([24, 48, 72] as const).map((hours, index) => ({
      hours,
      total: totals[index],
      expectedHours: hours,
      validHours: hours,
      coverage: 100,
      complete: true,
    })),
    metadata: metadata(coordinateFingerprint),
  }
}

function riverDays(values: number[]): RiverDay[] {
  return values.map((discharge, index) => ({
    date: `2026-08-${String(index + 19).padStart(2, '0')}`,
    discharge,
    mean: discharge,
    median: discharge,
    maximum: discharge * 1.2,
    p25: discharge * 0.9,
    p75: discharge * 1.1,
  }))
}

function environmental(options: {
  coordinateFingerprint?: string
  rainfall?: [number, number, number]
  discharge?: number[]
} = {}): EnvironmentalData {
  const coordinateFingerprint = options.coordinateFingerprint ?? fingerprint
  const rainfall = options.rainfall ?? [20, 40, 60]
  const days = riverDays(options.discharge ?? [70, 80, 90])
  const peak = Math.max(...days.map(day => day.discharge as number))
  return {
    location: { latitude: 16.5, longitude: 95 },
    fingerprint: coordinateFingerprint,
    weatherModels: {
      aifs: weather(rainfall, coordinateFingerprint),
      ifs: weather(rainfall, coordinateFingerprint),
      gfs: weather(rainfall, coordinateFingerprint),
      ukmo: weather(rainfall, coordinateFingerprint),
    },
    river: {
      unit: 'm³/s',
      days,
      primaryValidDays: days.length,
      primaryUsable: true,
      peakDischarge: peak,
      peakDate: days.find(day => day.discharge === peak)?.date ?? null,
      trend: 'rising',
      ensembleAvailability: {
        mean: { available: true, complete: false, validDays: 3, expectedDays: 7 },
        median: { available: true, complete: false, validDays: 3, expectedDays: 7 },
        maximum: { available: true, complete: false, validDays: 3, expectedDays: 7 },
        p25: { available: true, complete: false, validDays: 3, expectedDays: 7 },
        p75: { available: true, complete: false, validDays: 3, expectedDays: 7 },
      },
      communityCoordinate: { latitude: 16.5, longitude: 95 },
      riverModelCoordinate: { latitude: 16.5, longitude: 95 },
      riverModelDistanceKm: 0,
      riverLookupMode: 'EXACT_QUERY',
      metadata: metadata(coordinateFingerprint),
    },
    terrain: { unit: 'm', elevation: 8, metadata: metadata(coordinateFingerprint) },
    retrievedAt: now,
    status: 'live',
    stale: false,
  }
}

function history(values: number[]): HistoricalBaseline {
  return {
    status: 'available',
    requestedCoordinate: { latitude: 16.5, longitude: 95 },
    returnedModelCoordinate: { latitude: 16.5, longitude: 95 },
    coordinateFingerprint: fingerprint,
    calendarMonth: 8,
    values,
    validSampleCount: values.length,
    distinctYears: 20,
    firstValidDate: '1984-08-01',
    lastValidDate: '2025-08-31',
    unit: 'm³/s',
    sourceId: 'test-history',
    schemaVersion: 3,
    retrievedAt: now,
    lastSuccessfulAt: now,
    cachedAt: null,
    cached: false,
    error: null,
  }
}

function cacheResult(
  environmentalData: EnvironmentalData,
  historicalBaseline: HistoricalBaseline,
  storage: Storage,
): void {
  const evidence = buildRiskEvidence(environmentalData, historicalBaseline)
  const result = calculateRisk({
    environmental: environmentalData,
    historicalBaseline,
    nowMs,
  })
  writeRiskCache(evidence, result, storage, nowMs)
}

describe('derived risk cache identity', () => {
  it('does not reuse identical timestamps when rainfall evidence changes', () => {
    const storage = new MemoryStorage()
    const historical = history([10, 20, 30, 40, 50])
    const first = environmental({ rainfall: [20, 40, 60] })
    const changed = environmental({ rainfall: [25, 45, 65] })
    cacheResult(first, historical, storage)

    const firstEvidence = buildRiskEvidence(first, historical)
    const changedEvidence = buildRiskEvidence(changed, historical)
    expect(changedEvidence.evidenceHash).not.toBe(firstEvidence.evidenceHash)
    expect(readRiskCache(changedEvidence, storage, nowMs)).toBeNull()
  })

  it('does not reuse identical timestamps when primary river evidence changes', () => {
    const storage = new MemoryStorage()
    const historical = history([10, 20, 30, 40, 50])
    const first = environmental({ discharge: [70, 80, 90] })
    const changed = environmental({ discharge: [70, 85, 100] })
    cacheResult(first, historical, storage)

    expect(readRiskCache(buildRiskEvidence(changed, historical), storage, nowMs)).toBeNull()
  })

  it('does not reuse identical timestamps when historical distribution evidence changes', () => {
    const storage = new MemoryStorage()
    const current = environmental()
    const first = history([10, 20, 30, 40, 50])
    const changed = history([10, 20, 30, 40, 55])
    cacheResult(current, first, storage)

    expect(readRiskCache(buildRiskEvidence(current, changed), storage, nowMs)).toBeNull()
  })

  it('verifies the exact evidence payload even if a compact hash were to collide', () => {
    const storage = new MemoryStorage()
    const current = environmental()
    const historical = history([10, 20, 30, 40, 50])
    const evidence = buildRiskEvidence(current, historical)
    cacheResult(current, historical, storage)
    const differentPayload = { ...evidence, evidencePayload: `${evidence.evidencePayload} ` }

    expect(riskCacheKey(differentPayload)).toBe(riskCacheKey(evidence))
    expect(readRiskCache(differentPayload, storage, nowMs)).toBeNull()
  })

  it('never returns coordinate A data for coordinate B', () => {
    const storage = new MemoryStorage()
    const historical = history([10, 20, 30, 40, 50])
    const coordinateA = environmental()
    const coordinateB = environmental({ coordinateFingerprint: '17.5000,96.0000' })
    cacheResult(coordinateA, historical, storage)

    expect(readRiskCache(buildRiskEvidence(coordinateB, historical), storage, nowMs)).toBeNull()
  })

  it('rejects an expired derived result', () => {
    const storage = new MemoryStorage()
    const current = environmental()
    const historical = history([10, 20, 30, 40, 50])
    cacheResult(current, historical, storage)

    expect(readRiskCache(
      buildRiskEvidence(current, historical),
      storage,
      nowMs + 30 * 60 * 1000 + 1,
    )).toBeNull()
  })

  it('separates all four weather-model identities and rejects the previous cache schema', () => {
    const storage = new MemoryStorage()
    const current = environmental()
    const historical = history([10, 20, 30, 40, 50])
    const evidence = buildRiskEvidence(current, historical)
    const payload = JSON.parse(evidence.evidencePayload) as {
      weather: Record<string, { model: string }>
      historical: {
        requestedCoordinate: { latitude: number; longitude: number }
        returnedModelCoordinate: { latitude: number; longitude: number } | null
      }
    }
    const result = calculateRisk({ environmental: current, historicalBaseline: historical, nowMs })
    storage.setItem(riskCacheKey(evidence), JSON.stringify({
      schemaVersion: RISK_CACHE_SCHEMA_VERSION - 1,
      evidence,
      cachedAt: now,
      expiresAt: new Date(nowMs + 60_000).toISOString(),
      result,
    }))

    expect(Object.keys(payload.weather)).toEqual(['aifs', 'ifs', 'gfs', 'ukmo'])
    expect(payload.historical).toMatchObject({
      requestedCoordinate: { latitude: 16.5, longitude: 95 },
      returnedModelCoordinate: { latitude: 16.5, longitude: 95 },
    })
    expect(RISK_CACHE_SCHEMA_VERSION).toBe(6)
    expect(readRiskCache(evidence, storage, nowMs)).toBeNull()
  })
})

describe('derived risk cache freshness', () => {
  it('recalculates freshness and confidence from current time on a cache hit', () => {
    const storage = new MemoryStorage()
    const current = environmental()
    const historical = history(Array.from({ length: 100 }, (_, index) => index + 1))
    const initial = calculateRiskWithCache({
      environmental: current,
      historicalBaseline: historical,
      nowMs,
    }, storage)
    const laterMs = nowMs + 20 * 60 * 1000
    const later = calculateRiskWithCache({
      environmental: current,
      historicalBaseline: historical,
      nowMs: laterMs,
    }, storage)

    expect(storage.length).toBe(1)
    expect(later.calculatedAt).toBe(new Date(laterMs).toISOString())
    expect(later.freshness.score).toBeLessThan(initial.freshness.score)
    expect(later.confidenceScore).toBeLessThan(initial.confidenceScore)
  })
})
