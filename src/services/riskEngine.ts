import { buildWeatherConsensus, calculateModelAgreement } from './modelAgreement'
import { isPrimaryRiverUsable } from './glofas'
import {
  CONFIDENCE_WEIGHTS,
  ENSEMBLE_MIN_ALIGNED_DAYS,
  HAZARD_WEIGHTS,
  RISK_ENGINE_VERSION,
} from './riskConfig'
import {
  calculateCompleteness,
  calculateElevationVulnerability,
  calculateEnsembleConsistency,
  calculateFreshness,
  calculatePercentileRank,
  calculateRainfallSeverity,
  calculateRiverAbnormality,
  calculateRiverTrend,
  roundScore,
} from './riskScoring'
import type {
  FloodHazardLevel,
  HazardComponents,
  RiskEngineInput,
  RiskResult,
} from './riskTypes'
import type { EnvironmentalData } from './types'

export function classifyHazard(score: number): FloodHazardLevel {
  if (score < 40) return 'LOW'
  if (score < 70) return 'MEDIUM'
  return 'HIGH'
}

function calculateHazardComponents(
  rainfall: number | null,
  riverAbnormality: number | null,
  riverTrend: number | null,
  elevation: number | null,
): { components: HazardComponents; hazardScore: number | null } {
  const scores = { rainfall, riverAbnormality, riverTrend, elevation }
  const coreAvailable = rainfall !== null && riverAbnormality !== null
  const availableWeight = coreAvailable
    ? (Object.keys(scores) as (keyof typeof scores)[]).reduce(
        (sum, key) => sum + (scores[key] === null ? 0 : HAZARD_WEIGHTS[key]),
        0,
      )
    : 0
  const components = (Object.keys(scores) as (keyof typeof scores)[]).reduce(
    (result, key) => {
      const score = scores[key]
      const effectiveWeight = coreAvailable && score !== null && availableWeight > 0
        ? HAZARD_WEIGHTS[key] / availableWeight
        : 0
      result[key] = { score, baseWeight: HAZARD_WEIGHTS[key], effectiveWeight }
      return result
    }, {} as HazardComponents)
  const hazardScore = coreAvailable
    ? roundScore((Object.keys(components) as (keyof HazardComponents)[]).reduce(
        (sum, key) => sum + (components[key].score ?? 0) * components[key].effectiveWeight,
        0,
      ))
    : null
  return { components, hazardScore }
}

function latestSuccessfulUpdate(
  environmental: EnvironmentalData,
  historicalLastSuccessfulAt: string | null,
): string | null {
  const candidates = [
    environmental.weatherModels.aifs.metadata.lastSuccessfulAt,
    environmental.weatherModels.ifs.metadata.lastSuccessfulAt,
    environmental.river.metadata.lastSuccessfulAt,
    environmental.terrain.metadata.lastSuccessfulAt,
    historicalLastSuccessfulAt,
  ].flatMap(value => {
    if (!value) return []
    const parsed = Date.parse(value)
    return Number.isFinite(parsed) ? [{ value, parsed }] : []
  })
  return candidates.sort((a, b) => b.parsed - a.parsed)[0]?.value ?? null
}

