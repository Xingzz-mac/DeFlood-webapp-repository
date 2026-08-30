import { describe, expect, it } from 'vitest'
import { DEMO_RISK_FIXTURES } from './riskScenarios'
import {
  floodAssessmentPresentation,
  riskMeaning,
  riskNextStep,
} from './riskPresentation'

describe('user-facing risk presentation', () => {
  it('gives evidence-recovery guidance for incomplete risk', () => {
    const risk = {
      calculationStatus: 'INCOMPLETE' as const,
      hazardLevel: null,
      rainfallSeverity: null,
      contributingFactors: ['Historical evidence is unavailable.'],
    }
    expect(riskMeaning(risk)).toContain('usable core rainfall evidence')
    expect(riskNextStep(risk)).toBe('Review missing evidence or retry unavailable sources.')
  })

  it('presents usable rainfall with incomplete required river evidence as limited without mutating risk', () => {
    const risk = {
      ...DEMO_RISK_FIXTURES['demo-medium'],
      calculationStatus: 'INCOMPLETE' as const,
      hazardScore: null,
      hazardLevel: null,
      riverPercentile: null,
      riverAbnormality: null,
    }
    const before = JSON.stringify(risk)

    expect(floodAssessmentPresentation(risk)).toEqual({
      mode: 'LIMITED',
      label: 'LIMITED FLOOD ASSESSMENT',
    })
    expect(riskMeaning(risk)).toContain('required modeled river evidence')
    expect(risk.calculationStatus).toBe('INCOMPLETE')
    expect(risk.hazardScore).toBeNull()
    expect(risk.hazardLevel).toBeNull()
    expect(JSON.stringify(risk)).toBe(before)
  })

  it('presents incomplete core rainfall evidence as assessment unavailable', () => {
    expect(floodAssessmentPresentation(DEMO_RISK_FIXTURES['demo-incomplete'])).toEqual({
      mode: 'ASSESSMENT_UNAVAILABLE',
      label: 'ASSESSMENT UNAVAILABLE',
    })
  })

  it.each([
    ['demo-low', 'LOW'],
    ['demo-medium', 'MEDIUM'],
    ['demo-high', 'HIGH'],
  ] as const)('keeps the complete %s presentation as %s', (scenario, label) => {
    expect(floodAssessmentPresentation(DEMO_RISK_FIXTURES[scenario])).toEqual({
      mode: 'COMPLETE',
      label,
    })
  })

  it('keeps LOW guidance in preparedness rather than evacuation', () => {
    const risk = {
      calculationStatus: 'COMPLETE' as const,
      hazardLevel: 'LOW' as const,
      rainfallSeverity: 15,
      contributingFactors: ['Forecast rainfall severity is currently lower.'],
    }
    expect(riskMeaning(risk)).toContain('LOW flood hazard')
    expect(riskNextStep(risk)).toBe('Continue monitoring and review preparedness.')
  })
})
