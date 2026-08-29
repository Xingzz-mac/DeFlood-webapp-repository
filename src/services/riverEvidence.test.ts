import { describe, expect, it, vi } from 'vitest'
import { coordFingerprint } from './cache'
import { buildEnsembleAvailability } from './glofas'
import {
  readRiverEvidenceSelection,
  resolveRiverEvidence,
  riverSpatialCacheKey,
  writeRiverEvidenceSelection,
  type RiverEvidenceDependencies,
} from './riverEvidence'
import { haversineDistanceKm } from './riverSpatial'
import { calculateRisk } from './riskEngine'
import type { HistoricalBaseline } from './riskTypes'
import type {
  EnvironmentalData,
  GeographicCoordinate,
  RiverData,
  RiverDay,
  SourceMetadata,
  WeatherModelData,
} from './types'

const community = { latitude: 15.9, longitude: 97 }
const now = '2026-08-28T00:00:00.000Z'

class MemoryStorage implements Storage {
  private values = new Map<string, string>()
  get length() { return this.values.size }
  clear() { this.values.clear() }
  getItem(key: string) { return this.values.get(key) ?? null }
  key(index: number) { return [...this.values.keys()][index] ?? null }
  removeItem(key: string) { this.values.delete(key) }
  setItem(key: string, value: string) { this.values.set(key, value) }
}

function metadata(status: SourceMetadata['status'] = 'live'): SourceMetadata {
  return {
    status,
    retrievedAt: now,
    lastSuccessfulAt: status === 'live' ? now : null,
    cachedAt: null,
    ageMs: status === 'live' ? 0 : null,
    cached: false,
    coordinateFingerprint: coordFingerprint(community.latitude, community.longitude),
    error: null,
    refreshAttempt: null,
  }
}

function river(
  modelCoordinate: GeographicCoordinate | null,
  discharge: number | null,
  lookupMode: RiverData['riverLookupMode'],
): RiverData {
  const days: RiverDay[] = [0, 1, 2].map(index => ({
    date: `2026-08-${String(index + 28).padStart(2, '0')}`,
    discharge: discharge === null ? null : discharge + index,
    mean: null,
    median: null,
    maximum: null,
    p25: null,
    p75: null,
  }))
  const usable = discharge !== null
  return {
    unit: 'm³/s',
    days,
    primaryValidDays: usable ? 3 : 0,
    primaryUsable: usable,
    peakDischarge: usable ? discharge + 2 : null,
    peakDate: usable ? '2026-08-30' : null,
    trend: usable ? 'rising' : 'unavailable',
    ensembleAvailability: buildEnsembleAvailability(days),
    communityCoordinate: community,
    riverModelCoordinate: modelCoordinate,
    riverModelDistanceKm: modelCoordinate
      ? haversineDistanceKm(community, modelCoordinate)
      : null,
    riverLookupMode: lookupMode,
    metadata: metadata(usable ? 'live' : 'unavailable'),
  }
}

function baseline(
  coordinate: GeographicCoordinate,
  status: HistoricalBaseline['status'] = 'available',
): HistoricalBaseline {
  return {
    status,
    coordinateFingerprint: coordFingerprint(coordinate.latitude, coordinate.longitude),
    calendarMonth: 8,
    values: status === 'available' ? Array(100).fill(10) : [],
    validSampleCount: status === 'available' ? 100 : 0,
    distinctYears: status === 'available' ? 10 : 0,
    firstValidDate: status === 'available' ? '1984-08-01' : null,
    lastValidDate: status === 'available' ? '2025-08-31' : null,
    unit: 'm³/s',
    sourceId: 'test',
    schemaVersion: 2,
    retrievedAt: now,
    lastSuccessfulAt: status === 'available' ? now : null,
    cachedAt: null,
    cached: false,
    error: status === 'available' ? null : 'insufficient history',
  }
}

function dependencies(overrides: Partial<RiverEvidenceDependencies> = {}): RiverEvidenceDependencies {
  return {
    fetchNearbyCurrent: vi.fn().mockResolvedValue([]),
    fetchOneHistorical: vi.fn(),
    fetchManyHistorical: vi.fn().mockResolvedValue([]),
    readHistorical: vi.fn().mockReturnValue(null),
    ...overrides,
  }
}

function weather(): WeatherModelData {
  return {
    label: 'test',
    model: 'test',
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
    metadata: metadata(),
  }
}

