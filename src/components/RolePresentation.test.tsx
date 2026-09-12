import { act, create } from 'react-test-renderer'
import { describe, expect, it, vi } from 'vitest'
import Sidebar from './Sidebar'
import CommunityInfo from './CommunityInfo'
import SupportNetwork from './SupportNetwork'

vi.mock('../context/CommunityContext', () => ({ useCommunity: () => ({ community: { name: 'Selected Community' } }) }))
vi.mock('./GuardianLauncher', () => ({ default: () => null }))
vi.mock('./SupportRequestsView', () => ({ default: () => <div>Read-only requests</div> }))

describe('simulated role presentation boundaries', () => {
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
