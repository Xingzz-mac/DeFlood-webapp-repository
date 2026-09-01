import { act, create } from 'react-test-renderer'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { CommunityData } from './CommunityContext'
import { DEMO_RISK_FIXTURES } from '../services/riskScenarios'
import { EvacuationProvider, useEvacuationPlan } from './EvacuationContext'

const useCommunityMock = vi.hoisted(() => vi.fn())
const useRiskMock = vi.hoisted(() => vi.fn())

vi.mock('./CommunityContext', () => ({ useCommunity: useCommunityMock }))
vi.mock('./RiskContext', () => ({ useRisk: useRiskMock }))

const community: CommunityData = {
  name: 'Community', township: 'Township', region: 'Region', population: 2000,
  children: 320, elderly: 140, disabled: 65, otherVulnerable: 20,
  leader: 'Leader', mayor: 'Mayor', assistant: 'Assistant', phone: '000',
  volunteers: 25, cars: 2, trucks: 2, boats: 2, shelters: 2, shelterCapacity: 1200,
  water: 'Adequate', food: 'Limited', medicine: 'Adequate', equipment: 'Adequate',
  latitude: 16.5, longitude: 95, locationSource: 'manual', locationAccuracy: null,
  locationUpdatedAt: null,
}

describe('EvacuationContext provenance propagation', () => {
  beforeEach(() => {
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
    useRiskMock.mockReturnValue(DEMO_RISK_FIXTURES['demo-high'])
  })

  it('maps CommunityContext sample state to the shared plan and changes only wording after save', async () => {
    let plan: ReturnType<typeof useEvacuationPlan> | null = null
    function Consumer() {
      plan = useEvacuationPlan()
      return null
    }

    useCommunityMock.mockReturnValue({ community, isSampleData: true })
    let renderer: ReturnType<typeof create> | null = null
    await act(async () => { renderer = create(<EvacuationProvider><Consumer /></EvacuationProvider>) })
    const samplePlan = plan!
    expect(samplePlan.dataProvenance).toBe('SAMPLE')
    expect(samplePlan.allowedActions.map(action => action.text).join(' ')).not.toContain('confirmed shortfall')

    useCommunityMock.mockReturnValue({ community, isSampleData: false })
    await act(async () => { renderer?.update(<EvacuationProvider><Consumer /></EvacuationProvider>) })
    const confirmedPlan = plan!
    expect(confirmedPlan.dataProvenance).toBe('USER_CONFIRMED')
    expect(confirmedPlan.allowedActions.map(action => action.text).join(' ')).toContain('confirmed shortfall')
    expect(confirmedPlan.shelter).toEqual(samplePlan.shelter)
    expect(confirmedPlan.transport).toEqual(samplePlan.transport)
    expect(confirmedPlan.allowedActions.map(action => action.id)).toEqual(samplePlan.allowedActions.map(action => action.id))
    await act(async () => renderer?.unmount())
  })
})
