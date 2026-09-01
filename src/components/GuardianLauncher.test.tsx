import { act, create } from 'react-test-renderer'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import GuardianLauncher from './GuardianLauncher'

describe('Launch Guardian control', () => {
  beforeEach(() => {
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('renders a subtle explicit-click protocol link without launching on render', async () => {
    const fetch = vi.fn()
    vi.stubGlobal('fetch', fetch)
    let renderer: ReturnType<typeof create> | null = null
    await act(async () => { renderer = create(<GuardianLauncher />) })

    const link = renderer!.root.findByType('a')
    expect(link.props.href).toBe('defloodguardian://show')
    expect(renderer!.root.findAllByProps({ role: 'status' })).toHaveLength(0)

    await act(async () => link.props.onClick())

    const helper = renderer!.root.findByProps({ role: 'status' })
    expect(helper.children.join('')).toContain('Guardian launch requested.')
    expect(helper.children.join('')).not.toContain('Guardian is running')
    expect(fetch).not.toHaveBeenCalled()
    await act(async () => renderer!.unmount())
  })
})
