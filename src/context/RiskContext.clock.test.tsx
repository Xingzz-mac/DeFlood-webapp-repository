import { act, create } from 'react-test-renderer'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ReactTestRenderer } from 'react-test-renderer'
import { CommunityProvider } from './CommunityContext'
import { RiskProvider, useRisk } from './RiskContext'
import { WEATHER_MAX_STALE_MS } from '../services/config'
import { RISK_RECALCULATION_INTERVAL_MS } from '../services/riskConfig'
import type { HistoricalBaseline, RiskResult } from '../services/riskTypes'
import type { EnvironmentalData, RiverDay, SourceMetadata, WeatherModelData } from '../services/types'

const environmentalServiceMocks = vi.hoisted(() => ({
  fetchEnvironmentalData: vi.fn(),
  getCachedEnvData: vi.fn(),
  loadCachedOrStale: vi.fn(),
}))

const historicalServiceMocks = vi.hoisted(() => ({
  fetchHistoricalBaseline: vi.fn(),
  fetchHistoricalBaselines: vi.fn(),
  historicalErrorBaseline: vi.fn(),
  monthFromForecastDate: vi.fn(() => 8),
  readHistoricalBaseline: vi.fn(),
}))

vi.mock('../services/environmentalData', () => environmentalServiceMocks)
vi.mock('../services/historicalGlofas', () => historicalServiceMocks)

const now = '2026-08-19T00:00:00.000Z'
const fingerprint = '16.5000,95.0000'

function metadata(): SourceMetadata {
  return {
    status: 'live',
    retrievedAt: now,
    lastSuccessfulAt: now,
    cachedAt: null,
    ageMs: 0,
    cached: false,
    coordinateFingerprint: fingerprint,
    error: null,
    refreshAttempt: null,
  }
}

