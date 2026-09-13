import {
  act,
  create,
  type ReactTestInstance,
  type ReactTestRendererJSON,
} from "react-test-renderer"
import { beforeEach, describe, expect, it, vi } from "vitest"
import type { CommunityData } from "../context/CommunityContext"
import { DEMO_OPERATIONS_COMMUNITIES, DEMO_SCENARIOS } from "../services/demoScenarios"
import { calculateEvacuationPlan } from "../services/evacuationEngine"
import {
  createSupportRequest,
  type SupportRequest,
  type SupportRequestStatus,
} from "../services/supportNetwork"
import NGODashboard from "./NGODashboard"

const useSupportRequestsMock = vi.hoisted(() => vi.fn())
const contextMocks = vi.hoisted(() => ({
  useCommunity: vi.fn(),
  useRisk: vi.fn(),
  useEvacuationPlan: vi.fn(),
  useRiskScenarioOptional: vi.fn(),
}))
vi.mock("../hooks/useSupportRequests", () => ({
  useSupportRequests: useSupportRequestsMock,
}))
vi.mock("../context/CommunityContext", () => ({
  useCommunity: contextMocks.useCommunity,
}))
vi.mock("../context/RiskContext", () => ({ useRisk: contextMocks.useRisk }))
vi.mock("../context/EvacuationContext", () => ({
  useEvacuationPlan: contextMocks.useEvacuationPlan,
}))
vi.mock("../context/RiskScenarioContext", () => ({
  useRiskScenarioOptional: contextMocks.useRiskScenarioOptional,
}))

const currentCommunity: CommunityData = {
  name: "Current Confirmed Community",
  township: "Current Township",
  region: "Current Region",
  population: 2_000,
  children: 320,
  elderly: 140,
  disabled: 65,
  otherVulnerable: 20,
  leader: "Leader",
  mayor: "Mayor",
  assistant: "Assistant",
  phone: "000",
  volunteers: 25,
  cars: 2,
  trucks: 2,
  boats: 2,
  shelters: 2,
  shelterCapacity: 1_200,
  water: "Adequate",
  food: "Limited",
  medicine: "Adequate",
  equipment: "Adequate",
  latitude: 16.5,
  longitude: 95,
  locationSource: "manual",
  locationAccuracy: null,
  locationUpdatedAt: null,
}

function pageText(
  node: ReactTestRendererJSON | ReactTestRendererJSON[] | string | null,
): string {
  const text =
    node === null
      ? ""
      : typeof node === "string"
        ? node
        : Array.isArray(node)
          ? node.map(pageText).join(" ")
          : (node.children ?? [])
              .map((child) =>
                typeof child === "string" ? child : pageText(child),
              )
              .join(" ")
  return text.replace(/\s+/g, " ").trim()
}

function instanceText(node: ReactTestInstance | string): string {
  if (typeof node === "string") return node
  return node.children
    .map((child) => instanceText(child))
    .join(" ")
    .replace(/\s+/g, " ")
    .trim()
}

function buttonNamed(
  root: ReactTestInstance,
  label: string,
): ReactTestInstance {
  const button = root
    .findAllByType("button")
    .find((candidate) => instanceText(candidate).includes(label))
  if (!button) throw new Error(`Button not found: ${label}`)
  return button
}

function localRequest(
  status: SupportRequestStatus = "PENDING",
): SupportRequest {
  const request = createSupportRequest(
    {
      community: {
        name: "Locally Submitted Community",
        township: "Demo Township",
        region: "Demo Region",
        latitude: 16.5,
        longitude: 95,
        population: 1500,
      },
      riskLevel: "HIGH",
      vulnerableGroups: {
        children: 200,
        elderly: 100,
        disabled: 30,
        otherVulnerable: 20,
      },
      resourceConditions: {
        shelters: 1,
        shelterCapacity: 900,
        water: "Limited",
        food: "Adequate",
        medicine: "Limited",
        equipment: "Adequate",
        cars: 3,
        trucks: 1,
        boats: 2,
      },
      planningGaps: [
        "Confirmed shelter capacity is short by 600 places.",
        "Confirmed water supply is limited.",
      ],
      assistanceCategories: ["Shelter", "Water"],
      note: "Local-only demonstration note.",
      dataProvenance: "USER_CONFIRMED",
    },
    {
      now: () => new Date("2026-09-02T04:00:00.000Z"),
      idFactory: () => "DSR-dashboard",
    },
  )
  return {
    ...request,
    status,
    responderLabel: status === "PENDING" ? null : "Demo Response Team",
  }
}

