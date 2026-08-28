import { afterEach, describe, expect, it, vi } from 'vitest'
import { AIFS_MODEL, ECMWF_BASE, IFS_MODEL } from './config'
import {
  buildPrecipitationHorizons,
  fetchAifs,
  fetchIfs,
  isWeatherModelUsable,
  normalizePrecipitationSeries,
} from './ecmwf'

function hourlyTimes(count: number): string[] {
  const start = Date.UTC(2026, 0, 1)
  return Array.from({ length: count }, (_, index) =>
    new Date(start + index * 3_600_000).toISOString().slice(0, 16),
  )
}

function forecastResponse(value: number): Response {
  return new Response(JSON.stringify({
    hourly: {
      time: hourlyTimes(96),
      precipitation: Array(96).fill(value),
    },
  }), { status: 200 })
}

function nullForecastResponse(): Response {
  return new Response(JSON.stringify({
    hourly: {
      time: hourlyTimes(96),
      precipitation: Array(96).fill(null),
    },
  }), { status: 200 })
}

describe('ECMWF precipitation processing', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

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

  it('requests the current AIFS Single identifier and produces usable rainfall metadata', async () => {
    expect(AIFS_MODEL).toBe('ecmwf_aifs025_single')
    const fetchMock = vi.fn((_input: string | URL | Request) =>
      Promise.resolve(forecastResponse(1)))
    vi.stubGlobal('fetch', fetchMock)

    const result = await fetchAifs(16.5, 95)
    const url = new URL(String(fetchMock.mock.calls[0]?.[0]))

    expect(`${url.origin}${url.pathname}`).toBe(ECMWF_BASE)
    expect(url.searchParams.get('models')).toBe('ecmwf_aifs025_single')
    expect(url.searchParams.get('hourly')).toBe('precipitation')
    expect(url.searchParams.get('forecast_hours')).toBe('96')
    expect(result.model).toBe('ecmwf_aifs025_single')
    expect(result.horizons).toEqual([
      { hours: 24, total: 24, expectedHours: 24, validHours: 24, coverage: 100, complete: true },
      { hours: 48, total: 48, expectedHours: 48, validHours: 48, coverage: 100, complete: true },
      { hours: 72, total: 72, expectedHours: 72, validHours: 72, coverage: 100, complete: true },
    ])
    expect(isWeatherModelUsable(result)).toBe(true)
    expect(result.metadata).toMatchObject({
      status: 'live',
      lastSuccessfulAt: result.metadata.retrievedAt,
      ageMs: 0,
      cached: false,
      coordinateFingerprint: '16.5000,95.0000',
      error: null,
    })
  })

  it('keeps the existing IFS 0.25 identifier and parses its response through the same contract', async () => {
    expect(IFS_MODEL).toBe('ecmwf_ifs025')
    const fetchMock = vi.fn((_input: string | URL | Request) =>
      Promise.resolve(forecastResponse(2)))
    vi.stubGlobal('fetch', fetchMock)

    const result = await fetchIfs(21.9588, 96.0891)
    const url = new URL(String(fetchMock.mock.calls[0]?.[0]))

    expect(`${url.origin}${url.pathname}`).toBe(ECMWF_BASE)
    expect(url.searchParams.get('models')).toBe('ecmwf_ifs025')
    expect(result.horizons.map(horizon => horizon.total)).toEqual([48, 96, 144])
    expect(result.horizons.every(horizon => horizon.coverage === 100)).toBe(true)
    expect(isWeatherModelUsable(result)).toBe(true)
    expect(result.metadata.status).toBe('live')
    expect(result.metadata.lastSuccessfulAt).toBe(result.metadata.retrievedAt)
  })

  it('marks an HTTP-successful all-null rainfall response unavailable and not fresh', async () => {
    vi.stubGlobal('fetch', vi.fn(() => Promise.resolve(nullForecastResponse())))

    const result = await fetchAifs(16.5, 95)

    expect(result.series).toHaveLength(96)
    expect(result.series.every(point => point.value === null)).toBe(true)
    expect(result.horizons.every(horizon => horizon.total === null)).toBe(true)
    expect(result.horizons.every(horizon => horizon.coverage === 0)).toBe(true)
    expect(isWeatherModelUsable(result)).toBe(false)
    expect(result.metadata).toMatchObject({
      status: 'unavailable',
      lastSuccessfulAt: null,
      ageMs: null,
      error: 'No finite precipitation values returned',
    })
  })
})
