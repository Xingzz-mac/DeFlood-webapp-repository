import { act, create, type ReactTestRendererJSON } from 'react-test-renderer'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import CommunityInfo from '../components/CommunityInfo'
import { CommunityProvider, useCommunity, type CommunityData } from './CommunityContext'

class MemoryStorage implements Storage {
  private values = new Map<string, string>()
  get length() { return this.values.size }
  clear() { this.values.clear() }
  getItem(key: string) { return this.values.get(key) ?? null }
  key(index: number) { return [...this.values.keys()][index] ?? null }
  removeItem(key: string) { this.values.delete(key) }
  setItem(key: string, value: string) { this.values.set(key, value) }
}

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

describe('CommunityContext sample-data provenance', () => {
  const originalStorage = globalThis.localStorage

  beforeEach(() => {
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
    Object.defineProperty(globalThis, 'localStorage', {
      value: new MemoryStorage(),
      configurable: true,
      writable: true,
    })
  })

  afterEach(() => {
    vi.clearAllTimers()
    vi.useRealTimers()
    Object.defineProperty(globalThis, 'localStorage', {
      value: originalStorage,
      configurable: true,
      writable: true,
    })
  })

  it('labels initial seeded values as demo data and confirms them only after the existing save action', async () => {
    vi.useFakeTimers()
    let currentCommunity: CommunityData | null = null
    let isSampleData: boolean | null = null

    function Consumer() {
      const context = useCommunity()
      currentCommunity = context.community
      isSampleData = context.isSampleData
      return null
    }

    let renderer: ReturnType<typeof create> | null = null
    await act(async () => {
      renderer = create(
        <CommunityProvider>
          <Consumer />
          <CommunityInfo user={{ role: 'leader', name: 'Prototype User' }} />
        </CommunityProvider>,
      )
    })

    const seededValues = { ...(currentCommunity as unknown as CommunityData) }
    expect(isSampleData).toBe(true)
    expect(pageText(renderer!.toJSON())).toContain('Demo community data — confirm or edit before use.')
    expect(localStorage.getItem('deflood-community-data-confirmed')).toBeNull()

    const form = renderer!.root.findByType('form')
    await act(async () => {
      form.props.onSubmit({ preventDefault: vi.fn() })
    })

    expect(isSampleData).toBe(false)
    expect(currentCommunity).toEqual(seededValues)
    expect(pageText(renderer!.toJSON())).not.toContain('Demo community data — confirm or edit before use.')
    expect(pageText(renderer!.toJSON())).toContain('Information saved successfully')
    expect(localStorage.getItem('deflood-community-data-confirmed')).toBe('true')

    await act(async () => renderer?.unmount())
  })

  it('restores explicitly confirmed community values as confirmed without changing stored data', async () => {
    const stored: Partial<CommunityData> = {
      name: 'Saved Prototype Community',
      population: 2000,
      shelters: 2,
      shelterCapacity: 1200,
    }
    localStorage.setItem('deflood-community-data', JSON.stringify(stored))
    localStorage.setItem('deflood-community-data-confirmed', 'true')
    let observed: ReturnType<typeof useCommunity> | null = null

    function Consumer() {
      observed = useCommunity()
      return null
    }

    let renderer: ReturnType<typeof create> | null = null
    await act(async () => {
      renderer = create(<CommunityProvider><Consumer /></CommunityProvider>)
    })

    const restored = observed as unknown as ReturnType<typeof useCommunity>
    expect(restored.isSampleData).toBe(false)
    expect(restored.community.name).toBe('Saved Prototype Community')
    expect(restored.community.population).toBe(2000)
    expect(restored.community.shelterCapacity).toBe(1200)
    await act(async () => renderer?.unmount())
  })
})
