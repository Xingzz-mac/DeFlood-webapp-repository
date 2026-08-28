import { describe, expect, it } from 'vitest'
import { ALLOWED_ACTION_REGISTRY } from './allowedActions'
import { calculateEvacuationPlan } from './evacuationEngine'
import type { AllowedActionId, EvacuationCommunityInput, EvacuationRiskInput } from './evacuationTypes'

function community(overrides: Partial<EvacuationCommunityInput> = {}): EvacuationCommunityInput {
  return {
    population: 1000,
    children: 120,
    elderly: 80,
    disabled: 30,
    otherVulnerable: 20,
    volunteers: 25,
    cars: 10,
    trucks: 3,
    boats: 4,
    shelters: 2,
    shelterCapacity: 800,
    water: 'Adequate',
    food: 'Adequate',
    medicine: 'Adequate',
    equipment: 'Adequate',
    ...overrides,
  }
}

function risk(overrides: Partial<EvacuationRiskInput> = {}): EvacuationRiskInput {
  return {
    calculationStatus: 'COMPLETE',
    hazardLevel: 'MEDIUM',
    hazardScore: 55,
    confidenceScore: 82,
    contributingFactors: ['Moderate accumulated rainfall is forecast.'],
    riverTrend: { label: 'rising' },
    ...overrides,
  }
}

function actionIds(plan: ReturnType<typeof calculateEvacuationPlan>): string[] {
  return plan.allowedActions.map(action => action.id)
}

function actionText(plan: ReturnType<typeof calculateEvacuationPlan>, id: AllowedActionId): string | null {
  return plan.allowedActions.find(action => action.id === id)?.text ?? null
}

