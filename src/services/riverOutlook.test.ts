import { describe, expect, it } from 'vitest'
import type { HistoricalBaseline } from './riskTypes'
import { buildRiverOutlookPoints, deterministicQuantile, historicalReferenceQuantiles } from './riverOutlook'
import type { RiverData, RiverDay, SourceMetadata } from './types'

const metadata: SourceMetadata = {
  status: 'live',
  retrievedAt: '2026-08-08T00:00:00.000Z',
  lastSuccessfulAt: '2026-08-08T00:00:00.000Z',
  cachedAt: null,
  ageMs: 0,
  cached: false,
  coordinateFingerprint: '16.5000,95.0000',
  error: null,
  refreshAttempt: null,
}

function day(date: string, discharge: number | null, p25: number | null = null, p75: number | null = null): RiverDay {
  return { date, discharge, mean: discharge, median: discharge, maximum: discharge, p25, p75 }
}

function river(): RiverData {
  const days = [
    day('2026-08-08', 40, 35, 45),
    day('2026-08-09', null, 36, 46),
    day('2026-08-10', 50, 42, 58),
  ]
  return {
    unit: 'm³/s',
    recentDays: [day('2026-08-06', 30), day('2026-08-07', null)],
    days,
    primaryValidDays: 2,
    primaryUsable: true,
    peakDischarge: 50,
    peakDate: '2026-08-10',
    trend: 'rising',
    ensembleAvailability: {
      mean: { available: true, complete: false, validDays: 2, expectedDays: 7 },
      median: { available: true, complete: false, validDays: 2, expectedDays: 7 },
      maximum: { available: true, complete: false, validDays: 2, expectedDays: 7 },
      p25: { available: true, complete: false, validDays: 3, expectedDays: 7 },
      p75: { available: true, complete: false, validDays: 3, expectedDays: 7 },
    },
    communityCoordinate: { latitude: 16.5, longitude: 95 },
    riverModelCoordinate: { latitude: 16.5, longitude: 95 },
    riverModelDistanceKm: 0,
    riverLookupMode: 'EXACT_QUERY',
    metadata,
  }
}

function baseline(status: HistoricalBaseline['status']): HistoricalBaseline {
  return {
    status,
    coordinateFingerprint: '16.5000,95.0000',
    calendarMonth: 8,
    values: status === 'available' ? Array.from({ length: 101 }, (_, index) => index) : [],
    validSampleCount: status === 'available' ? 101 : 0,
    distinctYears: status === 'available' ? 20 : 0,
    firstValidDate: null,
    lastValidDate: null,
    unit: 'm³/s',
    sourceId: 'test',
    schemaVersion: 1,
    retrievedAt: '2026-08-08T00:00:00.000Z',
    lastSuccessfulAt: status === 'available' ? '2026-08-08T00:00:00.000Z' : null,
    cachedAt: null,
    cached: false,
    error: null,
  }
}

describe('river outlook presentation data', () => {
  it('keeps recent nulls unavailable, joins today, and aligns forecast uncertainty by date', () => {
    const points = buildRiverOutlookPoints(river())

    expect(points).toEqual([
      expect.objectContaining({ date: '2026-08-06', recent: 30, forecast: null, p25: null, p75: null }),
      expect.objectContaining({ date: '2026-08-07', recent: null, forecast: null, p25: null, p75: null }),
      expect.objectContaining({ date: '2026-08-08', recent: 40, forecast: 40, p25: 35, p75: 45, isToday: true }),
      expect.objectContaining({ date: '2026-08-09', recent: null, forecast: null, p25: 36, p75: 46 }),
      expect.objectContaining({ date: '2026-08-10', recent: null, forecast: 50, p25: 42, p75: 58 }),
    ])
    expect(points[1].recent).not.toBe(0)
  })

  it('calculates deterministic display-only historical quantiles only for available baselines', () => {
    expect(deterministicQuantile([100, 0, 50], 0.5)).toBe(50)
    expect(historicalReferenceQuantiles(baseline('available'))).toEqual({ p85: 85, p95: 95 })
    expect(historicalReferenceQuantiles(baseline('unavailable'))).toBeNull()
  })
})
