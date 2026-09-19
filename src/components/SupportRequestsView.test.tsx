import { act, create } from 'react-test-renderer'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ReactNode } from 'react'
import SupportRequestsView from './SupportRequestsView'
import SupportRequestsMap from './SupportRequestsMap'
import { archiveSupportRequest, buildSupportRequestDraft, submitSupportRequest, loadSupportRequests, transitionSupportRequest } from '../services/supportNetwork'
import { DEMO_OPERATIONS_COMMUNITIES, DEMO_SCENARIOS } from '../services/demoScenarios'
import { calculateEvacuationPlan } from '../services/evacuationEngine'
import { useSupportRequests } from '../hooks/useSupportRequests'

const map = vi.hoisted(() => ({ invalidateSize: vi.fn(), fitBounds: vi.fn() }))
vi.mock('leaflet', () => ({ divIcon: (options: unknown) => options }))
vi.mock('react-leaflet', () => ({
  MapContainer: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  TileLayer: () => null,
  Popup: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  Marker: ({ children, icon, title }: { children: ReactNode; icon: { html: string }; title: string }) => <div data-pin={icon.html} title={title}>{children}</div>,
  useMap: () => map,
}))

function seed() {
  const entry = DEMO_OPERATIONS_COMMUNITIES[0]
  const plan = calculateEvacuationPlan(entry.community, DEMO_SCENARIOS[entry.scenarioId].result, 'SAMPLE')
  return submitSupportRequest({ ...buildSupportRequestDraft(entry.community, plan), assistanceCategories: ['Evacuation / Transport'], assistancePeople: { total: 12, children: 0, elderly: 3, disabled: 0 }, requestLocation: { latitude: 16.5, longitude: 95 }, note: 'Water rising near homes.' })
}

