import { describe, expect, it } from 'vitest'
import { buildGuardianProtocolUrl } from './guardianProtocol'

describe('Guardian website protocol URLs', () => {
  it.each(['show', 'ask', 'open'] as const)('builds the allowlisted %s command', command => {
    expect(buildGuardianProtocolUrl(command)).toBe(`defloodguardian://${command}`)
  })

  it('does not construct arbitrary commands at runtime', () => {
    expect(() => buildGuardianProtocolUrl('https://example.com' as 'show')).toThrow(
      'Unsupported DeFlood Guardian command.',
    )
  })
})
