import {
  HISTORICAL_CACHE_MAX_AGE_MS,
  RISK_CACHE_MAX_AGE_MS,
  RISK_CACHE_SCHEMA_VERSION,
  RISK_ENGINE_VERSION,
} from './riskConfig'
import {
  ELEVATION_MAX_STALE_MS,
  RIVER_MAX_STALE_MS,
  WEATHER_MAX_STALE_MS,
} from './config'
import { isWeatherModelUsable } from './ecmwf'
import { isPrimaryRiverUsable } from './glofas'
import { calculateRisk } from './riskEngine'
import { calculateRiverTrend } from './riskScoring'
import type { HistoricalBaseline, RiskEngineInput, RiskResult } from './riskTypes'
import type { EnvironmentalData, SourceMetadata, WeatherModelData } from './types'

export interface RiskEvidenceIdentity {
  coordinateFingerprint: string
  engineVersion: string
  evidenceHash: string
  evidencePayload: string
  aifsLastSuccessfulAt: string | null
  ifsLastSuccessfulAt: string | null
  riverLastSuccessfulAt: string | null
  elevationLastSuccessfulAt: string | null
  historicalLastSuccessfulAt: string | null
}

interface RiskCacheEntry {
  schemaVersion: number
  evidence: RiskEvidenceIdentity
  cachedAt: string
  expiresAt: string
  result: RiskResult
}

function availableStorage(storage?: Storage): Storage | null {
  if (storage) return storage
  return typeof localStorage === 'undefined' ? null : localStorage
}

function hashEvidence(value: string): string {
  let hash = 2166136261
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index)
    hash = Math.imul(hash, 16777619)
  }
  return (hash >>> 0).toString(36)
}

function finiteOrNull(value: number | null): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

function metadataEvidence(metadata: SourceMetadata) {
  return {
    status: metadata.status,
    lastSuccessfulAt: metadata.lastSuccessfulAt,
    cachedAt: metadata.cachedAt,
    cached: metadata.cached,
    refreshAttempt: metadata.refreshAttempt
      ? {
          status: metadata.refreshAttempt.status,
          retrievedAt: metadata.refreshAttempt.retrievedAt,
          error: metadata.refreshAttempt.error,
        }
      : null,
  }
}

function weatherEvidence(model: WeatherModelData) {
  return {
    usable: isWeatherModelUsable(model),
    model: model.model,
    horizons: ([24, 48, 72] as const).map(hours => {
      const horizon = model.horizons.find(candidate => candidate.hours === hours)
      return {
        hours,
        total: finiteOrNull(horizon?.total ?? null),
        expectedHours: horizon?.expectedHours ?? null,
        validHours: horizon?.validHours ?? null,
        coverage: finiteOrNull(horizon?.coverage ?? null),
        complete: horizon?.complete ?? false,
      }
    }),
    metadata: metadataEvidence(model.metadata),
  }
}

export function buildRiskEvidence(
  environmental: EnvironmentalData,
  historical: HistoricalBaseline | null,
  engineVersion = RISK_ENGINE_VERSION,
): RiskEvidenceIdentity {
  const nearTermDays = environmental.river.days.slice(0, 3)
  const trend = calculateRiverTrend(environmental.river.days)
  const evidencePayload = JSON.stringify({
    coordinateFingerprint: environmental.fingerprint,
    engineVersion,
    weather: {
      aifs: weatherEvidence(environmental.weatherModels.aifs),
      ifs: weatherEvidence(environmental.weatherModels.ifs),
    },
    river: {
      primaryUsable: isPrimaryRiverUsable(environmental.river.days),
      primary: nearTermDays.map(day => ({
        date: day.date,
        discharge: finiteOrNull(day.discharge),
      })),
      peakDischarge: finiteOrNull(environmental.river.peakDischarge),
      peakDate: environmental.river.peakDate,
      trend: {
        sourceValue: environmental.river.trend,
        score: trend.score,
        percentChange: trend.percentChange,
        label: trend.label,
        validDays: trend.validDays,
      },
      alignedEnsemble: nearTermDays.map(day => ({
        date: day.date,
        p25: finiteOrNull(day.p25),
        median: finiteOrNull(day.median),
        p75: finiteOrNull(day.p75),
      })),
      metadata: metadataEvidence(environmental.river.metadata),
    },
    elevation: {
      value: finiteOrNull(environmental.terrain.elevation),
      metadata: metadataEvidence(environmental.terrain.metadata),
    },
    historical: historical
      ? {
          coordinateFingerprint: historical.coordinateFingerprint,
          calendarMonth: historical.calendarMonth,
          sourceId: historical.sourceId,
          schemaVersion: historical.schemaVersion,
          status: historical.status,
          validSampleCount: historical.validSampleCount,
          distinctYears: historical.distinctYears,
          cached: historical.cached,
          cachedAt: historical.cachedAt,
          lastSuccessfulAt: historical.lastSuccessfulAt,
          values: historical.values.filter(value => Number.isFinite(value)),
        }
      : null,
  })

  return {
    coordinateFingerprint: environmental.fingerprint,
    engineVersion,
    evidenceHash: hashEvidence(evidencePayload),
    evidencePayload,
    aifsLastSuccessfulAt: environmental.weatherModels.aifs.metadata.lastSuccessfulAt,
    ifsLastSuccessfulAt: environmental.weatherModels.ifs.metadata.lastSuccessfulAt,
    riverLastSuccessfulAt: environmental.river.metadata.lastSuccessfulAt,
    elevationLastSuccessfulAt: environmental.terrain.metadata.lastSuccessfulAt,
    historicalLastSuccessfulAt: historical?.lastSuccessfulAt ?? null,
  }
}