function buildFactors(result: {
  rainfallSeverity: number | null
  rain24: number | null
  riverPercentile: number | null
  trendLabel: string | null
  elevationScore: number | null
  agreementLabel: string
  agreementScore: number | null
  consensusSource: string
  ensembleScore: number | null
  historicalAvailable: boolean
  primaryRiverUsable: boolean
}): string[] {
  const factors: { priority: number; text: string }[] = []
  if (!result.historicalAvailable) {
    factors.push({
      priority: 120,
      text: 'Historical same-month river data is insufficient or unavailable, so Flood Hazard cannot yet be calculated.',
    })
  }
  if (!result.primaryRiverUsable) {
    factors.push({
      priority: 118,
      text: 'Current primary river forecast evidence is insufficient: at least two finite dated river_discharge values are required among the first three forecast days.',
    })
  }
  if (result.rainfallSeverity === null) {
    factors.push({
      priority: 115,
      text: 'Usable 24-hour and 72-hour rainfall evidence is unavailable, so Flood Hazard cannot yet be calculated.',
    })
  } else if (result.rainfallSeverity >= 70) {
    factors.push({ priority: 90, text: 'Heavy accumulated rainfall is forecast over the next 24 to 72 hours.' })
  } else if (result.rainfallSeverity >= 40) {
    factors.push({ priority: 65, text: 'Moderate accumulated rainfall is forecast over the next 24 to 72 hours.' })
  } else {
    factors.push({ priority: 45, text: 'Forecast rainfall severity is currently in the lower prototype range.' })
  }
  if (result.rain24 !== null && result.rain24 >= 50) {
    factors.push({ priority: 80, text: `Consensus 24-hour rainfall is ${result.rain24.toFixed(1)} mm.` })
  }
  if (result.riverPercentile !== null) {
    const percentile = result.riverPercentile
    const text = percentile >= 99
      ? 'Forecast river discharge is at or above the historical 99th percentile for this calendar month.'
      : percentile >= 95
        ? 'Forecast river discharge is at or above the historical 95th percentile for this calendar month.'
        : percentile >= 85
          ? 'Forecast river discharge is elevated relative to same-month history.'
          : 'Forecast river discharge is within the more common same-month historical range.'
    factors.push({ priority: percentile >= 99 ? 105 : percentile >= 95 ? 95 : percentile >= 85 ? 70 : 40, text })
  }
  if (result.trendLabel) {
    factors.push({
      priority: result.trendLabel.includes('rising') ? 75 : 35,
      text: `Primary river discharge is ${result.trendLabel} across the usable first-three-day forecast values.`,
    })
  }
  if (result.agreementScore !== null) {
    factors.push({
      priority: result.agreementScore >= 85 ? 55 : 60,
      text: `AIFS and IFS rainfall agreement is ${result.agreementLabel.toLowerCase()}, affecting Data Confidence only.`,
    })
  } else if (result.consensusSource === 'aifs' || result.consensusSource === 'ifs') {
    factors.push({
      priority: 85,
      text: `${result.consensusSource.toUpperCase()} is the only usable rainfall model, reducing model-agreement confidence.`,
    })
  } else {
    factors.push({
      priority: 88,
      text: 'Neither AIFS nor IFS is usable, so rainfall hazard and weather-model agreement are unavailable.',
    })
  }
  if (result.ensembleScore === null) {
    factors.push({
      priority: 50,
      text: 'Aligned GloFAS p25/median/p75 data is insufficient, reducing Data Confidence without invalidating primary discharge.',
    })
  }
  if (result.elevationScore !== null && result.elevationScore >= 75) {
    factors.push({
      priority: 45,
      text: 'The elevation input indicates low-lying terrain as a small contextual hazard component.',
    })
  }
  return factors.sort((a, b) => b.priority - a.priority).slice(0, 5).map(factor => factor.text)
}

function emptyRiskResult(nowMs: number): RiskResult {
  const unavailableSource = {
    score: 0,
    ageMs: null,
    maxAgeMs: 0,
    usable: false,
    cached: false,
  }
  return {
    engineVersion: RISK_ENGINE_VERSION,
    calculatedAt: new Date(nowMs).toISOString(),
    calculationStatus: 'NOT_CALCULATED',
    hazardScore: null,
    hazardLevel: null,
    confidenceScore: 0,
    components: {
      rainfall: { score: null, baseWeight: HAZARD_WEIGHTS.rainfall, effectiveWeight: 0 },
      riverAbnormality: { score: null, baseWeight: HAZARD_WEIGHTS.riverAbnormality, effectiveWeight: 0 },
      riverTrend: { score: null, baseWeight: HAZARD_WEIGHTS.riverTrend, effectiveWeight: 0 },
      elevation: { score: null, baseWeight: HAZARD_WEIGHTS.elevation, effectiveWeight: 0 },
    },
    effectiveWeights: { rainfall: 0, riverAbnormality: 0, riverTrend: 0, elevation: 0 },
    confidenceComponents: { completeness: 0, modelAgreement: null, ensembleConsistency: null, freshness: 0 },
    modelAgreement: { score: null, label: 'Unavailable — no usable weather models', weightedDifference: null, horizons: [] },
    weatherConsensus: { source: 'unavailable', horizons: [24, 48, 72].map(hours => ({ hours: hours as 24 | 48 | 72, value: null })) },
    rainfallSeverity: null,
    riverPercentile: null,
    riverAbnormality: null,
    riverTrend: { score: null, percentChange: null, label: null, validDays: 0 },
    ensembleConsistency: {
      score: null,
      averageSpreadRatio: null,
      alignedDays: 0,
      requiredAlignedDays: ENSEMBLE_MIN_ALIGNED_DAYS,
    },
    freshness: {
      score: 0,
      sources: {
        aifs: { ...unavailableSource },
        ifs: { ...unavailableSource },
        river: { ...unavailableSource },
        elevation: { ...unavailableSource },
      },
    },
    historicalBaseline: null,
    sourceInformation: {
      aifs: 'unavailable',
      ifs: 'unavailable',
      river: 'unavailable',
      elevation: 'unavailable',
      historical: 'not-requested',
    },
    contributingFactors: ['Waiting for environmental data for the current coordinates.'],
    lastMeaningfulDataUpdate: null,
    stale: false,
    degraded: false,
  }
}

