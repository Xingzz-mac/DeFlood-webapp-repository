import type { ReactNode } from 'react'
import { act, create } from 'react-test-renderer'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import App from './App'
import { PROTOTYPE_SESSION_STORAGE_KEY } from './services/prototypeSession'

vi.mock('./components/SignIn', () => ({
  default: ({ onSignIn }: { onSignIn: (user: { role: 'leader'; name: string }) => void }) => (
    <button type="button" data-sign-in onClick={() => onSignIn({ role: 'leader', name: 'Demo leader' })}>
      Sign in
    </button>
  ),
}))
vi.mock('./components/EvacuationPlanner', () => ({
  default: ({
    focusAssistant,
    onAssistantFocusFulfilled,
  }: {
    focusAssistant?: boolean
    onAssistantFocusFulfilled?: () => void
  }) => (
    <div data-view="evacuation" data-focus-assistant={String(Boolean(focusAssistant))}>
      <button type="button" data-assistant-focused onClick={onAssistantFocusFulfilled}>
        Assistant focused
      </button>
    </div>
  ),
}))
vi.mock('./components/Dashboard', () => ({ default: () => <div data-view="dashboard" /> }))
vi.mock('./components/Sidebar', () => ({
  default: ({ onSignOut }: { onSignOut: () => void }) => (
    <button type="button" data-sign-out onClick={onSignOut}>Sign out</button>
  ),
}))
vi.mock('./components/RiskAssessment', () => ({ default: () => null }))
vi.mock('./components/FloodMap', () => ({ default: () => null }))
vi.mock('./components/SupportNetwork', () => ({ default: () => null }))
vi.mock('./components/NGODashboard', () => ({ default: () => null }))
vi.mock('./components/CommunityInfo', () => ({ default: () => null }))
vi.mock('./components/Settings', () => ({ default: () => null }))
vi.mock('./components/DevelopmentScenarioSelector', () => ({ default: () => null }))
vi.mock('./components/Icons', () => ({ IconMenu: () => null }))
vi.mock('./context/RiskContext', () => ({ RiskProvider: ({ children }: { children: ReactNode }) => children }))
vi.mock('./context/EvacuationContext', () => ({ EvacuationProvider: ({ children }: { children: ReactNode }) => children }))
vi.mock('./context/RiskScenarioContext', () => ({ RiskScenarioProvider: ({ children }: { children: ReactNode }) => children }))

class MemoryStorage {
  readonly values = new Map<string, string>()

  getItem(key: string) {
    return this.values.get(key) ?? null
  }

  setItem(key: string, value: string) {
    this.values.set(key, value)
  }

  removeItem(key: string) {
    this.values.delete(key)
  }
}

