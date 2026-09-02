import type { CommunityData } from "../context/CommunityContext"
import type { DataProvenance, EvacuationPlanResult } from "./evacuationTypes"
import type { FloodHazardLevel } from "./riskTypes"

export const SUPPORT_REQUESTS_STORAGE_KEY = "deflood-support-requests"
export const DEMO_RESPONDER_LABEL = "Demo Response Team"
export const ASSISTANCE_CATEGORIES = [
  "Shelter",
  "Food",
  "Water",
  "Medical",
  "Boats / Transport",
  "Rescue",
  "Other",
] as const

export type AssistanceCategory = typeof ASSISTANCE_CATEGORIES[number]
export type SupportRequestStatus = "PENDING" | "ACCEPTED" | "IN_PROGRESS" | "RESOLVED"

export interface SupportCommunitySnapshot {
  name: string
  township: string
  region: string
  latitude: number | null
  longitude: number | null
  population: number
}

export interface VulnerableGroupsSnapshot {
  children: number
  elderly: number
  disabled: number
  otherVulnerable: number
}

export interface ResourceConditionsSnapshot {
  shelters: number
  shelterCapacity: number
  water: string
  food: string
  medicine: string
  equipment: string
  cars: number
  trucks: number
  boats: number
}

export interface SupportRequestDraft {
  community: SupportCommunitySnapshot
  riskLevel: FloodHazardLevel | null
  vulnerableGroups: VulnerableGroupsSnapshot
  resourceConditions: ResourceConditionsSnapshot
  planningGaps: string[]
  dataProvenance: DataProvenance
}

export interface SupportRequest extends SupportRequestDraft {
  id: string
  createdAt: string
  updatedAt: string
  assistanceCategories: AssistanceCategory[]
  note: string
  status: SupportRequestStatus
  responderLabel: string | null
  demo: true
}

export interface SupportRequestCreationInput extends SupportRequestDraft {
  assistanceCategories: AssistanceCategory[]
  note?: string
}

export interface StorageLike {
  getItem: (key: string) => string | null
  setItem: (key: string, value: string) => void
}

interface RequestOptions {
  storage?: StorageLike | null
  now?: () => Date
  idFactory?: () => string
}

const validStatuses = new Set<SupportRequestStatus>([
  "PENDING",
  "ACCEPTED",
  "IN_PROGRESS",
  "RESOLVED",
])
const validCategories = new Set<AssistanceCategory>(ASSISTANCE_CATEGORIES)
const requestListeners = new Set<() => void>()
let fallbackIdCounter = 0

function currentStorage(): StorageLike | null {
  return typeof localStorage === "undefined" ? null : localStorage
}

function cleanString(value: unknown, maximumLength: number): string {
  return typeof value === "string" ? value.trim().slice(0, maximumLength) : ""
}

function nonNegativeNumber(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0
    ? value
    : 0
}

function coordinate(
  value: unknown,
  minimum: number,
  maximum: number,
): number | null {
  return typeof value === "number" &&
    Number.isFinite(value) &&
    value >= minimum &&
    value <= maximum
    ? value
    : null
}

function cleanStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  return [
    ...new Set(value.map((item) => cleanString(item, 400)).filter(Boolean)),
  ].slice(0, 50)
}

function cleanCategories(value: unknown): AssistanceCategory[] {
  if (!Array.isArray(value)) return []
  return [
    ...new Set(
      value.filter((item): item is AssistanceCategory =>
        validCategories.has(item as AssistanceCategory),
      ),
    ),
  ]
}

function validIsoDate(value: unknown): string | null {
  if (typeof value !== "string" || !Number.isFinite(Date.parse(value)))
    return null
  return new Date(value).toISOString()
}

