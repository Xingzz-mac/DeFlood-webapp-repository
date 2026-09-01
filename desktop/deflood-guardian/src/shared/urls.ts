export const DEFAULT_DEFLOOD_APP_URL = 'https://deflood-ai.pages.dev'

function validatedBaseUrl(rawUrl: string): URL {
  const url = new URL(rawUrl)
  if ((url.protocol !== 'https:' && url.protocol !== 'http:') || !url.hostname) {
    throw new Error('DeFlood app URL must use http or https.')
  }
  if (url.username || url.password) {
    throw new Error('DeFlood app URL must not contain credentials.')
  }
  url.hash = ''
  return url
}

export function resolveConfiguredDeFloodAppUrl(rawOverride: string | undefined): string {
  const candidate = rawOverride?.trim()
  if (!candidate) return DEFAULT_DEFLOOD_APP_URL

  try {
    return validatedBaseUrl(candidate).toString()
  } catch {
    return DEFAULT_DEFLOOD_APP_URL
  }
}

export function buildOpenDeFloodUrl(rawBaseUrl: string): string {
  const url = validatedBaseUrl(rawBaseUrl)
  url.search = ''
  return url.toString()
}

export function buildAskDeFloodUrl(rawBaseUrl: string): string {
  const url = validatedBaseUrl(rawBaseUrl)
  url.search = ''
  url.searchParams.set('focus', 'assistant')
  return url.toString()
}

export function isAllowedDeFloodExternalUrl(rawUrl: string): boolean {
  try {
    validatedBaseUrl(rawUrl)
    return true
  } catch {
    return false
  }
}
