import { describe, expect, it } from 'vitest'
import { calculateModelAgreement } from './modelAgreement'
import type { SourceMetadata, WeatherModelData } from './types'

const fingerprint = '16.5000,95.0000'

function model(totals: [number, number, number] | null): WeatherModelData {
  const usable = totals !== null
  const metadata: SourceMetadata = {
    status: usable ? 'live' : 'unavailable',
    retrievedAt: '2026-08-19T00:00:00.000Z',
    lastSuccessfulAt: usable ? '2026-08-19T00:00:00.000Z' : null,
    cachedAt: null,
    ageMs: usable ? 0 : null,
    cached: false,
    coordinateFingerprint: fingerprint,
    error: null,
    refreshAttempt: null,
  }
  return {
    label: 'test',
    model: 'test',
    unit: 'mm',
    series: [],
    horizons: ([24, 48, 72] as const).map((hours, index) => ({
      hours,
      total: totals?.[index] ?? null,
      expectedHours: hours,
      validHours: usable ? hours : 0,
      coverage: usable ? 100 : 0,
      complete: usable,
    })),
    metadata,
  }
}

describe('AIFS and IFS agreement', () => {
  it('calculates agreement when both models are usable', () => {
    const result = calculateModelAgreement(model([10, 20, 40]), model([20, 20, 20]))

    expect(result.weightedDifference).toBeCloseTo(
      (10 / 15) * 0.5 + 0 * 0.3 + (20 / 30) * 0.2,
    )
    expect(result.label).toBe('Weak')
  })

  it('reports a single usable AIFS model', () => {
    const result = calculateModelAgreement(model([20, 40, 60]), model(null))

    expect(result.score).toBeNull()
    expect(result.weightedDifference).toBeNull()
    expect(result.label).toBe('Unavailable — single weather model')
  })

  it('reports a single usable IFS model', () => {
    const result = calculateModelAgreement(model(null), model([20, 40, 60]))

    expect(result.score).toBeNull()
    expect(result.weightedDifference).toBeNull()
    expect(result.label).toBe('Unavailable — single weather model')
  })

  it('reports that neither model is usable without implying one is available', () => {
    const result = calculateModelAgreement(model(null), model(null))

    expect(result.score).toBeNull()
    expect(result.weightedDifference).toBeNull()
    expect(result.label).toBe('Unavailable — no usable weather models')
  })

  it.each([
    [0.15, 'Strong'],
    [0.151, 'Moderate'],
    [0.3, 'Moderate'],
    [0.301, 'Weak'],
    [0.5, 'Weak'],
    [0.501, 'Poor'],
  ] as const)('labels a weighted difference of %s as %s', (ratio, label) => {
    const low = 100 * (1 - ratio / 2)
    const high = 100 * (1 + ratio / 2)
    expect(calculateModelAgreement(
      model([low, low, low]),
      model([high, high, high]),
    ).label).toBe(label)
  })
})
