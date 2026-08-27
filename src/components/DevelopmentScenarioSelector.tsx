import { useRiskScenario } from '../context/RiskScenarioContext'
import { RISK_SCENARIO_OPTIONS, type RiskScenario } from '../services/riskScenarios'

export default function DevelopmentScenarioSelector() {
  const scenario = useRiskScenario()
  if (!scenario.enabled) return null

  return (
    <div className="border-b border-amber-200 bg-amber-50 px-4 py-2.5 md:px-6">
      <div className="mx-auto flex max-w-5xl flex-wrap items-center gap-2.5 text-sm">
        <label htmlFor="developer-risk-scenario" className="font-semibold text-amber-900">
          Developer scenario
        </label>
        <select
          id="developer-risk-scenario"
          value={scenario.activeScenario}
          onChange={event => scenario.setScenario(event.target.value as RiskScenario)}
          className="rounded-lg border border-amber-300 bg-white px-3 py-1.5 text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-amber-500"
        >
          {RISK_SCENARIO_OPTIONS.map(option => (
            <option key={option.value} value={option.value}>{option.label}</option>
          ))}
        </select>
        {scenario.demoActive && (
          <span role="status" className="font-bold text-amber-900">
            DEMO SCENARIO — Not live flood data
          </span>
        )}
      </div>
    </div>
  )
}