function weather(): WeatherModelData {
  return {
    label: 'test',
    model: 'test-model',
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

function riverDays(): RiverDay[] {
  return [70, 80, 90].map((discharge, index) => ({
    date: `2026-08-${String(index + 19).padStart(2, '0')}`,
    discharge,
    mean: discharge,
    median: discharge,
    maximum: discharge * 1.2,
    p25: discharge * 0.9,
    p75: discharge * 1.1,
  }))
}

function environmentalFixture(): EnvironmentalData {
  const days = riverDays()
  return {
    location: { latitude: 16.5, longitude: 95 },
    fingerprint,
    weatherModels: { aifs: weather(), ifs: weather(), gfs: weather(), ukmo: weather() },
    river: {
      unit: 'm³/s',
      days,
      primaryValidDays: 3,
      primaryUsable: true,
      peakDischarge: 90,
      peakDate: '2026-08-21',
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
      metadata: metadata(),
    },
    terrain: { unit: 'm', elevation: 8, metadata: metadata() },
    retrievedAt: now,
    status: 'live',
    stale: false,
  }
}

function historicalFixture(): HistoricalBaseline {
  const values = Array.from({ length: 100 }, (_, index) => index + 1)
  return {
    status: 'available',
    coordinateFingerprint: fingerprint,
    calendarMonth: 8,
    values,
    validSampleCount: values.length,
    distinctYears: 20,
    firstValidDate: '1984-08-01',
    lastValidDate: '2025-08-31',
    unit: 'm³/s',
    sourceId: 'test-history',
    schemaVersion: 2,
    retrievedAt: now,
    lastSuccessfulAt: now,
    cachedAt: null,
    cached: false,
    error: null,
  }
}

describe('RiskProvider freshness clock', () => {
  beforeEach(() => {
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
    vi.useFakeTimers()
    vi.setSystemTime(new Date(now))
    const environmental = environmentalFixture()
    environmentalServiceMocks.fetchEnvironmentalData.mockReset().mockResolvedValue(environmental)
    environmentalServiceMocks.getCachedEnvData.mockReset().mockReturnValue(environmental)
    environmentalServiceMocks.loadCachedOrStale.mockReset().mockReturnValue(null)
    historicalServiceMocks.fetchHistoricalBaseline.mockReset()
    historicalServiceMocks.fetchHistoricalBaselines.mockReset()
    historicalServiceMocks.historicalErrorBaseline.mockReset()
    historicalServiceMocks.monthFromForecastDate.mockClear()
    historicalServiceMocks.readHistoricalBaseline.mockReset().mockReturnValue(historicalFixture())
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('recalculates time-dependent risk without refetching evidence and cleans up its timer', async () => {
    let latestRisk: RiskResult | null = null
    function Consumer() {
      latestRisk = useRisk()
      return null
    }

    let renderer: ReactTestRenderer | null = null
    await act(async () => {
      renderer = create(
        <CommunityProvider>
          <RiskProvider>
            <Consumer />
          </RiskProvider>
        </CommunityProvider>,
      )
      await Promise.resolve()
    })

    const initial = latestRisk as RiskResult | null
    expect(initial?.calculationStatus).toBe('COMPLETE')
    expect(initial?.calculatedAt).toBe(now)
    expect(environmentalServiceMocks.fetchEnvironmentalData).toHaveBeenCalledTimes(1)
    expect(historicalServiceMocks.fetchHistoricalBaseline).not.toHaveBeenCalled()
    expect(historicalServiceMocks.readHistoricalBaseline).toHaveBeenCalledTimes(1)
    expect(vi.getTimerCount()).toBe(1)

    await act(async () => {
      await vi.advanceTimersByTimeAsync(RISK_RECALCULATION_INTERVAL_MS * 10)
    })

    const updated = latestRisk as RiskResult | null
    expect(updated?.calculatedAt).toBe(new Date(Date.parse(now) + RISK_RECALCULATION_INTERVAL_MS * 10).toISOString())
    expect(updated?.freshness.score).toBeLessThan(initial?.freshness.score ?? 0)
    expect(updated?.confidenceScore).toBeLessThan(initial?.confidenceScore ?? 0)
    expect(environmentalServiceMocks.fetchEnvironmentalData).toHaveBeenCalledTimes(1)
    expect(historicalServiceMocks.fetchHistoricalBaseline).not.toHaveBeenCalled()
    expect(historicalServiceMocks.readHistoricalBaseline).toHaveBeenCalledTimes(1)

    await act(async () => renderer?.unmount())
    expect(vi.getTimerCount()).toBe(0)
  })

  it('expires current evidence from the local clock without starting a periodic fetch loop', async () => {
    let latestRisk: RiskResult | null = null
    function Consumer() {
      latestRisk = useRisk()
      return null
    }

    let renderer: ReactTestRenderer | null = null
    await act(async () => {
      renderer = create(
        <CommunityProvider>
          <RiskProvider>
            <Consumer />
          </RiskProvider>
        </CommunityProvider>,
      )
      await Promise.resolve()
    })

    expect((latestRisk as RiskResult | null)?.calculationStatus).toBe('COMPLETE')
    expect(environmentalServiceMocks.fetchEnvironmentalData).toHaveBeenCalledTimes(1)

    await act(async () => {
      await vi.advanceTimersByTimeAsync(
        WEATHER_MAX_STALE_MS + RISK_RECALCULATION_INTERVAL_MS,
      )
    })

    const expired = latestRisk as RiskResult | null
    expect(expired?.freshness.sources.aifs.usable).toBe(false)
    expect(expired?.freshness.sources.ifs.usable).toBe(false)
    expect(expired?.freshness.sources.gfs.usable).toBe(false)
    expect(expired?.freshness.sources.ukmo.usable).toBe(false)
    expect(expired?.calculationStatus).toBe('INCOMPLETE')
    expect(expired?.hazardScore).toBeNull()
    expect(environmentalServiceMocks.fetchEnvironmentalData).toHaveBeenCalledTimes(1)
    expect(historicalServiceMocks.fetchHistoricalBaseline).not.toHaveBeenCalled()
    expect(historicalServiceMocks.readHistoricalBaseline).toHaveBeenCalledTimes(1)

    await act(async () => renderer?.unmount())
  })
})
