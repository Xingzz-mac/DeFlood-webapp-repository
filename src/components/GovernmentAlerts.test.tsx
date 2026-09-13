import { act, create } from 'react-test-renderer'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import GovernmentAlerts from './GovernmentAlerts'
import CommunityAlerts from './CommunityAlerts'
import { alertCommunityId, issueGovernmentAlert, loadGovernmentAlerts, ALERT_MESSAGES, ALERT_STORAGE_KEY } from '../services/governmentAlerts'

const community = { name: 'Test Community', township: 'Test Township', region: 'Test Region' }
const candidates = ['HIGH', 'MEDIUM', 'LOW'].map((risk, i) => ({ community: i ? { ...community, name: `Community ${i}` } : community, risk, provenance: 'DEMO SCENARIO', assessment: 'Demo' }))
describe('Government prototype alerts', () => {
  beforeEach(() => {
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
    const values = new Map<string, string>()
    vi.stubGlobal('localStorage', { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => values.set(key, value) })
  })
  afterEach(() => vi.unstubAllGlobals())
  it('recommends only HIGH, requires explicit review and Send, persists and delivers only to the target', async () => {
    const original = JSON.stringify(candidates)
    let renderer!: ReturnType<typeof create>
    await act(async () => { renderer = create(<GovernmentAlerts role="government" candidates={candidates} />) })
    const click = async (label: string) => act(async () => renderer.root.findAllByType('button').find(b => b.children.includes(label))!.props.onClick())
    const reviewButtons = renderer.root.findAllByType('button').filter(b => b.children.includes('Review Alert for '))
    expect(reviewButtons).toHaveLength(1)
    expect(loadGovernmentAlerts()).toEqual([])
    await act(async () => reviewButtons[0].props.onClick())
    await act(async () => renderer.root.findByProps({ 'aria-label': 'Alert Type' }).props.onChange({ target: { value: 'Evacuation Alert' } }))
    await act(async () => renderer.root.findByType('textarea').props.onChange({ target: { value: 'Reviewed local demo instructions.' } }))
    await click('Preview Alert')
    expect(loadGovernmentAlerts()).toEqual([])
    await click('Send Alert')
    expect(loadGovernmentAlerts()).toHaveLength(1)
    expect(loadGovernmentAlerts()[0]).toMatchObject({ type: 'Evacuation Alert', message: 'Reviewed local demo instructions.', status: 'ISSUED' })
    expect(JSON.stringify(candidates)).toBe(original)
    expect(JSON.stringify(renderer.toJSON())).toContain('Alert Issued Successfully')
    await act(async () => renderer.unmount())
    const navigate = vi.fn()
    await act(async () => { renderer = create(<CommunityAlerts role="leader" community={community} onNavigate={navigate} />) })
    expect(JSON.stringify(renderer.toJSON())).toContain('Reviewed local demo instructions.')
    await act(async () => renderer.root.findByType('button').props.onClick())
    expect(navigate).toHaveBeenCalledWith('evacuation')
    await act(async () => renderer.update(<CommunityAlerts role="leader" community={{ ...community, name: 'Unrelated' }} onNavigate={navigate} />))
    expect(JSON.stringify(renderer.toJSON())).not.toContain('Reviewed local demo instructions.')
    await act(async () => renderer.unmount())
    await act(async () => { renderer = create(<GovernmentAlerts role="government" candidates={candidates} />) })
    expect(renderer.root.findAllByProps({ 'aria-label': 'Review government alert' })).toHaveLength(0)
    expect(JSON.stringify(renderer.toJSON())).toContain('Reviewed local demo instructions.')
    await act(async () => renderer.unmount())
  })
  it.each(['ngo', 'leader', 'mayor', 'assistant'] as const)('does not grant alert authority to %s', async role => {
    let renderer!: ReturnType<typeof create>
    await act(async () => { renderer = create(<GovernmentAlerts role={role} candidates={candidates} />) })
    expect(renderer.toJSON()).toBeNull()
    expect(() => issueGovernmentAlert(role, { type: 'Flood Warning', severity: 'Warning', targets: [{ id: alertCommunityId(community), name: community.name }], message: ALERT_MESSAGES['Flood Warning'] })).toThrow('Only')
    expect(loadGovernmentAlerts()).toEqual([])
    await act(async () => renderer.unmount())
  })
  it('handles invalid storage and failed saves without claiming issuance', () => {
    localStorage.setItem(ALERT_STORAGE_KEY, '[null,{}]')
    expect(loadGovernmentAlerts()).toEqual([])
    vi.stubGlobal('localStorage', { getItem: () => null, setItem: () => { throw new Error('Full') } })
    expect(() => issueGovernmentAlert('government', { type: 'Flood Warning', severity: 'Warning', targets: [{ id: alertCommunityId(community), name: community.name }], message: 'Demo' })).toThrow('not issued')
  })
})
