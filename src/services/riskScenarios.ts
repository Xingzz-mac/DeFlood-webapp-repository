import type { FloodHazardLevel, RiskResult } from './riskTypes'

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
const EFFECTIVE_WEIGHTS = {
  rainfall: 0.45,
  riverAbnormality: 0.35,
  riverTrend: 0.15,
  elevation: 0.05,
}

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
  return {
    engineVersion: DEMO_ENGINE_VERSION,
    calculatedAt: DEMO_CALCULATED_AT,
    calculationStatus: 'COMPLETE',
    hazardScore,
    hazardLevel,
    confidenceScore,
    components: {
      rainfall: { score: rainfall, baseWeight: EFFECTIVE_WEIGHTS.rainfall, effectiveWeight: EFFECTIVE_WEIGHTS.rainfall },
      riverAbnormality: { score: riverAbnormality, baseWeight: EFFECTIVE_WEIGHTS.riverAbnormality, effectiveWeight: EFFECTIVE_WEIGHTS.riverAbnormality },
      riverTrend: { score: riverTrend, baseWeight: EFFECTIVE_WEIGHTS.riverTrend, effectiveWeight: EFFECTIVE_WEIGHTS.riverTrend },
      elevation: { score: 30, baseWeight: EFFECTIVE_WEIGHTS.elevation, effectiveWeight: EFFECTIVE_WEIGHTS.elevation },
    },
    effectiveWeights: { ...EFFECTIVE_WEIGHTS },
    confidenceComponents: {
      completeness: confidenceScore,
      modelAgreement: confidenceScore,
      ensembleConsistency: confidenceScore,
      freshness: confidenceScore,
    },
    modelAgreement: {
      status: 'BOTH_MODELS_COMPLETE_FOR_AGREEMENT',
      score: confidenceScore,
      label: confidenceScore >= 80 ? 'Strong' : 'Moderate',
      weightedDifference: (100 - confidenceScore) / 100,
      horizons: [
        { hours: 24, aifs: rain24, ifs: rain24, differenceRatio: 0, weight: 0.5 },
        { hours: 48, aifs: rain48, ifs: rain48, differenceRatio: 0, weight: 0.3 },
        { hours: 72, aifs: rain72, ifs: rain72, differenceRatio: 0, weight: 0.2 },
      ],
    },
    weatherConsensus: {
      source: 'aifs+ifs',
      horizons: [
        { hours: 24, value: rain24 },
        { hours: 48, value: rain48 },
        { hours: 72, value: rain72 },
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

const incompleteFixture: RiskResult = {
  engineVersion: DEMO_ENGINE_VERSION,
  calculatedAt: DEMO_CALCULATED_AT,
  calculationStatus: 'INCOMPLETE',
  hazardScore: null,
  hazardLevel: null,
  confidenceScore: 30,
  components: {
    rainfall: { score: null, baseWeight: EFFECTIVE_WEIGHTS.rainfall, effectiveWeight: 0 },
    riverAbnormality: { score: null, baseWeight: EFFECTIVE_WEIGHTS.riverAbnormality, effectiveWeight: 0 },
    riverTrend: { score: null, baseWeight: EFFECTIVE_WEIGHTS.riverTrend, effectiveWeight: 0 },
    elevation: { score: 30, baseWeight: EFFECTIVE_WEIGHTS.elevation, effectiveWeight: 1 },
  },
  effectiveWeights: { rainfall: 0, riverAbnormality: 0, riverTrend: 0, elevation: 1 },
  confidenceComponents: { completeness: 25, modelAgreement: null, ensembleConsistency: null, freshness: 35 },
  modelAgreement: {
    status: 'NO_USABLE_MODELS',
    score: null,
    label: 'Unavailable — no usable weather models',
    weightedDifference: null,
    horizons: [],
  },
  weatherConsensus: {
    source: 'unavailable',
    horizons: [
      { hours: 24, value: null },
      { hours: 48, value: null },
      { hours: 72, value: null },
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
  freshness: demoFreshness(false, 35),
  historicalBaseline: null,
  sourceInformation: {
    aifs: 'unavailable',
    ifs: 'unavailable',
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
    rainfall: 18,
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
    rainfall: 58,
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
    rainfall: 86,
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
