import type { HistoricalBaseline } from './riskTypes'
import type { RiverData } from './types'

export interface RiverOutlookPoint {
  date: string
  recent: number | null
  forecast: number | null
  p25: number | null
  p75: number | null
  isToday: boolean
}

function finite(value: number | null | undefined): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

export function buildRiverOutlookPoints(river: RiverData): RiverOutlookPoint[] {
  const today = river.days[0]?.date ?? null
  const recent = (river.recentDays ?? [])
    .filter(day => day.date !== today)
    .map(day => ({
      date: day.date,
      recent: finite(day.discharge),
      forecast: null,
      p25: null,
      p75: null,
      isToday: false,
    }))
  const forecast = river.days.map((day, index) => {
    const p25 = finite(day.p25)
    const p75 = finite(day.p75)
    const validRange = p25 !== null && p75 !== null && p25 <= p75
    const discharge = finite(day.discharge)
    return {
      date: day.date,
      recent: index === 0 ? discharge : null,
      forecast: discharge,
      p25: validRange ? p25 : null,
      p75: validRange ? p75 : null,
      isToday: index === 0,
    }
  })
  return [...recent, ...forecast]
}

export function deterministicQuantile(
  values: number[],
  probability: number,
): number | null {
  const finiteValues = values.filter(Number.isFinite).sort((a, b) => a - b)
  if (finiteValues.length === 0 || probability < 0 || probability > 1) return null
  if (finiteValues.length === 1) return finiteValues[0]
  const position = (finiteValues.length - 1) * probability
  const lowerIndex = Math.floor(position)
  const upperIndex = Math.ceil(position)
  const lower = finiteValues[lowerIndex]
  const upper = finiteValues[upperIndex]
  return lower + (upper - lower) * (position - lowerIndex)
}

export function historicalReferenceQuantiles(
  baseline: HistoricalBaseline | null,
): { p85: number; p95: number } | null {
  if (baseline?.status !== 'available') return null
  const p85 = deterministicQuantile(baseline.values, 0.85)
  const p95 = deterministicQuantile(baseline.values, 0.95)
  return p85 === null || p95 === null ? null : { p85, p95 }
}
