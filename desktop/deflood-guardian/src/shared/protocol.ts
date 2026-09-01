export const GUARDIAN_PROTOCOL_SCHEME = 'defloodguardian'

export type GuardianProtocolCommand = 'show' | 'ask' | 'open'

export interface GuardianProtocolActions {
  show: () => void
  ask: () => void | Promise<void>
  open: () => void | Promise<void>
}

const allowedCommands = new Set<GuardianProtocolCommand>(['show', 'ask', 'open'])
const exactGuardianProtocolUrl = /^defloodguardian:\/\/(show|ask|open)\/?$/

export function parseGuardianProtocolUrl(rawUrl: string): GuardianProtocolCommand | null {
  if (!exactGuardianProtocolUrl.test(rawUrl)) return null

  try {
    const url = new URL(rawUrl)
    if (url.protocol !== `${GUARDIAN_PROTOCOL_SCHEME}:`) return null
    if (url.username || url.password || url.port || url.search || url.hash) return null
    if (url.pathname !== '' && url.pathname !== '/') return null

    const command = url.hostname as GuardianProtocolCommand
    return allowedCommands.has(command) ? command : null
  } catch {
    return null
  }
}

export function protocolCommandFromArguments(
  argumentsList: readonly string[],
): GuardianProtocolCommand | null {
  for (const argument of argumentsList) {
    const command = parseGuardianProtocolUrl(argument)
    if (command) return command
  }
  return null
}

export function hasGuardianProtocolArgument(argumentsList: readonly string[]): boolean {
  return argumentsList.some(argument => argument.startsWith(`${GUARDIAN_PROTOCOL_SCHEME}:`))
}

export async function executeGuardianProtocolCommand(
  command: GuardianProtocolCommand,
  actions: GuardianProtocolActions,
): Promise<void> {
  actions.show()
  if (command === 'ask') await actions.ask()
  if (command === 'open') await actions.open()
}
