import type { CommunityData } from "../context/CommunityContext"
import { calculateRisk } from "./riskEngine"
import type {
  HistoricalBaseline,
  RiskEngineInput,
  RiskResult,
} from "./riskTypes"
import type {
  EnvironmentalData,
  RiverDay,
  SourceMetadata,
  WeatherModelData,
  WeatherModelKey,
} from "./types"
import { WEATHER_MODEL_DEFINITIONS, WEATHER_MODEL_KEYS } from "./weatherModels"

export type RiskScenario = "live" | DemoRiskScenario
export type DemoRiskScenario = "demo-low" | "demo-medium" | "demo-high" | "demo-incomplete"

export const DEMO_SCENARIO_BANNER =
  "DEMO SCENARIO — Synthetic environmental evidence for demonstration. This is not a live flood assessment."

export const RISK_SCENARIO_OPTIONS: ReadonlyArray<{
  value: RiskScenario
  label: string
}> = [
  { value: "live", label: "Live Assessment" },
  { value: "demo-low", label: "Demo — LOW" },
  { value: "demo-medium", label: "Demo — MEDIUM" },
  { value: "demo-high", label: "Demo — HIGH" },
]

const DEMO_NOW = "2026-09-02T00:00:00.000Z"
const DEMO_COORDINATE = { latitude: 16.5, longitude: 95 }
const DEMO_FINGERPRINT = "16.5000,95.0000"

interface SyntheticEvidenceDefinition {
  weatherTotals: [number, number, number] | null
  riverDischarge: number[]
  elevation: number
  historicalValues: number[]
}

export interface DemoScenarioDefinition {
  id: DemoRiskScenario
  label: string
  provenance: "DEMO"
  evidenceSummary: string
  environmentalData: EnvironmentalData
  historicalBaseline: HistoricalBaseline
  engineInput: RiskEngineInput
  result: RiskResult
}

export interface DemoOperationsCommunity {
  id: string
  scenarioId: DemoRiskScenario
  provenance: "DEMO"
  community: CommunityData
}

function sourceMetadata(usable = true): SourceMetadata {
  return {
    status: usable ? "live" : "unavailable",
    retrievedAt: DEMO_NOW,
    lastSuccessfulAt: usable ? DEMO_NOW : null,
    cachedAt: null,
    ageMs: usable ? 0 : null,
    cached: false,
    coordinateFingerprint: DEMO_FINGERPRINT,
    error: null,
    refreshAttempt: null,
  }
}

function weatherModel(
  key: WeatherModelKey,
  totals: [number, number, number] | null,
): WeatherModelData {
  return {
    label: WEATHER_MODEL_DEFINITIONS[key].label,
    model: `synthetic-demo-${key}`,
    unit: "mm",
    horizons: ([24, 48, 72] as const).map((hours, index) => ({
      hours,
      total: totals?.[index] ?? null,
      expectedHours: hours,
      validHours: totals ? hours : 0,
      coverage: totals ? 100 : 0,
      complete: totals !== null,
    })),
    series: [],
    metadata: sourceMetadata(totals !== null),
  }
}

function riverDays(values: number[]): RiverDay[] {
  return values.map((discharge, index) => ({
    date: `2026-09-${String(index + 2).padStart(2, "0")}`,
    discharge,
    mean: discharge,
    median: discharge,
    maximum: discharge * 1.15,
    p25: discharge * 0.9,
    p75: discharge * 1.1,
  }))
}

