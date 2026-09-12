import { useRiskScenario } from "../context/RiskScenarioContext"
import type { Role } from '../App'
import { isCommunityRole } from '../services/rolePresentation'
import {
  DEMO_SCENARIO_BANNER,
  RISK_SCENARIO_OPTIONS,
  type RiskScenario,
} from "../services/demoScenarios"

export default function DevelopmentScenarioSelector({ role }: { role: Role }) {
  const scenario = useRiskScenario()
  if (!scenario.enabled) return null

  return (
    <div
      className={`shrink-0 border-b px-4 py-2.5 md:px-6 ${
        scenario.demoActive
          ? "border-amber-300 bg-amber-50"
          : "border-blue-100 bg-white"
      }`}
    >
      <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-2.5 text-sm">
        <span
          className={
            scenario.demoActive
              ? "font-semibold text-amber-950"
              : "font-semibold text-gray-700"
          }
        >
          Assessment mode
        </span>
        {isCommunityRole(role) ? <select
          id="assessment-mode"
          aria-label="Assessment mode"
          value={scenario.activeScenario}
          onChange={(event) =>
            scenario.setScenario(event.target.value as RiskScenario)
          }
          className={`rounded-lg bg-white px-3 py-1.5 text-sm font-semibold text-gray-900 focus:outline-none focus:ring-2 ${
            scenario.demoActive
              ? "border border-amber-400 focus:ring-amber-500"
              : "border border-gray-300 focus:ring-blue-500"
          }`}
        >
          {RISK_SCENARIO_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select> : <span className="font-semibold text-gray-900" aria-label="Read-only assessment mode">
          {RISK_SCENARIO_OPTIONS.find(option => option.value === scenario.activeScenario)?.label} · Read-only
        </span>}
        {scenario.demoActive && (
          <span
            role="status"
            className="basis-full font-bold leading-snug text-amber-950 lg:basis-auto"
          >
            {DEMO_SCENARIO_BANNER}
          </span>
        )}
      </div>
    </div>
  )
}
