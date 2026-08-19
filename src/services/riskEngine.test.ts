import { describe, expect, it } from 'vitest'
import { calculateRisk, classifyHazard } from './riskEngine'
import type { HistoricalBaseline } from './riskTypes'
import type {
  EnvironmentalData,
  RiverDay,
  SourceMetadata,
  WeatherModelData,
} from './types'

const fingerprint = '16.5000,95.0000'
const now = '2026-08-19T00:00:00.000Z'

function metadata(status: SourceMetadata['status'] = 'live'): SourceMetadata {
  const usable = status === 'live' || status === 'cached'
  return {
    status,
    retrievedAt: now,
    lastSuccessfulAt: usable ? now : null,
    cachedAt: status === 'cached' ? now : null,
    ageMs: usable ? 0 : null,
    cached: status === 'cached',
    coordinateFingerprint: fingerprint,
    error: null,
    refreshAttempt: null,
  }
}

function weather(
  totals: [number, number, number] | null,
  incomplete48 = false,
  status: SourceMetadata['status'] = totals ? 'live' : 'unavailable',
): WeatherModelData {
  const sourceMetadata = metadata(status)
  if (incomplete48 && totals) {
    sourceMetadata.status = 'incomplete'
    sourceMetadata.lastSuccessfulAt = now
    sourceMetadata.ageMs = 0
  }
  return {
    label: 'Weather',
    model: 'test',
    unit: 'mm',
    series: [],
    horizons: ([24, 48, 72] as const).map((hours, index) => ({
      hours,
      total: incomplete48 && hours === 48 ? null : totals?.[index] ?? null,
      expectedHours: hours,
      validHours: totals && !(incomplete48 && hours === 48) ? hours : 0,
      coverage: totals && !(incomplete48 && hours === 48) ? 100 : 0,
      complete: totals !== null && !(incomplete48 && hours === 48),
    })),
    metadata: sourceMetadata,
  }
}

function riverDays(
  discharge: (number | null)[],
  ensemble = true,
): RiverDay[] {
  return discharge.map((value, index) => ({
    date: `2026-08-${String(index + 19).padStart(2, '0')}`,
    discharge: value,
    mean: ensemble && value !== null ? value : null,
    median: ensemble && value !== null ? value : null,
    maximum: ensemble && value !== null ? value * 1.2 : null,
    p25: ensemble && value !== null ? value * 0.9 : null,
    p75: ensemble && value !== null ? value * 1.1 : null,
  }))
}

function environmental(options: {
  aifs?: [number, number, number] | null
  ifs?: [number, number, number] | null
  discharge?: (number | null)[]
  ensemble?: boolean
  elevation?: number | null
  aifsIncomplete48?: boolean
  ifsIncomplete48?: boolean
} = {}): EnvironmentalData {
  const aifs = options.aifs === undefined ? [10, 20, 30] as [number, number, number] : options.aifs
  const ifs = options.ifs === undefined ? aifs : options.ifs
  const discharge = options.discharge ?? [10, 11, 12]
  const days = riverDays(discharge, options.ensemble ?? true)
  const valid = discharge.filter((value): value is number => value !== null)
  const peak = valid.length ? Math.max(...valid) : null
  return {
    location: { latitude: 16.5, longitude: 95 },
    fingerprint,
    weatherModels: {
      aifs: weather(aifs, options.aifsIncomplete48),
      ifs: weather(ifs, options.ifsIncomplete48),
    },
    river: {
      unit: 'm³/s',
      days,
      primaryValidDays: valid.length,
      primaryUsable: valid.length >= 2,
      peakDischarge: peak,
      peakDate: peak === null ? null : days.find(day => day.discharge === peak)?.date ?? null,
      trend: 'stable',
      ensembleAvailability: {
        mean: { available: true, complete: true, validDays: 7, expectedDays: 7 },
        median: { available: true, complete: true, validDays: 7, expectedDays: 7 },
        maximum: { available: true, complete: true, validDays: 7, expectedDays: 7 },
        p25: { available: true, complete: true, validDays: 7, expectedDays: 7 },
        p75: { available: true, complete: true, validDays: 7, expectedDays: 7 },
      },
      metadata: metadata(valid.length >= 2 ? 'live' : 'incomplete'),
    },
    terrain: {
      unit: 'm',
      elevation: options.elevation === undefined ? 8 : options.elevation,
      metadata: metadata(options.elevation === null ? 'unavailable' : 'live'),
    },
    retrievedAt: now,
    status: 'live',
    stale: false,
  }
}

