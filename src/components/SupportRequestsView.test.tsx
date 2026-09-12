import { act, create } from 'react-test-renderer'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ReactNode } from 'react'
import SupportRequestsView from './SupportRequestsView'
import SupportRequestsMap from './SupportRequestsMap'
import { buildSupportRequestDraft, submitSupportRequest, loadSupportRequests, transitionSupportRequest } from '../services/supportNetwork'
import { DEMO_OPERATIONS_COMMUNITIES, DEMO_SCENARIOS } from '../services/demoScenarios'
import { calculateEvacuationPlan } from '../services/evacuationEngine'

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
      const pin = renderer.root.findAllByType('div').find(node => node.props['data-pin'])!
      expect(pin.props['data-pin']).toContain(color)
      expect(pin.props['data-pin']).toContain('HELP')
    }
    await act(async () => renderer.root.findByType('button').props.onClick())
    expect(open).toHaveBeenCalledWith(request.id)
    await act(async () => renderer.unmount())
  })
})
