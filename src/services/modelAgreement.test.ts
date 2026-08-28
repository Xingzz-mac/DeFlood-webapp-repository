import { describe, expect, it } from 'vitest'
import { buildWeatherConsensus, calculateModelAgreement } from './modelAgreement'
import type {
  SourceMetadata,
  WeatherModelData,
  WeatherModelKey,
  WeatherModels,
} from './types'

const fingerprint = '16.5000,95.0000'

function model(
  totals: [number, number, number] | null,
  incompleteHours: number[] = [],
): WeatherModelData {
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
    horizons: ([24, 48, 72] as const).map((hours, index) => {
      const complete = usable && !incompleteHours.includes(hours)
      return {
        hours,
        total: complete ? totals[index] : null,
        expectedHours: hours,
        validHours: complete ? hours : 0,
        coverage: complete ? 100 : 0,
        complete,
      }
    }),
    metadata,
  }
}

function models(overrides: Partial<Record<WeatherModelKey, WeatherModelData>> = {}): WeatherModels {
  const defaultModel = model([20, 40, 60])
  return {
    aifs: overrides.aifs ?? defaultModel,
    ifs: overrides.ifs ?? defaultModel,
    gfs: overrides.gfs ?? defaultModel,
    ukmo: overrides.ukmo ?? defaultModel,
  }
}

describe('four-model rainfall consensus', () => {
  it('uses the median for four usable models and resists one extreme outlier', () => {
    const result = buildWeatherConsensus(models({
      aifs: model([10, 20, 30]),
      ifs: model([11, 21, 31]),
      gfs: model([12, 22, 32]),
      ukmo: model([1000, 2000, 3000]),
    }))

    expect(result.usableModelCount).toBe(4)
    expect(result.horizons.map(horizon => horizon.value)).toEqual([11.5, 21.5, 31.5])
  })

  it('uses the median for three usable models', () => {
    const result = buildWeatherConsensus(models({
      aifs: model([10, 20, 30]),
      ifs: model([30, 40, 50]),
      gfs: model([20, 30, 40]),
      ukmo: model(null),
    }))

    expect(result.usableModelCount).toBe(3)
    expect(result.horizons.map(horizon => horizon.value)).toEqual([20, 30, 40])
  })

  it('uses the arithmetic mean for exactly two usable models', () => {
    const result = buildWeatherConsensus(models({
      aifs: model([10, 20, 30]),
      ifs: model([30, 50, 70]),
      gfs: model(null),
      ukmo: model(null),
    }))

    expect(result.usableModelCount).toBe(2)
    expect(result.horizons.map(horizon => horizon.value)).toEqual([20, 35, 50])
  })

  it('uses a single model for rainfall without fabricating agreement', () => {
    const current = models({
      aifs: model(null),
      ifs: model(null),
      gfs: model([7, 14, 21]),
      ukmo: model(null),
    })

    expect(buildWeatherConsensus(current)).toMatchObject({
      source: 'gfs',
      usableModelCount: 1,
      horizons: [{ value: 7 }, { value: 14 }, { value: 21 }],
    })
    expect(calculateModelAgreement(current)).toMatchObject({
      status: 'SINGLE_USABLE_MODEL',
      score: null,
      label: 'Unavailable — single usable weather model',
      usableModelCount: 1,
      horizons: [],
    })
  })

  it('reports rainfall unavailable with zero usable models', () => {
    const current = models({
      aifs: model(null),
      ifs: model(null),
      gfs: model(null),
      ukmo: model(null),
    })

    expect(buildWeatherConsensus(current).horizons.every(horizon => horizon.value === null)).toBe(true)
    expect(calculateModelAgreement(current)).toMatchObject({
      status: 'NO_USABLE_MODELS',
      score: null,
      label: 'Unavailable — no usable weather models',
      usableModelCount: 0,
    })
  })

  it('is independent of which model key receives each total', () => {
    const first = buildWeatherConsensus(models({
      aifs: model([10, 20, 30]),
      ifs: model([20, 30, 40]),
      gfs: model([30, 40, 50]),
      ukmo: model([40, 50, 60]),
    }))
    const reordered = buildWeatherConsensus(models({
      aifs: model([40, 50, 60]),
      ifs: model([10, 20, 30]),
      gfs: model([30, 40, 50]),
      ukmo: model([20, 30, 40]),
    }))

    expect(reordered.horizons.map(horizon => horizon.value))
      .toEqual(first.horizons.map(horizon => horizon.value))
  })
})

describe('multi-model agreement', () => {
  it('uses mean absolute deviation from consensus for each horizon', () => {
    const result = calculateModelAgreement(models({
      aifs: model([10, 10, 10]),
      ifs: model([20, 20, 20]),
      gfs: model([30, 30, 30]),
      ukmo: model([40, 40, 40]),
    }))

    expect(result.status).toBe('FOUR_USABLE_MODELS')
    expect(result.horizons[0]).toMatchObject({
      modelCount: 4,
      consensus: 25,
      meanAbsoluteDeviation: 10,
      differenceRatio: 0.4,
    })
    expect(result.score).toBe(52.5)
    expect(result.label).toBe('Weak')
  })

  it.each([
    [3, 'THREE_USABLE_MODELS'],
    [2, 'TWO_USABLE_MODELS'],
  ] as const)('reports the explicit %s-model availability status', (count, status) => {
    const keys: WeatherModelKey[] = ['aifs', 'ifs', 'gfs', 'ukmo']
    const current = models(Object.fromEntries(keys.map((key, index) => [
      key,
      index < count ? model([20, 40, 60]) : model(null),
    ])) as Partial<Record<WeatherModelKey, WeatherModelData>>)

    expect(calculateModelAgreement(current)).toMatchObject({
      status,
      usableModelCount: count,
      totalConfiguredModelCount: 4,
    })
  })

  it('does not renormalize missing agreement horizons upward', () => {
    const result = calculateModelAgreement(models({
      aifs: model([20, 40, 60]),
      ifs: model([20, 40, 60], [48]),
      gfs: model([20, 40, 60], [48]),
      ukmo: model([20, 40, 60], [48]),
    }))

    expect(result.horizons.map(horizon => horizon.hours)).toEqual([24, 72])
    expect(result.coveredHorizonWeight).toBe(0.7)
    expect(result.score).toBe(70)
  })
})
