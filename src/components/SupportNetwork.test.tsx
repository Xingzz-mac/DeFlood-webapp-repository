import {
  act,
  create,
  type ReactTestInstance,
  type ReactTestRendererJSON,
} from "react-test-renderer"
import { beforeEach, describe, expect, it, vi } from "vitest"
import type { CommunityData } from "../context/CommunityContext"
import { calculateEvacuationPlan } from "../services/evacuationEngine"
import { DEMO_RISK_FIXTURES } from "../services/riskScenarios"
import { createSupportRequest } from "../services/supportNetwork"
import SupportNetwork from "./SupportNetwork"

const useEvacuationPlanMock = vi.hoisted(() => vi.fn())
const useCommunityMock = vi.hoisted(() => vi.fn())
const useSupportRequestsMock = vi.hoisted(() => vi.fn())

vi.mock("../context/EvacuationContext", () => ({
  useEvacuationPlan: useEvacuationPlanMock,
}))
vi.mock("../context/CommunityContext", () => ({
  useCommunity: useCommunityMock,
}))
vi.mock("../hooks/useSupportRequests", () => ({
  useSupportRequests: useSupportRequestsMock,
}))

const community: CommunityData = {
  name: "Sample Community",
  township: "Township",
  region: "Region",
  population: 2000,
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
  shelterCapacity: 1200,
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

describe("Support Network local demonstration workflow", () => {
  beforeEach(() => {
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
    useEvacuationPlanMock.mockReset()
    useCommunityMock.mockReset()
    useSupportRequestsMock.mockReset()
    useCommunityMock.mockReturnValue({ community, isSampleData: true })
    useSupportRequestsMock.mockReturnValue({
      requests: [],
      submit: vi.fn(),
      transition: vi.fn(),
      refresh: vi.fn(),
    })
  })

  it("never presents seeded sample gaps as confirmed", async () => {
    useEvacuationPlanMock.mockReturnValue(
      calculateEvacuationPlan(
        community,
        DEMO_RISK_FIXTURES["demo-high"],
        "SAMPLE",
      ),
    )
    let renderer: ReturnType<typeof create> | null = null
    await act(async () => {
      renderer = create(<SupportNetwork />)
    })
    const text = pageText(renderer!.toJSON())

    expect(text).toContain("Sample planning gaps")
    expect(text).toContain("Sample resource gaps")
    expect(text).toContain("Sample shelter capacity is short by 800 places.")
    expect(text).toContain("Sample food supply is limited.")
    expect(text).toContain("Demonstration Support Network")
    expect(text).not.toMatch(/confirmed (?:planning|resource|shortfall|gap)/i)
    await act(async () => renderer?.unmount())
  })

  it("allows confirmed headings after user-confirmed provenance is supplied", async () => {
    useEvacuationPlanMock.mockReturnValue(
      calculateEvacuationPlan(
        community,
        DEMO_RISK_FIXTURES["demo-high"],
        "USER_CONFIRMED",
      ),
    )
    let renderer: ReturnType<typeof create> | null = null
    await act(async () => {
      renderer = create(<SupportNetwork />)
    })
    const text = pageText(renderer!.toJSON())

    expect(text).toContain("Confirmed planning gaps")
    expect(text).toContain("Confirmed resource gaps")
    expect(text).not.toContain("Sample planning gaps")
    await act(async () => renderer?.unmount())
  })

  it("prepares but never automatically submits a high-risk request and stores one reviewed selection", async () => {
    const plan = calculateEvacuationPlan(
      community,
      DEMO_RISK_FIXTURES["demo-high"],
      "SAMPLE",
    )
    const submit = vi.fn((input) =>
      createSupportRequest(input, {
        now: () => new Date("2026-09-02T01:00:00.000Z"),
        idFactory: () => "DSR-component",
      }),
    )
    useEvacuationPlanMock.mockReturnValue(plan)
    useSupportRequestsMock.mockReturnValue({
      requests: [],
      submit,
      transition: vi.fn(),
      refresh: vi.fn(),
    })
    let renderer: ReturnType<typeof create> | null = null
    await act(async () => {
      renderer = create(<SupportNetwork />)
    })

    expect(submit).not.toHaveBeenCalled()
    await act(async () =>
      buttonNamed(renderer!.root, "Prepare Support Request").props.onClick(),
    )
    const preparedText = pageText(renderer!.toJSON())
    expect(preparedText).toContain("High risk detected.")
    expect(preparedText).toContain(
      "current sample demonstration planning information",
    )
    expect(preparedText).toContain("Planner-derived gaps")
    plan.resourceWarnings
      .filter(
        (warning) =>
          !warning.startsWith("Transport capacity cannot be assessed from"),
      )
      .forEach((warning) => expect(preparedText).toContain(warning))
    expect(submit).not.toHaveBeenCalled()

    const submitButton = buttonNamed(renderer!.root, "Submit Demo Request")
    expect(submitButton.props.disabled).toBe(true)
    await act(async () =>
      renderer!.root.findByProps({ "aria-label": "Food" }).props.onChange(),
    )
    await act(async () =>
      renderer!.root
        .findByType("textarea")
        .props.onChange({ target: { value: "Need a local demo review." } }),
    )
    const enabledSubmit = buttonNamed(renderer!.root, "Submit Demo Request")
    expect(enabledSubmit.props.disabled).toBe(false)
    await act(async () => {
      enabledSubmit.props.onClick()
      enabledSubmit.props.onClick()
    })

    expect(submit).toHaveBeenCalledOnce()
    expect(submit.mock.calls[0][0]).toMatchObject({
      community: { name: community.name, population: community.population },
      riskLevel: plan.hazardLevel,
      dataProvenance: "SAMPLE",
      planningGaps: plan.resourceWarnings.filter(
        (warning) =>
          !warning.startsWith("Transport capacity cannot be assessed from"),
      ),
      assistanceCategories: ["Food"],
      note: "Need a local demo review.",
    })
    await act(async () => renderer?.unmount())
  })

  it("shows persisted responder status without implying a real dispatch", async () => {
    const plan = calculateEvacuationPlan(
      community,
      DEMO_RISK_FIXTURES["demo-high"],
      "USER_CONFIRMED",
    )
    const accepted = {
      ...createSupportRequest(
        {
          ...planToInput(plan),
          assistanceCategories: ["Shelter" as const],
        },
        {
          now: () => new Date("2026-09-02T01:00:00.000Z"),
          idFactory: () => "DSR-accepted",
        },
      ),
      status: "ACCEPTED" as const,
      responderLabel: "Demo Response Team",
    }
    useEvacuationPlanMock.mockReturnValue(plan)
    useSupportRequestsMock.mockReturnValue({
      requests: [accepted],
      submit: vi.fn(),
      transition: vi.fn(),
      refresh: vi.fn(),
    })
    let renderer: ReturnType<typeof create> | null = null
    await act(async () => {
      renderer = create(<SupportNetwork />)
    })
    const text = pageText(renderer!.toJSON())

    expect(text).toContain("Accepted by Demo Response Team")
    expect(text).toContain("Responder: Demo Response Team")
    expect(text).toContain(
      "not sent to real NGOs, governments, rescue teams, or emergency services",
    )
    await act(async () => renderer?.unmount())
  })
})

function planToInput(plan: ReturnType<typeof calculateEvacuationPlan>) {
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
    planningGaps: plan.resourceWarnings.filter(
      (warning) =>
        !warning.startsWith("Transport capacity cannot be assessed from"),
    ),
    dataProvenance: plan.dataProvenance,
  }
}
