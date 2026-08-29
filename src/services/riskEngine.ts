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
  ConfidenceBreakdownItem,
  ConfidenceComponents,
  FloodHazardLevel,
  HazardBreakdownItem,
  HazardComponents,
  ModelAgreementStatus,
  RiskEngineInput,
  RiskResult,
} from './riskTypes'
import type {
  EnvironmentalData,
  SourceStatus,
  WeatherModelData,
  WeatherModels,
} from './types'
import { isWeatherModelUsable, WEATHER_MODEL_KEYS } from './weatherModels'
import {
  historicalMatchesRiverModel,
  riverModelWithinMaximumDistance,
} from './riverSpatial'

export function classifyHazard(score: number): FloodHazardLevel {
  if (score < 40) return 'LOW'
  if (score < 70) return 'MEDIUM'
  return 'HIGH'
}

const HAZARD_LABELS: Record<keyof HazardComponents, string> = {
  rainfall: 'Rainfall severity',
  riverAbnormality: 'Historical river abnormality',
  riverTrend: 'River trend',
  elevation: 'Elevation context',
}

const CONFIDENCE_LABELS: Record<keyof ConfidenceComponents, string> = {
  completeness: 'Data completeness',
  modelAgreement: 'Multi-model agreement',
  ensembleConsistency: 'River ensemble consistency',
  freshness: 'Data freshness',
}

export function calculateHazardBreakdown(
  scores: Record<keyof HazardComponents, number | null>,
): {
  components: HazardComponents
  hazardBreakdown: HazardBreakdownItem[]
  hazardScore: number | null
} {
  const coreAvailable = scores.rainfall !== null && scores.riverAbnormality !== null
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
  const hazardBreakdown = (Object.keys(components) as (keyof HazardComponents)[]).map(id => {
    const component = components[id]
    return {
      id,
      label: HAZARD_LABELS[id],
      score: component.score,
      effectiveWeight: component.effectiveWeight,
      contribution: component.score === null ? 0 : component.score * component.effectiveWeight,
      available: component.score !== null,
    }
  })
  const hazardScore = coreAvailable
    ? roundScore(hazardBreakdown.reduce((sum, item) => sum + item.contribution, 0))
    : null
  return { components, hazardBreakdown, hazardScore }
}

export function calculateConfidenceBreakdown(
  scores: Record<keyof ConfidenceComponents, number | null>,
): { confidenceBreakdown: ConfidenceBreakdownItem[]; confidenceScore: number } {
  const confidenceBreakdown = (Object.keys(CONFIDENCE_WEIGHTS) as (keyof ConfidenceComponents)[])
    .map(id => ({
      id,
      label: CONFIDENCE_LABELS[id],
      score: scores[id],
      weight: CONFIDENCE_WEIGHTS[id],
      contribution: (scores[id] ?? 0) * CONFIDENCE_WEIGHTS[id],
      available: scores[id] !== null,
    }))
  return {
    confidenceBreakdown,
    confidenceScore: roundScore(confidenceBreakdown.reduce(
      (sum, item) => sum + item.contribution,
      0,
    )),
  }
}