describe('shared Support Requests list and map', () => {
  beforeEach(() => {
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
    const values = new Map<string, string>()
    vi.stubGlobal('localStorage', { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => values.set(key, value) })
  })
  afterEach(() => vi.unstubAllGlobals())

  it('updates the same persisted request through the NGO UI, and presents it read-only to Government', async () => {
    const request = seed()
    let renderer!: ReturnType<typeof create>
    await act(async () => { renderer = create(<SupportRequestsView role="government" />) })
    expect(JSON.stringify(renderer.toJSON())).toContain('Water rising near homes.')
    expect(renderer.root.findAllByType('button').some(button => button.children.includes('Acknowledge'))).toBe(false)
    expect(renderer.root.findAllByType('input')).toHaveLength(0)
    await act(async () => renderer.unmount())
    await act(async () => { renderer = create(<SupportRequestsView role="ngo" />) })
    expect(JSON.stringify(renderer.toJSON())).toContain('Water rising near homes.')
    for (const [label, status] of [['Acknowledge','ACCEPTED'], ['Start Response','IN_PROGRESS'], ['Resolve','RESOLVED']]) {
      const button = renderer.root.findAllByType('button').find(button => button.children.includes(label))!
      await act(async () => { button.props.onClick() })
      expect(loadSupportRequests()[0]).toMatchObject({ id: request.id, status, assistancePeople: { total: 12, elderly: 3 } })
    }
    await act(async () => renderer.update(<SupportRequestsView role="government" />))
    expect(JSON.stringify(renderer.toJSON())).toContain('Resolved')
    expect(renderer.root.findAllByType('button').some(button => ['Acknowledge','Start Response','Resolve'].some(label => button.children.includes(label)))).toBe(false)
    expect(renderer.root.findAllByType('input')).toHaveLength(0)
    await act(async () => renderer.root.findByProps({ 'aria-label': 'Request status filter' }).props.onChange({ target: { value: 'PENDING' } }))
    expect(JSON.stringify(renderer.toJSON())).toContain('No requests match')
    await act(async () => renderer.unmount())
  })

  it('renders distinct HELP markers with updated status colors and opens the matching request', async () => {
    const request = seed()
    const open = vi.fn()
    let renderer!: ReturnType<typeof create>
    await act(async () => { renderer = create(<SupportRequestsMap requests={loadSupportRequests()} onOpen={open} />) })
    for (const [status, color] of [['PENDING','#dc2626'], ['ACCEPTED','#d97706'], ['IN_PROGRESS','#2563eb'], ['RESOLVED','#15803d']] as const) {
      if (status !== 'PENDING') {
        transitionSupportRequest(request.id, status)
        await act(async () => renderer.update(<SupportRequestsMap requests={loadSupportRequests()} onOpen={open} />))
      }
      if (status === 'RESOLVED') {
        expect(renderer.root.findAllByType('div').filter(node => node.props['data-pin'])).toHaveLength(0)
        await act(async () => renderer.update(<SupportRequestsMap requests={loadSupportRequests()} onOpen={open} showResolved />))
      }
      const pin = renderer.root.findAllByType('div').find(node => node.props['data-pin'])!
      expect(pin.props['data-pin']).toContain(color)
      expect(pin.props['data-pin']).toContain(status === 'RESOLVED' ? '✓ RESOLVED' : 'HELP')
    }
    await act(async () => renderer.root.findByType('button').props.onClick())
    expect(open).toHaveBeenCalledWith(request.id)
    await act(async () => renderer.unmount())
  })

  it('archives only a resolved record, preserves all data and other requests, and persists history', async () => {
    const request = seed()
    for (const status of ['PENDING', 'ACCEPTED', 'IN_PROGRESS'] as const) {
      if (status !== 'PENDING') transitionSupportRequest(request.id, status)
      expect(archiveSupportRequest(request.id, 'ngo')).toBeNull()
    }
    transitionSupportRequest(request.id, 'RESOLVED')
    const resolved = loadSupportRequests()[0]
    for (const role of ['leader', 'mayor', 'assistant', 'government'] as const) expect(() => archiveSupportRequest(request.id, role)).toThrow('Only')
    const other = seed()
    let renderer!: ReturnType<typeof create>
    await act(async () => { renderer = create(<SupportRequestsView role="ngo" />) })
    const filter = async (value: string) => act(async () => renderer.root.findByProps({ 'aria-label': 'Request status filter' }).props.onChange({ target: { value } }))
    expect(renderer.root.findAllByType('button').some(b => b.children.includes('Archive Request'))).toBe(false)
    await filter('RESOLVED')
    const click = async (label: string) => act(async () => renderer.root.findAllByType('button').find(b => b.children.includes(label))!.props.onClick())
    await click('Archive Request')
    expect(loadSupportRequests().find(r => r.id === request.id)?.archivedAt).toBeUndefined()
    await click('Cancel')
    await click('Archive Request')
    await click('Archive')
    expect(renderer.root.findAllByProps({ 'aria-label': 'Request details' })).toHaveLength(0)
    const archived = loadSupportRequests().find(r => r.id === request.id)!
    expect(archived.archivedAt).toBeTruthy()
    const { archivedAt: _archivedAt, ...unchanged } = archived
    expect(unchanged).toEqual(resolved)
    expect(loadSupportRequests().find(r => r.id === other.id)).toEqual(other)
    await filter('archived')
    expect(JSON.stringify(renderer.toJSON())).toContain(request.id)
    expect(renderer.root.findAllByType('button').some(b => b.children.includes('Archive Request'))).toBe(false)
    await act(async () => renderer.unmount())
    await act(async () => { renderer = create(<SupportRequestsView role="government" />) })
    await filter('archived')
    expect(JSON.stringify(renderer.toJSON())).toContain(request.id)
    expect(renderer.root.findAllByType('button').some(b => b.children.includes('Archive Request'))).toBe(false)
    await act(async () => renderer.unmount())
    const fresh = seed()
    await act(async () => { renderer = create(<SupportRequestsMap requests={loadSupportRequests()} showResolved onOpen={() => {}} />) })
    const pins = renderer.root.findAllByType('div').filter(node => node.props['data-pin'])
    expect(pins).toHaveLength(1)
    expect(pins[0].props['data-pin']).toContain('HELP 2')
    expect(loadSupportRequests().find(r => r.id === fresh.id)?.status).toBe('PENDING')
    await act(async () => renderer.unmount())
  })

  it('removes completed pins immediately through the shared subscription without remounting', async () => {
    const request = seed()
    function LiveMap() {
      const { requests } = useSupportRequests()
      return <SupportRequestsMap requests={requests} onOpen={() => {}} />
    }
    let renderer!: ReturnType<typeof create>
    await act(async () => { renderer = create(<LiveMap />) })
    const pins = () => renderer.root.findAllByType('div').filter(node => node.props['data-pin'])
    expect(pins()).toHaveLength(1)
    for (const status of ['ACCEPTED', 'IN_PROGRESS', 'RESOLVED'] as const) {
      await act(async () => { transitionSupportRequest(request.id, status) })
      expect(pins()).toHaveLength(status === 'RESOLVED' ? 0 : 1)
    }
    await act(async () => { archiveSupportRequest(request.id, 'ngo') })
    expect(pins()).toHaveLength(0)
    await act(async () => { seed() })
    expect(pins()).toHaveLength(1)
    expect(pins()[0].props['data-pin']).toContain('HELP')
    await act(async () => renderer.unmount())
  })

  it('does not persist an archive or lose data when storage fails', () => {
    const request = seed()
    for (const status of ['ACCEPTED', 'IN_PROGRESS', 'RESOLVED'] as const) transitionSupportRequest(request.id, status)
    const before = loadSupportRequests()
    const failedStorage = { getItem: (key: string) => localStorage.getItem(key), setItem: () => { throw new Error('Full') } }
    expect(() => archiveSupportRequest(request.id, 'ngo', { storage: failedStorage })).toThrow('not archived')
    expect(loadSupportRequests()).toEqual(before)
  })
})