function environmentalData(
  definition: SyntheticEvidenceDefinition,
): EnvironmentalData {
  const days = riverDays(definition.riverDischarge)
  const peakDischarge = Math.max(...definition.riverDischarge)
  const trend =
    definition.riverDischarge.at(-1)! > definition.riverDischarge[0]
      ? "rising"
      : definition.riverDischarge.at(-1)! < definition.riverDischarge[0]
        ? "falling"
        : "stable"
  return {
    location: DEMO_COORDINATE,
    fingerprint: DEMO_FINGERPRINT,
    weatherModels: Object.fromEntries(
      WEATHER_MODEL_KEYS.map((key) => [
        key,
        weatherModel(key, definition.weatherTotals),
      ]),
    ) as EnvironmentalData["weatherModels"],
    river: {
      unit: "m³/s",
      recentDays: [],
      days,
      primaryValidDays: Math.min(3, days.length),
      primaryUsable: days.length >= 2,
      peakDischarge,
      peakDate:
        days.find((day) => day.discharge === peakDischarge)?.date ?? null,
      trend,
      ensembleAvailability: {
        mean: {
          available: true,
          complete: true,
          validDays: days.length,
          expectedDays: days.length,
        },
        median: {
          available: true,
          complete: true,
          validDays: days.length,
          expectedDays: days.length,
        },
        maximum: {
          available: true,
          complete: true,
          validDays: days.length,
          expectedDays: days.length,
        },
        p25: {
          available: true,
          complete: true,
          validDays: days.length,
          expectedDays: days.length,
        },
        p75: {
          available: true,
          complete: true,
          validDays: days.length,
          expectedDays: days.length,
        },
      },
      communityCoordinate: DEMO_COORDINATE,
      riverModelCoordinate: DEMO_COORDINATE,
      riverModelDistanceKm: 0,
      riverLookupMode: "EXACT_QUERY",
      metadata: sourceMetadata(),
    },
    terrain: {
      unit: "m",
      elevation: definition.elevation,
      metadata: sourceMetadata(),
    },
    retrievedAt: DEMO_NOW,
    status: definition.weatherTotals ? "live" : "partial",
    stale: false,
  }
}

function historicalBaseline(values: number[]): HistoricalBaseline {
  return {
    status: "available",
    requestedCoordinate: DEMO_COORDINATE,
    returnedModelCoordinate: DEMO_COORDINATE,
    coordinateFingerprint: DEMO_FINGERPRINT,
    calendarMonth: 9,
    values,
    validSampleCount: values.length,
    distinctYears: 20,
    firstValidDate: "1984-09-01",
    lastValidDate: "2025-09-30",
    unit: "m³/s",
    sourceId: "synthetic-demo-history",
    schemaVersion: 3,
    retrievedAt: DEMO_NOW,
    lastSuccessfulAt: DEMO_NOW,
    cachedAt: null,
    cached: false,
    error: null,
  }
}

function buildScenario(
  id: DemoRiskScenario,
  label: string,
  evidenceSummary: string,
  evidence: SyntheticEvidenceDefinition,
): DemoScenarioDefinition {
  const environmental = environmentalData(evidence)
  const historical = historicalBaseline(evidence.historicalValues)
  const engineInput: RiskEngineInput = {
    environmental,
    historicalBaseline: historical,
    nowMs: Date.parse(DEMO_NOW),
  }
  return {
    id,
    label,
    provenance: "DEMO",
    evidenceSummary,
    environmentalData: environmental,
    historicalBaseline: historical,
    engineInput,
    result: calculateRisk(engineInput),
  }
}

export const DEMO_SCENARIOS: Readonly<Record<DemoRiskScenario, DemoScenarioDefinition>> =
  {
    "demo-low": buildScenario(
      "demo-low",
      "LOW synthetic scenario",
      "Mild accumulated rainfall, river discharge within the common historical range, a falling near-term trend, and higher terrain.",
      {
        weatherTotals: [5, 10, 15],
        riverDischarge: [12, 10, 8, 8, 7, 7, 6],
        elevation: 18,
        historicalValues: Array.from({ length: 200 }, (_, index) => index + 1),
      },
    ),
    "demo-medium": buildScenario(
      "demo-medium",
      "MEDIUM synthetic scenario",
      "Moderate accumulated rainfall, elevated river discharge, a modest rising trend, and low-lying terrain.",
      {
        weatherTotals: [35, 60, 90],
        riverDischarge: [88, 90, 92, 94, 95, 96, 97],
        elevation: 8,
        historicalValues: Array.from({ length: 100 }, (_, index) => index + 1),
      },
    ),
    "demo-high": buildScenario(
      "demo-high",
      "HIGH synthetic scenario",
      "Heavy accumulated rainfall, unusually high river discharge, a sharply rising near-term trend, and very low elevation.",
      {
        weatherTotals: [130, 220, 280],
        riverDischarge: [100, 130, 170, 190, 205, 215, 225],
        elevation: 1,
        historicalValues: Array.from(
          { length: 1000 },
          (_, index) => index / 10,
        ),
      },
    ),
    "demo-incomplete": buildScenario(
      "demo-incomplete",
      "Incomplete synthetic scenario",
      "Synthetic rainfall evidence is unavailable, so the deterministic engine does not assign a LOW, MEDIUM, or HIGH hazard.",
      {
        weatherTotals: null,
        riverDischarge: [10, 11, 12, 12, 13, 13, 14],
        elevation: 20,
        historicalValues: Array.from({ length: 100 }, (_, index) => index + 1),
      },
    ),
  }

