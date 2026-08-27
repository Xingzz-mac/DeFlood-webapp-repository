import { describe, expect, it } from 'vitest'
import { riskMeaning, riskNextStep } from './riskPresentation'

describe('user-facing risk presentation', () => {
  it('gives evidence-recovery guidance for incomplete risk', () => {
    const risk = {
      calculationStatus: 'INCOMPLETE' as const,
      hazardLevel: null,
      contributingFactors: ['Historical evidence is unavailable.'],
    }
    expect(riskMeaning(risk)).toContain('cannot be fully calculated')
    expect(riskNextStep(risk)).toBe('Review missing evidence or retry unavailable sources.')
  })

  it('keeps LOW guidance in preparedness rather than evacuation', () => {
    const risk = {
      calculationStatus: 'COMPLETE' as const,
      hazardLevel: 'LOW' as const,
      contributingFactors: ['Forecast rainfall severity is currently lower.'],
    }
    expect(riskMeaning(risk)).toContain('LOW flood hazard')
    expect(riskNextStep(risk)).toBe('Continue monitoring and review preparedness.')
  })
})
