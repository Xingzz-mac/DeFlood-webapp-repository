import { describe, expect, it } from "vitest"
import {
  DEMO_SCENARIOS,
  RISK_SCENARIO_OPTIONS,
  resolveRiskScenario,
} from "./demoScenarios"
import { calculateRisk, classifyHazard } from "./riskEngine"
import { HAZARD_WEIGHTS } from "./riskConfig"

describe("judge-facing deterministic demo scenarios", () => {
  it.each([
    ["demo-low", "LOW"],
    ["demo-medium", "MEDIUM"],
    ["demo-high", "HIGH"],
  ] as const)(
    "runs %s synthetic evidence through the shared engine and produces %s",
    (id, expected) => {
      const scenario = DEMO_SCENARIOS[id]
      const recalculated = calculateRisk(scenario.engineInput)

      expect(scenario.provenance).toBe("DEMO")
      expect(scenario.result).toEqual(recalculated)
      expect(recalculated.calculationStatus).toBe("COMPLETE")
      expect(recalculated.hazardLevel).toBe(expected)
      expect(recalculated.hazardLevel).toBe(
        classifyHazard(recalculated.hazardScore!),
      )
      expect(recalculated.engineVersion).toBe("deflood-risk-engine-2g-v1")
      expect(
        recalculated.hazardBreakdown.map((item) => item.effectiveWeight),
      ).toEqual([
        HAZARD_WEIGHTS.rainfall,
        HAZARD_WEIGHTS.riverAbnormality,
        HAZARD_WEIGHTS.riverTrend,
        HAZARD_WEIGHTS.elevation,
      ])
    },
  )

  it("keeps the legacy incomplete test scenario out of the judge-facing control", () => {
    expect(DEMO_SCENARIOS["demo-incomplete"].result.calculationStatus).toBe(
      "INCOMPLETE",
    )
    expect(RISK_SCENARIO_OPTIONS.map((option) => option.value)).toEqual([
      "live",
      "demo-low",
      "demo-medium",
      "demo-high",
    ])
  })

  it("returns the exact live object when Live Assessment is selected or demo mode is disabled", () => {
    const live = calculateRisk({
      environmental: null,
      historicalBaseline: null,
      nowMs: 0,
    })
    expect(resolveRiskScenario(live, "live", true)).toBe(live)
    expect(resolveRiskScenario(live, "demo-high", false)).toBe(live)
  })
})
