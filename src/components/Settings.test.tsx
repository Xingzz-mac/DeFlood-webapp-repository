import { act, create, type ReactTestRendererJSON } from 'react-test-renderer'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import Settings from './Settings'

const useCommunityMock = vi.hoisted(() => vi.fn())

vi.mock('../context/CommunityContext', () => ({ useCommunity: useCommunityMock }))

function pageText(node: ReactTestRendererJSON | ReactTestRendererJSON[] | string | null): string {
  const text = node === null
    ? ''
    : typeof node === 'string'
      ? node
      : Array.isArray(node)
        ? node.map(pageText).join(' ')
        : (node.children ?? []).map(child => typeof child === 'string' ? child : pageText(child)).join(' ')
  return text.replace(/\s+/g, ' ').trim()
}

describe('Settings prototype truthfulness', () => {
  beforeEach(() => {
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
    useCommunityMock.mockReset().mockReturnValue({
      community: { name: 'Prototype Community' },
      isSampleData: true,
    })
  })

  it('describes the implemented prototype risk engine truthfully', async () => {
    let renderer: ReturnType<typeof create> | null = null
    await act(async () => {
      renderer = create(
        <Settings
          user={{ role: 'leader', name: 'Prototype User' }}
          onSignOut={vi.fn()}
        />,
      )
    })
    const text = pageText(renderer!.toJSON())

    expect(text).toContain(
      'Flood Hazard and Data Confidence are calculated using the current DeFlood prototype risk engine. Thresholds are experimental and not operationally validated.',
    )
    expect(text).not.toContain('No flood-risk calculation has been implemented yet.')
    await act(async () => renderer?.unmount())
  })

  it('shows notification controls only as disabled future features and disclaims official orders', async () => {
    let renderer: ReturnType<typeof create> | null = null
    await act(async () => {
      renderer = create(
        <Settings
          user={{ role: 'leader', name: 'Prototype User' }}
          onSignOut={vi.fn()}
        />,
      )
    })
    const text = pageText(renderer!.toJSON())
    const toggles = renderer!.root.findAllByType('input')

    expect(text).toContain('Future prototype feature — not currently active.')
    expect(text).toContain('DeFlood does not issue official evacuation orders.')
    expect(toggles).toHaveLength(4)
    expect(toggles.every(toggle => toggle.props.disabled === true)).toBe(true)
    expect(toggles.every(toggle => !toggle.props.checked && !toggle.props.defaultChecked)).toBe(true)
    await act(async () => renderer?.unmount())
  })
})
