import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  buildEnsembleAvailability,
  buildRiverDays,
  buildRiverSeries,
  computeThreeDayPeak,
  computeNearTermTrend,
  fetchRiverDischarge,
  isPrimaryRiverUsable,
} from './glofas'

afterEach(() => vi.unstubAllGlobals())

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

  it('separates seven recent modeled days from risk-facing forecast days without shifting Stage 2 inputs', () => {
    const recentDates = Array.from({ length: 7 }, (_, index) => `2026-08-${String(index + 1).padStart(2, '0')}`)
    const forecastDates = Array.from({ length: 7 }, (_, index) => `2026-08-${String(index + 8).padStart(2, '0')}`)
    const forecastDischarge = [40, 50, 45, 43, 42, 41, 39]
    const combined = buildRiverSeries({
      time: [...recentDates, ...forecastDates],
      river_discharge: [30, null, 32, 34, 35, 37, 38, ...forecastDischarge],
      river_discharge_p25: [1, 2, 3, 4, 5, 6, 7, 35, 44, 40, 38, 37, 36, 34],
      river_discharge_p75: [11, 12, 13, 14, 15, 16, 17, 45, 56, 50, 48, 47, 46, 44],
    })
    const originalForecast = buildRiverDays({
      time: forecastDates,
      river_discharge: forecastDischarge,
      river_discharge_p25: [35, 44, 40, 38, 37, 36, 34],
      river_discharge_p75: [45, 56, 50, 48, 47, 46, 44],
    })

    expect(combined.recentDays).toHaveLength(7)
    expect(combined.recentDays[1].discharge).toBeNull()
    expect(combined.forecastDays).toEqual(originalForecast)
    expect(combined.forecastDays[0]).toMatchObject({
      date: '2026-08-08',
      discharge: 40,
      p25: 35,
      p75: 45,
    })
    expect(isPrimaryRiverUsable(combined.forecastDays)).toBe(isPrimaryRiverUsable(originalForecast))
    expect(computeThreeDayPeak(combined.forecastDays)).toEqual(computeThreeDayPeak(originalForecast))
    expect(computeNearTermTrend(combined.forecastDays)).toBe(computeNearTermTrend(originalForecast))
  })

  it('requests past_days once and keeps the existing seven-day forecast contract', async () => {
    const dates = Array.from({ length: 14 }, (_, index) => `2026-08-${String(index + 1).padStart(2, '0')}`)
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      daily: {
        time: dates,
        river_discharge: Array.from({ length: 14 }, (_, index) => index + 1),
      },
    }), { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)

    const result = await fetchRiverDischarge(16.5, 95)
    const requestUrl = new URL(fetchMock.mock.calls[0][0])

    expect(requestUrl.searchParams.get('past_days')).toBe('7')
    expect(requestUrl.searchParams.get('forecast_days')).toBe('7')
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(result.recentDays?.map(day => day.date)).toEqual(dates.slice(0, 7))
    expect(result.days.map(day => day.date)).toEqual(dates.slice(7, 14))
    expect(result.peakDate).toBe('2026-08-10')
  })
})