function history(values: number[], status: HistoricalBaseline['status'] = 'available'): HistoricalBaseline {
  return {
    status,
    coordinateFingerprint: fingerprint,
    calendarMonth: 8,
    values: status === 'available' ? values : [],
    validSampleCount: status === 'available' ? values.length : 0,
    distinctYears: status === 'available' ? 20 : 0,
    firstValidDate: status === 'available' ? '1984-08-01' : null,
    lastValidDate: status === 'available' ? '2025-08-31' : null,
    unit: 'm³/s',
    sourceId: 'test-history',
    schemaVersion: 1,
    retrievedAt: now,
    lastSuccessfulAt: status === 'available' ? now : null,
    cachedAt: null,
    cached: false,
    error: status === 'available' ? null : 'insufficient',
  }
}

describe('deterministic Flood Hazard', () => {
  it.each([
    [0, 'LOW'],
    [39.9, 'LOW'],
    [40, 'MEDIUM'],
    [69.9, 'MEDIUM'],
    [70, 'HIGH'],
    [100, 'HIGH'],
  ] as const)('classifies the %s score boundary as %s', (score, level) => {
    expect(classifyHazard(score)).toBe(level)
  })

  it('classifies low rainfall, normal river discharge, and a falling river as LOW', () => {
    const result = calculateRisk({
      environmental: environmental({ aifs: [5, 10, 15], discharge: [12, 10, 8] }),
      historicalBaseline: history(Array.from({ length: 200 }, (_, index) => index + 1)),
      nowMs: Date.parse(now),
    })
    expect(result.calculationStatus).toBe('COMPLETE')
    expect(result.hazardLevel).toBe('LOW')
  })

  it('classifies moderate rainfall and elevated river discharge as MEDIUM', () => {
    const result = calculateRisk({
      environmental: environmental({ aifs: [35, 60, 90], discharge: [88, 90, 92] }),
      historicalBaseline: history(Array.from({ length: 100 }, (_, index) => index + 1)),
      nowMs: Date.parse(now),
    })
    expect(result.hazardLevel).toBe('MEDIUM')
  })

  it('classifies heavy rainfall, extreme river percentile, and a rising river as HIGH', () => {
    const result = calculateRisk({
      environmental: environmental({ aifs: [130, 220, 280], discharge: [100, 130, 170], elevation: 1 }),
      historicalBaseline: history(Array.from({ length: 1000 }, (_, index) => index / 10)),
      nowMs: Date.parse(now),
    })
    expect(result.riverPercentile).toBeGreaterThanOrEqual(99)
    expect(result.hazardLevel).toBe('HIGH')
  })

  it('returns INCOMPLETE when the historical baseline is unavailable', () => {
    const result = calculateRisk({
      environmental: environmental(),
      historicalBaseline: history([], 'unavailable'),
      nowMs: Date.parse(now),
    })
    expect(result.calculationStatus).toBe('INCOMPLETE')
    expect(result.hazardLevel).toBeNull()
  })

  it('returns INCOMPLETE when rainfall is unavailable', () => {
    const result = calculateRisk({
      environmental: environmental({ aifs: null, ifs: null }),
      historicalBaseline: history([1, 2, 3, 4, 5]),
      nowMs: Date.parse(now),
    })
    expect(result.calculationStatus).toBe('INCOMPLETE')
    expect(result.hazardScore).toBeNull()
    expect(result.modelAgreement.label).toBe('Unavailable — no usable weather models')
    expect(result.contributingFactors).toContain(
      'Neither AIFS nor IFS is usable, so rainfall hazard and weather-model agreement are unavailable.',
    )
  })

  it('calculates hazard with only IFS but lowers confidence and leaves agreement unavailable', () => {
    const sharedHistory = history(Array.from({ length: 100 }, (_, index) => index + 1))
    const both = calculateRisk({
      environmental: environmental({ aifs: [30, 60, 90], ifs: [30, 60, 90], discharge: [70, 75, 80] }),
      historicalBaseline: sharedHistory,
      nowMs: Date.parse(now),
    })
    const single = calculateRisk({
      environmental: environmental({ aifs: null, ifs: [30, 60, 90], discharge: [70, 75, 80] }),
      historicalBaseline: sharedHistory,
      nowMs: Date.parse(now),
    })
    expect(single.calculationStatus).toBe('COMPLETE')
    expect(single.modelAgreement.score).toBeNull()
    expect(single.modelAgreement.label).toBe('Unavailable — single weather model')
    expect(single.confidenceScore).toBeLessThan(both.confidenceScore)
  })

  it('lowers confidence for disagreement without automatically lowering physical hazard', () => {
    const sharedHistory = history(Array.from({ length: 100 }, (_, index) => index + 1))
    const agreeing = calculateRisk({
      environmental: environmental({ aifs: [50, 100, 150], ifs: [50, 100, 150] }),
      historicalBaseline: sharedHistory,
      nowMs: Date.parse(now),
    })
    const disagreeing = calculateRisk({
      environmental: environmental({ aifs: [0, 0, 0], ifs: [100, 200, 300] }),
      historicalBaseline: sharedHistory,
      nowMs: Date.parse(now),
    })
    expect(disagreeing.weatherConsensus).toEqual(agreeing.weatherConsensus)
    expect(disagreeing.hazardScore).toBe(agreeing.hazardScore)
    expect(disagreeing.confidenceScore).toBeLessThan(agreeing.confidenceScore)
  })

  it.each([
    ['AIFS', { aifsIncomplete48: true }],
    ['IFS', { ifsIncomplete48: true }],
  ] as const)('keeps both models in hazard consensus when %s 48h comparison is incomplete', (_, incompleteOption) => {
    const sharedHistory = history(Array.from({ length: 100 }, (_, index) => index + 1))
    const complete = calculateRisk({
      environmental: environmental({ aifs: [40, 70, 100], ifs: [40, 70, 100] }),
      historicalBaseline: sharedHistory,
      nowMs: Date.parse(now),
    })
    const incomplete = calculateRisk({
      environmental: environmental({
        aifs: [40, 70, 100],
        ifs: [40, 70, 100],
        ...incompleteOption,
      }),
      historicalBaseline: sharedHistory,
      nowMs: Date.parse(now),
    })

    expect(incomplete.modelAgreement.status).toBe('INCOMPLETE_COMPARISON_HORIZONS')
    expect(incomplete.modelAgreement.score).toBeNull()
    expect(incomplete.weatherConsensus.source).toBe('aifs+ifs')
    expect(incomplete.rainfallSeverity).toBe(complete.rainfallSeverity)
    expect(incomplete.hazardScore).toBe(complete.hazardScore)
    expect(incomplete.hazardLevel).toBe(complete.hazardLevel)
    expect(incomplete.confidenceComponents.modelAgreement).toBeNull()
    expect(incomplete.confidenceScore).toBeLessThan(complete.confidenceScore)
    expect(incomplete.contributingFactors).toContain(
      'Both weather models are usable for rainfall hazard, but model-agreement confidence is unavailable because one or more comparison horizons are incomplete.',
    )
    expect(incomplete.contributingFactors.join(' ')).not.toContain('Neither AIFS nor IFS')
    expect(incomplete.contributingFactors.join(' ')).not.toContain('only usable rainfall model')
  })

  it('calculates hazard when optional elevation is unavailable and reweights available parts', () => {
    const result = calculateRisk({
      environmental: environmental({ elevation: null }),
      historicalBaseline: history(Array.from({ length: 100 }, (_, index) => index + 1)),
      nowMs: Date.parse(now),
    })
    expect(result.calculationStatus).toBe('COMPLETE')
    expect(result.components.elevation.effectiveWeight).toBe(0)
    expect(Object.values(result.effectiveWeights).reduce((sum, value) => sum + value, 0)).toBeCloseTo(1)
  })

  it('returns INCOMPLETE with only one valid primary river day', () => {
    const result = calculateRisk({
      environmental: environmental({ discharge: [80, null, null] }),
      historicalBaseline: history(Array.from({ length: 100 }, (_, index) => index + 1)),
      nowMs: Date.parse(now),
    })
    expect(result.riverTrend.score).toBeNull()
    expect(result.calculationStatus).toBe('INCOMPLETE')
    expect(result.hazardScore).toBeNull()
    expect(result.hazardLevel).toBeNull()
    expect(result.components.riverTrend.effectiveWeight).toBe(0)
    expect(result.contributingFactors).toContain(
      'Current primary river forecast evidence is insufficient: at least two finite dated river_discharge values are required among the first three forecast days.',
    )
  })

  it('allows COMPLETE with two valid primary river days when other core evidence exists', () => {
    const result = calculateRisk({
      environmental: environmental({ discharge: [80, 90, null] }),
      historicalBaseline: history(Array.from({ length: 100 }, (_, index) => index + 1)),
      nowMs: Date.parse(now),
    })
    expect(result.riverTrend.validDays).toBe(2)
    expect(result.calculationStatus).toBe('COMPLETE')
    expect(result.hazardScore).not.toBeNull()
  })

  it('returns INCOMPLETE for ensemble-only river values without usable primary discharge', () => {
    const current = environmental({ discharge: [null, null, null], ensemble: false })
    current.river.days = current.river.days.map((day, index) => ({
      ...day,
      p25: 70 + index,
      median: 80 + index,
      p75: 90 + index,
    }))
    const result = calculateRisk({
      environmental: current,
      historicalBaseline: history(Array.from({ length: 100 }, (_, index) => index + 1)),
      nowMs: Date.parse(now),
    })
    expect(result.ensembleConsistency.score).not.toBeNull()
    expect(result.calculationStatus).toBe('INCOMPLETE')
    expect(result.hazardScore).toBeNull()
    expect(result.riverPercentile).toBeNull()
  })

  it('keeps primary river hazard usable when ensemble fields are missing but lowers confidence', () => {
    const sharedHistory = history(Array.from({ length: 100 }, (_, index) => index + 1))
    const aligned = calculateRisk({
      environmental: environmental({ discharge: [70, 75, 80], ensemble: true }),
      historicalBaseline: sharedHistory,
      nowMs: Date.parse(now),
    })
    const missing = calculateRisk({
      environmental: environmental({ discharge: [70, 75, 80], ensemble: false }),
      historicalBaseline: sharedHistory,
      nowMs: Date.parse(now),
    })
    expect(missing.calculationStatus).toBe('COMPLETE')
    expect(missing.ensembleConsistency.score).toBeNull()
    expect(missing.hazardScore).toBe(aligned.hazardScore)
    expect(missing.confidenceScore).toBeLessThan(aligned.confidenceScore)
  })

  it('uses fixed confidence weights so missing components contribute zero', () => {
    const result = calculateRisk({
      environmental: environmental({ aifs: null, ensemble: false }),
      historicalBaseline: history(Array.from({ length: 100 }, (_, index) => index + 1)),
      nowMs: Date.parse(now),
    })
    const expected = result.confidenceComponents.completeness * 0.35
      + 0 * 0.3
      + 0 * 0.25
      + result.confidenceComponents.freshness * 0.1
    expect(result.confidenceScore).toBeCloseTo(expected, 1)
  })

  it('computes hazard from effective weights that sum to one when core evidence exists', () => {
    const result = calculateRisk({
      environmental: environmental({ aifs: [35, 60, 90], discharge: [80, 90, 100] }),
      historicalBaseline: history(Array.from({ length: 100 }, (_, index) => index + 1)),
      nowMs: Date.parse(now),
    })
    const reconstructed = Object.values(result.components).reduce(
      (sum, component) => sum + (component.score ?? 0) * component.effectiveWeight,
      0,
    )
    expect(result.hazardScore).toBeCloseTo(reconstructed, 1)
  })
})
