/**
 * Prototype decision-support heuristics. These thresholds require regional
 * calibration and validation before any operational use.
 */
export const RISK_ENGINE_VERSION = 'deflood-risk-engine-2c-v1'
export const RISK_CACHE_SCHEMA_VERSION = 2
export const RISK_CACHE_MAX_AGE_MS = 30 * 60 * 1000

export const HISTORICAL_SCHEMA_VERSION = 2
export const HISTORICAL_SOURCE_ID = 'open-meteo-glofas-v4-seamless-default'
export const HISTORICAL_START_DATE = '1984-01-01'
export const HISTORICAL_MIN_YEARS = 10
export const HISTORICAL_MIN_SAMPLES = 100
export const HISTORICAL_CACHE_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000

export const AGREEMENT_HORIZON_WEIGHTS = {
  24: 0.5,
  48: 0.3,
  72: 0.2,
} as const
export const AGREEMENT_RAIN_FLOOR_MM = 5
export const AGREEMENT_SCORE_ANCHORS: readonly [number, number][] = [
  [0, 100],
  [0.15, 85],
  [0.3, 65],
  [0.5, 40],
  [1, 0],
]

export const RAINFALL_SEVERITY_WEIGHTS = { hours24: 0.65, hours72: 0.35 } as const
export const RAINFALL_24H_ANCHORS: readonly [number, number][] = [
  [0, 0],
  [10, 10],
  [25, 30],
  [50, 55],
  [100, 85],
  [150, 100],
]
export const RAINFALL_72H_ANCHORS: readonly [number, number][] = [
  [0, 0],
  [25, 10],
  [60, 30],
  [120, 55],
  [200, 85],
  [300, 100],
]

export const RIVER_PERCENTILE_SCORE_ANCHORS: readonly [number, number][] = [
  [0, 0],
  [70, 10],
  [85, 35],
  [95, 65],
  [99, 90],
  [100, 100],
]

export const TREND_PERCENT_FLOOR = 0.1
export const TREND_SCORE_ANCHORS: readonly [number, number][] = [
  [-50, 0],
  [-20, 15],
  [-5, 35],
  [5, 45],
  [20, 70],
  [50, 100],
]

export const ELEVATION_SCORE_ANCHORS: readonly [number, number][] = [
  [-5, 100],
  [2, 100],
  [5, 75],
  [10, 50],
  [20, 20],
  [30, 0],
]

export const HAZARD_WEIGHTS = {
  rainfall: 0.4,
  riverAbnormality: 0.45,
  riverTrend: 0.1,
  elevation: 0.05,
} as const

export const CONFIDENCE_WEIGHTS = {
  completeness: 0.35,
  modelAgreement: 0.3,
  ensembleConsistency: 0.25,
  freshness: 0.1,
} as const

export const COMPLETENESS_WEIGHTS = {
  aifs: 0.15,
  ifs: 0.15,
  river: 0.25,
  historical: 0.35,
  elevation: 0.1,
} as const
export const CACHED_SOURCE_COMPLETENESS_FACTOR = 0.75
export const CACHED_HISTORICAL_COMPLETENESS_FACTOR = 0.9

export const FRESHNESS_WEIGHTS = {
  aifs: 0.25,
  ifs: 0.25,
  river: 0.35,
  elevation: 0.15,
} as const
export const CACHED_FRESHNESS_FACTOR = 0.85

export const ENSEMBLE_MIN_ALIGNED_DAYS = 2
export const ENSEMBLE_MEDIAN_FLOOR = 0.1
export const ENSEMBLE_SCORE_ANCHORS: readonly [number, number][] = [
  [0, 100],
  [0.25, 85],
  [0.5, 65],
  [1, 35],
  [2, 0],
]