describe("NGO / government local demo request dashboard", () => {
  const transition = vi.fn()

  beforeEach(() => {
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
    transition.mockReset()
    useSupportRequestsMock.mockReset()
    const risk = DEMO_SCENARIOS["demo-medium"].result
    contextMocks.useCommunity.mockReturnValue({
      community: currentCommunity,
      isSampleData: false,
    })
    contextMocks.useRisk.mockReturnValue(risk)
    contextMocks.useEvacuationPlan.mockReturnValue(
      calculateEvacuationPlan(currentCommunity, risk, "USER_CONFIRMED"),
    )
    contextMocks.useRiskScenarioOptional.mockReturnValue({
      enabled: true,
      activeScenario: "live",
      demoActive: false,
      selectedDemo: null,
      setScenario: vi.fn(),
    })
  })

  it("shows locally submitted requests prominently with full snapshot details and disclaimer", async () => {
    useSupportRequestsMock.mockReturnValue({
      requests: [localRequest()],
      transition,
      submit: vi.fn(),
      refresh: vi.fn(),
    })
    let renderer: ReturnType<typeof create> | null = null
    await act(async () => {
      renderer = create(
        <NGODashboard
          user={{ role: "ngo", name: "Demo coordinator" }}
          onNavigate={vi.fn()}
        />,
      )
    })
    const text = pageText(renderer!.toJSON())

    expect(text).toContain("Local Demo Request")
    expect(text).toContain("NGO Assistance / Response")
    expect(text).not.toContain("Regional Coordination")
    expect(text).toContain("Locally Submitted Community")
    expect(text.indexOf("Locally Submitted Community")).toBeLessThan(
      text.indexOf("Demo Delta Community A"),
    )
    expect(text).toMatch(/Open Demo Requests\s*1/)
    expect(text).toMatch(/Demo Township\s*,\s*Demo Region/)
    expect(text).toContain("DSR-dashboard")
    expect(text).toContain("Shelter, Water")
    expect(text).toContain("Confirmed shelter capacity is short by 600 places.")
    expect(text).toContain("Local-only demonstration note.")
    expect(text).toContain("not a connected response system")
    expect(text).not.toMatch(/Red Cross|UNICEF|Save the Children/i)
    await act(async () => renderer?.unmount())
  })

  it("offers only the next valid responder transition and refreshes selected request details", async () => {
    useSupportRequestsMock.mockReturnValue({
      requests: [localRequest("PENDING")],
      transition,
      submit: vi.fn(),
      refresh: vi.fn(),
    })
    let renderer: ReturnType<typeof create> | null = null
    const renderDashboard = () => (
      <NGODashboard
        user={{ role: "ngo", name: "Demo responder" }}
        onNavigate={vi.fn()}
      />
    )
    await act(async () => {
      renderer = create(renderDashboard())
    })

    expect(buttonNamed(renderer!.root, "Accept Request")).toBeDefined()
    expect(
      renderer!.root
        .findAllByType("button")
        .some((button) => instanceText(button).includes("Mark In Progress")),
    ).toBe(false)
    await act(async () =>
      buttonNamed(renderer!.root, "Accept Request").props.onClick(),
    )
    expect(transition).toHaveBeenCalledWith("DSR-dashboard", "ACCEPTED")

    useSupportRequestsMock.mockReturnValue({
      requests: [localRequest("ACCEPTED")],
      transition,
      submit: vi.fn(),
      refresh: vi.fn(),
    })
    await act(async () => renderer!.update(renderDashboard()))
    const acceptedText = pageText(renderer!.toJSON())
    expect(acceptedText).toContain("Demo Response Team")
    expect(buttonNamed(renderer!.root, "Mark In Progress")).toBeDefined()

    useSupportRequestsMock.mockReturnValue({
      requests: [localRequest("IN_PROGRESS")],
      transition,
      submit: vi.fn(),
      refresh: vi.fn(),
    })
    await act(async () => renderer!.update(renderDashboard()))
    expect(buttonNamed(renderer!.root, "Resolve Request")).toBeDefined()

    useSupportRequestsMock.mockReturnValue({
      requests: [localRequest("RESOLVED")],
      transition,
      submit: vi.fn(),
      refresh: vi.fn(),
    })
    await act(async () => renderer!.update(renderDashboard()))
    expect(pageText(renderer!.toJSON())).toContain("Local demo request resolved")
    expect(
      renderer!.root
        .findAllByType("button")
        .some((button) => instanceText(button).includes("Accept Request")),
    ).toBe(false)
    await act(async () => renderer?.unmount())
  })

  it("shows regional counts, deterministic focus, provenance and read-only support activity for Government", async () => {
    const latest = localRequest("IN_PROGRESS")
    const older = { ...localRequest(), id: "older-request", createdAt: "2026-09-01T04:00:00.000Z" }
    useSupportRequestsMock.mockReturnValue({ requests: [latest, older], transition })
    let renderer: ReturnType<typeof create> | null = null
    await act(async () => {
      renderer = create(<NGODashboard user={{ role: "government", name: "Coordinator" }} onNavigate={vi.fn()} />)
    })
    const text = pageText(renderer!.toJSON())
    expect(text).toContain("Regional Coordination")
    expect(text).not.toContain("NGO Assistance / Response")
    expect(text).toContain("Prototype coordination view")
    expect(text).toMatch(/High Risk Communities\s*2/)
    expect(text).toMatch(/Medium Risk Communities\s*2/)
    expect(text).toMatch(/Open Support Requests\s*2/)
    const plans = [
      calculateEvacuationPlan(currentCommunity, DEMO_SCENARIOS["demo-medium"].result, "USER_CONFIRMED"),
      ...DEMO_OPERATIONS_COMMUNITIES.map(entry => calculateEvacuationPlan(entry.community, DEMO_SCENARIOS[entry.scenarioId].result, "SAMPLE")),
    ]
    const gapCount = plans.filter(plan => plan.resourceWarnings.length + plan.missingInformation.length > 0).length + 1
    expect(text).toMatch(new RegExp(`Communities with Preparedness Gaps\\s*${gapCount}`))
    expect(text).toContain("In Progress")
    expect(text).toContain("Demo Response Team")
    expect(text).toContain("Shelter, Water")
    expect(text).toContain("LIVE / CURRENT")
    expect(text).toContain("USER_CONFIRMED")
    expect(text).toContain("DEMO SCENARIO")
    expect(text).not.toMatch(/Accept Request|Mark In Progress|Resolve Request|priority score/i)
    const triage = renderer!.root.findByProps({ "aria-label": "Community triage list" })
    const listText = instanceText(triage)
    expect(listText.indexOf("Locally Submitted Community")).toBeLessThan(listText.indexOf("Demo Delta Community A"))
    expect(listText.indexOf("Demo Delta Community A")).toBeLessThan(listText.indexOf("Demo Riverside Community B"))
    expect(listText.indexOf("Demo Riverside Community B")).toBeLessThan(listText.indexOf("Demo Township Community C"))
    expect(triage.findAllByType("button").filter(button => instanceText(button).includes("Locally Submitted Community"))).toHaveLength(1)

    await act(async () => buttonNamed(triage, "Demo Delta Community A").props.onClick())
    const focus = renderer!.root.findAllByType("section").find(section =>
      section.findAllByType("h3").some(heading => instanceText(heading) === "Coordination Focus"),
    )!
    const highPlan = plans[1]
    expect(focus.findAllByType("li").map(item => instanceText(item).replace(/^•\s*/, ""))).toEqual(highPlan.allowedActions.filter(action => action.id !== "prepare-support-request").map(action => action.text))
    const highText = pageText(renderer!.toJSON())
    expect(highText).toContain("No support request has been submitted for this demonstration scenario.")
    expect(highText).toContain("Sample drinking water supply is critical.")
    expect(transition).not.toHaveBeenCalled()
    await act(async () => renderer?.unmount())
  })

  it("keeps sample and Limited assessment labels visible in the government current-community detail", async () => {
    contextMocks.useCommunity.mockReturnValue({ community: currentCommunity, isSampleData: true })
    contextMocks.useRisk.mockReturnValue({
      ...DEMO_SCENARIOS["demo-incomplete"].result,
      hazardLevel: null,
      hazardScore: null,
      rainfallSeverity: 30,
      calculationStatus: "INCOMPLETE",
    })
    useSupportRequestsMock.mockReturnValue({ requests: [], transition })
    let renderer: ReturnType<typeof create> | null = null
    await act(async () => {
      renderer = create(<NGODashboard user={{ role: "government", name: "Coordinator" }} onNavigate={vi.fn()} />)
    })
    await act(async () => buttonNamed(renderer!.root, currentCommunity.name).props.onClick())
    const text = pageText(renderer!.toJSON())
    expect(text).toContain("SAMPLE")
    expect(text).toContain("LIVE / CURRENT")
    expect(text).toMatch(/Assessment\s*Limited/)
    expect(text).toMatch(/Hazard level\s*Unavailable/)
    expect(text).not.toMatch(/Accept Request|Mark In Progress|Resolve Request/)
    await act(async () => renderer?.unmount())
  })

  it("keeps existing filters working for local demo requests", async () => {
    useSupportRequestsMock.mockReturnValue({
      requests: [localRequest("IN_PROGRESS")],
      transition,
      submit: vi.fn(),
      refresh: vi.fn(),
    })
    let renderer: ReturnType<typeof create> | null = null
    await act(async () => {
      renderer = create(
        <NGODashboard
          user={{ role: "ngo", name: "Demo coordinator" }}
          onNavigate={vi.fn()}
        />,
      )
    })
    await act(async () =>
      buttonNamed(renderer!.root, "In Progress").props.onClick(),
    )
    const text = pageText(renderer!.toJSON())
    expect(text).toContain("Locally Submitted Community")
    expect(text).not.toContain("Sample — Dedaye Township")
    await act(async () => renderer?.unmount())
  })

  it("orders deterministic demo communities HIGH to LOW and keeps a high-risk no-request state explicit", async () => {
    useSupportRequestsMock.mockReturnValue({
      requests: [],
      transition,
      submit: vi.fn(),
      refresh: vi.fn(),
    })
    let renderer: ReturnType<typeof create> | null = null
    await act(async () => {
      renderer = create(
        <NGODashboard
          user={{ role: "ngo", name: "Demo coordinator" }}
          onNavigate={vi.fn()}
        />,
      )
    })

    const initialText = pageText(renderer!.toJSON())
    expect(initialText.indexOf("Demo Delta Community A")).toBeLessThan(
      initialText.indexOf("Demo Riverside Community B"),
    )
    expect(initialText.indexOf("Demo Riverside Community B")).toBeLessThan(
      initialText.indexOf("Demo Township Community C"),
    )
    expect(initialText).toContain("HIGH RISK")
    expect(initialText).toContain("MEDIUM RISK")
    expect(initialText).toContain("LOW RISK")
    expect(initialText).toContain("DEMO SCENARIO")

    await act(async () =>
      buttonNamed(renderer!.root, "Demo Delta Community A").props.onClick(),
    )
    const selectedText = pageText(renderer!.toJSON())
    expect(selectedText).toContain(
      "No support request has been submitted for this demonstration scenario.",
    )
    expect(selectedText).toContain(
      "High risk identified, but no support request has been sent.",
    )
    expect(selectedText).toMatch(/Shelter capacity\s*1,500/)
    expect(selectedText).toMatch(/Shelter shortage\s*1,300/)
    expect(selectedText).toContain("Sample drinking water supply is critical.")
    expect(
      renderer!.root
        .findAllByType("button")
        .some((button) => instanceText(button).includes("Accept Request")),
    ).toBe(false)
    await act(async () => renderer?.unmount())
  })
})
