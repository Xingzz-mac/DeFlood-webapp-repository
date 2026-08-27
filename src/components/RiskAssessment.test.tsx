import { act, create, type ReactTestRendererJSON } from 'react-test-renderer'
import { describe, expect, it, vi } from 'vitest'
import RiskAssessment from './RiskAssessment'

const contextMocks = vi.hoisted(() => ({
  useCommunity: vi.fn(),
  useRisk: vi.fn(),
}))

vi.mock('../context/CommunityContext', () => ({ useCommunity: contextMocks.useCommunity }))
vi.mock('../context/RiskContext', () => ({ useRisk: contextMocks.useRisk }))

function textContent(node: ReactTestRendererJSON | ReactTestRendererJSON[] | string | null): string {
  if (node === null) return ''
  if (typeof node === 'string') return node
  if (Array.isArray(node)) return node.map(textContent).join(' ')
  return (node.children ?? []).map(child => typeof child === 'string' ? child : textContent(child)).join(' ')
}

describe('Risk Assessment information hierarchy', () => {
  it('is informative while supporting data is collapsed and gives incomplete-evidence recovery guidance', async () => {
    contextMocks.useCommunity.mockReturnValue({
      community: { name: 'Test Community', latitude: 16.5, longitude: 95 },
    })
    contextMocks.useRisk.mockReturnValue({
      calculationStatus: 'INCOMPLETE',
      hazardLevel: null,
      hazardScore: null,
      confidenceScore: 45,
      confidenceComponents: { completeness: 50, modelAgreement: null, ensembleConsistency: null, freshness: 70 },
      contributingFactors: ['Historical same-month river data is unavailable.'],
      environmentalData: null,
      sourceInformation: { aifs: 'live', ifs: 'live', river: 'incomplete', elevation: 'live', historical: 'unavailable' },
      components: {},
      stale: false,
      degraded: true,
      error: null,
      loading: false,
      refresh: vi.fn(),
    })

    let renderer: ReturnType<typeof create> | null = null
    await act(async () => {
      renderer = create(<RiskAssessment onNavigate={vi.fn()} />)
    })
    const root = renderer!.root
    const supportingData = root.findByType('details')
    expect(supportingData.props.open).toBeUndefined()
    const pageText = textContent(renderer!.toJSON())
    expect(pageText).toContain('Flood Hazard')
    expect(pageText).toContain('Data Confidence')
    expect(pageText).toContain('What this means')
    expect(pageText).toContain('Risk cannot be fully calculated')
    expect(pageText).toContain('Review missing evidence or retry unavailable sources')
    expect(pageText).toContain('Why this result')
    expect(pageText).toContain('Data quality')
    expect(pageText).toContain('AIFS:')
    await act(async () => renderer?.unmount())
  })
})