describe('aligned current and historical GloFAS selection', () => {
  it('keeps a usable exact coordinate and performs no nearby search', async () => {
    const exact = river(community, 20, 'EXACT_QUERY')
    const fetchNearbyCurrent = vi.fn()
    const deps = dependencies({
      fetchNearbyCurrent,
      readHistorical: vi.fn().mockReturnValue(baseline(community)),
    })

    const selected = await resolveRiverEvidence(community, exact, undefined, undefined, deps)

    expect(selected.river.riverLookupMode).toBe('EXACT_QUERY')
    expect(selected.river.riverModelCoordinate).toEqual(community)
    expect(fetchNearbyCurrent).not.toHaveBeenCalled()
    expect(deps.fetchManyHistorical).not.toHaveBeenCalled()
  })

  it('falls back to the nearest eligible point and keeps current/history coordinates aligned', async () => {
    const nearer = { latitude: 15.95, longitude: 97 }
    const farther = { latitude: 16, longitude: 97 }
    const deps = dependencies({
      fetchNearbyCurrent: vi.fn().mockResolvedValue([
        river(farther, 1_000, 'NEARBY_SEARCH'),
        river(nearer, 10, 'NEARBY_SEARCH'),
      ]),
      fetchManyHistorical: vi.fn().mockResolvedValue([
        baseline(farther),
        baseline(nearer),
      ]),
    })

    const selected = await resolveRiverEvidence(
      community,
      river(null, null, 'UNAVAILABLE'),
      undefined,
      undefined,
      deps,
    )

    expect(selected.river.riverLookupMode).toBe('NEARBY_SEARCH')
    expect(selected.river.riverModelCoordinate).toEqual(nearer)
    expect(selected.river.peakDischarge).toBe(12)
    expect(selected.historicalBaseline.coordinateFingerprint).toBe(
      coordFingerprint(nearer.latitude, nearer.longitude),
    )
    expect(deps.fetchNearbyCurrent).toHaveBeenCalledTimes(1)
    expect(deps.fetchManyHistorical).toHaveBeenCalledTimes(1)
  })

  it('searches nearby when exact current is usable but exact same-point history is not', async () => {
    const nearby = { latitude: 15.95, longitude: 97 }
    const deps = dependencies({
      readHistorical: vi.fn((latitude: number, longitude: number) => (
        coordFingerprint(latitude, longitude) === coordFingerprint(community.latitude, community.longitude)
          ? baseline(community, 'unavailable')
          : null
      )),
      fetchNearbyCurrent: vi.fn().mockResolvedValue([river(nearby, 10, 'NEARBY_SEARCH')]),
      fetchManyHistorical: vi.fn().mockResolvedValue([baseline(nearby)]),
    })

    const selected = await resolveRiverEvidence(
      community,
      river(community, 20, 'EXACT_QUERY'),
      undefined,
      undefined,
      deps,
    )

    expect(selected.river.riverLookupMode).toBe('NEARBY_SEARCH')
    expect(selected.river.riverModelCoordinate).toEqual(nearby)
    expect(selected.historicalBaseline.coordinateFingerprint).toBe(
      coordFingerprint(nearby.latitude, nearby.longitude),
    )
    expect(deps.fetchNearbyCurrent).toHaveBeenCalledTimes(1)
  })

  it('returns UNAVAILABLE when no current/history pair is eligible', async () => {
    const candidate = { latitude: 15.95, longitude: 97 }
    const selected = await resolveRiverEvidence(
      community,
      river(null, null, 'UNAVAILABLE'),
      undefined,
      undefined,
      dependencies({
        fetchNearbyCurrent: vi.fn().mockResolvedValue([river(candidate, 10, 'NEARBY_SEARCH')]),
        fetchManyHistorical: vi.fn().mockResolvedValue([baseline(candidate, 'unavailable')]),
      }),
    )

    expect(selected.river.riverLookupMode).toBe('UNAVAILABLE')
    expect(selected.river.riverModelCoordinate).toBeNull()
    expect(selected.river.days.every(day => day.discharge === null)).toBe(true)
    expect(selected.river.metadata.error).toBe(
      'No usable GloFAS river point was found within the nearby search radius.',
    )

    const environmental: EnvironmentalData = {
      location: community,
      fingerprint: coordFingerprint(community.latitude, community.longitude),
      weatherModels: { aifs: weather(), ifs: weather(), gfs: weather(), ukmo: weather() },
      river: selected.river,
      terrain: { unit: 'm', elevation: 8, metadata: metadata() },
      retrievedAt: now,
      status: 'partial',
      stale: false,
    }
    expect(calculateRisk({
      environmental,
      historicalBaseline: selected.historicalBaseline,
      nowMs: Date.parse(now),
    }).calculationStatus).toBe('INCOMPLETE')
  })

  it('separates cached selections by community, model coordinate, and provenance', () => {
    const storage = new MemoryStorage()
    const firstModel = { latitude: 15.95, longitude: 97 }
    const secondModel = { latitude: 15.9, longitude: 97.05 }
    const first = { river: river(firstModel, 10, 'NEARBY_SEARCH'), historicalBaseline: baseline(firstModel) }
    const second = { river: river(secondModel, 20, 'NEARBY_SEARCH'), historicalBaseline: baseline(secondModel) }

    writeRiverEvidenceSelection(first, storage, now)
    writeRiverEvidenceSelection(second, storage, now)

    const communityFingerprint = coordFingerprint(community.latitude, community.longitude)
    const firstKey = riverSpatialCacheKey(
      communityFingerprint,
      coordFingerprint(firstModel.latitude, firstModel.longitude),
      'NEARBY_SEARCH',
      8,
    )
    const secondKey = riverSpatialCacheKey(
      communityFingerprint,
      coordFingerprint(secondModel.latitude, secondModel.longitude),
      'NEARBY_SEARCH',
      8,
    )
    expect(firstKey).not.toBe(secondKey)
    expect(storage.getItem(firstKey)).not.toBeNull()
    expect(storage.getItem(secondKey)).not.toBeNull()
    expect(readRiverEvidenceSelection(community, 8, storage, Date.parse(now))
      ?.river.riverModelCoordinate).toEqual(secondModel)
    expect(readRiverEvidenceSelection(
      { latitude: 16.5, longitude: 95 },
      8,
      storage,
      Date.parse(now),
    )).toBeNull()
  })
})
