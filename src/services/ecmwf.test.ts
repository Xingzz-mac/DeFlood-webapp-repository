import { describe, expect, it } from 'vitest'
import {
  buildPrecipitationHorizons,
  normalizePrecipitationSeries,
} from './ecmwf'

function hourlyTimes(count: number): string[] {
  const start = Date.UTC(2026, 0, 1)
  return Array.from({ length: count }, (_, index) =>
    new Date(start + index * 3_600_000).toISOString().slice(0, 16),
  )
}

describe('ECMWF precipitation processing', () => {
  it('preserves null precipitation instead of converting it to zero', () => {
    const series = normalizePrecipitationSeries(hourlyTimes(3), [1.5, null, 2.5])

    expect(series.map(point => point.value)).toEqual([1.5, null, 2.5])
  })

  it('keeps expectedHours exactly 24, 48, and 72', () => {
    const series = normalizePrecipitationSeries(hourlyTimes(72), Array(72).fill(1))
    const horizons = buildPrecipitationHorizons(series)

    expect(horizons.map(horizon => horizon.expectedHours)).toEqual([24, 48, 72])
  })

  it('returns a null incomplete horizon when coverage is below 90 percent', () => {
    const values = Array<number | null>(72).fill(1)
    values.splice(0, 4, null, null, null, null)
    const horizons = buildPrecipitationHorizons(
      normalizePrecipitationSeries(hourlyTimes(72), values),
    )
    const firstDay = horizons.find(horizon => horizon.hours === 24)

    expect(firstDay).toMatchObject({
      expectedHours: 24,
      validHours: 20,
      complete: false,
      total: null,
    })
    expect(firstDay?.coverage).toBeLessThan(90)
  })
})
