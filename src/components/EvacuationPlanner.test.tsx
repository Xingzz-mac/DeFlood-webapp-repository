import { act, create, type ReactTestRendererJSON } from 'react-test-renderer'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { CommunityData } from '../context/CommunityContext'
import type { RiskContextValue } from '../context/RiskContext'
import { calculateEvacuationPlan } from '../services/evacuationEngine'
import type { EvacuationAiResult } from '../services/evacuationTypes'
import { DEMO_RISK_FIXTURES } from '../services/riskScenarios'
import EvacuationPlanner from './EvacuationPlanner'

const useCommunityMock = vi.hoisted(() => vi.fn())
const useRiskMock = vi.hoisted(() => vi.fn())
const useEvacuationPlanMock = vi.hoisted(() => vi.fn())

vi.mock('../context/CommunityContext', () => ({ useCommunity: useCommunityMock }))
vi.mock('../context/RiskContext', () => ({ useRisk: useRiskMock }))
vi.mock('../context/EvacuationContext', () => ({ useEvacuationPlan: useEvacuationPlanMock }))
vi.mock('./EvacuationChat', () => ({ default: () => null }))

function community(overrides: Partial<CommunityData> = {}): CommunityData {
  return {
    name: 'Planner Community',
    township: 'Township',
    region: 'Region',
    population: 2000,
    children: 320,
    elderly: 140,
    disabled: 65,
    otherVulnerable: 20,
    leader: 'Leader',
    mayor: 'Mayor',
    assistant: 'Assistant',
    phone: '000',
    volunteers: 25,
    cars: 2,
    trucks: 2,
    boats: 2,
    shelters: 2,
    shelterCapacity: 1200,
    water: 'Adequate',
    food: 'Adequate',
    medicine: 'Adequate',
    equipment: 'Adequate',
    latitude: 16.5,
    longitude: 95,
    locationSource: 'manual',
    locationAccuracy: null,
    locationUpdatedAt: null,
    ...overrides,
  }
}

function riskValue(scenario: keyof typeof DEMO_RISK_FIXTURES): RiskContextValue {
  return {
    ...DEMO_RISK_FIXTURES[scenario],
    environmentalData: null,
    loading: false,
    error: null,
    refresh: vi.fn(),
  }
}

function setPlanningContext(
  currentCommunity: CommunityData,
  risk: RiskContextValue,
  isSampleData = false,
) {
  const plan = calculateEvacuationPlan(
    currentCommunity,
    risk,
    isSampleData ? 'SAMPLE' : 'USER_CONFIRMED',
  )
  useCommunityMock.mockReturnValue({ community: currentCommunity, isSampleData })
  useRiskMock.mockReturnValue(risk)
  useEvacuationPlanMock.mockReturnValue(plan)
  return plan
}

function pageText(node: ReactTestRendererJSON | ReactTestRendererJSON[] | string | null): string {
  const text = node === null
    ? ''
    : typeof node === 'string'
      ? node
      : Array.isArray(node)
        ? node.map(pageText).join(' ')
        : (node.children ?? []).map(child => typeof child === 'string' ? child : pageText(child)).join(' ')
  return text.replace(/\s+/g, ' ').trim()
}

function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>(next => { resolve = next })
  return { promise, resolve }
}

function generateButton(renderer: ReturnType<typeof create>) {
  return renderer.root.findAllByType('button').find(button => (
    JSON.stringify(button.props.children).includes('Generate AI-assisted plan')
  ))!
}

