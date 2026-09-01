import { describe, expect, it, vi } from 'vitest'
import {
  executeGuardianProtocolCommand,
  hasGuardianProtocolArgument,
  parseGuardianProtocolUrl,
  protocolCommandFromArguments,
  type GuardianProtocolActions,
} from '../src/shared/protocol.js'

describe('DeFlood Guardian protocol', () => {
  it.each([
    ['defloodguardian://show', 'show'],
    ['defloodguardian://show/', 'show'],
    ['defloodguardian://ask', 'ask'],
    ['defloodguardian://open', 'open'],
  ] as const)('accepts the allowlisted command in %s', (url, command) => {
    expect(parseGuardianProtocolUrl(url)).toBe(command)
  })

  it.each([
    '',
    'defloodguardian:',
    'defloodguardian://',
    'defloodguardian://unknown',
    'defloodguardian://SHOW',
    'defloodguardian://show/extra',
    'defloodguardian://show?redirect=https://example.com',
    'defloodguardian://show#javascript:alert(1)',
    'defloodguardian://user:password@show',
    'defloodguardian://show:80',
    'defloodguardian:///tmp/file',
    'defloodguardian://javascript:alert(1)',
    'https://defloodguardian.example/show',
    'file:///tmp/guardian',
    'javascript:alert(1)',
    'data:text/html,unsafe',
  ])('rejects malformed or non-allowlisted input %s', candidate => {
    expect(parseGuardianProtocolUrl(candidate)).toBeNull()
  })

  it('extracts only a valid protocol URL from packaged-process arguments', () => {
    expect(protocolCommandFromArguments([
      '/Applications/DeFlood Guardian.app/Contents/MacOS/DeFlood Guardian',
      '--some-electron-flag',
      'defloodguardian://ask',
    ])).toBe('ask')
    expect(protocolCommandFromArguments(['defloodguardian://show?redirect=file:///tmp/x'])).toBeNull()
    expect(hasGuardianProtocolArgument(['defloodguardian://show?redirect=file:///tmp/x'])).toBe(true)
    expect(hasGuardianProtocolArgument(['https://example.com/defloodguardian://show'])).toBe(false)
  })

  it('shows without invoking a URL action or changing any position state', async () => {
    const actions: GuardianProtocolActions = {
      show: vi.fn(),
      ask: vi.fn(),
      open: vi.fn(),
    }

    await executeGuardianProtocolCommand('show', actions)

    expect(actions.show).toHaveBeenCalledOnce()
    expect(actions.ask).not.toHaveBeenCalled()
    expect(actions.open).not.toHaveBeenCalled()
  })

  it.each(['ask', 'open'] as const)('shows once and uses only the safe %s action', async command => {
    const actions: GuardianProtocolActions = {
      show: vi.fn(),
      ask: vi.fn(),
      open: vi.fn(),
    }

    await executeGuardianProtocolCommand(command, actions)

    expect(actions.show).toHaveBeenCalledOnce()
    expect(actions[command]).toHaveBeenCalledOnce()
    expect(actions[command === 'ask' ? 'open' : 'ask']).not.toHaveBeenCalled()
  })
})
