import { act, create, type ReactTestRendererJSON } from 'react-test-renderer'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { CommunityData } from '../context/CommunityContext'
import { calculateEvacuationPlan } from '../services/evacuationEngine'
import { DEMO_RISK_FIXTURES } from '../services/riskScenarios'
import SupportNetwork from './SupportNetwork'

const useEvacuationPlanMock = vi.hoisted(() => vi.fn())

vi.mock('../context/EvacuationContext', () => ({ useEvacuationPlan: useEvacuationPlanMock }))

const community: CommunityData = {
  name: 'Sample Community',
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
  food: 'Limited',
  medicine: 'Adequate',
  equipment: 'Adequate',
  latitude: 16.5,
  longitude: 95,
  locationSource: 'manual',
  locationAccuracy: null,
  locationUpdatedAt: null,
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

describe('Support Network data provenance', () => {
  beforeEach(() => {
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
    useEvacuationPlanMock.mockReset()
  })

  it('never presents seeded sample gaps as confirmed', async () => {
    useEvacuationPlanMock.mockReturnValue(
      calculateEvacuationPlan(community, DEMO_RISK_FIXTURES['demo-high'], 'SAMPLE'),
    )
    let renderer: ReturnType<typeof create> | null = null
    await act(async () => { renderer = create(<SupportNetwork />) })
    const text = pageText(renderer!.toJSON())

    expect(text).toContain('Sample planning gaps')
    expect(text).toContain('Sample resource gaps')
    expect(text).toContain('Sample shelter capacity is short by 800 places.')
    expect(text).toContain('Sample food supply is limited.')
    expect(text).not.toMatch(/confirmed (?:planning|resource|shortfall|gap)/i)
    await act(async () => renderer?.unmount())
  })

  it('allows confirmed headings after user-confirmed provenance is supplied', async () => {
    useEvacuationPlanMock.mockReturnValue(
      calculateEvacuationPlan(community, DEMO_RISK_FIXTURES['demo-high'], 'USER_CONFIRMED'),
    )
    let renderer: ReturnType<typeof create> | null = null
    await act(async () => { renderer = create(<SupportNetwork />) })
    const text = pageText(renderer!.toJSON())

    expect(text).toContain('Confirmed planning gaps')
    expect(text).toContain('Confirmed resource gaps')
    expect(text).not.toContain('Sample planning gaps')
    await act(async () => renderer?.unmount())
  })
})
