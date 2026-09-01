import { describe, expect, it, vi } from 'vitest'
import {
  consumeAssistantLaunchIntent,
  focusExistingAssistant,
  parseAppLaunchIntent,
} from './appDeepLink'

describe('DeFlood app launch intent', () => {
  it('requests the existing assistant only for the explicit assistant focus parameter', () => {
    expect(parseAppLaunchIntent('?focus=assistant')).toEqual({ focusAssistant: true })
    expect(parseAppLaunchIntent('')).toEqual({ focusAssistant: false })
    expect(parseAppLaunchIntent('?focus=map')).toEqual({ focusAssistant: false })
  })

  it('scrolls to and focuses the existing input without producing any message', () => {
    const scrollIntoView = vi.fn()
    const focus = vi.fn()

    focusExistingAssistant({ scrollIntoView }, { focus })

    expect(scrollIntoView).toHaveBeenCalledWith({ behavior: 'smooth', block: 'end' })
    expect(focus).toHaveBeenCalledWith({ preventScroll: true })
  })

  it('respects reduced-motion when focusing the assistant', () => {
    const scrollIntoView = vi.fn()
    focusExistingAssistant({ scrollIntoView }, { focus: vi.fn() }, true)
    expect(scrollIntoView).toHaveBeenCalledWith({ behavior: 'auto', block: 'end' })
  })

  it('consumes only the assistant query after successful handling without reloading', () => {
    const replaceState = vi.fn()
    const history = { state: { retained: true }, replaceState }

    expect(consumeAssistantLaunchIntent(
      { href: 'http://localhost:8443/?source=guardian&focus=assistant#planner' },
      history,
    )).toBe(true)
    expect(replaceState).toHaveBeenCalledWith(
      history.state,
      '',
      '/?source=guardian#planner',
    )
  })

  it('does not rewrite a normal Open DeFlood URL', () => {
    const replaceState = vi.fn()
    expect(consumeAssistantLaunchIntent(
      { href: 'http://localhost:8443/' },
      { state: null, replaceState },
    )).toBe(false)
    expect(replaceState).not.toHaveBeenCalled()
  })
})
