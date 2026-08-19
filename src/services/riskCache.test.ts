import { describe, expect, it } from 'vitest'
import { calculateRisk } from './riskEngine'
import {
  readRiskCache,
  writeRiskCache,
  type RiskEvidenceIdentity,
} from './riskCache'

class MemoryStorage implements Storage {
  private values = new Map<string, string>()
  get length() { return this.values.size }
  clear() { this.values.clear() }
  getItem(key: string) { return this.values.get(key) ?? null }
  key(index: number) { return [...this.values.keys()][index] ?? null }
  removeItem(key: string) { this.values.delete(key) }
  setItem(key: string, value: string) { this.values.set(key, value) }
}

const evidence: RiskEvidenceIdentity = {
  coordinateFingerprint: '16.5000,95.0000',
  engineVersion: 'engine-v1',
  aifsLastSuccessfulAt: '2026-08-19T00:00:00.000Z',
  aifsState: 'live|fresh|no-refresh-failure|',
  ifsLastSuccessfulAt: '2026-08-19T00:00:00.000Z',
  ifsState: 'live|fresh|no-refresh-failure|',
  riverLastSuccessfulAt: '2026-08-19T00:00:00.000Z',
  riverState: 'live|fresh|no-refresh-failure|',
  elevationLastSuccessfulAt: '2026-08-19T00:00:00.000Z',
  elevationState: 'live|fresh|no-refresh-failure|',
  historicalLastSuccessfulAt: '2026-08-19T00:00:00.000Z',
  historicalMonth: 8,
  historicalSchemaVersion: 1,
  historicalSourceId: 'glofas-v4',
}
const nowMs = Date.parse('2026-08-19T00:00:00.000Z')

describe('derived risk cache identity', () => {
  it('rejects another coordinate', () => {
    const storage = populatedStorage()
    expect(readRiskCache(
      { ...evidence, coordinateFingerprint: '17.5000,96.0000' },
      storage,
      nowMs,
    )).toBeNull()
  })

  it('rejects another engine version', () => {
    const storage = populatedStorage()
    expect(readRiskCache({ ...evidence, engineVersion: 'engine-v2' }, storage, nowMs)).toBeNull()
  })

  it('rejects changed source timestamps', () => {
    const storage = populatedStorage()
    expect(readRiskCache({
      ...evidence,
      riverLastSuccessfulAt: '2026-08-19T01:00:00.000Z',
    }, storage, nowMs)).toBeNull()
  })

  it('rejects an expired derived result', () => {
    const storage = populatedStorage()
    expect(readRiskCache(evidence, storage, nowMs + 30 * 60 * 1000 + 1)).toBeNull()
  })

  it('expires before a contributing weather source exceeds its stale limit', () => {
    const storage = new MemoryStorage()
    const nearExpiry = {
      ...evidence,
      aifsLastSuccessfulAt: new Date(nowMs - 6 * 60 * 60 * 1000 + 60_000).toISOString(),
    }
    writeRiskCache(
      nearExpiry,
      calculateRisk({ environmental: null, historicalBaseline: null, nowMs }),
      storage,
      nowMs,
    )
    expect(readRiskCache(nearExpiry, storage, nowMs + 60_001)).toBeNull()
  })
})

function populatedStorage(): MemoryStorage {
  const storage = new MemoryStorage()
  writeRiskCache(
    evidence,
    calculateRisk({ environmental: null, historicalBaseline: null, nowMs }),
    storage,
    nowMs,
  )
  return storage
}
