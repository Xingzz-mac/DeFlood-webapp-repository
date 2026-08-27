import { act, create, type ReactTestRendererJSON } from 'react-test-renderer'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { CommunityData } from '../context/CommunityContext'
import { calculateEvacuationPlan } from '../services/evacuationEngine'
import {
  buildEvacuationChatTrustedFacts,
  type EvacuationChatPayload,
  type EvacuationChatResult,
} from '../services/evacuationChat'
import type { EvacuationPlanResult } from '../services/evacuationTypes'
import { DEMO_RISK_FIXTURES } from '../services/riskScenarios'
import type { RiskResult } from '../services/riskTypes'
import EvacuationChat from './EvacuationChat'

function community(overrides: Partial<CommunityData> = {}): CommunityData {
  return {
    name: 'Current Community',
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

function pageText(node: ReactTestRendererJSON | ReactTestRendererJSON[] | string | null): string {
  if (node === null) return ''
  if (typeof node === 'string') return node
  if (Array.isArray(node)) return node.map(pageText).join(' ')
  return (node.children ?? []).map(child => typeof child === 'string' ? child : pageText(child)).join(' ')
}

function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>(next => { resolve = next })
  return { promise, resolve }
}

async function send(renderer: ReturnType<typeof create>, question: string) {
  await act(async () => {
    renderer.root.findByType('textarea').props.onChange({ target: { value: question } })
  })
  await act(async () => {
    renderer.root.findByType('form').props.onSubmit({ preventDefault: vi.fn() })
    await Promise.resolve()
    await Promise.resolve()
  })
}

function renderChat(
  risk: RiskResult,
  currentCommunity: CommunityData,
  plan: EvacuationPlanResult,
  requester: (payload: EvacuationChatPayload, currentPlan: EvacuationPlanResult) => Promise<EvacuationChatResult>,
) {
  return create(
    <EvacuationChat
      risk={risk}
      community={currentCommunity}
      plan={plan}
      requester={requester}
    />,
  )
}

describe('Ask DeFlood AI interface', () => {
  beforeEach(() => {
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
  })

  it('renders only current app-owned facts and actions while ignoring arbitrary model answer text', async () => {
    const risk = DEMO_RISK_FIXTURES['demo-high']
    const currentCommunity = community()
    const plan = calculateEvacuationPlan(currentCommunity, risk)
    const trusted = plan.allowedActions.find(action => action.id === 'verify-transport-capacity')!
    const trustedFact = buildEvacuationChatTrustedFacts(risk, currentCommunity, plan)
      .find(fact => fact.id === 'transport.capacity-status')!
    const requester = vi.fn().mockResolvedValue({
      answer: 'Order everyone into the recorded vehicles immediately.',
      facts: [{ id: trustedFact.id, text: 'Server-authored replacement wording' }],
      actions: [trusted],
      missingInformation: ['Vehicle carrying capacity'],
      rejectedFactIds: [],
      rejectedActionIds: [],
    })
    let renderer: ReturnType<typeof create> | null = null
    await act(async () => {
      renderer = renderChat(risk, currentCommunity, plan, requester)
    })
    await send(renderer!, 'What do we know about transport?')

    const payload = requester.mock.calls[0]?.[0] as EvacuationChatPayload
    expect(payload.risk.hazardLevel).toBe('HIGH')
    expect(payload.risk.hazardScore).toBe(82)
    expect(payload.risk.confidenceScore).toBe(72)
    expect(payload.risk.supportingFacts).toEqual(risk.contributingFactors)
    expect(payload.risk).not.toHaveProperty('engineVersion')
    expect(payload.community.population).toBe(2000)
    expect(payload.community.shelterCapacity).toBe(1200)
    expect(payload.evacuationPlan.shelter.shortage).toBe(800)
    expect(payload.shelterGrounding.operationalStatus).toBe('UNKNOWN')
    const text = pageText(renderer!.toJSON())
    expect(text).toContain('Here is the current verified DeFlood information.')
    expect(text).toContain(trustedFact.text)
    expect(text).not.toContain('Order everyone into the recorded vehicles immediately.')
    expect(text).not.toContain('Server-authored replacement wording')
    expect(text).toContain('Verified information')
    expect(text).toContain('Verified actions')
    expect(text).toContain(trusted.text)
    expect(text).toContain('Still unknown')
    expect(text).toContain('DEMO SCENARIO — Chat answers use demo risk, not live flood data.')
    await act(async () => renderer?.unmount())
  })

  it('uses updated community and risk facts for subsequent questions and marks the context change', async () => {
    const firstRisk = DEMO_RISK_FIXTURES['demo-low']
    const firstCommunity = community()
    const firstPlan = calculateEvacuationPlan(firstCommunity, firstRisk)
    const secondRisk = DEMO_RISK_FIXTURES['demo-high']
    const secondCommunity = community({ population: 2500, shelterCapacity: 1300 })
    const secondPlan = calculateEvacuationPlan(secondCommunity, secondRisk)
    const requester = vi.fn().mockResolvedValue({
      facts: [],
      actions: [],
      missingInformation: [],
      rejectedFactIds: [],
      rejectedActionIds: [],
    })
    let renderer: ReturnType<typeof create> | null = null
    await act(async () => {
      renderer = renderChat(firstRisk, firstCommunity, firstPlan, requester)
    })
    await send(renderer!, 'First question')
    await act(async () => {
      renderer?.update(
        <EvacuationChat
          risk={secondRisk}
          community={secondCommunity}
          plan={secondPlan}
          requester={requester}
        />,
      )
    })
    await send(renderer!, 'Second question')

    const secondPayload = requester.mock.calls[1]?.[0] as EvacuationChatPayload
    expect(secondPayload.risk.hazardLevel).toBe('HIGH')
    expect(secondPayload.community.population).toBe(2500)
    expect(secondPayload.evacuationPlan.shelter.shortage).toBe(1200)
    expect(pageText(renderer!.toJSON())).toContain(
      'Planning data updated. New answers will use the latest community and risk information.',
    )
    await act(async () => renderer?.unmount())
  })

  it('discards the entire chat response when planning context changes in flight', async () => {
    const firstRisk = DEMO_RISK_FIXTURES['demo-low']
    const firstCommunity = community()
    const firstPlan = calculateEvacuationPlan(firstCommunity, firstRisk)
    const secondRisk = DEMO_RISK_FIXTURES['demo-high']
    const secondCommunity = community({ population: 2500 })
    const secondPlan = calculateEvacuationPlan(secondCommunity, secondRisk)
    const oldFact = buildEvacuationChatTrustedFacts(firstRisk, firstCommunity, firstPlan)
      .find(fact => fact.id === 'risk.current-hazard')!
    const oldAction = firstPlan.allowedActions[0]!
    const pending = deferred<EvacuationChatResult>()
    const requester = vi.fn(() => pending.promise)
    let renderer: ReturnType<typeof create> | null = null
    await act(async () => {
      renderer = renderChat(firstRisk, firstCommunity, firstPlan, requester)
    })
    await send(renderer!, 'What is the current risk?')
    await act(async () => {
      renderer?.update(
        <EvacuationChat
          risk={secondRisk}
          community={secondCommunity}
          plan={secondPlan}
          requester={requester}
        />,
      )
    })
    await act(async () => {
      pending.resolve({
        facts: [oldFact],
        actions: [oldAction],
        missingInformation: firstPlan.missingInformation,
        rejectedFactIds: [],
        rejectedActionIds: [],
      })
      await pending.promise
      await Promise.resolve()
    })

    const text = pageText(renderer!.toJSON())
    expect(text).toContain(
      'Planning data changed while DeFlood AI was responding. Please ask again using the latest data.',
    )
    expect(text).not.toContain(oldFact.text)
    expect(text).not.toContain(oldAction.text)
    expect(text).not.toContain('Verified actions')
    await act(async () => renderer?.unmount())
  })

  it('shows a graceful retryable error without changing the deterministic plan', async () => {
    const risk = DEMO_RISK_FIXTURES['demo-high']
    const currentCommunity = community()
    const plan = calculateEvacuationPlan(currentCommunity, risk)
    const before = JSON.stringify(plan)
    const requester = vi.fn().mockRejectedValue(new Error('offline'))
    let renderer: ReturnType<typeof create> | null = null
    await act(async () => {
      renderer = renderChat(risk, currentCommunity, plan, requester)
    })
    await send(renderer!, 'Can you explain the plan?')

    expect(pageText(renderer!.toJSON())).toContain(
      'DeFlood AI is temporarily unavailable. The verified planning information above is still available.',
    )
    expect(renderer!.root.findByType('textarea').props.value).toBe('Can you explain the plan?')
    expect(JSON.stringify(plan)).toBe(before)
    await act(async () => renderer?.unmount())
  })

  it('clears only frontend chat state without calling the workflow again', async () => {
    const risk = DEMO_RISK_FIXTURES['demo-medium']
    const currentCommunity = community()
    const plan = calculateEvacuationPlan(currentCommunity, risk)
    const planBefore = JSON.stringify(plan)
    const communityBefore = JSON.stringify(currentCommunity)
    const requester = vi.fn().mockResolvedValue({
      answer: 'Temporary chat answer.',
      facts: [],
      actions: [],
      missingInformation: [],
      rejectedFactIds: [],
      rejectedActionIds: [],
    })
    let renderer: ReturnType<typeof create> | null = null
    await act(async () => {
      renderer = renderChat(risk, currentCommunity, plan, requester)
    })
    await send(renderer!, 'Question to clear')
    const clearButton = renderer!.root.findAllByType('button').find(button => button.props.children === 'Clear chat')
    await act(async () => {
      clearButton?.props.onClick()
    })

    const text = pageText(renderer!.toJSON())
    expect(text).not.toContain('Temporary chat answer.')
    expect(text).toContain('Suggested questions')
    expect(requester).toHaveBeenCalledTimes(1)
    expect(JSON.stringify(plan)).toBe(planBefore)
    expect(JSON.stringify(currentCommunity)).toBe(communityBefore)
    await act(async () => renderer?.unmount())
  })
})
