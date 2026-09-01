export interface AppLaunchIntent {
  focusAssistant: boolean
}

export function parseAppLaunchIntent(search: string): AppLaunchIntent {
  const parameters = new URLSearchParams(search)
  return {
    focusAssistant: parameters.get('focus') === 'assistant',
  }
}

export function currentAppLaunchIntent(): AppLaunchIntent {
  if (typeof window === 'undefined') return { focusAssistant: false }
  return parseAppLaunchIntent(window.location.search)
}

interface BrowserLocation {
  href: string
}

interface BrowserHistory {
  state: unknown
  replaceState: (data: unknown, unused: string, url?: string | URL | null) => void
}

export function consumeAssistantLaunchIntent(
  location: BrowserLocation,
  history: BrowserHistory,
): boolean {
  try {
    const url = new URL(location.href)
    if (url.searchParams.get('focus') !== 'assistant') return false
    url.searchParams.delete('focus')
    const replacement = `${url.pathname}${url.search}${url.hash}`
    history.replaceState(history.state, '', replacement)
    return true
  } catch {
    return false
  }
}

export function consumeCurrentAssistantLaunchIntent(): boolean {
  if (typeof window === 'undefined') return false
  return consumeAssistantLaunchIntent(window.location, window.history)
}

export interface AssistantFocusTarget {
  scrollIntoView: (options?: ScrollIntoViewOptions) => void
}

export interface AssistantInputTarget {
  focus: (options?: FocusOptions) => void
}

export function focusExistingAssistant(
  assistant: AssistantFocusTarget,
  input: AssistantInputTarget,
  reduceMotion = false,
): void {
  assistant.scrollIntoView({
    behavior: reduceMotion ? 'auto' : 'smooth',
    block: 'end',
  })
  input.focus({ preventScroll: true })
}
