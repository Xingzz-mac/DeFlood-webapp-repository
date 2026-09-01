import { act, create, type ReactTestRendererJSON } from 'react-test-renderer'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { CommunityData } from '../context/CommunityContext'
import { calculateEvacuationPlan } from '../services/evacuationEngine'
import {
  buildEvacuationChatTrustedFacts,
  EVACUATION_CHAT_CONCISE_FACT_LIMIT,
  EVACUATION_CHAT_CONFUSION_RESPONSE,
  EVACUATION_CHAT_FILLER_RESPONSE,
  EVACUATION_CHAT_RESPONSE_LEADS,
  EVACUATION_CHAT_SO_RESPONSE,
  EVACUATION_CHAT_THANKS_RESPONSE,
  EVACUATION_CHAT_WORRIED_RESPONSE,
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
  showResponseSourceDiagnostics = true,
  focusRequested = false,
) {
  return create(
    <EvacuationChat
      risk={risk}
      community={currentCommunity}
      plan={plan}
      requester={requester}
      showResponseSourceDiagnostics={showResponseSourceDiagnostics}
      focusRequested={focusRequested}
    />,
  )
}

describe('Ask DeFlood.AI interface', () => {
  beforeEach(() => {
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('does not send a message when the desktop deep link requests input focus', async () => {
    const risk = DEMO_RISK_FIXTURES['demo-low']
    const currentCommunity = community()
    const plan = calculateEvacuationPlan(currentCommunity, risk)
    const requester = vi.fn()
    let renderer: ReturnType<typeof create> | null = null

    await act(async () => {
      renderer = renderChat(risk, currentCommunity, plan, requester, true, true)
    })

    expect(requester).not.toHaveBeenCalled()
    expect(renderer!.root.findByType('textarea').props.value).toBe('')
    await act(async () => renderer?.unmount())
  })

  it('reveals the composer once with minimum scrolling, focuses without scrolling, and reports fulfillment', async () => {
    const risk = DEMO_RISK_FIXTURES['demo-low']
    const currentCommunity = community()
    const plan = calculateEvacuationPlan(currentCommunity, risk)
    const requester = vi.fn()
    const assistantSectionScroll = vi.fn()
    const composerScroll = vi.fn()
    const messageEndScroll = vi.fn()
    const inputFocus = vi.fn()
    const onFocusFulfilled = vi.fn()
    vi.stubGlobal('window', {
      matchMedia: () => ({ matches: false }),
    })
    let renderer: ReturnType<typeof create> | null = null

    await act(async () => {
      renderer = create(
        <EvacuationChat
          risk={risk}
          community={currentCommunity}
          plan={plan}
          requester={requester}
          focusRequested
          onFocusFulfilled={onFocusFulfilled}
        />,
        {
          createNodeMock: element => {
            if (element.type === 'section') return { scrollIntoView: assistantSectionScroll }
            if (element.type === 'form') return { scrollIntoView: composerScroll }
            if (element.type === 'textarea') return { focus: inputFocus }
            if (element.type === 'div' && Object.keys(element.props as object).length === 0) {
              return { scrollIntoView: messageEndScroll }
            }
            return null
          },
        },
      )
    })

    expect(composerScroll).toHaveBeenCalledOnce()
    expect(composerScroll).toHaveBeenCalledWith({ behavior: 'smooth', block: 'end' })
    expect(renderer!.root.findByType('form').props.className).toContain('scroll-mb-6')
    expect(assistantSectionScroll).not.toHaveBeenCalled()
    expect(inputFocus).toHaveBeenCalledWith({ preventScroll: true })
    expect(messageEndScroll).not.toHaveBeenCalled()
    expect(onFocusFulfilled).toHaveBeenCalledOnce()
    expect(requester).not.toHaveBeenCalled()
    await act(async () => renderer?.unmount())
  })

  it('answers a simple greeting locally without calling the workflow', async () => {
    const risk = DEMO_RISK_FIXTURES['demo-low']
    const currentCommunity = community()
    const plan = calculateEvacuationPlan(currentCommunity, risk)
    const requester = vi.fn()
    let renderer: ReturnType<typeof create> | null = null
    await act(async () => {
      renderer = renderChat(risk, currentCommunity, plan, requester)
    })

    await send(renderer!, 'hi')

    const text = pageText(renderer!.toJSON())
    expect(text).toContain(EVACUATION_CHAT_RESPONSE_LEADS.GREETING)
    expect(text).not.toContain('That information is not available')
    expect(requester).not.toHaveBeenCalled()
    await act(async () => renderer?.unmount())
  })

  it.each([
    'thank you',
    'thank u',
    'Thanks!',
    'thx',
    'ty',
    'THANK U!!',
  ])('answers %s locally without calling the workflow', async (message) => {
    const risk = DEMO_RISK_FIXTURES['demo-low']
    const currentCommunity = community()
    const plan = calculateEvacuationPlan(currentCommunity, risk)
    const requester = vi.fn()
    let renderer: ReturnType<typeof create> | null = null
    await act(async () => {
      renderer = renderChat(risk, currentCommunity, plan, requester)
    })

    await send(renderer!, message)

    const text = pageText(renderer!.toJSON())
    expect(text).toContain(EVACUATION_CHAT_THANKS_RESPONSE)
    expect(text).not.toContain('That information is not available')
    expect(requester).not.toHaveBeenCalled()
    await act(async () => renderer?.unmount())
  })

  it('keeps a thanks-prefixed planning question in the grounded backend flow', async () => {
    const risk = DEMO_RISK_FIXTURES['demo-low']
    const currentCommunity = community()
    const plan = calculateEvacuationPlan(currentCommunity, risk)
    const trustedAction = plan.allowedActions[0]!
    const requester = vi.fn().mockResolvedValue({
      responseType: 'ACTIONS',
      facts: [],
      actions: [trustedAction],
      missingInformation: [],
      rejectedFactIds: [],
      rejectedActionIds: [],
    })
    let renderer: ReturnType<typeof create> | null = null
    await act(async () => {
      renderer = renderChat(risk, currentCommunity, plan, requester)
    })

    const question = 'thank you, but what should I do now?'
    await send(renderer!, question)

    expect(requester).toHaveBeenCalledTimes(1)
    expect((requester.mock.calls[0]?.[0] as EvacuationChatPayload).message).toBe(question)
    expect(pageText(renderer!.toJSON())).toContain(trustedAction.text)
    await act(async () => renderer?.unmount())
  })

  it.each([
    ["I'm worried", EVACUATION_CHAT_WORRIED_RESPONSE],
    ["I'm confused", EVACUATION_CHAT_CONFUSION_RESPONSE],
    ['ahhh', EVACUATION_CHAT_FILLER_RESPONSE],
    ['so', EVACUATION_CHAT_SO_RESPONSE],
  ])('handles %s locally without unavailable or backend-failure wording', async (message, expectedResponse) => {
    const risk = DEMO_RISK_FIXTURES['demo-low']
    const currentCommunity = community()
    const plan = calculateEvacuationPlan(currentCommunity, risk)
    const requester = vi.fn()
    let renderer: ReturnType<typeof create> | null = null
    await act(async () => {
      renderer = renderChat(risk, currentCommunity, plan, requester)
    })

    await send(renderer!, message)

    const text = pageText(renderer!.toJSON())
    expect(text).toContain(expectedResponse)
    expect(text).toContain('Handled locally')
    expect(text).not.toContain('That information is not available')
    expect(text).not.toContain('DeFlood.AI is temporarily unavailable')
    expect(requester).not.toHaveBeenCalled()
    await act(async () => renderer?.unmount())
  })

  it('does not include locally handled conversation in a later backend request history', async () => {
    const risk = DEMO_RISK_FIXTURES['demo-low']
    const currentCommunity = community()
    const plan = calculateEvacuationPlan(currentCommunity, risk)
    const requester = vi.fn().mockResolvedValue({
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

    await send(renderer!, 'ahhh')
    await send(renderer!, 'Who won the football match?')

    expect(requester).toHaveBeenCalledTimes(1)
    const payload = requester.mock.calls[0]?.[0] as EvacuationChatPayload
    expect(payload.conversationHistory).toEqual([])
    await act(async () => renderer?.unmount())
  })

  it('shows response-source diagnostics only when DEV diagnostics are enabled', async () => {
    const risk = DEMO_RISK_FIXTURES['demo-low']
    const currentCommunity = community()
    const plan = calculateEvacuationPlan(currentCommunity, risk)
    const requester = vi.fn()
    let renderer: ReturnType<typeof create> | null = null
    await act(async () => {
      renderer = renderChat(risk, currentCommunity, plan, requester, false)
    })

    await send(renderer!, 'hi')

    const text = pageText(renderer!.toJSON())
    expect(text).toContain(EVACUATION_CHAT_RESPONSE_LEADS.GREETING)
    expect(text).toContain(
      'Grounded assistant — simple conversation may be handled locally; flood-related answers use verified DeFlood data and approved planning actions.',
    )
    expect(text).not.toContain('Handled locally')
    expect(renderer!.root.findAllByProps({ 'data-testid': 'deflood-response-source' })).toHaveLength(0)
    await act(async () => renderer?.unmount())
  })

  it('uses an app-owned action lead for an action-only answer and preserves unknowns', async () => {
    const risk = DEMO_RISK_FIXTURES['demo-low']
    const currentCommunity = community({ population: 2340 })
    const plan = calculateEvacuationPlan(currentCommunity, risk)
    const trustedAction = plan.allowedActions.find(
      action => action.id === 'review-evacuation-readiness',
    )!
    const requester = vi.fn().mockResolvedValue({
      responseType: 'ACTIONS',
      answer: 'Begin an immediate evacuation on a route selected by the model.',
      facts: [],
      actions: [{ ...trustedAction, text: 'Model-authored replacement action.' }],
      missingInformation: plan.missingInformation.slice(0, 3),
      rejectedFactIds: [],
      rejectedActionIds: [],
    })
    let renderer: ReturnType<typeof create> | null = null
    await act(async () => {
      renderer = renderChat(risk, currentCommunity, plan, requester)
    })

    await send(renderer!, 'what should i do')

    const text = pageText(renderer!.toJSON())
    expect(text).toContain(EVACUATION_CHAT_RESPONSE_LEADS.ACTIONS)
    expect(text).toContain('Verified actions')
    expect(text).toContain(trustedAction.text)
    expect(text).toContain('Still unknown')
    expect(text).not.toContain('That information is not available')
    expect(text).not.toContain('Begin an immediate evacuation')
    expect(text).not.toContain('Model-authored replacement action')
    expect(text).toContain('AI-selected verified response')
    await act(async () => renderer?.unmount())
  })

  it('renders sample chat facts and actions without verified or confirmed sample wording', async () => {
    const risk = DEMO_RISK_FIXTURES['demo-high']
    const currentCommunity = community()
    const plan = calculateEvacuationPlan(currentCommunity, risk, 'SAMPLE')
    const trustedFact = buildEvacuationChatTrustedFacts(risk, currentCommunity, plan)
      .find(fact => fact.id === 'shelter.capacity-shortfall')!
    const trustedAction = plan.allowedActions.find(action => action.id === 'seek-additional-shelter-support')!
    const requester = vi.fn().mockResolvedValue({
      responseType: 'ACTIONS',
      facts: [trustedFact],
      actions: [trustedAction],
      missingInformation: [],
      rejectedFactIds: [],
      rejectedActionIds: [],
    })
    let renderer: ReturnType<typeof create> | null = null
    await act(async () => { renderer = renderChat(risk, currentCommunity, plan, requester) })
    await send(renderer!, 'What are the shelter gaps?')
    const text = pageText(renderer!.toJSON())

    expect(text).toContain('these app-validated actions use sample community and resource inputs')
    expect(text).toContain('Sample-qualified information')
    expect(text).toContain('App-validated actions based on sample inputs')
    expect(text).toContain('sample shortfall of 800 places')
    expect(text).not.toMatch(/confirmed shortfall|Verified actions|AI-selected verified response/i)
    const payload = requester.mock.calls[0]?.[0] as EvacuationChatPayload
    expect(payload.dataProvenance).toBe('SAMPLE')
    await act(async () => renderer?.unmount())
  })

  it('renders a facts-only response with an app-owned lead', async () => {
    const risk = DEMO_RISK_FIXTURES['demo-high']
    const currentCommunity = community()
    const plan = calculateEvacuationPlan(currentCommunity, risk)
    const trustedFact = buildEvacuationChatTrustedFacts(risk, currentCommunity, plan)
      .find(fact => fact.id === 'risk.current-hazard')!
    const requester = vi.fn().mockResolvedValue({
      responseType: 'FACTS',
      facts: [trustedFact],
      actions: [],
      missingInformation: [],
      rejectedFactIds: [],
      rejectedActionIds: [],
    })
    let renderer: ReturnType<typeof create> | null = null
    await act(async () => {
      renderer = renderChat(risk, currentCommunity, plan, requester)
    })

    await send(renderer!, 'tell me about the current state')

    const text = pageText(renderer!.toJSON())
    expect(text).toContain(EVACUATION_CHAT_RESPONSE_LEADS.FACTS)
    expect(text).toContain(trustedFact.text)
    expect(text).toContain('Verified information')
    expect(text).toContain('AI-selected verified response')
    expect(text).not.toContain('That information is not available')
    await act(async () => renderer?.unmount())
  })

  it('keeps an ordinary status response concise and expands verified details without another request', async () => {
    const risk = DEMO_RISK_FIXTURES['demo-high']
    const currentCommunity = community()
    const plan = calculateEvacuationPlan(currentCommunity, risk)
    const trustedFacts = buildEvacuationChatTrustedFacts(risk, currentCommunity, plan)
    const requester = vi.fn().mockResolvedValue({
      responseType: 'STATUS',
      facts: trustedFacts,
      actions: [],
      missingInformation: [],
      rejectedFactIds: [],
      rejectedActionIds: [],
    })
    let renderer: ReturnType<typeof create> | null = null
    await act(async () => {
      renderer = renderChat(risk, currentCommunity, plan, requester)
    })

    await send(renderer!, "what's happening right now")

    expect(requester).toHaveBeenCalledTimes(1)
    expect((requester.mock.calls[0]?.[0] as EvacuationChatPayload).factSelectionGuidance).toMatchObject({
      detailLevel: 'CONCISE',
      maximumFactIds: EVACUATION_CHAT_CONCISE_FACT_LIMIT,
    })
    expect(renderer!.root.findAllByType('li')).toHaveLength(EVACUATION_CHAT_CONCISE_FACT_LIMIT)
    const expandButton = renderer!.root.findAllByType('button')
      .find(button => button.props.children === 'Show all verified details')!
    expect(expandButton.props['aria-expanded']).toBe(false)

    await act(async () => expandButton.props.onClick())

    expect(requester).toHaveBeenCalledTimes(1)
    expect(renderer!.root.findAllByType('li')).toHaveLength(trustedFacts.length)
    const collapseButton = renderer!.root.findAllByType('button')
      .find(button => button.props.children === 'Show less')!
    expect(collapseButton.props['aria-expanded']).toBe(true)

    await act(async () => collapseButton.props.onClick())
    expect(requester).toHaveBeenCalledTimes(1)
    expect(renderer!.root.findAllByType('li')).toHaveLength(EVACUATION_CHAT_CONCISE_FACT_LIMIT)
    await act(async () => renderer?.unmount())
  })

  it('shows the broader verified set by default for an explicit full-details request', async () => {
    const risk = DEMO_RISK_FIXTURES['demo-high']
    const currentCommunity = community()
    const plan = calculateEvacuationPlan(currentCommunity, risk)
    const trustedFacts = buildEvacuationChatTrustedFacts(risk, currentCommunity, plan)
    const requester = vi.fn().mockResolvedValue({
      responseType: 'STATUS',
      facts: trustedFacts,
      actions: [],
      missingInformation: [],
      rejectedFactIds: [],
      rejectedActionIds: [],
    })
    let renderer: ReturnType<typeof create> | null = null
    await act(async () => {
      renderer = renderChat(risk, currentCommunity, plan, requester)
    })

    await send(renderer!, 'Show me all verified details.')

    expect(requester).toHaveBeenCalledTimes(1)
    expect((requester.mock.calls[0]?.[0] as EvacuationChatPayload).factSelectionGuidance).toMatchObject({
      detailLevel: 'FULL',
      maximumFactIds: null,
    })
    expect(renderer!.root.findAllByType('li')).toHaveLength(trustedFacts.length)
    expect(pageText(renderer!.toJSON())).toContain('Show less')
    await act(async () => renderer?.unmount())
  })

  it('uses deterministic missing information without claiming unknown values', async () => {
    const risk = DEMO_RISK_FIXTURES['demo-high']
    const currentCommunity = community()
    const plan = calculateEvacuationPlan(currentCommunity, risk)
    const missing = plan.missingInformation[0]!
    const requester = vi.fn().mockResolvedValue({
      responseType: 'MISSING_INFORMATION',
      facts: [],
      actions: [],
      missingInformation: [missing, 'Invented unknown'],
      rejectedFactIds: [],
      rejectedActionIds: [],
    })
    let renderer: ReturnType<typeof create> | null = null
    await act(async () => {
      renderer = renderChat(risk, currentCommunity, plan, requester)
    })

    await send(renderer!, 'What still needs to be verified?')

    const text = pageText(renderer!.toJSON())
    expect(text).toContain(EVACUATION_CHAT_RESPONSE_LEADS.MISSING_INFORMATION)
    expect(text).toContain(missing)
    expect(text).not.toContain('Invented unknown')
    expect(text).not.toContain('That information is not available')
    await act(async () => renderer?.unmount())
  })

  it('uses the hard fallback only when no validated content or supported intent exists', async () => {
    const risk = DEMO_RISK_FIXTURES['demo-high']
    const currentCommunity = community()
    const plan = calculateEvacuationPlan(currentCommunity, risk)
    const requester = vi.fn().mockResolvedValue({
      responseType: null,
      facts: [],
      actions: [],
      missingInformation: [],
      rejectedFactIds: ['invented.fact'],
      rejectedActionIds: ['invent-route'],
    })
    let renderer: ReturnType<typeof create> | null = null
    await act(async () => {
      renderer = renderChat(risk, currentCommunity, plan, requester)
    })

    await send(renderer!, 'Who won the football match?')

    const text = pageText(renderer!.toJSON())
    expect(text).toContain('That information is not available in the current verified DeFlood data.')
    expect(text).not.toContain('Verified actions')
    expect(text).not.toContain('Verified information')
    await act(async () => renderer?.unmount())
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
    expect(text).toContain(EVACUATION_CHAT_RESPONSE_LEADS.FACTS)
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
      'Planning data changed while DeFlood.AI was responding. Please ask again using the latest data.',
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

    expect(requester).toHaveBeenCalledTimes(1)
    expect(pageText(renderer!.toJSON())).toContain(
      'DeFlood.AI is temporarily unavailable. The verified planning information above is still available.',
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
