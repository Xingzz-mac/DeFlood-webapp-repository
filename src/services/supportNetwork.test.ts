import { afterEach, describe, expect, it, vi } from "vitest"
import type { CommunityData } from "../context/CommunityContext"
import { calculateEvacuationPlan } from "./evacuationEngine"
import { DEMO_RISK_FIXTURES } from "./riskScenarios"
import {
  DEMO_RESPONDER_LABEL,
  SUPPORT_REQUESTS_STORAGE_KEY,
  buildSupportRequestDraft,
  createSupportRequest,
  generateSupportRequestId,
  loadSupportRequests,
  parseSupportRequests,
  planningGapsFromPlan,
  submitSupportRequest,
  transitionSupportRequest,
  type StorageLike,
  type SupportRequestCreationInput,
} from "./supportNetwork"

class MemoryStorage implements StorageLike {
  private values = new Map<string, string>()
  getItem(key: string) {
    return this.values.get(key) ?? null
  }
  setItem(key: string, value: string) {
    this.values.set(key, value)
  }
}

const community: CommunityData = {
  name: "Test Delta Community",
  township: "Test Township",
  region: "Ayeyarwady Region",
  population: 2000,
  children: 320,
  elderly: 140,
  disabled: 65,
  otherVulnerable: 20,
  leader: "Demo leader",
  mayor: "Demo mayor",
  assistant: "Demo assistant",
  phone: "000",
  volunteers: 25,
  cars: 2,
  trucks: 2,
  boats: 2,
  shelters: 2,
  shelterCapacity: 1200,
  water: "Adequate",
  food: "Limited",
  medicine: "Adequate",
  equipment: "Limited",
  latitude: 16.5,
  longitude: 95,
  locationSource: "manual",
  locationAccuracy: null,
  locationUpdatedAt: null,
}

function creationInput(
  provenance: "SAMPLE" | "USER_CONFIRMED" = "SAMPLE",
): SupportRequestCreationInput {
  const plan = calculateEvacuationPlan(
    community,
    DEMO_RISK_FIXTURES["demo-high"],
    provenance,
  )
  return {
    ...buildSupportRequestDraft(community, plan),
    assistanceCategories: ["Food", "Boats / Transport"],
    note: "Local demonstration note",
  }
}

