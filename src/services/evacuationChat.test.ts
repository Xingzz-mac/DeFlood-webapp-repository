import { describe, expect, it, vi } from 'vitest'
import type { CommunityData } from '../context/CommunityContext'
import { calculateEvacuationPlan } from './evacuationEngine'
import {
  buildEvacuationChatPayload,
  capConversationHistory,
  EVACUATION_CHAT_CONCISE_FACT_LIMIT,
  EVACUATION_CHAT_CONFUSION_RESPONSE,
  EVACUATION_CHAT_FILLER_RESPONSE,
  EVACUATION_CHAT_RESPONSE_LEADS,
  EVACUATION_CHAT_SO_RESPONSE,
  EVACUATION_CHAT_WORRIED_RESPONSE,
  localEvacuationChatResponse,
  requestEvacuationChat,
  suggestedEvacuationChatQuestions,
  type EvacuationChatHistoryMessage,
} from './evacuationChat'
import { DEMO_RISK_FIXTURES } from './riskScenarios'

const community: CommunityData = {
  name: 'Test Community',
  township: 'Test Township',
  region: 'Test Region',
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
}

const highRisk = DEMO_RISK_FIXTURES['demo-high']
const highPlan = calculateEvacuationPlan(community, highRisk)
const sampleHighPlan = calculateEvacuationPlan(community, highRisk, 'SAMPLE')

function response(body: unknown, ok = true, status = 200): Response {
  return { ok, status, json: async () => body } as Response
}

