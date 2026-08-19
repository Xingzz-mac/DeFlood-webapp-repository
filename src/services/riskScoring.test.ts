import { describe, expect, it } from 'vitest'
import {
  calculateEnsembleConsistency,
  calculateElevationVulnerability,
  calculateRainfallSeverity,
  calculateRiverAbnormality,
  calculateRiverTrend,
} from './riskScoring'
import type { RiverDay } from './types'

describe('risk scoring boundaries', () => {
  it('allows extreme rainfall to reach the configured maximum score', () => {
    const score = calculateRainfallSeverity({
      source: 'aifs+ifs',
      horizons: [
        { hours: 24, value: 150 },
        { hours: 48, value: 220 },
        { hours: 72, value: 300 },
      ],
    })
    expect(score).toBe(100)
  })

  it('uses separate accumulation bands for 24-hour and 72-hour rainfall', () => {
    const score = calculateRainfallSeverity({
      source: 'aifs+ifs',
      horizons: [
        { hours: 24, value: 25 },
        { hours: 48, value: 25 },
        { hours: 72, value: 25 },
      ],
    })
    expect(score).toBe(23)
  })

  it.each([
    [70, 10],
    [85, 35],
    [95, 65],
    [99, 90],
    [100, 100],
  ])('maps the %sth river percentile to score %s', (percentile, score) => {
    expect(calculateRiverAbnormality(percentile)).toBe(score)
  })

  it('allows high elevation to reach minimum low-elevation vulnerability', () => {
    expect(calculateElevationVulnerability(30)).toBe(0)
    expect(calculateElevationVulnerability(100)).toBe(0)
  })

  it.each([
    [-21, 'sharply falling'],
    [-20, 'falling'],
    [-5, 'stable'],
    [5, 'stable'],
    [6, 'rising'],
    [21, 'sharply rising'],
  ] as const)('labels a %s percent trend as %s', (percent, label) => {
    const first = 100
    const last = first * (1 + percent / 100)
    const result = calculateRiverTrend([
      day('2026-08-19', first, null, null, null),
      day('2026-08-20', last, null, null, null),
    ])
    expect(result.label).toBe(label)
  })

  it('uses only date-aligned p25, median, and p75 values', () => {
    const result = calculateEnsembleConsistency([
      day('2026-08-19', 10, 8, 10, 12),
      day('2026-08-20', 11, 9, 11, null),
      day('2026-08-21', 12, 10, 12, 14),
    ])
    expect(result.alignedDays).toBe(2)
    expect(result.score).not.toBeNull()
  })
})

function day(
  date: string,
  discharge: number,
  p25: number | null,
  median: number | null,
  p75: number | null,
): RiverDay {
  return { date, discharge, mean: null, median, maximum: null, p25, p75 }
}
