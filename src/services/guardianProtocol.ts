export const GUARDIAN_PROTOCOL_SCHEME = 'defloodguardian'

export type GuardianProtocolCommand = 'show' | 'ask' | 'open'

export function buildGuardianProtocolUrl(command: GuardianProtocolCommand): string {
  if (command !== 'show' && command !== 'ask' && command !== 'open') {
    throw new Error('Unsupported DeFlood Guardian command.')
  }
  return `${GUARDIAN_PROTOCOL_SCHEME}://${command}`
}