function community(
  input: Partial<CommunityData> & Pick<CommunityData, "name" | "township">,
): CommunityData {
  const { name, township, ...overrides } = input
  return {
    name,
    township,
    region: "Fictional Delta Demonstration Area",
    population: 1_000,
    children: 180,
    elderly: 120,
    disabled: 45,
    otherVulnerable: 70,
    leader: "Demo Community Lead",
    mayor: "Demo Local Coordinator",
    assistant: "Demo Operations Assistant",
    phone: "Not connected",
    volunteers: 30,
    cars: 5,
    trucks: 2,
    boats: 4,
    shelters: 2,
    shelterCapacity: 800,
    water: "Adequate",
    food: "Adequate",
    medicine: "Adequate",
    equipment: "Adequate",
    latitude: DEMO_COORDINATE.latitude,
    longitude: DEMO_COORDINATE.longitude,
    locationSource: "manual",
    locationAccuracy: null,
    locationUpdatedAt: null,
    ...overrides,
  }
}

export const DEMO_OPERATIONS_COMMUNITIES: readonly DemoOperationsCommunity[] = [
  {
    id: "demo-delta-community-a",
    scenarioId: "demo-high",
    provenance: "DEMO",
    community: community({
      name: "Demo Delta Community A",
      township: "Demo Delta Township",
      population: 2_800,
      children: 520,
      elderly: 330,
      disabled: 105,
      otherVulnerable: 190,
      volunteers: 20,
      cars: 4,
      trucks: 1,
      boats: 2,
      shelters: 2,
      shelterCapacity: 1_500,
      water: "Critical",
      food: "Limited",
      medicine: "Limited",
    }),
  },
  {
    id: "demo-riverside-community-b",
    scenarioId: "demo-medium",
    provenance: "DEMO",
    community: community({
      name: "Demo Riverside Community B",
      township: "Demo Riverside Township",
      population: 1_600,
      children: 280,
      elderly: 190,
      disabled: 70,
      otherVulnerable: 95,
      cars: 6,
      trucks: 2,
      boats: 5,
      shelters: 2,
      shelterCapacity: 1_400,
      food: "Limited",
    }),
  },
  {
    id: "demo-township-community-c",
    scenarioId: "demo-low",
    provenance: "DEMO",
    community: community({
      name: "Demo Township Community C",
      township: "Demo Inland Township",
      population: 900,
      children: 150,
      elderly: 95,
      disabled: 30,
      otherVulnerable: 45,
      volunteers: 38,
      cars: 8,
      trucks: 3,
      boats: 2,
      shelters: 2,
      shelterCapacity: 1_000,
    }),
  },
]

export function demoScenario(
  scenario: DemoRiskScenario,
): DemoScenarioDefinition {
  return DEMO_SCENARIOS[scenario]
}

export function resolveRiskScenario(
  liveRisk: RiskResult,
  scenario: RiskScenario,
  enabled: boolean,
): RiskResult {
  if (!enabled || scenario === "live") return liveRisk
  return DEMO_SCENARIOS[scenario].result
}