describe('desktop Guardian web handoff', () => {
  beforeEach(() => {
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  async function renderAt(
    search: string,
    storage = new MemoryStorage(),
  ) {
    const replaceState = vi.fn()
    vi.stubGlobal('localStorage', storage)
    vi.stubGlobal('window', {
      location: { search, href: `http://localhost:8443/${search}` },
      history: { state: null, replaceState },
    })
    let renderer: ReturnType<typeof create> | null = null
    await act(async () => { renderer = create(<App />) })
    return { renderer: renderer!, storage, replaceState }
  }

  async function signInAt(search: string, storage = new MemoryStorage()) {
    const result = await renderAt(search, storage)
    const { renderer } = result
    await act(async () => { renderer!.root.findByProps({ 'data-sign-in': true }).props.onClick() })
    return result
  }

  it('persists a successful prototype sign-in without credentials or secrets', async () => {
    const { renderer, storage } = await signInAt('')
    const serialized = storage.getItem(PROTOTYPE_SESSION_STORAGE_KEY)!
    expect(JSON.parse(serialized)).toEqual({
      signedIn: true,
      role: 'leader',
      name: 'Demo leader',
    })
    expect(serialized).not.toMatch(/pin|password|secret|token|n8n|groq|worker/i)
    await act(async () => renderer.unmount())
  })

  it('restores a valid session synchronously without rendering Sign In', async () => {
    const storage = new MemoryStorage()
    storage.setItem(PROTOTYPE_SESSION_STORAGE_KEY, JSON.stringify({
      signedIn: true,
      role: 'leader',
      name: 'Returning leader',
    }))
    const { renderer } = await renderAt('', storage)
    expect(renderer.root.findAllByProps({ 'data-sign-in': true })).toHaveLength(0)
    expect(renderer.root.findByProps({ 'data-view': 'dashboard' })).toBeDefined()
    await act(async () => renderer.unmount())
  })

  it('keeps assistant intent through Sign In and consumes it only after focus succeeds', async () => {
    const { renderer, replaceState } = await signInAt('?focus=assistant')
    const planner = renderer.root.findByProps({ 'data-view': 'evacuation' })
    expect(planner.props['data-focus-assistant']).toBe('true')
    expect(replaceState).not.toHaveBeenCalled()

    await act(async () => {
      renderer.root.findByProps({ 'data-assistant-focused': true }).props.onClick()
    })

    expect(replaceState).toHaveBeenCalledWith(null, '', '/')
    expect(renderer.root.findByProps({ 'data-view': 'evacuation' }).props['data-focus-assistant'])
      .toBe('false')
    await act(async () => renderer.unmount())
  })

  it('opens and focuses the assistant directly for an already-restored session', async () => {
    const storage = new MemoryStorage()
    storage.setItem(PROTOTYPE_SESSION_STORAGE_KEY, JSON.stringify({
      signedIn: true,
      role: 'assistant',
      name: 'Returning assistant',
    }))
    const { renderer, replaceState } = await renderAt('?focus=assistant', storage)

    expect(renderer.root.findAllByProps({ 'data-sign-in': true })).toHaveLength(0)
    expect(renderer.root.findByProps({ 'data-view': 'evacuation' }).props['data-focus-assistant'])
      .toBe('true')
    await act(async () => {
      renderer.root.findByProps({ 'data-assistant-focused': true }).props.onClick()
    })
    expect(replaceState).toHaveBeenCalledWith(null, '', '/')
    await act(async () => renderer.unmount())
  })

  it('clears the session on Sign Out and requires Sign In next time', async () => {
    const storage = new MemoryStorage()
    storage.setItem(PROTOTYPE_SESSION_STORAGE_KEY, JSON.stringify({
      signedIn: true,
      role: 'leader',
      name: 'Returning leader',
    }))
    const { renderer } = await renderAt('', storage)

    await act(async () => renderer.root.findByProps({ 'data-sign-out': true }).props.onClick())

    expect(storage.getItem(PROTOTYPE_SESSION_STORAGE_KEY)).toBeNull()
    expect(renderer.root.findByProps({ 'data-sign-in': true })).toBeDefined()
    await act(async () => renderer.unmount())
  })

  it('keeps normal Open DeFlood loading on Dashboard without assistant focus', async () => {
    const { renderer } = await signInAt('')
    expect(renderer.root.findByProps({ 'data-view': 'dashboard' })).toBeDefined()
    expect(renderer.root.findAllByProps({ 'data-view': 'evacuation' })).toHaveLength(0)
    await act(async () => renderer.unmount())
  })

  it('does not focus the assistant again after the query has been consumed and refreshed', async () => {
    const storage = new MemoryStorage()
    const first = await signInAt('?focus=assistant', storage)
    await act(async () => {
      first.renderer.root.findByProps({ 'data-assistant-focused': true }).props.onClick()
    })
    await act(async () => first.renderer.unmount())

    const refreshed = await renderAt('', storage)
    expect(refreshed.renderer.root.findByProps({ 'data-view': 'dashboard' })).toBeDefined()
    expect(refreshed.renderer.root.findAllByProps({ 'data-view': 'evacuation' })).toHaveLength(0)
    await act(async () => refreshed.renderer.unmount())
  })
})
