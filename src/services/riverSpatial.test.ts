import { describe, expect, it } from 'vitest'
import { buildEnsembleAvailability } from './glofas'
import {
  haversineDistanceKm,
  nearbyRiverCandidates,
  RIVER_MAX_SEARCH_DISTANCE_KM,
  riverSpatialQualityFactor,
  selectNearestAlignedRiverCandidate,
} from './riverSpatial'
import type { HistoricalBaseline } from './riskTypes'
import type { GeographicCoordinate, RiverData, RiverDay, SourceMetadata } from './types'
import { coordFingerprint } from './cache'

const community = { latitude: 15.9, longitude: 97 }
const now = '2026-08-28T00:00:00.000Z'

function metadata(): SourceMetadata {
  return {
    status: 'live',
    retrievedAt: now,
    lastSuccessfulAt: now,
    cachedAt: null,
    ageMs: 0,
    cached: false,
    coordinateFingerprint: coordFingerprint(community.latitude, community.longitude),
    error: null,
    refreshAttempt: null,
  }
}

function river(model: GeographicCoordinate, discharge: number): RiverData {
  const days: RiverDay[] = [0, 1, 2].map(index => ({
    date: `2026-08-${String(index + 28).padStart(2, '0')}`,
    discharge: discharge + index,
    mean: null,
    median: null,
    maximum: null,
    p25: null,
    p75: null,
  }))
  return {
    unit: 'm³/s',
    days,
    primaryValidDays: 3,
    primaryUsable: true,
    peakDischarge: discharge + 2,
    peakDate: '2026-08-30',
    trend: 'rising',
    ensembleAvailability: buildEnsembleAvailability(days),
    communityCoordinate: community,
    riverModelCoordinate: model,
    riverModelDistanceKm: haversineDistanceKm(community, model),
    riverLookupMode: 'NEARBY_SEARCH',
    metadata: metadata(),
  }
}

function baseline(model: GeographicCoordinate): HistoricalBaseline {
  return {
    status: 'available',
    requestedCoordinate: model,
    returnedModelCoordinate: model,
    coordinateFingerprint: coordFingerprint(model.latitude, model.longitude),
    calendarMonth: 8,
    values: Array(100).fill(10),
    validSampleCount: 100,
    distinctYears: 10,
    firstValidDate: '1984-08-01',
    lastValidDate: '2025-08-31',
    unit: 'm³/s',
    sourceId: 'test',
    schemaVersion: 3,
    retrievedAt: now,
    lastSuccessfulAt: now,
    cachedAt: null,
    cached: false,
    error: null,
  }
}

describe('GloFAS spatial candidate selection', () => {
  it('uses a deterministic 12-point nearby pattern bounded by 15 km', () => {
    const candidates = nearbyRiverCandidates(community)

    expect(candidates).toHaveLength(12)
    expect(new Set(candidates.map(candidate => coordFingerprint(candidate.latitude, candidate.longitude))).size).toBe(12)
    expect(candidates.every(candidate => (
      haversineDistanceKm(community, candidate) <= RIVER_MAX_SEARCH_DISTANCE_KM
    ))).toBe(true)
  })

  it('calculates Haversine distance correctly', () => {
    expect(haversineDistanceKm(community, { latitude: 16, longitude: 97 })).toBeCloseTo(11.12, 1)
    expect(haversineDistanceKm(community, community)).toBe(0)
  })

  it('selects the nearest aligned candidate, not the candidate with higher discharge', () => {
    const nearer = { latitude: 15.95, longitude: 97 }
    const farther = { latitude: 16, longitude: 97 }
    const selected = selectNearestAlignedRiverCandidate(community, [
      { river: river(farther, 9_999), historicalBaseline: baseline(farther), requestIndex: 0 },
      { river: river(nearer, 5), historicalBaseline: baseline(nearer), requestIndex: 1 },
    ])

    expect(selected?.river.riverModelCoordinate).toEqual(nearer)
    expect(selected?.river.peakDischarge).toBe(7)
  })

  it('rejects candidates outside the maximum radius and coordinate-mismatched history', () => {
    const outside = { latitude: 16.1, longitude: 97 }
    const inside = { latitude: 15.95, longitude: 97 }

    expect(selectNearestAlignedRiverCandidate(community, [
      { river: river(outside, 10), historicalBaseline: baseline(outside), requestIndex: 0 },
    ])).toBeNull()
    expect(selectNearestAlignedRiverCandidate(community, [
      { river: river(inside, 10), historicalBaseline: baseline(outside), requestIndex: 0 },
    ])).toBeNull()
  })

  it('applies spatial quality only inside the existing river completeness component', () => {
    const nearby = river({ latitude: 15.95, longitude: 97 }, 10)
    expect(riverSpatialQualityFactor({
      ...nearby,
      riverLookupMode: 'EXACT_QUERY',
    })).toBe(0.85)
    expect(riverSpatialQualityFactor(nearby)).toBe(0.85)
    expect(riverSpatialQualityFactor({
      ...nearby,
      riverModelCoordinate: community,
      riverModelDistanceKm: 0,
      riverLookupMode: 'EXACT_QUERY',
    })).toBe(1)
    expect(riverSpatialQualityFactor({
      ...nearby,
      riverModelDistanceKm: 3.8,
      riverLookupMode: 'EXACT_QUERY',
    })).toBe(0.95)
    expect(riverSpatialQualityFactor({
      ...nearby,
      riverModelDistanceKm: null,
      riverLookupMode: 'UNAVAILABLE',
    })).toBe(0)
  })
})
