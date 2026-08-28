import { act, create, type ReactTestRendererJSON } from 'react-test-renderer'
import { describe, expect, it, vi } from 'vitest'
import { DEMO_RISK_FIXTURES } from '../services/riskScenarios'
import type { EnvironmentalData, SourceMetadata, SourceStatus, WeatherModelData } from '../services/types'
import RiskAssessment from './RiskAssessment'

const contextMocks = vi.hoisted(() => ({
  useCommunity: vi.fn(),
  useRisk: vi.fn(),
}))

vi.mock('../context/CommunityContext', () => ({ useCommunity: contextMocks.useCommunity }))
vi.mock('../context/RiskContext', () => ({ useRisk: contextMocks.useRisk }))

function textContent(node: ReactTestRendererJSON | ReactTestRendererJSON[] | string | null): string {
  if (node === null) return ''
  if (typeof node === 'string') return node
  if (Array.isArray(node)) return node.map(textContent).join(' ')
  return (node.children ?? []).map(child => typeof child === 'string' ? child : textContent(child)).join(' ')
}

function metadata(status: SourceStatus): SourceMetadata {
  return {
    status,
    retrievedAt: '2026-08-28T00:00:00.000Z',
    lastSuccessfulAt: status === 'unavailable' ? null : '2026-08-28T00:00:00.000Z',
    cachedAt: status === 'cached' ? '2026-08-28T00:05:00.000Z' : null,
    ageMs: status === 'cached' || status === 'expired' ? 3_600_000 : 0,
    cached: status === 'cached' || status === 'expired',
    coordinateFingerprint: '16.5000,95.0000',
    error: null,
    refreshAttempt: null,
  }
}

function weather(label: string, model: string, status: SourceStatus): WeatherModelData {
  return {
    label,
    model,
    unit: 'mm',
    series: [],
    horizons: [24, 48, 72].map(hours => ({
      hours,
      total: hours,
      expectedHours: hours,
      validHours: hours,
      coverage: 100,
      complete: true,
    })),
    metadata: metadata(status),
  }
}

function fourModelEnvironmentalData(): EnvironmentalData {
  const unavailable = { available: false, complete: false, validDays: 0, expectedDays: 7 }
  return {
    location: { latitude: 16.5, longitude: 95 },
    fingerprint: '16.5000,95.0000',
    weatherModels: {
      aifs: weather('ECMWF AIFS Single — AI Forecast', 'ecmwf_aifs025_single', 'live'),
      ifs: weather('ECMWF IFS HRES — Physics-Based Forecast', 'ecmwf_ifs', 'cached'),
      gfs: weather('NOAA GFS Global — Physics-Based Forecast', 'ncep_gfs_global', 'incomplete'),
      ukmo: weather('UKMO Global 10 km — Physics-Based Forecast', 'ukmo_global_deterministic_10km', 'expired'),
    },
    river: {
      unit: 'm³/s',
      days: [],
      primaryValidDays: 0,
      primaryUsable: false,
      peakDischarge: null,
      peakDate: null,
      trend: 'unavailable',
      ensembleAvailability: {
        mean: { ...unavailable },
        median: { ...unavailable },
        maximum: { ...unavailable },
        p25: { ...unavailable },
        p75: { ...unavailable },
      },
      metadata: metadata('unavailable'),
    },
    terrain: { unit: 'm', elevation: 10, metadata: metadata('live') },
    retrievedAt: '2026-08-28T00:00:00.000Z',
    status: 'partial',
    stale: true,
  }
}

