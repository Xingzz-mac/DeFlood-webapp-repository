import { act, create, type ReactTestRendererJSON } from 'react-test-renderer'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { CommunityData } from '../context/CommunityContext'
import { DEMO_RISK_FIXTURES } from '../services/riskScenarios'
import type { EnvironmentalData, RiverData } from '../services/types'
import FloodMap from './FloodMap'
import type { MapDeviceLocation } from './GeographicEvidenceMap'
import {
  FLOOD_MAP_CONTAINER_CLASS,
  OPENSTREETMAP_ATTRIBUTION,
  OPENSTREETMAP_TILE_URL,
} from './floodMapConfig'
import type { FloodMapViewModel } from './floodMapData'

const mocks = vi.hoisted(() => ({
  useCommunity: vi.fn(),
  useRisk: vi.fn(),
  map: vi.fn((_props: unknown) => null),
  updateCommunity: vi.fn(),
}))

vi.mock('../context/CommunityContext', () => ({ useCommunity: mocks.useCommunity }))
vi.mock('../context/RiskContext', () => ({ useRisk: mocks.useRisk }))
vi.mock('./GeographicEvidenceMap', () => ({ default: mocks.map }))

const community: CommunityData = {
  name: 'Coordinate Test Community',
  township: 'Test Township',
  region: 'Test Region',
  population: 2000,
  children: 300,
  elderly: 150,
  disabled: 50,
  otherVulnerable: 25,
  leader: 'Leader',
  mayor: 'Mayor',
  assistant: 'Assistant',
  phone: '000',
  volunteers: 20,
  cars: 2,
  trucks: 1,
  boats: 1,
  shelters: 2,
  shelterCapacity: 1000,
  water: 'Adequate',
  food: 'Adequate',
  medicine: 'Adequate',
  equipment: 'Adequate',
  latitude: 16.8661,
  longitude: 96.1951,
  locationSource: 'gps',
  locationAccuracy: 18,
  locationUpdatedAt: '2026-08-30T00:00:00.000Z',
}

function pageText(node: ReactTestRendererJSON | ReactTestRendererJSON[] | string | null): string {
  if (node === null) return ''
  if (typeof node === 'string') return node
  if (Array.isArray(node)) return node.map(pageText).join(' ')
  return (node.children ?? []).map(child => typeof child === 'string' ? child : pageText(child)).join(' ')
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
    communityCoordinate: { latitude: community.latitude, longitude: community.longitude },
    riverModelCoordinate: { latitude: 16.875, longitude: 96.21 },
    riverModelDistanceKm: 1.9,
    riverLookupMode: 'EXACT_QUERY',
    metadata: {
      status: 'live',
      retrievedAt: '2026-08-30T00:00:00.000Z',
      lastSuccessfulAt: '2026-08-30T00:00:00.000Z',
      cachedAt: null,
      ageMs: 0,
      cached: false,
      coordinateFingerprint: '16.8661,96.1951',
      error: null,
      refreshAttempt: null,
    },
    ...overrides,
  }
}

function riskValue(
  scenario: keyof typeof DEMO_RISK_FIXTURES = 'demo-high',
  currentRiver: RiverData = river(),
) {
  return {
    ...DEMO_RISK_FIXTURES[scenario],
    environmentalData: { river: currentRiver } as EnvironmentalData,
    loading: false,
    error: null,
    refresh: vi.fn(),
  }
}

function latestMapProps(): {
  model: FloodMapViewModel
  locationSource: 'gps' | 'manual'
  deviceLocation: MapDeviceLocation | null
  onDeviceLocationChange: (location: MapDeviceLocation) => void
} {
  return mocks.map.mock.calls.at(-1)?.[0] as {
    model: FloodMapViewModel
    locationSource: 'gps' | 'manual'
    deviceLocation: MapDeviceLocation | null
    onDeviceLocationChange: (location: MapDeviceLocation) => void
  }
}

