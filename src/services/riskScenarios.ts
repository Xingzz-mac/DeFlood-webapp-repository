import type { FloodHazardLevel, RiskResult } from './riskTypes'
import { calculateConfidenceBreakdown, calculateHazardBreakdown } from './riskEngine'

export type RiskScenario = 'live' | 'demo-low' | 'demo-medium' | 'demo-high' | 'demo-incomplete'
export type DemoRiskScenario = Exclude<RiskScenario, 'live'>

export const RISK_SCENARIO_OPTIONS: ReadonlyArray<{ value: RiskScenario; label: string }> = [
  { value: 'live', label: 'Live Data' },
  { value: 'demo-low', label: 'Demo LOW' },
  { value: 'demo-medium', label: 'Demo MEDIUM' },
  { value: 'demo-high', label: 'Demo HIGH' },
  { value: 'demo-incomplete', label: 'Demo INCOMPLETE' },
]

const DEMO_ENGINE_VERSION = 'deflood-dev-scenario-v1'
const DEMO_CALCULATED_AT = '2026-01-01T00:00:00.000Z'
function demoFreshness(usable: boolean, score: number) {
  const source = {
    score,
    ageMs: usable ? 0 : null,
    maxAgeMs: 0,
    usable,
    cached: false,
  }
  return {
    score,
    sources: {
      aifs: { ...source },
      ifs: { ...source },
      gfs: { ...source },
      ukmo: { ...source },
      river: { ...source },
      elevation: { ...source },
    },
  }
}

function completeFixture({
  hazardLevel,
  hazardScore,
  confidenceScore,
  rainfall,
  rainfallHorizons,
  riverAbnormality,
  riverTrend,
  riverPercentile,
  factors,
}: {
  hazardLevel: FloodHazardLevel
  hazardScore: number
  confidenceScore: number
  rainfall: number
  rainfallHorizons: [number, number, number]
  riverAbnormality: number
  riverTrend: number
  riverPercentile: number
  factors: string[]
}): RiskResult {
  const [rain24, rain48, rain72] = rainfallHorizons
  const hazard = calculateHazardBreakdown({
    rainfall,
    riverAbnormality,
    riverTrend,
    elevation: 30,
  })
  const confidenceComponents = {
    completeness: confidenceScore,
    modelAgreement: confidenceScore,
    ensembleConsistency: confidenceScore,
    freshness: confidenceScore,
  }
  const confidence = calculateConfidenceBreakdown(confidenceComponents)
  return {
    engineVersion: DEMO_ENGINE_VERSION,
    calculatedAt: DEMO_CALCULATED_AT,
    calculationStatus: 'COMPLETE',
    hazardScore: hazard.hazardScore ?? hazardScore,
    hazardLevel,
    confidenceScore,
    components: hazard.components,
    effectiveWeights: Object.fromEntries(
      hazard.hazardBreakdown.map(item => [item.id, item.effectiveWeight]),
    ) as RiskResult['effectiveWeights'],
    hazardBreakdown: hazard.hazardBreakdown,
    confidenceComponents,
    confidenceBreakdown: confidence.confidenceBreakdown,
    modelAgreement: {
      status: 'FOUR_USABLE_MODELS',
      score: confidenceScore,
      label: confidenceScore >= 80 ? 'Strong' : 'Moderate',
      weightedDifference: (100 - confidenceScore) / 100,
      usableModelCount: 4,
      totalConfiguredModelCount: 4,
      coveredHorizonWeight: 1,
      horizons: [
        { hours: 24, modelTotals: [], modelCount: 4, consensus: rain24, meanAbsoluteDeviation: 0, differenceRatio: 0, score: confidenceScore, weight: 0.5 },
        { hours: 48, modelTotals: [], modelCount: 4, consensus: rain48, meanAbsoluteDeviation: 0, differenceRatio: 0, score: confidenceScore, weight: 0.3 },
        { hours: 72, modelTotals: [], modelCount: 4, consensus: rain72, meanAbsoluteDeviation: 0, differenceRatio: 0, score: confidenceScore, weight: 0.2 },
      ],
    },
    weatherConsensus: {
      source: 'multi-model',
      usableModelCount: 4,
      totalConfiguredModelCount: 4,
      horizons: [
        { hours: 24, value: rain24, modelCount: 4, modelKeys: ['aifs', 'ifs', 'gfs', 'ukmo'] },
        { hours: 48, value: rain48, modelCount: 4, modelKeys: ['aifs', 'ifs', 'gfs', 'ukmo'] },
        { hours: 72, value: rain72, modelCount: 4, modelKeys: ['aifs', 'ifs', 'gfs', 'ukmo'] },
      ],
    },
    rainfallSeverity: rainfall,
    riverPercentile,
    riverAbnormality,
    riverTrend: {
      score: riverTrend,
      percentChange: riverTrend >= 70 ? 35 : riverTrend >= 45 ? 12 : 2,
      label: riverTrend >= 70 ? 'rising' : 'stable',
      validDays: 3,
    },
    ensembleConsistency: {
      score: confidenceScore,
      averageSpreadRatio: (100 - confidenceScore) / 100,
      alignedDays: 3,
      requiredAlignedDays: 2,
    },
    freshness: demoFreshness(true, confidenceScore),
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
    contributingFactors: factors,
    lastMeaningfulDataUpdate: null,
    stale: false,
    degraded: false,
  }
}