export function calculateRisk(input: RiskEngineInput): RiskResult {
  const nowMs = input.nowMs ?? Date.now()
  const environmental = input.environmental
  if (!environmental) return emptyRiskResult(nowMs)

  const historical = input.historicalBaseline
  const modelAgreement = calculateModelAgreement(
    environmental.weatherModels.aifs,
    environmental.weatherModels.ifs,
  )
  const weatherConsensus = buildWeatherConsensus(
    environmental.weatherModels.aifs,
    environmental.weatherModels.ifs,
  )
  const rainfallSeverity = calculateRainfallSeverity(weatherConsensus)
  const primaryRiverUsable = isPrimaryRiverUsable(environmental.river.days)
  const riverPercentile = historical?.status === 'available' && primaryRiverUsable
    ? calculatePercentileRank(environmental.river.peakDischarge, historical.values)
    : null
  const riverAbnormality = calculateRiverAbnormality(riverPercentile)
  const riverTrend = calculateRiverTrend(environmental.river.days)
  const elevation = calculateElevationVulnerability(environmental.terrain.elevation)
  const ensembleConsistency = calculateEnsembleConsistency(environmental.river.days)
  const { components, hazardScore } = calculateHazardComponents(
    rainfallSeverity,
    riverAbnormality,
    riverTrend.score,
    elevation,
  )
  const completeness = calculateCompleteness(environmental, historical)
  const freshness = calculateFreshness(environmental, nowMs)
  const confidenceScore = roundScore(
    completeness * CONFIDENCE_WEIGHTS.completeness
    + (modelAgreement.score ?? 0) * CONFIDENCE_WEIGHTS.modelAgreement
    + (ensembleConsistency.score ?? 0) * CONFIDENCE_WEIGHTS.ensembleConsistency
    + freshness.score * CONFIDENCE_WEIGHTS.freshness,
  )
  const calculationStatus = hazardScore === null ? 'INCOMPLETE' : 'COMPLETE'
  const rain24 = weatherConsensus.horizons.find(horizon => horizon.hours === 24)?.value ?? null
  const sourceInformation = {
    aifs: environmental.weatherModels.aifs.metadata.status,
    ifs: environmental.weatherModels.ifs.metadata.status,
    river: environmental.river.metadata.status,
    elevation: environmental.terrain.metadata.status,
    historical: historical?.status ?? 'not-requested',
  } as const
  const degraded = environmental.status !== 'live'
    || historical?.status !== 'available'
    || modelAgreement.score === null
    || ensembleConsistency.score === null
    || [
      environmental.weatherModels.aifs.metadata,
      environmental.weatherModels.ifs.metadata,
      environmental.river.metadata,
      environmental.terrain.metadata,
    ].some(metadata => metadata.cached || metadata.refreshAttempt !== null)

  return {
    engineVersion: RISK_ENGINE_VERSION,
    calculatedAt: new Date(nowMs).toISOString(),
    calculationStatus,
    hazardScore,
    hazardLevel: hazardScore === null ? null : classifyHazard(hazardScore),
    confidenceScore,
    components,
    effectiveWeights: {
      rainfall: components.rainfall.effectiveWeight,
      riverAbnormality: components.riverAbnormality.effectiveWeight,
      riverTrend: components.riverTrend.effectiveWeight,
      elevation: components.elevation.effectiveWeight,
    },
    confidenceComponents: {
      completeness,
      modelAgreement: modelAgreement.score,
      ensembleConsistency: ensembleConsistency.score,
      freshness: freshness.score,
    },
    modelAgreement,
    weatherConsensus,
    rainfallSeverity,
    riverPercentile,
    riverAbnormality,
    riverTrend,
    ensembleConsistency,
    freshness,
    historicalBaseline: historical,
    sourceInformation,
    contributingFactors: buildFactors({
      rainfallSeverity,
      rain24,
      riverPercentile,
      trendLabel: riverTrend.label,
      elevationScore: elevation,
      agreementLabel: modelAgreement.label,
      agreementScore: modelAgreement.score,
      consensusSource: weatherConsensus.source,
      ensembleScore: ensembleConsistency.score,
      historicalAvailable: historical?.status === 'available',
      primaryRiverUsable,
    }),
    lastMeaningfulDataUpdate: latestSuccessfulUpdate(
      environmental,
      historical?.lastSuccessfulAt ?? null,
    ),
    stale: environmental.stale,
    degraded,
  }
}