describe('real geographic Flood Map presentation', () => {
  beforeEach(() => {
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
    mocks.updateCommunity.mockReset()
    mocks.useCommunity.mockReset().mockReturnValue({ community, updateCommunity: mocks.updateCommunity })
    mocks.useRisk.mockReset().mockReturnValue(riskValue())
    mocks.map.mockClear()
  })

  it('passes the saved GPS coordinate to the map and displays GPS provenance and accuracy', async () => {
    let renderer: ReturnType<typeof create> | null = null
    await act(async () => {
      renderer = create(<FloodMap />)
    })

    const mapProps = latestMapProps()
    expect(mapProps.model.center).toEqual({ latitude: 16.8661, longitude: 96.1951 })
    expect(mapProps.model.communityPoint?.coordinate).toEqual(mapProps.model.center)
    expect(mapProps.locationSource).toBe('gps')
    const text = pageText(renderer!.toJSON())
    expect(text).toContain('Location source GPS')
    expect(text).toContain('Reported accuracy ±18 m')
    await act(async () => renderer?.unmount())
  })

  it('displays manual provenance without inventing GPS accuracy', async () => {
    mocks.useCommunity.mockReturnValue({
      community: { ...community, locationSource: 'manual', locationAccuracy: null },
    })
    let renderer: ReturnType<typeof create> | null = null
    await act(async () => {
      renderer = create(<FloodMap />)
    })

    const text = pageText(renderer!.toJSON())
    expect(text).toContain('Location source Manual')
    expect(text).not.toContain('Reported accuracy')
    await act(async () => renderer?.unmount())
  })

  it('updates the map model when CommunityContext supplies a newly saved coordinate', async () => {
    let renderer: ReturnType<typeof create> | null = null
    await act(async () => {
      renderer = create(<FloodMap />)
    })
    expect(latestMapProps().model.center).toEqual({ latitude: 16.8661, longitude: 96.1951 })

    mocks.useCommunity.mockReturnValue({
      community: { ...community, latitude: 15.9, longitude: 97, locationSource: 'manual' },
    })
    await act(async () => {
      renderer?.update(<FloodMap />)
    })

    expect(latestMapProps().model.center).toEqual({ latitude: 15.9, longitude: 97 })
    await act(async () => renderer?.unmount())
  })

  it('shows only real shared spatial evidence and truthful layer explanations', async () => {
    let renderer: ReturnType<typeof create> | null = null
    await act(async () => {
      renderer = create(<FloodMap />)
    })
    const text = pageText(renderer!.toJSON()).replace(/\s+/g, ' ')

    expect(text).toContain('GloFAS modeled river point')
    expect(text).toContain('The exact community query returned this GloFAS grid point, 1.9 km from the community.')
    expect(text).toContain('River-data search radius: 15 km')
    expect(text).toContain('not flood extent')
    expect(text).toContain('Evidence-distance line')
    expect(text).toContain('not a route or river')
    expect(text).not.toContain('Shelter A')
    expect(text).not.toContain('Sample flood overlay')
    expect(text).not.toContain('Sample high')
    await act(async () => renderer?.unmount())
  })

  it('keeps the real map and radius for LIMITED assessment without a fake river marker', async () => {
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
    const limited = {
      ...riskValue('demo-medium', unavailableRiver),
      calculationStatus: 'INCOMPLETE' as const,
      hazardScore: null,
      hazardLevel: null,
    }
    mocks.useRisk.mockReturnValue(limited)
    let renderer: ReturnType<typeof create> | null = null
    await act(async () => {
      renderer = create(<FloodMap />)
    })
    const text = pageText(renderer!.toJSON()).replace(/\s+/g, ' ')

    expect(latestMapProps().model.center).toEqual({ latitude: 16.8661, longitude: 96.1951 })
    expect(latestMapProps().model.riverPoint).toBeNull()
    expect(text).toContain('LIMITED FLOOD ASSESSMENT')
    expect(text).toContain('Rainfall evidence is available, but representative river evidence is not.')
    expect(text).toContain('No representative GloFAS river point was found within the nearby search radius.')
    expect(text).toContain('River-data search radius: 15 km')
    await act(async () => renderer?.unmount())
  })

  it('distinguishes demo risk from shared spatial evidence', async () => {
    let renderer: ReturnType<typeof create> | null = null
    await act(async () => {
      renderer = create(<FloodMap />)
    })
    expect(pageText(renderer!.toJSON()).replace(/\s+/g, ' ')).toContain(
      'Demo risk scenario — map coordinates and river markers continue to use shared live spatial/environmental evidence.',
    )
    await act(async () => renderer?.unmount())
  })

  it('introduces no environmental request and keeps controls structurally usable on mobile', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch')
    let renderer: ReturnType<typeof create> | null = null
    await act(async () => {
      renderer = create(<FloodMap />)
    })

    expect(fetchSpy).not.toHaveBeenCalled()
    expect(mocks.map).toHaveBeenCalledTimes(1)
    expect(FLOOD_MAP_CONTAINER_CLASS).toContain('h-[420px]')
    expect(FLOOD_MAP_CONTAINER_CLASS).toContain('md:h-[560px]')
    expect(renderer!.root.findAllByType('fieldset')).toHaveLength(1)
    fetchSpy.mockRestore()
    await act(async () => renderer?.unmount())
  })

  it('keeps a located device position separate from the saved assessment location', async () => {
    const currentRisk = riskValue()
    mocks.useRisk.mockReturnValue(currentRisk)
    let renderer: ReturnType<typeof create> | null = null
    await act(async () => {
      renderer = create(<FloodMap />)
    })
    expect(pageText(renderer!.toJSON())).not.toContain('Your current device location')
    const deviceLocation: MapDeviceLocation = {
      coordinate: { latitude: 17.01, longitude: 96.11 },
      accuracy: 14,
    }
    await act(async () => latestMapProps().onDeviceLocationChange(deviceLocation))

    expect(latestMapProps().deviceLocation).toEqual(deviceLocation)
    expect(latestMapProps().model.center).toEqual({ latitude: 16.8661, longitude: 96.1951 })
    expect(mocks.updateCommunity).not.toHaveBeenCalled()
    expect(currentRisk.refresh).not.toHaveBeenCalled()
    expect(pageText(renderer!.toJSON()).replace(/\s+/g, ' ')).toContain(
      'Your current device location : Temporary map-navigation position only; the saved assessment location remains unchanged',
    )
    await act(async () => renderer?.unmount())
  })

  it('uses the existing DeFlood globe branding in a decorative, non-chatbot guide slot', async () => {
    let renderer: ReturnType<typeof create> | null = null
    await act(async () => {
      renderer = create(<FloodMap />)
    })
    const text = pageText(renderer!.toJSON()).replace(/\s+/g, ' ')

    expect(text).toContain('DeFlood Guide')
    expect(text).toContain("Map markers show where DeFlood's environmental evidence comes from.")
    expect(text).not.toContain('ChatGPT')
    expect(renderer!.root.findAll(node => node.props['data-guide-artwork-slot'] !== undefined)).toHaveLength(1)
    await act(async () => renderer?.unmount())
  })

  it('uses the policy-compliant OpenStreetMap tile endpoint and visible attribution text', () => {
    expect(OPENSTREETMAP_TILE_URL).toBe('https://tile.openstreetmap.org/{z}/{x}/{y}.png')
    expect(OPENSTREETMAP_ATTRIBUTION).toContain('OpenStreetMap')
    expect(OPENSTREETMAP_ATTRIBUTION).toContain('contributors')
  })
})