describe('evacuation planning chat service', () => {
  it('classifies only bounded conversational messages for local handling', () => {
    expect(localEvacuationChatResponse("I'm worried")?.content).toBe(EVACUATION_CHAT_WORRIED_RESPONSE)
    expect(localEvacuationChatResponse("I don't understand")?.content).toBe(EVACUATION_CHAT_CONFUSION_RESPONSE)
    expect(localEvacuationChatResponse('ahhhhahhh')?.content).toBe(EVACUATION_CHAT_FILLER_RESPONSE)
    expect(localEvacuationChatResponse('soso')?.content).toBe(EVACUATION_CHAT_FILLER_RESPONSE)
    expect(localEvacuationChatResponse('so')?.content).toBe(EVACUATION_CHAT_SO_RESPONSE)
  })

  it.each([
    'thank you',
    'thank u',
    'Thanks!',
    'thx',
    'ty',
    'THANK U!!',
  ])('classifies the simple acknowledgement %s as local thanks', (message) => {
    expect(localEvacuationChatResponse(message)).toEqual({
      intent: 'THANKS',
      content: "You're welcome. You can ask me about the current risk, resources, missing information, or recommended planning actions.",
    })
  })

  it('does not swallow a thanks-prefixed real question', () => {
    expect(localEvacuationChatResponse('thank you, but what should I do now?')).toBeNull()
  })

  it('does not classify meaningful flood and planning questions as local filler', () => {
    for (const question of [
      'tell me about the current state',
      'what should i do',
      'why is the risk low',
      'what is still unknown',
      'what should volunteers focus on',
      'how much shelter capacity do we have',
      'what does the current risk mean',
      'so what should we do first',
    ]) {
      expect(localEvacuationChatResponse(question)).toBeNull()
    }
  })

  it('builds a request with chat-safe risk, community, plan, and contextual allowed actions', () => {
    const payload = buildEvacuationChatPayload(
      'What should I verify?',
      [{ role: 'assistant', content: 'Earlier answer' }],
      highRisk,
      community,
      highPlan,
    )
    expect(payload).toMatchObject({
      message: 'What should I verify?',
      dataProvenance: 'USER_CONFIRMED',
      risk: {
        status: 'COMPLETE',
        hazardLevel: 'HIGH',
        hazardScore: 82,
        confidenceScore: 72,
        supportingFacts: highRisk.contributingFactors,
        unavailableFacts: [],
      },
      community: {
        population: 2000,
        children: 320,
        elderly: 140,
        disabled: 65,
        otherVulnerable: 20,
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
      },
      evacuationPlan: { planningStatus: 'URGENT_PLANNING', shelter: { shortage: 800 } },
      shelterGrounding: {
        reportedShelterCount: 2,
        reportedShelterCapacity: 1200,
        operationalStatus: 'UNKNOWN',
      },
    })
    expect(payload.allowedActions).toEqual(
      highPlan.allowedActions.map(({ id, text }) => ({ id, text })),
    )
    expect(payload.factSelectionGuidance).toMatchObject({
      detailLevel: 'CONCISE',
      maximumFactIds: EVACUATION_CHAT_CONCISE_FACT_LIMIT,
    })
    expect(payload.trustedFacts).toContainEqual({
      id: 'risk.current-hazard',
      text: 'Current Flood Hazard is HIGH with a hazard score of 82.0 / 100.',
    })
    expect(payload.trustedFacts).toContainEqual({
      id: 'shelter.operational-status',
      text: 'Shelter operational status is unknown. Reported shelter inventory and capacity do not establish whether any shelter is operational.',
    })
  })

  it('grounds seeded sample values as demonstration data throughout the chat payload', () => {
    const payload = buildEvacuationChatPayload(
      'What are our resource gaps?',
      [],
      highRisk,
      community,
      sampleHighPlan,
    )
    const trustedText = payload.trustedFacts.map(fact => fact.text).join(' ')
    const actionText = payload.allowedActions.map(action => action.text).join(' ')

    expect(payload.dataProvenance).toBe('SAMPLE')
    expect(payload.evacuationPlan.dataProvenance).toBe('SAMPLE')
    expect(payload.shelterGrounding.operationalStatusMeaning).toContain('Sample shelter inventory')
    expect(payload.trustedFacts).toContainEqual({
      id: 'shelter.operational-status',
      text: 'Shelter operational status is unknown. Sample shelter inventory and capacity do not establish whether any shelter is operational.',
    })
    expect(payload.trustedFacts).toContainEqual({
      id: 'planning.data-provenance',
      text: 'Community and resource values are seeded sample demonstration data and are not user-confirmed.',
    })
    expect(payload.trustedFacts).toContainEqual({
      id: 'shelter.capacity-shortfall',
      text: 'The sample shelter capacity has a sample shortfall of 800 places.',
    })
    expect(trustedText).toContain('Current sample resource warnings, based on demonstration data')
    expect(trustedText).not.toMatch(/confirmed shortfall|verified resource warning/i)
    expect(actionText).toContain('sample shortfall of 800 places')
    expect(actionText).not.toMatch(/confirmed (?:shortfall|gap)/i)
    expect(payload.community).not.toHaveProperty('leader')
    expect(payload.community).not.toHaveProperty('phone')
  })

  it('restores user-confirmed wording while preserving the same numeric plan', () => {
    const samplePayload = buildEvacuationChatPayload('Question', [], highRisk, community, sampleHighPlan)
    const confirmedPayload = buildEvacuationChatPayload('Question', [], highRisk, community, highPlan)

    expect(confirmedPayload.dataProvenance).toBe('USER_CONFIRMED')
    expect(confirmedPayload.evacuationPlan.shelter).toEqual(samplePayload.evacuationPlan.shelter)
    expect(confirmedPayload.allowedActions.map(action => action.id)).toEqual(
      samplePayload.allowedActions.map(action => action.id),
    )
    expect(confirmedPayload.allowedActions.map(action => action.text).join(' ')).toContain('confirmed shortfall')
  })

  it('exposes the Limited Flood Assessment concept as an app-owned trusted fact', () => {
    const limitedRisk = {
      ...DEMO_RISK_FIXTURES['demo-incomplete'],
      rainfallSeverity: 48,
    }
    const limitedPlan = calculateEvacuationPlan(community, limitedRisk, 'SAMPLE')
    const payload = buildEvacuationChatPayload('What is the assessment?', [], limitedRisk, community, limitedPlan)

    expect(payload.trustedFacts).toContainEqual({
      id: 'risk.assessment-mode',
      text: 'LIMITED FLOOD ASSESSMENT. Rainfall evidence exists, but the full Flood Hazard is unavailable because required modeled river evidence or historical river context is unavailable.',
    })
  })

  it('requests a broader trusted-fact selection only for explicit full-detail wording', () => {
    const payload = buildEvacuationChatPayload(
      'Please give me the full report.',
      [],
      highRisk,
      community,
      highPlan,
    )
    expect(payload.factSelectionGuidance).toMatchObject({
      detailLevel: 'FULL',
      maximumFactIds: null,
    })
    expect(payload.factSelectionGuidance.instruction).toContain('trusted fact ID')
  })

  it('excludes internal risk implementation details from the chat POST body', async () => {
    const fetcher = vi.fn().mockResolvedValue(response({
      factIds: ['risk.current-hazard'],
      actionIds: [],
    }))
    const payload = buildEvacuationChatPayload('Explain the risk', [], highRisk, community, highPlan)
    await requestEvacuationChat(payload, highPlan, {
      url: 'https://example.test/chat',
      fetcher,
    })

    const requestBody = fetcher.mock.calls[0]?.[1]?.body
    expect(typeof requestBody).toBe('string')
    const posted = JSON.parse(requestBody as string)
    expect(posted.risk).toEqual({
      status: 'COMPLETE',
      hazardLevel: 'HIGH',
      hazardScore: 82,
      confidenceScore: 72,
      confidenceLabel: 'Data Confidence (evidence quality, not flood probability)',
      supportingFacts: highRisk.contributingFactors,
      unavailableFacts: [],
    })
    expect(JSON.stringify(posted.risk)).not.toContain('effectiveWeights')
    expect(JSON.stringify(posted.risk)).not.toContain('baseWeight')
    expect(JSON.stringify(posted.risk)).not.toContain('components')
    expect(JSON.stringify(posted.risk)).not.toContain('engineVersion')
    expect(JSON.stringify(posted.risk)).not.toContain('threshold')
    expect(posted.community).not.toHaveProperty('leader')
    expect(posted.community).not.toHaveProperty('mayor')
    expect(posted.community).not.toHaveProperty('assistant')
    expect(posted.community).not.toHaveProperty('phone')
    expect(posted.community).not.toHaveProperty('latitude')
    expect(posted.community).not.toHaveProperty('longitude')
    expect(posted.community).not.toHaveProperty('locationAccuracy')
    expect(posted.community).not.toHaveProperty('locationUpdatedAt')
    expect(posted.community).not.toHaveProperty('locationSource')
    expect(posted.community).toMatchObject({
      population: 2000,
      children: 320,
      elderly: 140,
      disabled: 65,
      otherVulnerable: 20,
      volunteers: 25,
      shelters: 2,
      shelterCapacity: 1200,
      cars: 2,
      trucks: 2,
      boats: 2,
    })
  })

  it('marks detailed supporting evidence unavailable when no trusted facts exist', () => {
    const riskWithoutFacts = { ...highRisk, contributingFactors: [] }
    const payload = buildEvacuationChatPayload(
      'Why is the risk high?',
      [],
      riskWithoutFacts,
      community,
      highPlan,
    )
    expect(payload.risk.supportingFacts).toEqual([])
    expect(payload.risk.unavailableFacts).toEqual([
      'Detailed supporting evidence is unavailable. Direct the user to View supporting data.',
    ])
  })

  it('keeps reported shelter facts separate from unknown operational status', () => {
    const payload = buildEvacuationChatPayload('Are shelters operational?', [], highRisk, community, highPlan)
    expect(payload.shelterGrounding).toEqual({
      reportedShelterCount: 2,
      reportedShelterCapacity: 1200,
      operationalStatus: 'UNKNOWN',
      operationalStatusMeaning: 'Reported shelter inventory and capacity do not establish whether any shelter is operational.',
    })
    const shelterGrounding = JSON.stringify(payload.shelterGrounding).toLowerCase()
    expect(shelterGrounding).not.toContain('zero operational')
    expect(shelterGrounding).not.toContain('no shelters operational')
    expect(shelterGrounding).not.toContain('shelters closed')
  })

  it('does not fetch environmental data while building or posting a chat request', async () => {
    const environmentalFetcher = vi.spyOn(globalThis, 'fetch')
    const chatFetcher = vi.fn().mockResolvedValue(response({ factIds: [], actionIds: [] }))
    const payload = buildEvacuationChatPayload('Question', [], highRisk, community, highPlan)
    await requestEvacuationChat(payload, highPlan, {
      url: 'https://example.test/chat',
      fetcher: chatFetcher,
    })
    expect(chatFetcher).toHaveBeenCalledTimes(1)
    expect(environmentalFetcher).not.toHaveBeenCalled()
    environmentalFetcher.mockRestore()
  })

  it('treats validated action IDs with zero fact IDs as a grounded action response', async () => {
    const trusted = highPlan.allowedActions.find(action => action.id === 'verify-transport-capacity')
    const fetcher = vi.fn().mockResolvedValue(response({
      responseType: 'ACTIONS',
      answer: 'Model-authored operational advice must not be displayed.',
      factIds: [],
      actionIds: ['verify-transport-capacity'],
    }))
    const payload = buildEvacuationChatPayload(
      'What should I start doing?',
      [],
      highRisk,
      community,
      highPlan,
    )

    const result = await requestEvacuationChat(payload, highPlan, {
      url: 'https://example.test/chat',
      fetcher,
    })

    expect(result.responseType).toBe('ACTIONS')
    expect(result.facts).toEqual([])
    expect(result.actions).toEqual([trusted])
    expect(result).not.toHaveProperty('answer')
    expect(EVACUATION_CHAT_RESPONSE_LEADS.ACTIONS).toContain('verified DeFlood data')
  })

  it('ignores arbitrary response types instead of displaying model-authored prose', async () => {
    const fetcher = vi.fn().mockResolvedValue(response({
      responseType: 'EVACUATION_ORDER',
      answer: 'Mandatory evacuation order issued by the model.',
      factIds: [],
      actionIds: [],
    }))
    const payload = buildEvacuationChatPayload('Adversarial prompt', [], highRisk, community, highPlan)

    const result = await requestEvacuationChat(payload, highPlan, {
      url: 'https://example.test/chat',
      fetcher,
    })

    expect(result.responseType).toBeNull()
    expect(result.facts).toEqual([])
    expect(result.actions).toEqual([])
    expect(result).not.toHaveProperty('answer')
  })

  it('suggests a shelter question when reported shelter information exists', () => {
    expect(suggestedEvacuationChatQuestions(highRisk, highPlan)).toContain(
      'Do we have enough shelter capacity?',
    )
  })

  it('uses evidence-oriented suggestions for INCOMPLETE risk without HIGH wording', () => {
    const incomplete = DEMO_RISK_FIXTURES['demo-incomplete']
    const plan = calculateEvacuationPlan(community, incomplete)
    const suggestions = suggestedEvacuationChatQuestions(incomplete, plan)
    expect(suggestions).toContain('What information is missing?')
    expect(suggestions).toContain('Why can’t flood hazard be calculated?')
    expect(suggestions.join(' ')).not.toContain('HIGH')
  })

  it('resolves trusted fact and action IDs to app-owned text without server overwrites', async () => {
    const trusted = highPlan.allowedActions.find(action => action.id === 'verify-transport-capacity')
    const trustedFact = buildEvacuationChatPayload(
      'What about transport?',
      [],
      highRisk,
      community,
      highPlan,
    ).trustedFacts.find(fact => fact.id === 'transport.capacity-status')
    const fetcher = vi.fn().mockResolvedValue(response({
      answer: 'Use every vehicle immediately. This model-authored advice must be ignored.',
      factIds: ['transport.capacity-status'],
      facts: [{ id: 'transport.capacity-status', text: 'Server replacement wording' }],
      actions: [
        { id: 'verify-transport-capacity', text: 'Invented wording' },
        { id: 'verify-transport-capacity', text: 'Duplicate wording' },
      ],
      missingInformation: ['Vehicle carrying capacity', 'Invented missing fact'],
      validation: { rejectedActionIds: [] },
    }))
    const payload = buildEvacuationChatPayload('What about transport?', [], highRisk, community, highPlan)
    const result = await requestEvacuationChat(payload, highPlan, {
      url: 'https://example.test/chat',
      fetcher,
    })
    expect(result.facts).toEqual([trustedFact])
    expect(result.responseType).toBe('FACTS')
    expect(result).not.toHaveProperty('answer')
    expect(result.actions).toEqual([trusted])
    expect(result.actions[0]?.text).not.toBe('Invented wording')
    expect(result.missingInformation).toEqual(['Vehicle carrying capacity'])
  })

  it('rejects unknown fact IDs and deduplicates trusted fact IDs', async () => {
    const payload = buildEvacuationChatPayload('Question', [], highRisk, community, highPlan)
    const expected = payload.trustedFacts.find(fact => fact.id === 'risk.current-hazard')
    const fetcher = vi.fn().mockResolvedValue(response({
      factIds: ['invented.fact', 'risk.current-hazard', 'risk.current-hazard'],
      actionIds: [],
    }))
    const result = await requestEvacuationChat(payload, highPlan, {
      url: 'https://example.test/chat',
      fetcher,
    })
    expect(result.facts).toEqual([expected])
    expect(result.rejectedFactIds).toEqual(['invented.fact'])
  })

  it('ignores unknown and rejected action IDs', async () => {
    const fetcher = vi.fn().mockResolvedValue(response({
      factIds: [],
      actions: [
        { id: 'invent-route', text: 'Invent a route' },
        { id: 'verify-transport-capacity', text: 'Valid ID' },
      ],
      validation: { rejectedActionIds: ['verify-transport-capacity'] },
    }))
    const payload = buildEvacuationChatPayload('Question', [], highRisk, community, highPlan)
    const result = await requestEvacuationChat(payload, highPlan, {
      url: 'https://example.test/chat',
      fetcher,
    })
    expect(result.actions).toEqual([])
    expect(result.rejectedActionIds).toEqual(['verify-transport-capacity'])
  })

  it('rejects malformed fact and action selections', async () => {
    const malformedActionsFetcher = vi.fn().mockResolvedValue(response({ actions: 'bad' }))
    const malformedFactsFetcher = vi.fn().mockResolvedValue(response({ factIds: 'risk.current-hazard' }))
    const payload = buildEvacuationChatPayload('Question', [], highRisk, community, highPlan)
    await expect(requestEvacuationChat(payload, highPlan, {
      url: 'https://example.test/chat',
      fetcher: malformedActionsFetcher,
    })).rejects.toThrow('malformed actions')
    await expect(requestEvacuationChat(payload, highPlan, {
      url: 'https://example.test/chat',
      fetcher: malformedFactsFetcher,
    })).rejects.toThrow('malformed fact IDs')
  })

  it('handles timeout and network failure without modifying the deterministic plan', async () => {
    vi.useFakeTimers()
    const timeoutFetcher = vi.fn((_url: string | URL | Request, init?: RequestInit) => new Promise<Response>((_resolve, reject) => {
      init?.signal?.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')))
    })) as typeof fetch
    const payload = buildEvacuationChatPayload('Question', [], highRisk, community, highPlan)
    const request = requestEvacuationChat(payload, highPlan, {
      url: 'https://example.test/chat',
      fetcher: timeoutFetcher,
      timeoutMs: 100,
    })
    const timeoutExpectation = expect(request).rejects.toThrow('timed out')
    await vi.advanceTimersByTimeAsync(100)
    await timeoutExpectation
    vi.useRealTimers()

    const networkFetcher = vi.fn().mockRejectedValue(new TypeError('offline'))
    await expect(requestEvacuationChat(payload, highPlan, {
      url: 'https://example.test/chat',
      fetcher: networkFetcher,
    })).rejects.toThrow('workflow could not be reached')
    expect(highPlan.planningStatus).toBe('URGENT_PLANNING')
    expect(highPlan.shelter.shortage).toBe(800)
  })

  it('caps conversation history to the most recent ten messages', () => {
    const history: EvacuationChatHistoryMessage[] = Array.from({ length: 14 }, (_, index) => ({
      role: index % 2 === 0 ? 'user' : 'assistant',
      content: `message-${index}`,
    }))
    const capped = capConversationHistory(history)
    expect(capped).toHaveLength(10)
    expect(capped[0]?.content).toBe('message-4')
    expect(capped[9]?.content).toBe('message-13')
  })

  it('does not recalculate or mutate the supplied risk and plan while building payloads', () => {
    const riskBefore = JSON.stringify(highRisk)
    const planBefore = JSON.stringify(highPlan)
    buildEvacuationChatPayload('Question', [], highRisk, community, highPlan)
    expect(JSON.stringify(highRisk)).toBe(riskBefore)
    expect(JSON.stringify(highPlan)).toBe(planBefore)
  })
})
