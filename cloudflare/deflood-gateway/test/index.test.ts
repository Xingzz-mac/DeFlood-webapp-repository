import { afterEach, describe, expect, it, vi } from "vitest"
import { handleRequest, type Env } from "../src/index"

const ADMIN_TOKEN = "test-admin-token"
const ORIGIN = "https://current-example.trycloudflare.com"

class MemoryKV {
  values = new Map<string, string>()
  writes: Array<{ key: string; value: string }> = []

  async get(key: string): Promise<string | null> {
    return this.values.get(key) ?? null
  }

  async put(key: string, value: string): Promise<void> {
    this.values.set(key, value)
    this.writes.push({ key, value })
  }
}

function environment(kv = new MemoryKV()): Env {
  return {
    DEFLOOD_CONFIG: kv as unknown as KVNamespace,
    ADMIN_TOKEN,
  }
}

function jsonRequest(path: string, body: unknown, headers: HeadersInit = {}): Request {
  return new Request(`https://gateway.example${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headers },
    body: JSON.stringify(body),
  })
}

afterEach(() => vi.unstubAllGlobals())

describe("DeFlood gateway", () => {
  it.each([
    "/webhook/evacuation-plan",
    "/webhook/evacuation-chat",
  ])("forwards POST %s to the configured Quick Tunnel", async path => {
    const kv = new MemoryKV()
    kv.values.set("n8n_origin", ORIGIN)
    const backendFetch = vi.fn().mockResolvedValue(new Response(
      JSON.stringify({ accepted: true }),
      { status: 202, headers: { "Content-Type": "application/json" } },
    ))
    vi.stubGlobal("fetch", backendFetch)

    const response = await handleRequest(jsonRequest(path, { requestId: "abc" }), environment(kv))

    expect(response.status).toBe(202)
    expect(await response.json()).toEqual({ accepted: true })
    expect(backendFetch).toHaveBeenCalledTimes(1)
    const [destination, init] = backendFetch.mock.calls[0] as [string, RequestInit]
    expect(destination).toBe(`${ORIGIN}${path}`)
    expect(init.method).toBe("POST")
    expect(new Headers(init.headers).get("Content-Type")).toBe("application/json")
    expect(JSON.parse(new TextDecoder().decode(init.body as ArrayBuffer))).toEqual({ requestId: "abc" })
  })

  it("rejects unsupported paths", async () => {
    const response = await handleRequest(jsonRequest("/webhook/anything", {}), environment())
    expect(response.status).toBe(404)
  })

  it("rejects unsupported methods on a known webhook", async () => {
    const response = await handleRequest(
      new Request("https://gateway.example/webhook/evacuation-plan"),
      environment(),
    )
    expect(response.status).toBe(405)
    expect(response.headers.get("Allow")).toBe("POST, OPTIONS")
  })

  it("returns 503 when no backend origin is configured", async () => {
    const backendFetch = vi.fn()
    vi.stubGlobal("fetch", backendFetch)
    const response = await handleRequest(
      jsonRequest("/webhook/evacuation-plan", {}),
      environment(),
    )
    expect(response.status).toBe(503)
    expect(backendFetch).not.toHaveBeenCalled()
  })

  it("returns 503 for malformed stored origin configuration", async () => {
    const kv = new MemoryKV()
    kv.values.set("n8n_origin", "https://trycloudflare.com.attacker.example")
    const response = await handleRequest(
      jsonRequest("/webhook/evacuation-plan", {}),
      environment(kv),
    )
    expect(response.status).toBe(503)
  })

  it("rejects an admin update without a token", async () => {
    const response = await handleRequest(jsonRequest("/admin/origin", { origin: ORIGIN }), environment())
    expect(response.status).toBe(401)
  })

  it("rejects an admin update with the wrong token", async () => {
    const response = await handleRequest(jsonRequest(
      "/admin/origin",
      { origin: ORIGIN },
      { Authorization: "Bearer wrong-token" },
    ), environment())
    expect(response.status).toBe(401)
  })

  it.each([
    "http://current-example.trycloudflare.com",
    "https://trycloudflare.com.attacker.example",
    "https://current-example.trycloudflare.com/path",
    "https://user:password@current-example.trycloudflare.com",
  ])("rejects invalid admin origin %s", async origin => {
    const response = await handleRequest(jsonRequest(
      "/admin/origin",
      { origin },
      { Authorization: `Bearer ${ADMIN_TOKEN}` },
    ), environment())
    expect(response.status).toBe(400)
  })

  it("writes a valid admin origin to the n8n_origin KV key", async () => {
    const kv = new MemoryKV()
    const response = await handleRequest(jsonRequest(
      "/admin/origin",
      { origin: `${ORIGIN}/` },
      { Authorization: `Bearer ${ADMIN_TOKEN}` },
    ), environment(kv))
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ updated: true })
    expect(kv.writes).toEqual([{ key: "n8n_origin", value: ORIGIN }])
  })

  it("reports health without exposing the stored origin or admin token", async () => {
    const kv = new MemoryKV()
    kv.values.set("n8n_origin", ORIGIN)
    const response = await handleRequest(
      new Request("https://gateway.example/health"),
      environment(kv),
    )
    const text = await response.text()
    expect(response.status).toBe(200)
    expect(JSON.parse(text)).toEqual({ gateway: "ok", backendConfigured: true })
    expect(text).not.toContain(ORIGIN)
    expect(text).not.toContain(ADMIN_TOKEN)
  })

  it("answers webhook preflight requests without credentials", async () => {
    const response = await handleRequest(new Request(
      "https://gateway.example/webhook/evacuation-chat",
      { method: "OPTIONS" },
    ), environment())
    expect(response.status).toBe(204)
    expect(response.headers.get("Access-Control-Allow-Origin")).toBe("*")
    expect(response.headers.get("Access-Control-Allow-Headers")).toBe("Content-Type")
    expect(response.headers.get("Access-Control-Allow-Credentials")).toBeNull()
  })

  it("returns a clean gateway failure when the backend is offline", async () => {
    const kv = new MemoryKV()
    kv.values.set("n8n_origin", ORIGIN)
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("offline")))
    const response = await handleRequest(
      jsonRequest("/webhook/evacuation-chat", {}),
      environment(kv),
    )
    expect(response.status).toBe(502)
    expect(await response.json()).toEqual({ error: "Backend gateway request failed" })
  })
})
