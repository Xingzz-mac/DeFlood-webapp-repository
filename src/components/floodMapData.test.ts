import { describe, expect, it } from 'vitest'
import { DEMO_RISK_FIXTURES } from '../services/riskScenarios'
import type { EnvironmentalData, RiverData } from '../services/types'
import { buildFloodMapViewModel } from './floodMapData'

const community = {
  name: 'Current Community',
  latitude: 16.5,
  longitude: 95,
}

function river(overrides: Partial<RiverData> = {}): RiverData {
  return {
    unit: 'm³/s',
    days: [
      { date: '2026-08-30', discharge: 80, mean: 82, median: 81, maximum: 90, p25: 75, p75: 86 },
      { date: '2026-08-31', discharge: 90, mean: 92, median: 91, maximum: 100, p25: 85, p75: 96 },
    ],
    primaryValidDays: 2,
    primaryUsable: true,
    peakDischarge: 90,
    peakDate: '2026-08-31',
    trend: 'rising',
    ensembleAvailability: {
      mean: { available: true, complete: true, validDays: 2, expectedDays: 2 },
      median: { available: true, complete: true, validDays: 2, expectedDays: 2 },
      maximum: { available: true, complete: true, validDays: 2, expectedDays: 2 },
      p25: { available: true, complete: true, validDays: 2, expectedDays: 2 },
      p75: { available: true, complete: true, validDays: 2, expectedDays: 2 },
    },
    communityCoordinate: { latitude: 16.5, longitude: 95 },
    riverModelCoordinate: { latitude: 16.525002, longitude: 95.025024 },
    riverModelDistanceKm: 3.8,
    riverLookupMode: 'EXACT_QUERY',
    metadata: {
      status: 'live',
      retrievedAt: '2026-08-30T00:00:00.000Z',
      lastSuccessfulAt: '2026-08-30T00:00:00.000Z',
      cachedAt: null,
      ageMs: 0,
      cached: false,
      coordinateFingerprint: '16.5000,95.0000',
      error: null,
      refreshAttempt: null,
    },
    ...overrides,
  }
}

function environmental(currentRiver: RiverData): EnvironmentalData {
  return { river: currentRiver } as EnvironmentalData
}

describe('geographic flood map view model', () => {
  it('uses the saved community coordinate for both map center and community marker', () => {
    const model = buildFloodMapViewModel(
      { ...community, latitude: 16.8661, longitude: 96.1951 },
      DEMO_RISK_FIXTURES['demo-low'],
      null,
    )

    expect(model.center).toEqual({ latitude: 16.8661, longitude: 96.1951 })
    expect(model.communityPoint).toEqual({
      coordinate: { latitude: 16.8661, longitude: 96.1951 },
      label: 'Assessment location',
    })
  })

  it('updates the map center when the saved coordinate changes', () => {
    const first = buildFloodMapViewModel(community, DEMO_RISK_FIXTURES['demo-low'], null)
    const second = buildFloodMapViewModel(
      { ...community, latitude: 15.9, longitude: 97 },
      DEMO_RISK_FIXTURES['demo-low'],
      null,
    )

    expect(first.center).toEqual({ latitude: 16.5, longitude: 95 })
    expect(second.center).toEqual({ latitude: 15.9, longitude: 97 })
  })

  it('uses the existing EXACT_QUERY GloFAS coordinate, distance, and truthful provenance', () => {
    const model = buildFloodMapViewModel(
      community,
      DEMO_RISK_FIXTURES['demo-high'],
      environmental(river()),
    )

    expect(model.riverPoint).toMatchObject({
      coordinate: { latitude: 16.525002, longitude: 95.025024 },
      lookupMode: 'EXACT_QUERY',
      distanceKm: 3.8,
    })
    expect(model.riverPoint?.provenanceText).toBe(
      'The exact community query returned this GloFAS grid point, 3.8 km from the community.',
    )
    expect(model.evidenceLine).toEqual([
      { latitude: 16.5, longitude: 95 },
      { latitude: 16.525002, longitude: 95.025024 },
    ])
  })

  it('uses truthful nearby-search provenance without calling the point a gauge or station', () => {
    const model = buildFloodMapViewModel(
      community,
      DEMO_RISK_FIXTURES['demo-medium'],
      environmental(river({
        riverLookupMode: 'NEARBY_SEARCH',
        riverModelCoordinate: { latitude: 16.55, longitude: 95 },
        riverModelDistanceKm: 5.6,
      })),
    )

    expect(model.riverPoint?.provenanceText).toBe(
      'Nearest usable GloFAS point found by nearby search, 5.6 km from the community.',
    )
    expect(model.riverPoint?.provenanceText).not.toMatch(/gauge|station|sensor/i)
  })

  it('renders no fake GloFAS marker or evidence line when river evidence is unavailable', () => {
    const unavailableRiver = river({
      days: [],
      primaryValidDays: 0,
      primaryUsable: false,
      peakDischarge: null,
      peakDate: null,
      trend: 'unavailable',
      riverModelCoordinate: null,
      riverModelDistanceKm: null,
      riverLookupMode: 'UNAVAILABLE',
    })
    const model = buildFloodMapViewModel(
      community,
      { ...DEMO_RISK_FIXTURES['demo-medium'], calculationStatus: 'INCOMPLETE', hazardScore: null, hazardLevel: null },
      environmental(unavailableRiver),
    )

    expect(model.presentation.label).toBe('LIMITED FLOOD ASSESSMENT')
    expect(model.communityPoint).not.toBeNull()
    expect(model.riverPoint).toBeNull()
    expect(model.evidenceLine).toBeNull()
    expect(model.searchRadiusKm).toBe(15)
    expect(model.riverUnavailableMessage).toBe(
      'No representative GloFAS river point was found within the nearby search radius.',
    )
  })

  it.each([
    ['demo-low', 'LOW'],
    ['demo-medium', 'MEDIUM'],
    ['demo-high', 'HIGH'],
  ] as const)('preserves the shared COMPLETE %s summary as %s', (scenario, label) => {
    const model = buildFloodMapViewModel(
      community,
      DEMO_RISK_FIXTURES[scenario],
      environmental(river()),
    )

    expect(model.presentation).toEqual({ mode: 'COMPLETE', label })
    expect(model.hazardScore).toBe(DEMO_RISK_FIXTURES[scenario].hazardScore)
  })

  it('does not create a valid map location from invalid coordinates', () => {
    const model = buildFloodMapViewModel(
      { ...community, latitude: Number.NaN },
      DEMO_RISK_FIXTURES['demo-low'],
      null,
    )
    expect(model.hasSavedCoordinate).toBe(false)
    expect(model.center).toBeNull()
    expect(model.communityPoint).toBeNull()
  })
})
