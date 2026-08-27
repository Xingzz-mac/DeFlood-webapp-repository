import { describe, expect, it } from 'vitest'
import { calculateRisk } from './riskEngine'
import { DEMO_RISK_FIXTURES, resolveRiskScenario } from './riskScenarios'

describe('typed development risk fixtures', () => {
  it('provides deterministic LOW, MEDIUM, HIGH, and INCOMPLETE results', () => {
    expect(DEMO_RISK_FIXTURES['demo-low']).toMatchObject({
      calculationStatus: 'COMPLETE',
      hazardLevel: 'LOW',
      hazardScore: 20,
      confidenceScore: 85,
    })
    expect(DEMO_RISK_FIXTURES['demo-medium']).toMatchObject({
      calculationStatus: 'COMPLETE',
      hazardLevel: 'MEDIUM',
      hazardScore: 55,
      confidenceScore: 75,
    })
    expect(DEMO_RISK_FIXTURES['demo-high']).toMatchObject({
      calculationStatus: 'COMPLETE',
      hazardLevel: 'HIGH',
      hazardScore: 82,
      confidenceScore: 72,
    })
    expect(DEMO_RISK_FIXTURES['demo-high'].contributingFactors).toEqual(expect.arrayContaining([
      'Demo fixture: forecast river discharge is unusually high historically.',
      'Demo fixture: heavy rainfall is forecast.',
      'Demo fixture: the river is rising.',
    ]))
    expect(DEMO_RISK_FIXTURES['demo-incomplete']).toMatchObject({
      calculationStatus: 'INCOMPLETE',
      hazardLevel: null,
      hazardScore: null,
      confidenceScore: 30,
    })
    expect(DEMO_RISK_FIXTURES['demo-incomplete'].contributingFactors.join(' ')).toContain('evidence is unavailable')
  })

  it('returns the live object unchanged for Live Data and for any production request', () => {
    const live = calculateRisk({ environmental: null, historicalBaseline: null, nowMs: 0 })
    expect(resolveRiskScenario(live, 'live', true)).toBe(live)
    expect(resolveRiskScenario(live, 'demo-high', false)).toBe(live)
  })
})