const incompleteHazard = calculateHazardBreakdown({
  rainfall: null,
  riverAbnormality: null,
  riverTrend: null,
  elevation: 30,
})
const incompleteConfidenceComponents = {
  completeness: 70,
  modelAgreement: null,
  ensembleConsistency: null,
  freshness: 55,
}
const incompleteConfidence = calculateConfidenceBreakdown(incompleteConfidenceComponents)

const incompleteFixture: RiskResult = {
  engineVersion: DEMO_ENGINE_VERSION,
  calculatedAt: DEMO_CALCULATED_AT,
  calculationStatus: 'INCOMPLETE',
  hazardScore: null,
  hazardLevel: null,
  confidenceScore: 30,
  components: incompleteHazard.components,
  effectiveWeights: { rainfall: 0, riverAbnormality: 0, riverTrend: 0, elevation: 0 },
  hazardBreakdown: incompleteHazard.hazardBreakdown,
  confidenceComponents: incompleteConfidenceComponents,
  confidenceBreakdown: incompleteConfidence.confidenceBreakdown,
  modelAgreement: {
    status: 'NO_USABLE_MODELS',
    score: null,
    label: 'Unavailable — no usable weather models',
    weightedDifference: null,
    usableModelCount: 0,
    totalConfiguredModelCount: 4,
    coveredHorizonWeight: 0,
    horizons: [],
  },
  weatherConsensus: {
    source: 'unavailable',
    usableModelCount: 0,
    totalConfiguredModelCount: 4,
    horizons: [
      { hours: 24, value: null, modelCount: 0, modelKeys: [] },
      { hours: 48, value: null, modelCount: 0, modelKeys: [] },
      { hours: 72, value: null, modelCount: 0, modelKeys: [] },
    ],
  },
  rainfallSeverity: null,
  riverPercentile: null,
  riverAbnormality: null,
  riverTrend: { score: null, percentChange: null, label: null, validDays: 0 },
  ensembleConsistency: {
    score: null,
    averageSpreadRatio: null,
    alignedDays: 0,
    requiredAlignedDays: 2,
  },
  freshness: demoFreshness(false, 55),
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
  contributingFactors: [
    'Required rainfall and primary river evidence is unavailable in this demo scenario.',
    'A complete Flood Hazard cannot be calculated until the required evidence is available.',
  ],
  lastMeaningfulDataUpdate: null,
  stale: false,
  degraded: true,
}

export const DEMO_RISK_FIXTURES: Readonly<Record<DemoRiskScenario, RiskResult>> = {
  'demo-low': completeFixture({
    hazardLevel: 'LOW',
    hazardScore: 20,
    confidenceScore: 85,
    rainfall: 16.5,
    rainfallHorizons: [10, 18, 28],
    riverAbnormality: 22,
    riverTrend: 20,
    riverPercentile: 45,
    factors: [
      'Demo fixture: forecast rainfall remains in the lower prototype range.',
      'Demo fixture: modeled river discharge is not unusually high historically.',
      'Demo fixture: the near-term river trend is stable.',
    ],
  }),
  'demo-medium': completeFixture({
    hazardLevel: 'MEDIUM',
    hazardScore: 55,
    confidenceScore: 75,
    rainfall: 57.75,
    rainfallHorizons: [36, 64, 98],
    riverAbnormality: 56,
    riverTrend: 52,
    riverPercentile: 78,
    factors: [
      'Demo fixture: elevated rainfall is forecast across the next three days.',
      'Demo fixture: forecast river discharge is above typical historical conditions.',
      'Demo fixture: the near-term river trend supports readiness planning.',
    ],
  }),
  'demo-high': completeFixture({
    hazardLevel: 'HIGH',
    hazardScore: 82,
    confidenceScore: 72,
    rainfall: 77.25,
    rainfallHorizons: [72, 128, 190],
    riverAbnormality: 92,
    riverTrend: 82,
    riverPercentile: 97,
    factors: [
      'Demo fixture: forecast river discharge is unusually high historically.',
      'Demo fixture: heavy rainfall is forecast.',
      'Demo fixture: the river is rising.',
    ],
  }),
  'demo-incomplete': incompleteFixture,
}

export function resolveRiskScenario(
  liveRisk: RiskResult,
  scenario: RiskScenario,
  developmentEnabled: boolean,
): RiskResult {
  if (!developmentEnabled || scenario === 'live') return liveRisk
  return DEMO_RISK_FIXTURES[scenario]
}
