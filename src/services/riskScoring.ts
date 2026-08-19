import { isWeatherModelUsable } from './ecmwf'
import { isPrimaryRiverUsable, usablePrimaryRiverDays } from './glofas'
import {
  ELEVATION_MAX_STALE_MS,
  RIVER_MAX_STALE_MS,
  WEATHER_MAX_STALE_MS,
} from './config'
import {
  CACHED_FRESHNESS_FACTOR,
  CACHED_HISTORICAL_COMPLETENESS_FACTOR,
  CACHED_SOURCE_COMPLETENESS_FACTOR,
  COMPLETENESS_WEIGHTS,
  ELEVATION_SCORE_ANCHORS,
  ENSEMBLE_MEDIAN_FLOOR,
  ENSEMBLE_MIN_ALIGNED_DAYS,
  ENSEMBLE_SCORE_ANCHORS,
  FRESHNESS_WEIGHTS,
  RAINFALL_24H_ANCHORS,
  RAINFALL_72H_ANCHORS,
  RAINFALL_SEVERITY_WEIGHTS,
  RIVER_PERCENTILE_SCORE_ANCHORS,
  TREND_PERCENT_FLOOR,
  TREND_SCORE_ANCHORS,
} from './riskConfig'
import type {
  EnsembleConsistency,
  FreshnessResult,
  FreshnessSourceScore,
  HistoricalBaseline,
  TrendAnalysis,
  TrendLabel,
  WeatherConsensus,
} from './riskTypes'
import type { EnvironmentalData, RiverDay, SourceMetadata } from './types'

export function clamp(value: number, min = 0, max = 100): number {
  return Math.min(max, Math.max(min, value))
}

export function roundScore(value: number): number {
  return Math.round(clamp(value) * 10) / 10
}

export function interpolateAnchors(
  value: number,
  anchors: readonly [number, number][],
): number {
  if (!Number.isFinite(value) || anchors.length === 0) return 0
  if (value <= anchors[0][0]) return anchors[0][1]
  for (let index = 1; index < anchors.length; index += 1) {
    const [upperX, upperY] = anchors[index]
    const [lowerX, lowerY] = anchors[index - 1]
    if (value <= upperX) {
      const width = upperX - lowerX
      if (width <= 0) return upperY
      const position = (value - lowerX) / width
      return lowerY + position * (upperY - lowerY)
    }
  }
  return anchors[anchors.length - 1][1]
}

function consensusValue(consensus: WeatherConsensus, hours: number): number | null {
  return consensus.horizons.find(horizon => horizon.hours === hours)?.value ?? null
}

export function calculateRainfallSeverity(consensus: WeatherConsensus): number | null {
  const rain24 = consensusValue(consensus, 24)
  const rain72 = consensusValue(consensus, 72)
  if (rain24 === null || rain72 === null) return null
  const score24 = interpolateAnchors(rain24, RAINFALL_24H_ANCHORS)
  const score72 = interpolateAnchors(rain72, RAINFALL_72H_ANCHORS)
  return roundScore(
    score24 * RAINFALL_SEVERITY_WEIGHTS.hours24
      + score72 * RAINFALL_SEVERITY_WEIGHTS.hours72,
  )
}

export function calculatePercentileRank(
  forecastPeak: number | null,
  historicalValues: number[],
): number | null {
  if (forecastPeak === null || !Number.isFinite(forecastPeak) || historicalValues.length === 0) {
    return null
  }
  const finite = historicalValues.filter(value => Number.isFinite(value))
  if (finite.length === 0) return null
  const below = finite.filter(value => value < forecastPeak).length
  const equal = finite.filter(value => value === forecastPeak).length
  return Math.round(((below + equal * 0.5) / finite.length) * 1000) / 10
}

export function calculateRiverAbnormality(percentile: number | null): number | null {
  return percentile === null
    ? null
    : roundScore(interpolateAnchors(percentile, RIVER_PERCENTILE_SCORE_ANCHORS))
}

function trendLabel(percentChange: number): TrendLabel {
  if (percentChange > 20) return 'sharply rising'
  if (percentChange > 5) return 'rising'
  if (percentChange >= -5) return 'stable'
  if (percentChange >= -20) return 'falling'
  return 'sharply falling'
}

export function calculateRiverTrend(days: RiverDay[]): TrendAnalysis {
  const usable = usablePrimaryRiverDays(days)
  if (usable.length < 2) {
    return { score: null, percentChange: null, label: null, validDays: usable.length }
  }
  const first = usable[0].discharge
  const last = usable[usable.length - 1].discharge
  const percentChange = ((last - first) / Math.max(Math.abs(first), TREND_PERCENT_FLOOR)) * 100
  return {
    score: roundScore(interpolateAnchors(percentChange, TREND_SCORE_ANCHORS)),
    percentChange,
    label: trendLabel(percentChange),
    validDays: usable.length,
  }
}

export function calculateElevationVulnerability(elevation: number | null): number | null {
  return elevation === null || !Number.isFinite(elevation)
    ? null
    : roundScore(interpolateAnchors(elevation, ELEVATION_SCORE_ANCHORS))
}

