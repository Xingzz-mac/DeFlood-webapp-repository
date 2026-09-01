import { describe, expect, it } from 'vitest'
import {
  buildAskDeFloodUrl,
  buildOpenDeFloodUrl,
  DEFAULT_DEFLOOD_APP_URL,
  isAllowedDeFloodExternalUrl,
  resolveConfiguredDeFloodAppUrl,
} from '../src/shared/urls.js'

describe('DeFlood Guardian external URLs', () => {
  it('uses the published DeFlood site as the production fallback', () => {
    expect(DEFAULT_DEFLOOD_APP_URL).toBe('https://deflood-ai.pages.dev')
    expect(resolveConfiguredDeFloodAppUrl(undefined)).toBe(DEFAULT_DEFLOOD_APP_URL)
    expect(resolveConfiguredDeFloodAppUrl('   ')).toBe(DEFAULT_DEFLOOD_APP_URL)
    expect(buildOpenDeFloodUrl(DEFAULT_DEFLOOD_APP_URL)).toBe('https://deflood-ai.pages.dev/')
    expect(buildAskDeFloodUrl(DEFAULT_DEFLOOD_APP_URL)).toBe('https://deflood-ai.pages.dev/?focus=assistant')
  })

  it('preserves a valid development override', () => {
    expect(resolveConfiguredDeFloodAppUrl('http://localhost:8443')).toBe('http://localhost:8443/')
    expect(buildOpenDeFloodUrl(resolveConfiguredDeFloodAppUrl('http://localhost:8443')))
      .toBe('http://localhost:8443/')
    expect(buildAskDeFloodUrl(resolveConfiguredDeFloodAppUrl('http://localhost:8443')))
      .toBe('http://localhost:8443/?focus=assistant')
  })

  it('falls back safely when the development override is invalid', () => {
    expect(resolveConfiguredDeFloodAppUrl('javascript:alert(1)')).toBe(DEFAULT_DEFLOOD_APP_URL)
    expect(resolveConfiguredDeFloodAppUrl('https://user:password@deflood.example'))
      .toBe(DEFAULT_DEFLOOD_APP_URL)
    expect(resolveConfiguredDeFloodAppUrl('not a URL')).toBe(DEFAULT_DEFLOOD_APP_URL)
  })

  it('builds the assistant deep link from the configurable app base URL', () => {
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