function latestSuccessfulUpdate(
  environmental: EnvironmentalData,
  historicalLastSuccessfulAt: string | null,
): string | null {
  const candidates = [
    ...WEATHER_MODEL_KEYS.map(key =>
      environmental.weatherModels[key].metadata.lastSuccessfulAt),
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
  agreementStatus: ModelAgreementStatus
  consensusSource: string
  usableModelCount: number
  totalConfiguredModelCount: number
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
  switch (result.agreementStatus) {
    case 'FOUR_USABLE_MODELS':
    case 'THREE_USABLE_MODELS':
    case 'TWO_USABLE_MODELS':
      if (result.agreementScore !== null) {
        factors.push({
          priority: result.agreementScore >= 85 ? 55 : 60,
          text: `${result.usableModelCount} of ${result.totalConfiguredModelCount} weather models are usable; multi-model rainfall agreement is ${result.agreementLabel.toLowerCase()}, affecting Data Confidence only.`,
        })
      }
      break
    case 'SINGLE_USABLE_MODEL':
      factors.push({
        priority: 85,
        text: WEATHER_MODEL_KEYS.includes(result.consensusSource as typeof WEATHER_MODEL_KEYS[number])
          ? `${result.consensusSource.toUpperCase()} is the only usable rainfall model, reducing model-agreement confidence.`
          : 'Only one weather model is usable for rainfall hazard, reducing model-agreement confidence.',
      })
      break
    case 'NO_USABLE_MODELS':
      factors.push({
        priority: 88,
        text: 'No configured weather model is usable, so rainfall hazard and multi-model agreement are unavailable.',
      })
      break
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
  const { components, hazardBreakdown } = calculateHazardBreakdown({
    rainfall: null,
    riverAbnormality: null,
    riverTrend: null,
    elevation: null,
  })
  const { confidenceBreakdown } = calculateConfidenceBreakdown({
    completeness: null,
    modelAgreement: null,
    ensembleConsistency: null,
    freshness: null,
  })
  return {
    engineVersion: RISK_ENGINE_VERSION,
    calculatedAt: new Date(nowMs).toISOString(),
    calculationStatus: 'NOT_CALCULATED',
    hazardScore: null,
    hazardLevel: null,
    confidenceScore: 0,
    components,
    effectiveWeights: { rainfall: 0, riverAbnormality: 0, riverTrend: 0, elevation: 0 },
    hazardBreakdown,
    confidenceComponents: { completeness: 0, modelAgreement: null, ensembleConsistency: null, freshness: 0 },
    confidenceBreakdown,
    modelAgreement: {
      status: 'NO_USABLE_MODELS',
      score: null,
      label: 'Unavailable — no usable weather models',
      weightedDifference: null,
      usableModelCount: 0,
      totalConfiguredModelCount: WEATHER_MODEL_KEYS.length,
      coveredHorizonWeight: 0,
      horizons: [],
    },
    weatherConsensus: {
      source: 'unavailable',
      usableModelCount: 0,
      totalConfiguredModelCount: WEATHER_MODEL_KEYS.length,
      horizons: [24, 48, 72].map(hours => ({
        hours: hours as 24 | 48 | 72,
        value: null,
        modelCount: 0,
        modelKeys: [],
      })),
    },
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
        gfs: { ...unavailableSource },
        ukmo: { ...unavailableSource },
        river: { ...unavailableSource },
        elevation: { ...unavailableSource },
      },
    },
    historicalBaseline: null,
    sourceInformation: {
      aifs: 'unavailable',
      ifs: 'unavailable',
      gfs: 'unavailable',
      ukmo: 'unavailable',
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

function ineligibleWeather(model: WeatherModelData): WeatherModelData {
  return {
    ...model,
    horizons: model.horizons.map(horizon => ({
      ...horizon,
      total: null,
      complete: false,
    })),
  }
}

function weatherSourceStatus(
  model: WeatherModelData,
  freshness: RiskResult['freshness']['sources']['aifs'],
): SourceStatus {
  if (
    isWeatherModelUsable(model)
    && !freshness.usable
    && freshness.ageMs !== null
    && freshness.ageMs > freshness.maxAgeMs
  ) {
    return 'expired'
  }
  return model.metadata.status
}

export function calculateRisk(input: RiskEngineInput): RiskResult {
  const nowMs = input.nowMs ?? Date.now()
  const environmental = input.environmental
  if (!environmental) return emptyRiskResult(nowMs)

  const historical = input.historicalBaseline
  const freshness = calculateFreshness(environmental, nowMs)
  const currentWeatherModels = Object.fromEntries(WEATHER_MODEL_KEYS.map(key => [
    key,
    freshness.sources[key].usable
      ? environmental.weatherModels[key]
      : ineligibleWeather(environmental.weatherModels[key]),
  ])) as WeatherModels
  const currentRiverEligible = riverModelWithinMaximumDistance(environmental.river)
  const currentRiverDays = freshness.sources.river.usable && currentRiverEligible
    ? environmental.river.days
    : []
  const alignedHistorical = historicalMatchesRiverModel(environmental.river, historical)
    ? historical
    : null
  const modelAgreement = calculateModelAgreement(currentWeatherModels)
  const weatherConsensus = buildWeatherConsensus(currentWeatherModels)
  const rainfallSeverity = calculateRainfallSeverity(weatherConsensus)
  const primaryRiverUsable = isPrimaryRiverUsable(currentRiverDays)
  const riverPercentile = alignedHistorical && primaryRiverUsable
    ? calculatePercentileRank(environmental.river.peakDischarge, alignedHistorical.values)
    : null
  const riverAbnormality = calculateRiverAbnormality(riverPercentile)
  const riverTrend = calculateRiverTrend(currentRiverDays)
  const elevation = calculateElevationVulnerability(
    freshness.sources.elevation.usable ? environmental.terrain.elevation : null,
  )
  const ensembleConsistency = calculateEnsembleConsistency(environmental.river.days)
  const { components, hazardBreakdown, hazardScore } = calculateHazardBreakdown({
    rainfall: rainfallSeverity,
    riverAbnormality,
    riverTrend: riverTrend.score,
    elevation,
  })
  const completeness = calculateCompleteness(
    environmental,
    alignedHistorical,
  )
  const confidenceComponents = {
    completeness,
    modelAgreement: modelAgreement.score,
    ensembleConsistency: ensembleConsistency.score,
    freshness: freshness.score,
  }
  const { confidenceBreakdown, confidenceScore } = calculateConfidenceBreakdown(confidenceComponents)
  const calculationStatus = hazardScore === null ? 'INCOMPLETE' : 'COMPLETE'
  const rain24 = weatherConsensus.horizons.find(horizon => horizon.hours === 24)?.value ?? null
  const sourceInformation = {
    aifs: weatherSourceStatus(environmental.weatherModels.aifs, freshness.sources.aifs),
    ifs: weatherSourceStatus(environmental.weatherModels.ifs, freshness.sources.ifs),
    gfs: weatherSourceStatus(environmental.weatherModels.gfs, freshness.sources.gfs),
    ukmo: weatherSourceStatus(environmental.weatherModels.ukmo, freshness.sources.ukmo),
    river: environmental.river.metadata.status,
    elevation: environmental.terrain.metadata.status,
    historical: alignedHistorical
      ? 'available'
      : historical?.status === 'available'
        ? 'unavailable'
        : historical?.status ?? 'not-requested',
  } as const
  const degraded = environmental.status !== 'live'
    || !alignedHistorical
    || !currentRiverEligible
    || modelAgreement.score === null
    || ensembleConsistency.score === null
    || Object.values(freshness.sources).some(source => !source.usable)
    || [
      ...WEATHER_MODEL_KEYS.map(key => environmental.weatherModels[key].metadata),
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
    hazardBreakdown,
    confidenceComponents,
    confidenceBreakdown,
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
      agreementStatus: modelAgreement.status,
      consensusSource: weatherConsensus.source,
      usableModelCount: modelAgreement.usableModelCount,
      totalConfiguredModelCount: modelAgreement.totalConfiguredModelCount,
      ensembleScore: ensembleConsistency.score,
      historicalAvailable: alignedHistorical !== null,
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
