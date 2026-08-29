export interface Env {
  DEFLOOD_CONFIG: KVNamespace
  ADMIN_TOKEN: string
}

const ORIGIN_KEY = "n8n_origin"
const MAX_REQUEST_BODY_BYTES = 256 * 1024
const BACKEND_TIMEOUT_MS = 20_000
const WEBHOOK_PATHS = new Set([
  "/webhook/evacuation-plan",
  "/webhook/evacuation-chat",
])
const QUICK_TUNNEL_HOSTNAME = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.trycloudflare\.com$/

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
  "Access-Control-Max-Age": "86400",
} as const

function jsonResponse(
  value: unknown,
  status: number,
  cors = false,
  additionalHeaders: HeadersInit = {},
): Response {
  return new Response(JSON.stringify(value), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      ...(cors ? CORS_HEADERS : {}),
      ...additionalHeaders,
    },
  })
}

function methodNotAllowed(allowed: string, cors = false): Response {
  return jsonResponse(
    { error: "Method not allowed" },
    405,
    cors,
    { Allow: allowed },
  )
}

function isJsonContentType(request: Request): boolean {
  const mediaType = request.headers.get("Content-Type")
    ?.split(";", 1)[0]
    .trim()
    .toLowerCase()
  return mediaType === "application/json" || mediaType?.endsWith("+json") === true
}

async function boundedBody(request: Request): Promise<ArrayBuffer | Response> {
  const declaredLength = request.headers.get("Content-Length")
  if (declaredLength !== null) {
    const parsedLength = Number(declaredLength)
    if (Number.isFinite(parsedLength) && parsedLength > MAX_REQUEST_BODY_BYTES) {
      return jsonResponse({ error: "Request body is too large" }, 413)
    }
  }
  try {
    const body = await request.arrayBuffer()
    return body.byteLength <= MAX_REQUEST_BODY_BYTES
      ? body
      : jsonResponse({ error: "Request body is too large" }, 413)
  } catch {
    return jsonResponse({ error: "Request body could not be read" }, 400)
  }
}

export function normalizeQuickTunnelOrigin(value: unknown): string | null {
  if (typeof value !== "string") return null
  try {
    const parsed = new URL(value)
    if (
      parsed.protocol !== "https:"
      || !QUICK_TUNNEL_HOSTNAME.test(parsed.hostname)
      || parsed.username !== ""
      || parsed.password !== ""
      || parsed.port !== ""
      || parsed.pathname !== "/"
      || parsed.search !== ""
      || parsed.hash !== ""
    ) return null
    return parsed.origin
  } catch {
    return null
  }
}

function constantTimeEqual(first: string, second: string): boolean {
  const maximumLength = Math.max(first.length, second.length)
  let difference = first.length ^ second.length
  for (let index = 0; index < maximumLength; index += 1) {
    difference |= (first.charCodeAt(index) || 0) ^ (second.charCodeAt(index) || 0)
  }
  return difference === 0
}

function authorized(request: Request, env: Env): boolean {
  const authorization = request.headers.get("Authorization")
  if (!authorization?.startsWith("Bearer ") || !env.ADMIN_TOKEN) return false
  return constantTimeEqual(authorization.slice("Bearer ".length), env.ADMIN_TOKEN)
}

async function updateOrigin(request: Request, env: Env): Promise<Response> {
  if (request.method !== "POST") return methodNotAllowed("POST")
  if (!authorized(request, env)) {
    return jsonResponse({ error: "Unauthorized" }, 401, false, {
      "WWW-Authenticate": "Bearer",
    })
  }
  if (!isJsonContentType(request)) {
    return jsonResponse({ error: "Content-Type must be application/json" }, 415)
  }
  const body = await boundedBody(request)
  if (body instanceof Response) return body
  let parsed: unknown
  try {
    parsed = JSON.parse(new TextDecoder().decode(body))
  } catch {
    return jsonResponse({ error: "Malformed JSON body" }, 400)
  }
  const origin = normalizeQuickTunnelOrigin(
    typeof parsed === "object" && parsed !== null && "origin" in parsed
      ? (parsed as { origin?: unknown }).origin
      : null,
  )
  if (!origin) return jsonResponse({ error: "Invalid Quick Tunnel origin" }, 400)
  try {
    await env.DEFLOOD_CONFIG.put(ORIGIN_KEY, origin)
  } catch {
    return jsonResponse({ error: "Gateway configuration could not be updated" }, 503)
  }
  return jsonResponse({ updated: true }, 200)
}

async function health(env: Env): Promise<Response> {
  try {
    const storedOrigin = await env.DEFLOOD_CONFIG.get(ORIGIN_KEY)
    return jsonResponse({
      gateway: "ok",
      backendConfigured: normalizeQuickTunnelOrigin(storedOrigin) !== null,
    }, 200)
  } catch {
    return jsonResponse({ gateway: "degraded", backendConfigured: false }, 503)
  }
}

async function proxyWebhook(request: Request, env: Env, path: string): Promise<Response> {
  if (request.method !== "POST") return methodNotAllowed("POST, OPTIONS", true)
  if (!isJsonContentType(request)) {
    return jsonResponse({ error: "Content-Type must be application/json" }, 415, true)
  }
  const body = await boundedBody(request)
  if (body instanceof Response) {
    const headers = new Headers(body.headers)
    Object.entries(CORS_HEADERS).forEach(([name, value]) => headers.set(name, value))
    return new Response(body.body, { status: body.status, headers })
  }

  let storedOrigin: string | null
  try {
    storedOrigin = await env.DEFLOOD_CONFIG.get(ORIGIN_KEY)
  } catch {
    return jsonResponse({ error: "Backend configuration unavailable" }, 503, true)
  }
  const origin = normalizeQuickTunnelOrigin(storedOrigin)
  if (!origin) return jsonResponse({ error: "Backend is not configured" }, 503, true)

  const headers = new Headers()
  headers.set("Content-Type", request.headers.get("Content-Type") ?? "application/json")
  const accept = request.headers.get("Accept")
  if (accept) headers.set("Accept", accept)

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), BACKEND_TIMEOUT_MS)
  try {
    const backendResponse = await fetch(`${origin}${path}`, {
      method: "POST",
      headers,
      body,
      redirect: "follow",
      signal: controller.signal,
    })
    const responseHeaders = new Headers(CORS_HEADERS)
    responseHeaders.set("Cache-Control", "no-store")
    const responseContentType = backendResponse.headers.get("Content-Type")
    if (responseContentType) responseHeaders.set("Content-Type", responseContentType)
    return new Response(backendResponse.body, {
      status: backendResponse.status,
      statusText: backendResponse.statusText,
      headers: responseHeaders,
    })
  } catch {
    return jsonResponse({ error: "Backend gateway request failed" }, 502, true)
  } finally {
    clearTimeout(timeout)
  }
}

export async function handleRequest(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url)

  if (WEBHOOK_PATHS.has(url.pathname)) {
    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: CORS_HEADERS })
    }
    return proxyWebhook(request, env, url.pathname)
  }

  if (url.pathname === "/admin/origin") return updateOrigin(request, env)
  if (url.pathname === "/health") {
    return request.method === "GET" ? health(env) : methodNotAllowed("GET")
  }

  return jsonResponse({ error: "Not found" }, 404)
}

export default {
  fetch(request: Request, env: Env): Promise<Response> {
    return handleRequest(request, env)
  },
}
