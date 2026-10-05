import { act, create } from 'react-test-renderer'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import GovernmentAlerts from './GovernmentAlerts'
import CommunityAlerts from './CommunityAlerts'
import { alertCommunityId, issueGovernmentAlert, loadGovernmentAlerts, endGovernmentAlert, archiveGovernmentAlert, ALERT_MESSAGES, ALERT_STORAGE_KEY } from '../services/governmentAlerts'

const community = { name: 'Test Community', township: 'Test Township', region: 'Test Region' }
const candidates = ['HIGH', 'MEDIUM', 'LOW'].map((risk, i) => ({ community: i ? { ...community, name: `Community ${i}` } : community, risk, provenance: 'DEMO SCENARIO', assessment: 'Demo' }))
describe('Government prototype alerts', () => {
  beforeEach(() => {
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
    const values = new Map<string, string>()
    vi.stubGlobal('localStorage', { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => values.set(key, value) })
  })
  afterEach(() => vi.unstubAllGlobals())
  it('ends and archives without losing issued data, and delivers subsequent alerts live', async () => {
    const draft = { type: 'Flood Warning' as const, severity: 'Warning' as const, targets: [{ id: alertCommunityId(community), name: community.name }], message: 'Original warning' }
    const original = issueGovernmentAlert('government', draft)
    expect(original.endedAt).toBeUndefined()
    expect(original.archivedAt).toBeUndefined()
    expect(archiveGovernmentAlert(original.id, 'government')).toBeNull()
    let gov!: ReturnType<typeof create>
    let resident!: ReturnType<typeof create>
    await act(async () => {
      gov = create(<GovernmentAlerts role="government" candidates={candidates} />)
      resident = create(<CommunityAlerts role="leader" community={community} onNavigate={vi.fn()} />)
    })
    expect(JSON.stringify(resident.toJSON())).toContain('Original warning')
    await act(async () => gov.root.findAllByType('button').find(b => b.children.includes('End Alert'))!.props.onClick())
    expect(JSON.stringify(resident.toJSON())).not.toContain('Original warning')
    expect(JSON.stringify(gov.toJSON())).not.toContain('Original warning')
    const ended = loadGovernmentAlerts()[0]
    expect(ended).toMatchObject(original)
    expect(ended.endedAt).toBeTruthy()
    const filter = async (value: string) => act(async () => gov.root.findByProps({ 'aria-label': 'Alert history filter' }).props.onChange({ target: { value } }))
    await filter('ended')
    expect(JSON.stringify(gov.toJSON())).toContain('Original warning')
    await act(async () => gov.root.findAllByType('button').find(b => b.children.includes('Archive'))!.props.onClick())
    const { archivedAt, ...preserved } = loadGovernmentAlerts()[0]
    expect(archivedAt).toBeTruthy()
    expect(preserved).toEqual(ended)
    await act(async () => gov.unmount())
    await act(async () => { gov = create(<GovernmentAlerts role="government" candidates={candidates} />) })
    expect(JSON.stringify(gov.toJSON())).not.toContain('Original warning')
    await filter('archived')
    expect(JSON.stringify(gov.toJSON())).toContain('Original warning')
    expect(gov.root.findAllByType('button').some(b => b.children.includes('End Alert') || b.children.includes('Archive'))).toBe(false)
    await act(async () => { issueGovernmentAlert('government', { ...draft, message: 'New warning' }) })
    expect(JSON.stringify(resident.toJSON())).toContain('New warning')
    expect(JSON.stringify(resident.toJSON())).not.toContain('Original warning')
    expect(loadGovernmentAlerts()).toHaveLength(2)
    await act(async () => { gov.unmount(); resident.unmount() })
  })

  it('restricts lifecycle updates to Government and leaves records unchanged on storage failure', () => {
    const alert = issueGovernmentAlert('government', { type: 'Flood Warning', severity: 'Warning', targets: [{ id: alertCommunityId(community), name: community.name }], message: 'Keep this record' })
    for (const role of ['leader', 'mayor', 'assistant', 'ngo'] as const) {
      expect(() => endGovernmentAlert(alert.id, role)).toThrow('Only')
      expect(() => archiveGovernmentAlert(alert.id, role)).toThrow('Only')
    }
    const stored = localStorage.getItem(ALERT_STORAGE_KEY)
    vi.stubGlobal('localStorage', { getItem: () => stored, setItem: () => { throw new Error('Full') } })
    expect(() => endGovernmentAlert(alert.id, 'government')).toThrow('not changed')
    expect(loadGovernmentAlerts()).toEqual([alert])
    const ended = { ...alert, endedAt: new Date().toISOString() }
    vi.stubGlobal('localStorage', { getItem: () => JSON.stringify([ended]), setItem: () => { throw new Error('Full') } })
    expect(() => archiveGovernmentAlert(alert.id, 'government')).toThrow('not changed')
    expect(loadGovernmentAlerts()).toEqual([ended])
  })
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