function evidenceExpiryMs(evidence: RiskEvidenceIdentity, nowMs: number): number {
  const expiries = [
    [evidence.aifsLastSuccessfulAt, WEATHER_MAX_STALE_MS],
    [evidence.ifsLastSuccessfulAt, WEATHER_MAX_STALE_MS],
    [evidence.riverLastSuccessfulAt, RIVER_MAX_STALE_MS],
    [evidence.elevationLastSuccessfulAt, ELEVATION_MAX_STALE_MS],
    [evidence.historicalLastSuccessfulAt, HISTORICAL_CACHE_MAX_AGE_MS],
  ].flatMap(([timestamp, maxAge]) => {
    if (typeof timestamp !== 'string' || typeof maxAge !== 'number') return []
    const parsed = Date.parse(timestamp)
    return Number.isFinite(parsed) ? [parsed + maxAge] : []
  })
  return Math.min(nowMs + RISK_CACHE_MAX_AGE_MS, ...expiries)
}

export function riskCacheKey(evidence: RiskEvidenceIdentity): string {
  const version = evidence.engineVersion.replace(/[^a-zA-Z0-9_-]/g, '_')
  return `deflood-risk:v${RISK_CACHE_SCHEMA_VERSION}:${evidence.coordinateFingerprint}:${version}:${evidence.evidenceHash}`
}

export function readRiskCache(
  evidence: RiskEvidenceIdentity,
  storage?: Storage,
  nowMs = Date.now(),
): RiskResult | null {
  try {
    const target = availableStorage(storage)
    if (!target) return null
    const raw = target.getItem(riskCacheKey(evidence))
    if (!raw) return null
    const entry = JSON.parse(raw) as RiskCacheEntry
    if (entry.schemaVersion !== RISK_CACHE_SCHEMA_VERSION) return null
    if (entry.evidence.coordinateFingerprint !== evidence.coordinateFingerprint) return null
    if (entry.evidence.engineVersion !== evidence.engineVersion) return null
    if (entry.evidence.evidenceHash !== evidence.evidenceHash) return null
    // The key stays compact, while this exact comparison prevents a hash collision
    // from ever reusing a result for a different evidence payload.
    if (entry.evidence.evidencePayload !== evidence.evidencePayload) return null
    const expiresAt = Date.parse(entry.expiresAt)
    if (!Number.isFinite(expiresAt) || nowMs > expiresAt) return null
    return entry.result
  } catch {
    return null
  }
}

export function writeRiskCache(
  evidence: RiskEvidenceIdentity,
  result: RiskResult,
  storage?: Storage,
  nowMs = Date.now(),
): void {
  try {
    const target = availableStorage(storage)
    if (!target) return
    const expiresAtMs = evidenceExpiryMs(evidence, nowMs)
    if (expiresAtMs <= nowMs) return
    const entry: RiskCacheEntry = {
      schemaVersion: RISK_CACHE_SCHEMA_VERSION,
      evidence,
      cachedAt: new Date(nowMs).toISOString(),
      expiresAt: new Date(expiresAtMs).toISOString(),
      result,
    }
    target.setItem(riskCacheKey(evidence), JSON.stringify(entry))
  } catch {
    // derived caching is best effort
  }
}

export function calculateRiskWithCache(
  input: RiskEngineInput,
  storage?: Storage,
): RiskResult {
  if (!input.environmental) return calculateRisk(input)
  const nowMs = input.nowMs ?? Date.now()
  const currentInput = { ...input, nowMs }
  const evidence = buildRiskEvidence(input.environmental, input.historicalBaseline)
  const cached = readRiskCache(evidence, storage, nowMs)
  if (cached) {
    // Source evidence is unchanged, but freshness and confidence are time-dependent.
    // Recalculate the result so a cache hit can never freeze either value.
    return calculateRisk(currentInput)
  }
  const result = calculateRisk(currentInput)
  writeRiskCache(evidence, result, storage, nowMs)
  return result
}
