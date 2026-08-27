import { afterEach, describe, expect, it, vi } from 'vitest'
import { ENVIRONMENTAL_REQUEST_TIMEOUT_MS } from './config'
import { buildHistoricalBaseline, fetchHistoricalBaseline } from './historicalGlofas'

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

describe('historical GloFAS baseline', () => {
  it('filters finite primary discharge to the forecast calendar month and records coverage', () => {
    const time: string[] = []
    const river_discharge: (number | null)[] = []
    for (let year = 2000; year < 2010; year += 1) {
      for (let day = 1; day <= 12; day += 1) {
        time.push(`${year}-08-${String(day).padStart(2, '0')}`)
        river_discharge.push(year + day)
      }
      time.push(`${year}-07-01`)
      river_discharge.push(99999)
    }
    time.push('2010-08-01')
    river_discharge.push(null)

    const baseline = buildHistoricalBaseline(
      { time, river_discharge },
      '16.5000,95.0000',
      8,
      '2026-08-19T00:00:00.000Z',
    )

    expect(baseline.status).toBe('available')
    expect(baseline.validSampleCount).toBe(120)
    expect(baseline.distinctYears).toBe(10)
    expect(baseline.firstValidDate).toBe('2000-08-01')
    expect(baseline.lastValidDate).toBe('2009-08-12')
    expect(baseline.values).not.toContain(99999)
  })

  it('is unavailable below either the 10-year or 100-sample minimum', () => {
    const baseline = buildHistoricalBaseline(
      {
        time: Array.from({ length: 99 }, (_, index) => `2000-08-${String((index % 28) + 1).padStart(2, '0')}`),
        river_discharge: Array(99).fill(10),
      },
      '16.5000,95.0000',
      8,
    )

    expect(baseline.status).toBe('unavailable')
    expect(baseline.lastSuccessfulAt).toBeNull()
  })

  it('requests primary discharge from 1984 through the last completed year', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      daily: { time: [], river_discharge: [] },
    }), { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)

    await fetchHistoricalBaseline(16.5, 95, '2026-08-19')

    const requestUrl = new URL(fetchMock.mock.calls[0][0])
    expect(requestUrl.searchParams.get('daily')).toBe('river_discharge')
    expect(requestUrl.searchParams.get('start_date')).toBe('1984-01-01')
    expect(requestUrl.searchParams.get('end_date')).toBe('2025-12-31')
    expect(requestUrl.searchParams.has('river_discharge_p25')).toBe(false)
  })

  it('times out historical GloFAS gracefully and clears the in-flight request', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-08-19T00:00:00.000Z'))
    const hangingFetch = vi.fn((_input: string | URL | Request, init?: RequestInit) => (
      new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener(
          'abort',
          () => reject(new DOMException('Aborted', 'AbortError')),
          { once: true },
        )
      })
    ))
    vi.stubGlobal('fetch', hangingFetch)

    const pending = fetchHistoricalBaseline(17.5, 96, '2026-08-19')
    const rejected = expect(pending).rejects.toThrow(
      `Historical GloFAS request timed out after ${ENVIRONMENTAL_REQUEST_TIMEOUT_MS} ms`,
    )
    await vi.advanceTimersByTimeAsync(ENVIRONMENTAL_REQUEST_TIMEOUT_MS)
    await rejected

    const retryFetch = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      daily: { time: [], river_discharge: [] },
    }), { status: 200 }))
    vi.stubGlobal('fetch', retryFetch)

    await fetchHistoricalBaseline(17.5, 96, '2026-08-19')
    expect(retryFetch).toHaveBeenCalledTimes(1)
    expect(vi.getTimerCount()).toBe(0)
  })
})