describe('deterministic evacuation planning', () => {
  it('maps LOW hazard to preparedness without urgent language', () => {
    const plan = calculateEvacuationPlan(community(), risk({ hazardLevel: 'LOW', hazardScore: 20 }))
    expect(plan.planningStatus).toBe('PREPAREDNESS')
    expect(plan.explanations.join(' ')).toContain('evacuation is not recommended')
    expect(plan.explanations.join(' ')).not.toContain('Urgent evacuation planning')
  })

  it('maps MEDIUM hazard to readiness planning', () => {
    const plan = calculateEvacuationPlan(community(), risk())
    expect(plan.planningStatus).toBe('READINESS')
    expect(actionIds(plan)).toContain('review-evacuation-readiness')
  })

  it('maps HIGH hazard to urgent planning but never an official order', () => {
    const plan = calculateEvacuationPlan(community(), risk({ hazardLevel: 'HIGH', hazardScore: 85 }))
    expect(plan.planningStatus).toBe('URGENT_PLANNING')
    expect(plan.explanations.join(' ')).toContain('Urgent evacuation planning is recommended')
    expect(plan.explanations.join(' ')).toContain('not a mandatory or official evacuation order')
  })

  it('keeps incomplete risk NOT_READY with evidence actions only', () => {
    const plan = calculateEvacuationPlan(community(), risk({
      calculationStatus: 'INCOMPLETE',
      hazardLevel: null,
      hazardScore: null,
    }))
    expect(plan.planningStatus).toBe('NOT_READY')
    expect(plan.hazardLevel).toBeNull()
    expect(actionIds(plan)).toEqual(['monitor-risk', 'review-risk-evidence'])
    expect(plan.explanations.join(' ')).toContain('core Flood Hazard evidence is incomplete')
  })

  it('calculates an exact confirmed shelter shortage', () => {
    const plan = calculateEvacuationPlan(community({ population: 1000, shelterCapacity: 650 }), risk())
    expect(plan.shelter.shortage).toBe(350)
    expect(plan.shelter.coveragePercent).toBe(65)
    expect(plan.shelter.shortageConfirmed).toBe(true)
    expect(plan.resourceWarnings).toContain('Reported shelter capacity is short by 350 places.')
  })

  it('does not warn when reported shelter capacity covers the population', () => {
    const plan = calculateEvacuationPlan(community({ population: 1000, shelterCapacity: 1200 }), risk())
    expect(plan.shelter.shortage).toBe(0)
    expect(plan.shelter.coveragePercent).toBe(100)
    expect(plan.shelter.shortageConfirmed).toBe(false)
    expect(plan.resourceWarnings.some(warning => warning.includes('shelter capacity is short'))).toBe(false)
  })

  it('handles zero population without division errors', () => {
    const plan = calculateEvacuationPlan(community({ population: 0, shelterCapacity: 0 }), risk())
    expect(plan.shelter.shortage).toBe(0)
    expect(plan.shelter.coveragePercent).toBe(100)
  })

  it('leaves shelter shortage null and allows verification when capacity is missing', () => {
    const plan = calculateEvacuationPlan(community({ shelterCapacity: undefined }), risk())
    expect(plan.shelter.shortage).toBeNull()
    expect(plan.missingInformation).toContain('Shelter capacity')
    expect(actionIds(plan)).toContain('verify-shelter')
  })

  it('treats vehicles and boats as inventory without inventing carrying capacity', () => {
    const plan = calculateEvacuationPlan(community({ cars: 8, trucks: 2, boats: 3 }), risk())
    expect(plan.transport.vehicles).toBe(10)
    expect(plan.transport.boats).toBe(3)
    expect(plan.transport.vehicleCapacityKnown).toBe(false)
    expect(plan.transport.boatCapacityKnown).toBe(false)
    expect(plan.resourceWarnings).toContain('Transport capacity cannot be assessed from vehicle and boat counts alone.')
    expect(actionIds(plan)).toContain('verify-transport-capacity')
  })

  it('includes only positive supplied priority groups', () => {
    const plan = calculateEvacuationPlan(community({ disabled: 30, elderly: 80, children: 0, otherVulnerable: 0 }), risk())
    expect(plan.priorityGroups).toEqual([
      { id: 'peopleWithDisabilities', label: 'People with disabilities', count: 30 },
      { id: 'elderly', label: 'Elderly residents', count: 80 },
    ])
    expect(actionIds(plan)).toContain('prioritize-vulnerable')
  })

  it('does not prioritize a zero-count vulnerable group', () => {
    const plan = calculateEvacuationPlan(community({ disabled: 0, elderly: 0, children: 0, otherVulnerable: 0 }), risk())
    expect(plan.priorityGroups).toEqual([])
    expect(actionIds(plan)).not.toContain('prioritize-vulnerable')
  })

  it('preserves overlapping group counts separately without creating a unique total', () => {
    const plan = calculateEvacuationPlan(community({ disabled: 40, elderly: 40, children: 40 }), risk())
    expect(plan.priorityGroups.map(group => group.count)).toEqual([40, 40, 40, 20])
    expect('vulnerableTotal' in plan).toBe(false)
  })

  it('allows additional shelter support only for a confirmed shortage in urgent planning', () => {
    const shortage = calculateEvacuationPlan(community({ shelterCapacity: 500 }), risk({ hazardLevel: 'HIGH' }))
    const noShortage = calculateEvacuationPlan(community({ shelterCapacity: 1000 }), risk({ hazardLevel: 'HIGH' }))
    expect(actionIds(shortage)).toContain('seek-additional-shelter-support')
    expect(actionIds(noShortage)).not.toContain('seek-additional-shelter-support')
  })

  it('does not allow a support-request action without a confirmed resource gap', () => {
    const plan = calculateEvacuationPlan(community({ shelterCapacity: 1000 }), risk({ hazardLevel: 'HIGH' }))
    expect(plan.confirmedResourceGap).toBe(false)
    expect(actionIds(plan)).not.toContain('prepare-support-request')
  })

  it('places a confirmed 800-place shelter shortage in trusted contextual action text', () => {
    const plan = calculateEvacuationPlan(
      community({ population: 2000, shelterCapacity: 1200 }),
      risk({ hazardLevel: 'HIGH', hazardScore: 82 }),
    )
    expect(actionText(plan, 'seek-additional-shelter-support')).toBe(
      'Plan additional shelter support for the confirmed shortfall of 800 places.',
    )
    expect(actionText(plan, 'prepare-support-request')).toContain('confirmed shelter shortfall of 800 places')
  })

  it('never inserts false shelter-shortage wording when there is no shortage', () => {
    const plan = calculateEvacuationPlan(
      community({ population: 1000, shelterCapacity: 1200 }),
      risk({ hazardLevel: 'HIGH' }),
    )
    expect(actionIds(plan)).not.toContain('seek-additional-shelter-support')
    expect(plan.allowedActions.map(action => action.text).join(' ')).not.toContain('shelter shortfall')
    expect(plan.allowedActions.map(action => action.text).join(' ')).not.toContain('capacity shortfall')
  })

  it('contextualizes transport inventory while keeping carrying capacity unknown', () => {
    const plan = calculateEvacuationPlan(
      community({ cars: 2, trucks: 2, boats: 2 }),
      risk(),
    )
    expect(plan.transport.vehicles).toBe(4)
    expect(plan.transport.boats).toBe(2)
    expect(plan.transport.vehicleCapacityKnown).toBe(false)
    expect(plan.transport.boatCapacityKnown).toBe(false)
    expect(actionText(plan, 'verify-transport-capacity')).toBe(
      'Verify carrying capacity and availability for the 4 recorded vehicles and 2 recorded boats before estimating transport capability.',
    )
  })

  it('contextualizes overlapping vulnerable groups without summing them', () => {
    const plan = calculateEvacuationPlan(
      community({ disabled: 65, elderly: 140, children: 320, otherVulnerable: 0 }),
      risk(),
    )
    const text = actionText(plan, 'prioritize-vulnerable')
    expect(text).toContain('65 people with disabilities')
    expect(text).toContain('140 elderly residents')
    expect(text).toContain('320 children')
    expect(text).toContain('may overlap and must not be summed into a unique total')
    expect(text).not.toContain('525')
    expect('vulnerableTotal' in plan).toBe(false)
  })

  it('ranks confirmed shelter support above generic monitoring for HIGH hazard', () => {
    const plan = calculateEvacuationPlan(
      community({ population: 2000, shelterCapacity: 1200 }),
      risk({ hazardLevel: 'HIGH' }),
    )
    const priorities = plan.immediatePriorities.map(action => action.id)
    expect(priorities[0]).toBe('seek-additional-shelter-support')
    expect(priorities.indexOf('seek-additional-shelter-support')).toBeLessThan(priorities.indexOf('monitor-risk'))
  })

  it('does not surface urgent resource-gap priorities for LOW hazard', () => {
    const plan = calculateEvacuationPlan(
      community({ population: 2000, shelterCapacity: 1200 }),
      risk({ hazardLevel: 'LOW', hazardScore: 20 }),
    )
    const priorities = plan.immediatePriorities.map(action => action.id)
    expect(plan.planningStatus).toBe('PREPAREDNESS')
    expect(priorities).not.toContain('seek-additional-shelter-support')
    expect(priorities).not.toContain('prepare-support-request')
    expect(plan.immediatePriorities.every(action => action.category !== 'support')).toBe(true)
  })

  it('keeps the complete trusted action ID registry stable', () => {
    expect(Object.keys(ALLOWED_ACTION_REGISTRY)).toEqual([
      'monitor-risk',
      'review-risk-evidence',
      'prioritize-vulnerable',
      'review-evacuation-readiness',
      'verify-shelter',
      'seek-additional-shelter-support',
      'verify-transport-capacity',
      'verify-volunteer-availability',
      'prepare-support-request',
    ])
  })

  it('produces identical contextual actions for identical supplied facts', () => {
    const suppliedCommunity = community({
      population: 2000,
      shelterCapacity: 1200,
      cars: 2,
      trucks: 2,
      boats: 2,
      disabled: 65,
      elderly: 140,
      children: 320,
    })
    const suppliedRisk = risk({ hazardLevel: 'HIGH', hazardScore: 82 })
    const first = calculateEvacuationPlan(suppliedCommunity, suppliedRisk)
    const second = calculateEvacuationPlan(suppliedCommunity, suppliedRisk)
    expect(second.allowedActions).toEqual(first.allowedActions)
    expect(second.immediatePriorities).toEqual(first.immediatePriorities)
  })

  it('keeps Stage 3 output identical when four-model metadata is present outside its deterministic inputs', () => {
    const suppliedCommunity = community()
    const stage2Result = risk({ hazardLevel: 'HIGH', hazardScore: 82, confidenceScore: 76 })
    const fourModelStage2Result = {
      ...stage2Result,
      weatherConsensus: {
        usableModelCount: 4,
        horizons: [
          { hours: 24, value: 30 },
          { hours: 48, value: 50 },
          { hours: 72, value: 80 },
        ],
      },
      modelAgreement: { status: 'FOUR_USABLE_MODELS', score: 76 },
    }

    expect(calculateEvacuationPlan(suppliedCommunity, fourModelStage2Result))
      .toEqual(calculateEvacuationPlan(suppliedCommunity, stage2Result))
  })
})