describe('AI-assisted evacuation plan stale-response protection', () => {
  beforeEach(() => {
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
    useCommunityMock.mockReset()
    useRiskMock.mockReset()
    useEvacuationPlanMock.mockReset()
  })

  it('discards the entire AI-assisted result when planning context changes in flight', async () => {
    const firstCommunity = community()
    const firstRisk = riskValue('demo-low')
    const firstPlan = setPlanningContext(firstCommunity, firstRisk)
    const pending = deferred<EvacuationAiResult>()
    const aiRequester = vi.fn(() => pending.promise)
    let renderer: ReturnType<typeof create> | null = null
    await act(async () => {
      renderer = create(<EvacuationPlanner onNavigate={vi.fn()} aiRequester={aiRequester} />)
    })
    await act(async () => {
      generateButton(renderer!).props.onClick()
      await Promise.resolve()
    })

    const secondCommunity = community({ population: 2600, shelterCapacity: 1000 })
    const secondRisk = riskValue('demo-high')
    setPlanningContext(secondCommunity, secondRisk)
    await act(async () => {
      renderer?.update(<EvacuationPlanner onNavigate={vi.fn()} aiRequester={aiRequester} />)
    })

    const oldAction = firstPlan.allowedActions[0]!
    await act(async () => {
      pending.resolve({
        actions: [oldAction],
        summary: 'Old-context result must be discarded.',
        rejectedActionIds: [],
      })
      await pending.promise
      await Promise.resolve()
    })

    const text = pageText(renderer!.toJSON())
    expect(text).toContain(
      'Planning data changed while DeFlood.AI was responding. Please ask again using the latest data.',
    )
    expect(text).not.toContain('Old-context result must be discarded.')
    expect(text).not.toContain('AI-prioritized verified actions')
    await act(async () => renderer?.unmount())
  })

  it('accepts a valid AI-assisted result when planning context is unchanged', async () => {
    const currentCommunity = community()
    const risk = riskValue('demo-high')
    const plan = setPlanningContext(currentCommunity, risk)
    const trustedAction = plan.allowedActions[0]!
    const result: EvacuationAiResult = {
      actions: [trustedAction],
      summary: 'AI assistance organized 1 verified planning action. Deterministic risk and community facts remain authoritative.',
      rejectedActionIds: [],
    }
    const aiRequester = vi.fn().mockResolvedValue(result)
    let renderer: ReturnType<typeof create> | null = null
    await act(async () => {
      renderer = create(<EvacuationPlanner onNavigate={vi.fn()} aiRequester={aiRequester} />)
    })
    await act(async () => {
      generateButton(renderer!).props.onClick()
      await Promise.resolve()
      await Promise.resolve()
    })

    const text = pageText(renderer!.toJSON())
    expect(text).toContain('AI-prioritized verified actions')
    expect(text).toContain(result.summary)
    expect(text).toContain(trustedAction.text)
    expect(text).not.toContain('Planning data changed while DeFlood.AI was responding.')
    await act(async () => renderer?.unmount())
  })

  it('qualifies sample-data planning gaps and leaves Stage 3 numbers unchanged after confirmation', async () => {
    const currentCommunity = community()
    const risk = riskValue('demo-high')
    const samplePlan = setPlanningContext(currentCommunity, risk, true)
    let renderer: ReturnType<typeof create> | null = null
    await act(async () => {
      renderer = create(<EvacuationPlanner onNavigate={vi.fn()} />)
    })

    const sampleText = pageText(renderer!.toJSON())
    expect(sampleText).toContain('Demo community data — planning results are derived from sample inputs.')
    expect(sampleText).toContain('Sample-data shortage')
    expect(sampleText).toContain('Sample-data shelter shortfall')
    expect(sampleText).toContain('All app-validated sample-data planning actions')
    expect(sampleText).not.toContain('Confirmed shelter shortfall')
    expect(sampleText).not.toContain('confirmed shortfall')

    const confirmedPlan = setPlanningContext(currentCommunity, risk, false)
    await act(async () => {
      renderer?.update(<EvacuationPlanner onNavigate={vi.fn()} />)
    })

    const confirmedText = pageText(renderer!.toJSON())
    expect(confirmedText).toContain('Confirmed shortage')
    expect(confirmedText).toContain('Confirmed shelter shortfall')
    expect(confirmedText).not.toContain('Demo community data')
    expect(confirmedPlan.shelter).toEqual(samplePlan.shelter)
    expect(confirmedPlan.transport).toEqual(samplePlan.transport)
    expect(confirmedPlan.priorityGroups).toEqual(samplePlan.priorityGroups)
    expect(confirmedPlan.immediatePriorities.map(action => action.id)).toEqual(
      samplePlan.immediatePriorities.map(action => action.id),
    )
    await act(async () => renderer?.unmount())
  })
})
