import type { EnvironmentalData, SourceStatus } from './types'

export type CalculationStatus = 'NOT_CALCULATED' | 'INCOMPLETE' | 'COMPLETE'
export type FloodHazardLevel = 'LOW' | 'MEDIUM' | 'HIGH'
export type AgreementLabel =
  | 'Strong'
  | 'Moderate'
  | 'Weak'
  | 'Poor'
  | 'Unavailable — single weather model'
  | 'Unavailable — no usable weather models'
  | 'Unavailable — incomplete horizons'
export type WeatherConsensusSource = 'aifs+ifs' | 'aifs' | 'ifs' | 'unavailable'
export type TrendLabel = 'sharply rising' | 'rising' | 'stable' | 'falling' | 'sharply falling'

export interface AgreementHorizon {
  hours: 24 | 48 | 72
  aifs: number
  ifs: number
  differenceRatio: number
  weight: number
}

export interface ModelAgreement {
  score: number | null
  label: AgreementLabel
  weightedDifference: number | null
  horizons: AgreementHorizon[]
}

export interface ConsensusHorizon {
  hours: 24 | 48 | 72
  value: number | null
}

export interface WeatherConsensus {
  source: WeatherConsensusSource
  horizons: ConsensusHorizon[]
}

export type HistoricalBaselineStatus = 'available' | 'unavailable' | 'error'

export interface HistoricalBaseline {
  status: HistoricalBaselineStatus
  coordinateFingerprint: string
  calendarMonth: number
  values: number[]
  validSampleCount: number
  distinctYears: number
  firstValidDate: string | null
  lastValidDate: string | null
  unit: 'm³/s'
  sourceId: string
  schemaVersion: number
  retrievedAt: string
  lastSuccessfulAt: string | null
  cachedAt: string | null
  cached: boolean
  error: string | null
}

export interface HazardComponent {
  score: number | null
  baseWeight: number
  effectiveWeight: number
}

export interface HazardComponents {
  rainfall: HazardComponent
  riverAbnormality: HazardComponent
  riverTrend: HazardComponent
  elevation: HazardComponent
}

export interface EnsembleConsistency {
  score: number | null
  averageSpreadRatio: number | null
  alignedDays: number
  requiredAlignedDays: number
}

export interface TrendAnalysis {
  score: number | null
  percentChange: number | null
  label: TrendLabel | null
  validDays: number
}

export interface FreshnessSourceScore {
  score: number
  ageMs: number | null
  maxAgeMs: number
  usable: boolean
  cached: boolean
}

export interface FreshnessResult {
  score: number
  sources: {
    aifs: FreshnessSourceScore
    ifs: FreshnessSourceScore
    river: FreshnessSourceScore
    elevation: FreshnessSourceScore
  }
}

export interface ConfidenceComponents {
  completeness: number
  modelAgreement: number | null
  ensembleConsistency: number | null
  freshness: number
}

export interface SourceInformation {
  aifs: SourceStatus
  ifs: SourceStatus
  river: SourceStatus
  elevation: SourceStatus
  historical: HistoricalBaselineStatus | 'not-requested'
}

export interface RiskResult {
  engineVersion: string
  calculatedAt: string
  calculationStatus: CalculationStatus
  hazardScore: number | null
  hazardLevel: FloodHazardLevel | null
  confidenceScore: number
  components: HazardComponents
  effectiveWeights: Record<keyof HazardComponents, number>
  confidenceComponents: ConfidenceComponents
  modelAgreement: ModelAgreement
  weatherConsensus: WeatherConsensus
  rainfallSeverity: number | null
  riverPercentile: number | null
  riverAbnormality: number | null
  riverTrend: TrendAnalysis
  ensembleConsistency: EnsembleConsistency
  freshness: FreshnessResult
  historicalBaseline: HistoricalBaseline | null
  sourceInformation: SourceInformation
  contributingFactors: string[]
  lastMeaningfulDataUpdate: string | null
  stale: boolean
  degraded: boolean
}

export interface RiskEngineInput {
  environmental: EnvironmentalData | null
  historicalBaseline: HistoricalBaseline | null
  nowMs?: number
}