function parseStoredRequest(value: unknown): SupportRequest | null {
  if (!value || typeof value !== "object") return null
  const record = value as Record<string, unknown>
  const id = cleanString(record.id, 160)
  const createdAt = validIsoDate(record.createdAt)
  const status = validStatuses.has(record.status as SupportRequestStatus)
    ? record.status as SupportRequestStatus
    : null
  const communityValue = record.community
  const vulnerableValue = record.vulnerableGroups
  const resourceValue = record.resourceConditions
  if (
    !id ||
    !createdAt ||
    !status ||
    !communityValue ||
    typeof communityValue !== "object" ||
    !vulnerableValue ||
    typeof vulnerableValue !== "object" ||
    !resourceValue ||
    typeof resourceValue !== "object"
  )
    return null

  const community = communityValue as Record<string, unknown>
  const vulnerableGroups = vulnerableValue as Record<string, unknown>
  const resourceConditions = resourceValue as Record<string, unknown>
  const communityName = cleanString(community.name, 160)
  if (!communityName) return null

  return {
    id,
    createdAt,
    updatedAt: validIsoDate(record.updatedAt) ?? createdAt,
    community: {
      name: communityName,
      township: cleanString(community.township, 160),
      region: cleanString(community.region, 160),
      latitude: coordinate(community.latitude, -90, 90),
      longitude: coordinate(community.longitude, -180, 180),
      population: nonNegativeNumber(community.population),
    },
    riskLevel:
      record.riskLevel === "LOW" ||
      record.riskLevel === "MEDIUM" ||
      record.riskLevel === "HIGH"
        ? record.riskLevel
        : null,
    vulnerableGroups: {
      children: nonNegativeNumber(vulnerableGroups.children),
      elderly: nonNegativeNumber(vulnerableGroups.elderly),
      disabled: nonNegativeNumber(vulnerableGroups.disabled),
      otherVulnerable: nonNegativeNumber(vulnerableGroups.otherVulnerable),
    },
    resourceConditions: {
      shelters: nonNegativeNumber(resourceConditions.shelters),
      shelterCapacity: nonNegativeNumber(resourceConditions.shelterCapacity),
      water: cleanString(resourceConditions.water, 120),
      food: cleanString(resourceConditions.food, 120),
      medicine: cleanString(resourceConditions.medicine, 120),
      equipment: cleanString(resourceConditions.equipment, 120),
      cars: nonNegativeNumber(resourceConditions.cars),
      trucks: nonNegativeNumber(resourceConditions.trucks),
      boats: nonNegativeNumber(resourceConditions.boats),
    },
    planningGaps: cleanStringArray(record.planningGaps),
    assistanceCategories: cleanCategories(record.assistanceCategories),
    note: cleanString(record.note, 500),
    status,
    responderLabel:
      status === "PENDING"
        ? null
        : cleanString(record.responderLabel, 120) || DEMO_RESPONDER_LABEL,
    dataProvenance:
      record.dataProvenance === "USER_CONFIRMED" ? "USER_CONFIRMED" : "SAMPLE",
    demo: true,
  }
}

function notifyRequestListeners(): void {
  requestListeners.forEach((listener) => listener())
}

export function planningGapsFromPlan(
  plan: Pick<EvacuationPlanResult, "resourceWarnings">,
): string[] {
  return plan.resourceWarnings.filter(
    (warning) =>
      !warning.startsWith("Transport capacity cannot be assessed from"),
  )
}

export function buildSupportRequestDraft(
  community: CommunityData,
  plan: EvacuationPlanResult,
): SupportRequestDraft {
  return {
    community: {
      name: community.name,
      township: community.township,
      region: community.region,
      latitude: community.latitude,
      longitude: community.longitude,
      population: community.population,
    },
    riskLevel: plan.hazardLevel,
    vulnerableGroups: {
      children: community.children,
      elderly: community.elderly,
      disabled: community.disabled,
      otherVulnerable: community.otherVulnerable,
    },
    resourceConditions: {
      shelters: community.shelters,
      shelterCapacity: community.shelterCapacity,
      water: community.water,
      food: community.food,
      medicine: community.medicine,
      equipment: community.equipment,
      cars: community.cars,
      trucks: community.trucks,
      boats: community.boats,
    },
    planningGaps: planningGapsFromPlan(plan),
    dataProvenance: plan.dataProvenance,
  }
}

export function parseSupportRequests(raw: string | null): SupportRequest[] {
  if (!raw) return []
  try {
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    return parsed
      .map(parseStoredRequest)
      .filter((request): request is SupportRequest => request !== null)
      .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt))
  } catch {
    return []
  }
}

export function loadSupportRequests(
  storage: StorageLike | null = currentStorage(),
): SupportRequest[] {
  if (!storage) return []
  try {
    return parseSupportRequests(storage.getItem(SUPPORT_REQUESTS_STORAGE_KEY))
  } catch {
    return []
  }
}

export function saveSupportRequests(
  requests: SupportRequest[],
  storage: StorageLike | null = currentStorage(),
): void {
  if (!storage) return
  const safeRequests = requests
    .map(parseStoredRequest)
    .filter((request): request is SupportRequest => request !== null)
  try {
    storage.setItem(SUPPORT_REQUESTS_STORAGE_KEY, JSON.stringify(safeRequests))
    notifyRequestListeners()
  } catch {
    // A local demonstration should remain usable if browser storage is unavailable.
  }
}