export function calculateEnsembleConsistency(days: RiverDay[]): EnsembleConsistency {
  const aligned = days.slice(0, 3).flatMap(day => {
    if (day.p25 === null || day.median === null || day.p75 === null) return []
    const spreadRatio = Math.max(0, day.p75 - day.p25)
      / Math.max(Math.abs(day.median), ENSEMBLE_MEDIAN_FLOOR)
    return [{ date: day.date, spreadRatio }]
  })
  if (aligned.length < ENSEMBLE_MIN_ALIGNED_DAYS) {
    return {
      score: null,
      averageSpreadRatio: null,
      alignedDays: aligned.length,
      requiredAlignedDays: ENSEMBLE_MIN_ALIGNED_DAYS,
    }
  }
  const averageSpreadRatio = aligned.reduce((sum, day) => sum + day.spreadRatio, 0)
    / aligned.length
  return {
    score: roundScore(interpolateAnchors(averageSpreadRatio, ENSEMBLE_SCORE_ANCHORS)),
    averageSpreadRatio,
    alignedDays: aligned.length,
    requiredAlignedDays: ENSEMBLE_MIN_ALIGNED_DAYS,
  }
}

function completenessCredit(usable: boolean, cached: boolean, cachedFactor: number): number {
  if (!usable) return 0
  return cached ? cachedFactor : 1
}

export function calculateCompleteness(
  environmental: EnvironmentalData,
  historical: HistoricalBaseline | null,
): number {
  const aifs = completenessCredit(
    isWeatherModelUsable(environmental.weatherModels.aifs),
    environmental.weatherModels.aifs.metadata.cached,
    CACHED_SOURCE_COMPLETENESS_FACTOR,
  )
  const ifs = completenessCredit(
    isWeatherModelUsable(environmental.weatherModels.ifs),
    environmental.weatherModels.ifs.metadata.cached,
    CACHED_SOURCE_COMPLETENESS_FACTOR,
  )
  const river = completenessCredit(
    isPrimaryRiverUsable(environmental.river.days),
    environmental.river.metadata.cached,
    CACHED_SOURCE_COMPLETENESS_FACTOR,
  )
  const history = completenessCredit(
    historical?.status === 'available',
    historical?.cached ?? false,
    CACHED_HISTORICAL_COMPLETENESS_FACTOR,
  )
  const elevation = completenessCredit(
    typeof environmental.terrain.elevation === 'number'
      && Number.isFinite(environmental.terrain.elevation),
    environmental.terrain.metadata.cached,
    CACHED_SOURCE_COMPLETENESS_FACTOR,
  )
  return roundScore(100 * (
    aifs * COMPLETENESS_WEIGHTS.aifs
    + ifs * COMPLETENESS_WEIGHTS.ifs
    + river * COMPLETENESS_WEIGHTS.river
    + history * COMPLETENESS_WEIGHTS.historical
    + elevation * COMPLETENESS_WEIGHTS.elevation
  ))
}

function sourceFreshness(
  metadata: SourceMetadata,
  usable: boolean,
  maxAgeMs: number,
  nowMs: number,
): FreshnessSourceScore {
  const parsed = metadata.lastSuccessfulAt ? Date.parse(metadata.lastSuccessfulAt) : Number.NaN
  const ageMs = Number.isFinite(parsed) ? Math.max(0, nowMs - parsed) : null
  const withinAge = ageMs !== null && ageMs <= maxAgeMs
  const actualUsable = usable && withinAge
  const ageScore = actualUsable && ageMs !== null
    ? 100 * (1 - ageMs / maxAgeMs)
    : 0
  return {
    score: roundScore(ageScore * (metadata.cached ? CACHED_FRESHNESS_FACTOR : 1)),
    ageMs,
    maxAgeMs,
    usable: actualUsable,
    cached: metadata.cached,
  }
}

export function calculateFreshness(
  environmental: EnvironmentalData,
  nowMs = Date.now(),
): FreshnessResult {
  const sources = {
    aifs: sourceFreshness(
      environmental.weatherModels.aifs.metadata,
      isWeatherModelUsable(environmental.weatherModels.aifs),
      WEATHER_MAX_STALE_MS,
      nowMs,
    ),
    ifs: sourceFreshness(
      environmental.weatherModels.ifs.metadata,
      isWeatherModelUsable(environmental.weatherModels.ifs),
      WEATHER_MAX_STALE_MS,
      nowMs,
    ),
    river: sourceFreshness(
      environmental.river.metadata,
      isPrimaryRiverUsable(environmental.river.days),
      RIVER_MAX_STALE_MS,
      nowMs,
    ),
    elevation: sourceFreshness(
      environmental.terrain.metadata,
      typeof environmental.terrain.elevation === 'number'
        && Number.isFinite(environmental.terrain.elevation),
      ELEVATION_MAX_STALE_MS,
      nowMs,
    ),
  }
  return {
    score: roundScore(
      sources.aifs.score * FRESHNESS_WEIGHTS.aifs
      + sources.ifs.score * FRESHNESS_WEIGHTS.ifs
      + sources.river.score * FRESHNESS_WEIGHTS.river
      + sources.elevation.score * FRESHNESS_WEIGHTS.elevation,
    ),
    sources,
  }
}
