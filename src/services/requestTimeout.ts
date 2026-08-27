import { ENVIRONMENTAL_REQUEST_TIMEOUT_MS } from './config'

export async function withRequestTimeout<T>(
  label: string,
  request: (signal: AbortSignal) => Promise<T>,
  parentSignal?: AbortSignal,
  timeoutMs = ENVIRONMENTAL_REQUEST_TIMEOUT_MS,
): Promise<T> {
  const controller = new AbortController()
  let timedOut = false
  const abortFromParent = () => controller.abort(parentSignal?.reason)
  if (parentSignal?.aborted) abortFromParent()
  else parentSignal?.addEventListener('abort', abortFromParent, { once: true })
  const timeoutId = setTimeout(() => {
    timedOut = true
    controller.abort()
  }, timeoutMs)

  try {
    return await request(controller.signal)
  } catch (error) {
    if (timedOut) throw new Error(`${label} request timed out after ${timeoutMs} ms`)
    throw error
  } finally {
    clearTimeout(timeoutId)
    parentSignal?.removeEventListener('abort', abortFromParent)
  }
}