export function generateSupportRequestId(nowMs = Date.now()): string {
  if (
    typeof crypto !== "undefined" &&
    typeof crypto.randomUUID === "function"
  ) {
    return `DSR-${crypto.randomUUID()}`
  }
  fallbackIdCounter += 1
  return `DSR-${nowMs.toString(36).toUpperCase()}-${fallbackIdCounter.toString(36).toUpperCase()}`
}

export function createSupportRequest(
  input: SupportRequestCreationInput,
  options: Pick<RequestOptions, "now" | "idFactory"> = {},
): SupportRequest {
  const assistanceCategories = cleanCategories(input.assistanceCategories)
  if (assistanceCategories.length === 0) {
    throw new Error("Select at least one assistance category.")
  }
  const now = (options.now ?? (() => new Date()))().toISOString()
  const request = parseStoredRequest({
    ...input,
    id: (options.idFactory ?? generateSupportRequestId)(),
    createdAt: now,
    updatedAt: now,
    assistanceCategories,
    note: input.note ?? "",
    status: "PENDING",
    responderLabel: null,
    demo: true,
  })
  if (!request) throw new Error("The support request snapshot is incomplete.")
  return request
}

export function submitSupportRequest(
  input: SupportRequestCreationInput,
  options: RequestOptions = {},
): SupportRequest {
  const storage =
    options.storage === undefined ? currentStorage() : options.storage
  const request = createSupportRequest(input, options)
  saveSupportRequests([request, ...loadSupportRequests(storage)], storage)
  return request
}

export function nextSupportRequestStatus(
  status: SupportRequestStatus,
): SupportRequestStatus | null {
  if (status === "PENDING") return "ACCEPTED"
  if (status === "ACCEPTED") return "IN_PROGRESS"
  if (status === "IN_PROGRESS") return "RESOLVED"
  return null
}

export function transitionSupportRequest(
  id: string,
  nextStatus: SupportRequestStatus,
  options: Pick<RequestOptions, "storage" | "now"> = {},
): SupportRequest | null {
  const storage =
    options.storage === undefined ? currentStorage() : options.storage
  const requests = loadSupportRequests(storage)
  const current = requests.find((request) => request.id === id)
  if (!current || nextSupportRequestStatus(current.status) !== nextStatus)
    return null

  const updated: SupportRequest = {
    ...current,
    status: nextStatus,
    updatedAt: (options.now ?? (() => new Date()))().toISOString(),
    responderLabel: current.responderLabel ?? DEMO_RESPONDER_LABEL,
  }
  saveSupportRequests(
    requests.map((request) => (request.id === id ? updated : request)),
    storage,
  )
  return updated
}

export function supportRequestStatusLabel(
  status: SupportRequestStatus,
): string {
  if (status === "IN_PROGRESS") return "In Progress"
  return status.charAt(0) + status.slice(1).toLowerCase()
}

export function supportRequestStatusMessage(request: SupportRequest): string {
  if (request.status === "PENDING") return "Awaiting demo responder action"
  if (request.status === "ACCEPTED")
    return `Accepted by ${request.responderLabel ?? DEMO_RESPONDER_LABEL}`
  if (request.status === "IN_PROGRESS")
    return "Demo response marked in progress"
  return "Demo request marked resolved"
}

export function requestBelongsToCommunity(
  request: SupportRequest,
  community: Pick<CommunityData, "name" | "township" | "region">,
): boolean {
  const normalize = (value: string) => value.trim().toLocaleLowerCase()
  return (
    normalize(request.community.name) === normalize(community.name) &&
    normalize(request.community.township) === normalize(community.township) &&
    normalize(request.community.region) === normalize(community.region)
  )
}

export function subscribeSupportRequests(listener: () => void): () => void {
  requestListeners.add(listener)
  const handleStorage = (event: StorageEvent) => {
    if (event.key === SUPPORT_REQUESTS_STORAGE_KEY) listener()
  }
  if (
    typeof window !== "undefined" &&
    typeof window.addEventListener === "function"
  ) {
    window.addEventListener("storage", handleStorage)
  }
  return () => {
    requestListeners.delete(listener)
    if (
      typeof window !== "undefined" &&
      typeof window.removeEventListener === "function"
    ) {
      window.removeEventListener("storage", handleStorage)
    }
  }
}
