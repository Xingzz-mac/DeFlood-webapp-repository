import { act, create, type ReactTestRendererJSON } from 'react-test-renderer'
import { beforeEach, describe, expect, it } from 'vitest'
import type { HistoricalBaseline } from '../services/riskTypes'
import type { RiverData, RiverDay, SourceMetadata } from '../services/types'
import RiverDischargeChart from './RiverDischargeChart'

function pageText(node: ReactTestRendererJSON | ReactTestRendererJSON[] | string | null): string {
  const text = node === null
    ? ''
    : typeof node === 'string'
      ? node
      : Array.isArray(node)
        ? node.map(pageText).join(' ')
        : (node.children ?? []).map(child => typeof child === 'string' ? child : pageText(child)).join(' ')
  return text.replace(/\s+/g, ' ').trim()
}

const metadata: SourceMetadata = {
  status: 'cached',
  retrievedAt: '2026-08-08T00:00:00.000Z',
  lastSuccessfulAt: '2026-08-08T00:00:00.000Z',
  cachedAt: '2026-08-08T00:00:00.000Z',
  ageMs: 60_000,
  cached: true,
  coordinateFingerprint: '16.5000,95.0000',
  error: null,
  refreshAttempt: null,
}

function day(date: string, discharge: number | null, p25: number | null = null, p75: number | null = null): RiverDay {
  return { date, discharge, mean: discharge, median: discharge, maximum: discharge, p25, p75 }
}

const river: RiverData = {
  unit: 'm³/s',
  recentDays: [day('2026-08-06', 30), day('2026-08-07', 34)],
  days: [day('2026-08-08', 40, 35, 45), day('2026-08-09', 50, 42, 58)],
  primaryValidDays: 2,
  primaryUsable: true,
  peakDischarge: 50,
  peakDate: '2026-08-09',
  trend: 'rising',
  ensembleAvailability: {
    mean: { available: true, complete: false, validDays: 2, expectedDays: 7 },
    median: { available: true, complete: false, validDays: 2, expectedDays: 7 },
    maximum: { available: true, complete: false, validDays: 2, expectedDays: 7 },
    p25: { available: true, complete: false, validDays: 2, expectedDays: 7 },
    p75: { available: true, complete: false, validDays: 2, expectedDays: 7 },
  },
  communityCoordinate: { latitude: 16.5, longitude: 95 },
  riverModelCoordinate: { latitude: 16.525002, longitude: 95.025024 },
  riverModelDistanceKm: 3.8,
  riverLookupMode: 'EXACT_QUERY',
  metadata,
}

const historicalBaseline: HistoricalBaseline = {
  status: 'available',
  coordinateFingerprint: '16.5000,95.0000',
  calendarMonth: 8,
  values: Array.from({ length: 101 }, (_, index) => index),
  validSampleCount: 101,
  distinctYears: 20,
  firstValidDate: '1984-08-01',
  lastValidDate: '2025-08-31',
  unit: 'm³/s',
  sourceId: 'test',
  schemaVersion: 1,
  retrievedAt: '2026-08-08T00:00:00.000Z',
  lastSuccessfulAt: '2026-08-08T00:00:00.000Z',
  cachedAt: null,
  cached: false,
  error: null,
}

describe('RiverDischargeChart', () => {
  beforeEach(() => Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true }))

  it('renders recent, forecast, uncertainty, Today, historical references, and truthful source wording', async () => {
    let renderer: ReturnType<typeof create> | null = null
    await act(async () => {
      renderer = create(
        <RiverDischargeChart
          river={river}
          historicalBaseline={historicalBaseline}
          riverPercentile={87.4}
          trendLabel="rising"
          loading={false}
        />,
      )
    })
    const text = pageText(renderer!.toJSON())

    expect(text).toContain('Modeled river discharge outlook')
    expect(text).toContain('Recent modeled')
    expect(text).toContain('Forecast')
    expect(text).toContain('Forecast p25–p75 uncertainty')
    expect(text).toContain('Today')
    expect(text).toContain('Historical 85th percentile reference: 85.0 m³/s')
    expect(text).toContain('Historical 95th percentile reference: 95.0 m³/s')
    expect(text).toContain('Percentile 87.4')
    expect(text).toContain('Cached source')
    expect(text).toContain('River model location: GloFAS grid point 3.8 km from the community.')
    expect(text).toContain('The exact community query returned this modeled grid location.')
    expect(text).toContain('approximately 5 km river grid')
    expect(text).toContain('not a local gauge measurement')
    expect(text).not.toContain('river height')

    const hoverTargets = renderer!.root.findAll(node => node.props.role === 'button')
    await act(async () => hoverTargets[hoverTargets.length - 1].props.onMouseEnter())
    expect(pageText(renderer!.toJSON())).toContain('Forecast p25–p75: 42.0 – 58.0 m³/s')
    await act(async () => renderer?.unmount())
  })

  it('shows nearby GloFAS provenance without describing it as an exact river or gauge', async () => {
    let renderer: ReturnType<typeof create> | null = null
    await act(async () => {
      renderer = create(
        <RiverDischargeChart
          river={{
            ...river,
            riverModelCoordinate: { latitude: 16.55, longitude: 95 },
            riverModelDistanceKm: 6.2,
            riverLookupMode: 'NEARBY_SEARCH',
          }}
          historicalBaseline={historicalBaseline}
          riverPercentile={87.4}
          trendLabel="rising"
          loading={false}
        />,
      )
    })
    const text = pageText(renderer!.toJSON())
    expect(text).toContain('River model location: nearest usable GloFAS point found by nearby search, 6.2 km from the community.')
    expect(text).toContain('nearby modeled river point')
    expect(text).not.toContain("community's exact river")
    expect(text).toContain('not a local gauge measurement')
    await act(async () => renderer?.unmount())
  })

  it('uses truthful compact empty states for demo, expired, and loading data', async () => {
    let renderer: ReturnType<typeof create> | null = null
    await act(async () => {
      renderer = create(
        <RiverDischargeChart
          river={river}
          historicalBaseline={null}
          riverPercentile={null}
          trendLabel={null}
          loading={false}
          demoUnavailable
        />,
      )
    })
    expect(pageText(renderer!.toJSON())).toContain('Demo risk fixtures do not include a verified daily river-discharge series.')

    await act(async () => {
      renderer?.update(
        <RiverDischargeChart
          river={river}
          historicalBaseline={null}
          riverPercentile={null}
          trendLabel={null}
          loading={false}
          expired
        />,
      )
    })
    expect(pageText(renderer!.toJSON())).toContain('River discharge outlook unavailable.')
    expect(pageText(renderer!.toJSON())).toContain('exceeded its freshness limit')

    await act(async () => {
      renderer?.update(
        <RiverDischargeChart
          river={null}
          historicalBaseline={null}
          riverPercentile={null}
          trendLabel={null}
          loading
        />,
      )
    })
    expect(pageText(renderer!.toJSON())).toContain('Loading river discharge outlook…')
    await act(async () => renderer?.unmount())
  })
})
