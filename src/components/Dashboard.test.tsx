import { act, create, type ReactTestRendererJSON } from 'react-test-renderer'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { CommunityData } from '../context/CommunityContext'
import { calculateEvacuationPlan } from '../services/evacuationEngine'
import { DEMO_RISK_FIXTURES } from '../services/riskScenarios'
import Dashboard from './Dashboard'

const useCommunityMock = vi.hoisted(() => vi.fn())
const useRiskMock = vi.hoisted(() => vi.fn())
const useEvacuationPlanMock = vi.hoisted(() => vi.fn())

vi.mock('../context/CommunityContext', () => ({ useCommunity: useCommunityMock }))
vi.mock('../context/RiskContext', () => ({ useRisk: useRiskMock }))
vi.mock('../context/EvacuationContext', () => ({ useEvacuationPlan: useEvacuationPlanMock }))

const community: CommunityData = {
  name: 'Prototype Community',
  township: 'Township',
  region: 'Region',
  population: 2340,
  children: 420,
  elderly: 310,
  disabled: 95,
  otherVulnerable: 180,
  leader: 'Leader',
  mayor: 'Mayor',
  assistant: 'Assistant',
  phone: '000',
  volunteers: 45,
  cars: 18,
  trucks: 6,
  boats: 12,
  shelters: 3,
  shelterCapacity: 1800,
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

describe('Dashboard community-data provenance', () => {
  beforeEach(() => {
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
    const risk = {
      ...DEMO_RISK_FIXTURES['demo-high'],
      environmentalData: null,
      loading: false,
      error: null,
      refresh: vi.fn(),
    }
    useCommunityMock.mockReset()
    useRiskMock.mockReset().mockReturnValue(risk)
    useEvacuationPlanMock.mockReset().mockReturnValue(calculateEvacuationPlan(community, risk))
  })

  it('labels untouched seeded values as sample rather than saved or community-entered', async () => {
    useCommunityMock.mockReturnValue({ community, isSampleData: true })
    let renderer: ReturnType<typeof create> | null = null
    await act(async () => {
      renderer = create(
        <Dashboard user={{ role: 'leader', name: 'Prototype User' }} onNavigate={vi.fn()} />,
      )
    })
    const text = pageText(renderer!.toJSON())

    expect(text).toContain('Demo community data — confirm or edit Community Information before use.')
    expect(text).toContain('Sample Population')
    expect(text).toContain('Sample resource count')
    expect(text).not.toContain('Saved Population')
    expect(text).not.toContain('Community-entered resource count')
    await act(async () => renderer?.unmount())
  })

  it('uses confirmed wording after Community Information has been explicitly saved', async () => {
    useCommunityMock.mockReturnValue({ community, isSampleData: false })
    let renderer: ReturnType<typeof create> | null = null
    await act(async () => {
      renderer = create(
        <Dashboard user={{ role: 'leader', name: 'Prototype User' }} onNavigate={vi.fn()} />,
      )
    })
    const text = pageText(renderer!.toJSON())

    expect(text).toContain('Confirmed Population')
    expect(text).toContain('Community-confirmed resource count')
    expect(text).not.toContain('Demo community data')
    expect(text).not.toContain('Sample resource count')
    await act(async () => renderer?.unmount())
  })
})