describe("Support Network local request store", () => {
  afterEach(() => vi.unstubAllGlobals())

  it("recovers safely from malformed storage and drops unknown records", () => {
    expect(parseSupportRequests("{broken")).toEqual([])
    expect(parseSupportRequests(JSON.stringify({ requests: [] }))).toEqual([])
    expect(
      parseSupportRequests(
        JSON.stringify([{ id: "unsafe", status: "DISPATCHED" }]),
      ),
    ).toEqual([])

    const storage = new MemoryStorage()
    storage.setItem(SUPPORT_REQUESTS_STORAGE_KEY, "{not-json")
    expect(loadSupportRequests(storage)).toEqual([])
  })

  it("builds an exact community, risk, vulnerability, resource, and provenance snapshot", () => {
    const plan = calculateEvacuationPlan(
      community,
      DEMO_RISK_FIXTURES["demo-high"],
      "SAMPLE",
    )
    const draft = buildSupportRequestDraft(community, plan)

    expect(draft.community).toEqual({
      name: community.name,
      township: community.township,
      region: community.region,
      latitude: community.latitude,
      longitude: community.longitude,
      population: community.population,
    })
    expect(draft.riskLevel).toBe(plan.hazardLevel)
    expect(draft.vulnerableGroups).toEqual({
      children: 320,
      elderly: 140,
      disabled: 65,
      otherVulnerable: 20,
    })
    expect(draft.resourceConditions).toMatchObject({
      shelterCapacity: 1200,
      food: "Limited",
      equipment: "Limited",
      boats: 2,
    })
    expect(draft.dataProvenance).toBe("SAMPLE")
  })

  it("copies planning gaps only from the existing deterministic plan warnings", () => {
    const plan = calculateEvacuationPlan(
      community,
      DEMO_RISK_FIXTURES["demo-high"],
      "USER_CONFIRMED",
    )
    const expected = planningGapsFromPlan(plan)
    const draft = buildSupportRequestDraft(community, plan)

    expect(draft.planningGaps).toEqual(expected)
    expect(
      draft.planningGaps.every((gap) => plan.resourceWarnings.includes(gap)),
    ).toBe(true)
    expect(draft.planningGaps).not.toContain(
      "Transport capacity cannot be assessed from counts alone because per-vehicle and per-boat capacities are not supplied.",
    )
  })

  it("creates a pending local demo request with selected categories and a stable ID", () => {
    const request = createSupportRequest(creationInput(), {
      now: () => new Date("2026-09-02T01:02:03.000Z"),
      idFactory: () => "DSR-test-request",
    })

    expect(request).toMatchObject({
      id: "DSR-test-request",
      createdAt: "2026-09-02T01:02:03.000Z",
      updatedAt: "2026-09-02T01:02:03.000Z",
      status: "PENDING",
      responderLabel: null,
      assistanceCategories: ["Food", "Boats / Transport"],
      note: "Local demonstration note",
      demo: true,
    })
    expect(generateSupportRequestId(123)).toMatch(/^DSR-/)
  })

  it("requires an explicit assistance category selection", () => {
    expect(() =>
      createSupportRequest({ ...creationInput(), assistanceCategories: [] }),
    ).toThrow("Select at least one assistance category.")
  })

  it("persists a submitted request and restores it after a store re-read", () => {
    const storage = new MemoryStorage()
    const submitted = submitSupportRequest(creationInput("USER_CONFIRMED"), {
      storage,
      now: () => new Date("2026-09-02T02:00:00.000Z"),
      idFactory: () => "DSR-persisted",
    })

    const reloaded = loadSupportRequests(storage)
    expect(reloaded).toHaveLength(1)
    expect(reloaded[0]).toEqual(submitted)
    expect(reloaded[0].dataProvenance).toBe("USER_CONFIRMED")
  })

  it("allows only Pending to Accepted to In Progress to Resolved and persists every step", () => {
    const storage = new MemoryStorage()
    submitSupportRequest(creationInput(), {
      storage,
      now: () => new Date("2026-09-02T03:00:00.000Z"),
      idFactory: () => "DSR-lifecycle",
    })

    expect(
      transitionSupportRequest("DSR-lifecycle", "IN_PROGRESS", { storage }),
    ).toBeNull()
    expect(loadSupportRequests(storage)[0].status).toBe("PENDING")

    const accepted = transitionSupportRequest("DSR-lifecycle", "ACCEPTED", {
      storage,
      now: () => new Date("2026-09-02T03:01:00.000Z"),
    })
    expect(accepted?.status).toBe("ACCEPTED")
    expect(accepted?.responderLabel).toBe(DEMO_RESPONDER_LABEL)

    expect(
      transitionSupportRequest("DSR-lifecycle", "IN_PROGRESS", {
        storage,
        now: () => new Date("2026-09-02T03:02:00.000Z"),
      })?.status,
    ).toBe("IN_PROGRESS")
    expect(
      transitionSupportRequest("DSR-lifecycle", "RESOLVED", {
        storage,
        now: () => new Date("2026-09-02T03:03:00.000Z"),
      })?.status,
    ).toBe("RESOLVED")
    expect(
      transitionSupportRequest("DSR-lifecycle", "ACCEPTED", { storage }),
    ).toBeNull()
    expect(loadSupportRequests(storage)[0]).toMatchObject({
      status: "RESOLVED",
      updatedAt: "2026-09-02T03:03:00.000Z",
      responderLabel: DEMO_RESPONDER_LABEL,
    })
  })
})
