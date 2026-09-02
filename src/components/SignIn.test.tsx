import { act, create, type ReactTestRendererJSON } from 'react-test-renderer'
import { describe, expect, it, vi } from 'vitest'
import SignIn from './SignIn'

vi.mock('../context/CommunityContext', () => ({
  useCommunity: () => ({ community: { name: 'Prototype Community' } }),
}))

function pageText(node: ReactTestRendererJSON | ReactTestRendererJSON[] | string | null): string {
  if (node === null) return ''
  if (typeof node === 'string') return node
  if (Array.isArray(node)) return node.map(pageText).join(' ')
  return (node.children ?? []).map(child => typeof child === 'string' ? child : pageText(child)).join(' ')
}

describe('prototype sign-in wording', () => {
  it('labels access and the PIN as demonstration-only without changing the role/PIN flow', async () => {
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
    const onSignIn = vi.fn()
    let renderer: ReturnType<typeof create> | null = null
    await act(async () => {
      renderer = create(<SignIn onSignIn={onSignIn} />)
    })

    const text = pageText(renderer!.toJSON())
    expect(text).toContain('Prototype access — roles are simulated for demonstration.')
    expect(text).toContain('Demonstration PIN')
    expect(text).toContain('Demo only — this PIN is not a security credential.')
    expect(text).toContain('Demo workspace starts with sample data. You can review and replace it after signing in.')
    expect(text).not.toContain('Authorised users only')

    const nameInput = renderer!.root.findByProps({ type: 'text' })
    const pinInput = renderer!.root.findByProps({ type: 'password' })
    await act(async () => {
      nameInput.props.onChange({ target: { value: 'Test User' } })
      pinInput.props.onChange({ target: { value: '1234' } })
    })
    await act(async () => {
      renderer!.root.findByType('form').props.onSubmit({ preventDefault: vi.fn() })
    })
    expect(onSignIn).toHaveBeenCalledWith({ role: 'leader', name: 'Test User' })
    await act(async () => renderer?.unmount())
  })
})
