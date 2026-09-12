import { act, create } from 'react-test-renderer'
import { describe, expect, it, vi } from 'vitest'
import Sidebar from './Sidebar'
import CommunityInfo from './CommunityInfo'
import SupportNetwork from './SupportNetwork'
import { DEMO_OPERATIONS_COMMUNITIES } from '../services/demoScenarios'

const updateCommunity = vi.hoisted(() => vi.fn())
vi.mock('../context/CommunityContext', () => ({ useCommunity: () => ({ community: DEMO_OPERATIONS_COMMUNITIES[0].community, isSampleData: true, updateCommunity }) }))
vi.mock('./GuardianLauncher', () => ({ default: () => null }))
vi.mock('./SupportRequestsView', () => ({ default: () => <div>Read-only requests</div> }))

describe('simulated role presentation boundaries', () => {
  it('keeps community profile editing and explicit save available to Community', async () => {
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
    let renderer!: ReturnType<typeof create>
    await act(async () => { renderer = create(<CommunityInfo user={{ role: 'leader', name: 'Test' }} />) })
    expect(JSON.stringify(renderer.toJSON())).toContain('Sample demo workspace')
    const field = renderer.root.findAllByType('input').find(input => input.props.value === DEMO_OPERATIONS_COMMUNITIES[0].community.name)!
    await act(async () => field.props.onChange({ target: { value: 'Reviewed Community' } }))
    expect(updateCommunity).not.toHaveBeenCalled()
    await act(async () => renderer.root.findByType('form').props.onSubmit({ preventDefault: vi.fn() }))
    expect(updateCommunity).toHaveBeenCalledWith(expect.objectContaining({ name: 'Reviewed Community' }))
    await act(async () => renderer.unmount())
  })
  it.each(['leader', 'mayor', 'assistant', 'ngo', 'government'] as const)('shows appropriate navigation for %s', async role => {
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
    let renderer!: ReturnType<typeof create>
    await act(async () => { renderer = create(<Sidebar user={{ role, name: 'Test' }} activeSection="dashboard" onNavigate={vi.fn()} onSignOut={vi.fn()} />) })
    const text = JSON.stringify(renderer.toJSON())
    const community = ['leader', 'mayor', 'assistant'].includes(role)
    expect(text.includes('Community Information')).toBe(community)
    expect(text.includes('Support Network')).toBe(community)
    expect(text.includes('Evacuation Plan')).toBe(community)
    if (!community) expect(text).toContain(role === 'ngo' ? 'NGO Operations' : 'Regional Coordination')
    await act(async () => renderer.unmount())
  })

  it.each(['ngo', 'government'] as const)('does not mount editing or composition controls for direct %s component access', async role => {
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
    let renderer!: ReturnType<typeof create>
    await act(async () => { renderer = create(<><CommunityInfo user={{ role, name: 'Test' }} /><SupportNetwork role={role} /></>) })
    expect(JSON.stringify(renderer.toJSON())).toContain('Read-only requests')
    expect(renderer.root.findAllByType('input')).toHaveLength(0)
    await act(async () => renderer.unmount())
  })
})
