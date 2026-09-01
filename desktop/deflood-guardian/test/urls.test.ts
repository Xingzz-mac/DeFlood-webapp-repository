import { describe, expect, it } from 'vitest'
import {
  buildAskDeFloodUrl,
  buildOpenDeFloodUrl,
  DEFAULT_DEFLOOD_APP_URL,
  isAllowedDeFloodExternalUrl,
} from '../src/shared/urls.js'

describe('DeFlood Guardian external URLs', () => {
  it('builds the assistant deep link from the configurable app base URL', () => {
    expect(buildAskDeFloodUrl(DEFAULT_DEFLOOD_APP_URL)).toBe('http://localhost:8443/?focus=assistant')
    expect(buildAskDeFloodUrl('https://deflood.example/app')).toBe('https://deflood.example/app?focus=assistant')
  })

  it('opens the normal application without forcing assistant focus', () => {
    expect(buildOpenDeFloodUrl('https://deflood.example/app?focus=assistant#chat'))
      .toBe('https://deflood.example/app')
  })

  it.each([
    'javascript:alert(1)',
    'file:///tmp/deflood.html',
    'data:text/html,unsafe',
    'https://user:password@deflood.example',
  ])('rejects invalid external destination %s', candidate => {
    expect(isAllowedDeFloodExternalUrl(candidate)).toBe(false)
    expect(() => buildAskDeFloodUrl(candidate)).toThrow()
  })
})