describe('Risk Assessment information hierarchy', () => {
  it('is informative while supporting data is collapsed and gives incomplete-evidence recovery guidance', async () => {
    contextMocks.useCommunity.mockReturnValue({
      community: { name: 'Test Community', latitude: 16.5, longitude: 95 },
    })
    contextMocks.useRisk.mockReturnValue({
      ...DEMO_RISK_FIXTURES['demo-incomplete'],
      contributingFactors: ['Historical same-month river data is unavailable.'],
      environmentalData: null,
      stale: false,
      degraded: true,
      error: null,
      loading: false,
      refresh: vi.fn(),
    })

    let renderer: ReturnType<typeof create> | null = null
    await act(async () => {
      renderer = create(<RiskAssessment onNavigate={vi.fn()} />)
    })
    const root = renderer!.root
    const supportingData = root.findByType('details')
    expect(supportingData.props.open).toBeUndefined()
    const pageText = textContent(renderer!.toJSON())
    expect(pageText).toContain('Flood Hazard')
    expect(pageText).toContain('Data Confidence')
    expect(pageText).toContain('What this means')
    expect(pageText).toContain('Risk cannot be fully calculated')
    expect(pageText).toContain('Review missing evidence or retry unavailable sources')
    expect(pageText).toContain('Modeled river discharge outlook')
    expect(pageText).toContain('River discharge outlook unavailable.')
    expect(pageText).toContain('Why this result')
    expect(pageText).toContain('Why this Flood Hazard score?')
    expect(pageText).toContain('A numeric breakdown is unavailable')
    expect(pageText).not.toContain('Final Flood Hazard score')
    expect(pageText).toContain('Why this Data Confidence score?')
    expect(pageText.indexOf('Modeled river discharge outlook')).toBeLessThan(pageText.indexOf('Why this result'))
    expect(pageText).toContain('Data quality')
    expect(pageText).toContain('AIFS:')
    expect(pageText).toContain('IFS:')
    expect(pageText).toContain('GFS:')
    expect(pageText).toContain('UKMO:')
    await act(async () => renderer?.unmount())
  })

  it('shows all four model statuses, identifiers, horizons, consensus, and agreement in supporting data', async () => {
    contextMocks.useCommunity.mockReturnValue({
      community: { name: 'Test Community', latitude: 16.5, longitude: 95 },
    })
    contextMocks.useRisk.mockReturnValue({
      ...DEMO_RISK_FIXTURES['demo-high'],
      engineVersion: 'test-live-risk-engine',
      environmentalData: fourModelEnvironmentalData(),
      sourceInformation: {
        ...DEMO_RISK_FIXTURES['demo-high'].sourceInformation,
        aifs: 'live',
        ifs: 'live',
        gfs: 'live',
        ukmo: 'live',
      },
      loading: false,
      error: null,
      refresh: vi.fn(),
    })

    let renderer: ReturnType<typeof create> | null = null
    await act(async () => {
      renderer = create(<RiskAssessment onNavigate={vi.fn()} />)
    })
    const pageText = textContent(renderer!.toJSON())
    const normalizedText = pageText.replace(/\s+/g, ' ')

    expect(pageText).toContain('Weather consensus and agreement')
    expect(normalizedText).toContain('Usable models: 4 / 4')
    expect(normalizedText).toContain('4 usable models')
    expect(normalizedText).toContain('AIFS: live')
    expect(normalizedText).toContain('IFS: live')
    expect(normalizedText).toContain('GFS: live')
    expect(normalizedText).toContain('UKMO: live')
    expect(pageText).toContain('ecmwf_aifs025_single')
    expect(pageText).toContain('ecmwf_ifs')
    expect(pageText).toContain('ncep_gfs_global')
    expect(pageText).toContain('ukmo_global_deterministic_10km')
    expect(normalizedText).toContain('Next 24 hours')
    expect(normalizedText).toContain('Next 48 hours')
    expect(normalizedText).toContain('Next 72 hours')
    expect(pageText).toContain('Deterministic score explanation')
    expect(pageText).toContain('Calculated deterministically from verified DeFlood inputs — not generated by AI.')
    expect(pageText).toContain('Why this Flood Hazard score?')
    expect(pageText).toContain('Why this Data Confidence score?')
    expect(pageText).toContain('Four-model rainfall outlook')
    expect(normalizedText).toContain('72h consensus: 190.0 mm')
    for (const item of DEMO_RISK_FIXTURES['demo-high'].hazardBreakdown) {
      expect(normalizedText).toContain(`${item.contribution.toFixed(1)} points`)
    }
    for (const item of DEMO_RISK_FIXTURES['demo-high'].confidenceBreakdown) {
      expect(normalizedText).toContain(`${item.contribution.toFixed(1)} points`)
    }
    await act(async () => renderer?.unmount())
  })

  it('shows an unavailable model as unavailable rather than zero in the 72-hour summary', async () => {
    const base = DEMO_RISK_FIXTURES['demo-high']
    const consensus72 = base.weatherConsensus.horizons.find(horizon => horizon.hours === 72)
    contextMocks.useCommunity.mockReturnValue({
      community: { name: 'Test Community', latitude: 16.5, longitude: 95 },
    })
    contextMocks.useRisk.mockReturnValue({
      ...base,
      engineVersion: 'test-live-risk-engine',
      environmentalData: fourModelEnvironmentalData(),
      weatherConsensus: {
        ...base.weatherConsensus,
        usableModelCount: 3,
        horizons: base.weatherConsensus.horizons.map(horizon => horizon.hours === 72
          ? { ...horizon, modelCount: 3, modelKeys: ['aifs', 'ifs', 'gfs'] }
          : horizon),
      },
      modelAgreement: { ...base.modelAgreement, usableModelCount: 3 },
      sourceInformation: { ...base.sourceInformation, aifs: 'live', ifs: 'live', gfs: 'live', ukmo: 'unavailable' },
      loading: false,
      error: null,
      refresh: vi.fn(),
    })

    let renderer: ReturnType<typeof create> | null = null
    await act(async () => {
      renderer = create(<RiskAssessment onNavigate={vi.fn()} />)
    })
    const normalizedText = textContent(renderer!.toJSON()).replace(/\s+/g, ' ')
    expect(consensus72?.value).toBe(190)
    expect(normalizedText).toContain('Usable models: 3 / 4')
    expect(normalizedText).toContain(
      'UKMO Global 10 km — Physics-Based Forecast Unavailable unavailable',
    )
    await act(async () => renderer?.unmount())
  })
})
