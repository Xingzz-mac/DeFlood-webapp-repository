import { describe, expect, it } from 'vitest'
import {
  buildEnsembleAvailability,
  buildRiverDays,
  computeNearTermTrend,
  isPrimaryRiverUsable,
} from './glofas'

describe('GloFAS primary and ensemble usability', () => {
  it('does not treat ensemble-only data as a usable primary river forecast', () => {
    const days = buildRiverDays({
      time: ['2026-08-19', '2026-08-20', '2026-08-21'],
      river_discharge: [null, null, null],
      river_discharge_mean: [10, 11, 12],
    })

    expect(isPrimaryRiverUsable(days)).toBe(false)
  })

  it('counts only finite primary discharge values toward usability', () => {
    const days = buildRiverDays({
      time: ['2026-08-19', '2026-08-20', '2026-08-21'],
      river_discharge: [10, Number.NaN, null],
    })

    expect(isPrimaryRiverUsable(days)).toBe(false)
  })

  it('requires primary discharge values to remain aligned to valid dates', () => {
    const days = buildRiverDays({
      time: ['2026-08-19', '2026-08-20'],
      river_discharge: [10, 12],
    })
    days[1].date = ''

    expect(isPrimaryRiverUsable(days)).toBe(false)
  })

  it('does not let a missing ensemble percentile invalidate usable primary discharge', () => {
    const days = buildRiverDays({
      time: ['2026-08-19', '2026-08-20', '2026-08-21'],
      river_discharge: [10, 12, null],
      river_discharge_p75: [null, null, null],
    })
    const availability = buildEnsembleAvailability(days)

    expect(isPrimaryRiverUsable(days)).toBe(true)
    expect(availability.p75).toMatchObject({ available: false, validDays: 0 })
  })

  it('requires at least two aligned primary discharge values for trend', () => {
    const oneValue = buildRiverDays({
      time: ['2026-08-19', '2026-08-20', '2026-08-21'],
      river_discharge: [10, null, null],
    })
    const twoValues = buildRiverDays({
      time: ['2026-08-19', '2026-08-20', '2026-08-21'],
      river_discharge: [10, null, 13],
    })

    expect(computeNearTermTrend(oneValue)).toBe('unavailable')
    expect(computeNearTermTrend(twoValues)).toBe('rising')
  })

  it('keeps ensemble values aligned to their forecast dates', () => {
    const days = buildRiverDays({
      time: ['2026-08-19', '2026-08-20', '2026-08-21'],
      river_discharge: [10, 11, 12],
      river_discharge_mean: [20, null, 22],
      river_discharge_p25: [5, 6, null],
      river_discharge_p75: [25, 26, 27],
    })

    expect(days).toEqual([
      expect.objectContaining({ date: '2026-08-19', discharge: 10, mean: 20, p25: 5, p75: 25 }),
      expect.objectContaining({ date: '2026-08-20', discharge: 11, mean: null, p25: 6, p75: 26 }),
      expect.objectContaining({ date: '2026-08-21', discharge: 12, mean: 22, p25: null, p75: 27 }),
    ])
  })
})
