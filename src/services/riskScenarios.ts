import {
  DEMO_SCENARIOS,
  RISK_SCENARIO_OPTIONS,
  resolveRiskScenario,
  type DemoRiskScenario,
  type RiskScenario,
} from "./demoScenarios"

export const DEMO_RISK_FIXTURES = Object.fromEntries(
  Object.entries(DEMO_SCENARIOS).map(([id, scenario]) => [id, scenario.result]),
) as Readonly<Record<DemoRiskScenario, typeof DEMO_SCENARIOS[DemoRiskScenario]["result"]>>

export {
  RISK_SCENARIO_OPTIONS,
  resolveRiskScenario,
  type DemoRiskScenario,
  type RiskScenario,
}
