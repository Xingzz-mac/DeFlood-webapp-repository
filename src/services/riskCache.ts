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
import { calculateRisk } from './riskEngine'
import type { HistoricalBaseline, RiskEngineInput, RiskResult } from './riskTypes'
import type { EnvironmentalData } from './types'

export interface RiskEvidenceIdentity {
  coordinateFingerprint: string
  engineVersion: string
  aifsLastSuccessfulAt: string | null
  aifsState: string
  ifsLastSuccessfulAt: string | null
  ifsState: string
  riverLastSuccessfulAt: string | null
  riverState: string
  elevationLastSuccessfulAt: string | null
  elevationState: string
  historicalLastSuccessfulAt: string | null
  historicalMonth: number | null
  historicalSchemaVersion: number | null
  historicalSourceId: string | null
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

export function buildRiskEvidence(
  environmental: EnvironmentalData,
  historical: HistoricalBaseline | null,
  engineVersion = RISK_ENGINE_VERSION,
): RiskEvidenceIdentity {
  return {
    coordinateFingerprint: environmental.fingerprint,
    engineVersion,
    aifsLastSuccessfulAt: environmental.weatherModels.aifs.metadata.lastSuccessfulAt,
    aifsState: sourceState(environmental.weatherModels.aifs.metadata),
    ifsLastSuccessfulAt: environmental.weatherModels.ifs.metadata.lastSuccessfulAt,
    ifsState: sourceState(environmental.weatherModels.ifs.metadata),
    riverLastSuccessfulAt: environmental.river.metadata.lastSuccessfulAt,
    riverState: sourceState(environmental.river.metadata),
    elevationLastSuccessfulAt: environmental.terrain.metadata.lastSuccessfulAt,
    elevationState: sourceState(environmental.terrain.metadata),
    historicalLastSuccessfulAt: historical?.lastSuccessfulAt ?? null,
    historicalMonth: historical?.calendarMonth ?? null,
    historicalSchemaVersion: historical?.schemaVersion ?? null,
    historicalSourceId: historical?.sourceId ?? null,
  }
}

function sourceState(metadata: EnvironmentalData['river']['metadata']): string {
  return [
    metadata.status,
    metadata.cached ? 'cached' : 'fresh',
    metadata.refreshAttempt?.status ?? 'no-refresh-failure',
    metadata.refreshAttempt?.retrievedAt ?? '',
  ].join('|')
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
  return `deflood-risk:v${RISK_CACHE_SCHEMA_VERSION}:${evidence.coordinateFingerprint}:${version}:${hashEvidence(JSON.stringify(evidence))}`
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
    if (JSON.stringify(entry.evidence) !== JSON.stringify(evidence)) return null
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

export function calculateRiskWithCache(input: RiskEngineInput): RiskResult {
  if (!input.environmental) return calculateRisk(input)
  const evidence = buildRiskEvidence(input.environmental, input.historicalBaseline)
  const cached = readRiskCache(evidence, undefined, input.nowMs)
  if (cached) return cached
  const result = calculateRisk(input)
  writeRiskCache(evidence, result, undefined, input.nowMs)
  return result
}
