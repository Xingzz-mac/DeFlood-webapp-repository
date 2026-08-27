import { useState, type ReactNode } from 'react'
import type { Section } from '../App'
import { useCommunity } from '../context/CommunityContext'
import { useEvacuationPlan } from '../context/EvacuationContext'
import { useRisk } from '../context/RiskContext'
import { requestEvacuationAiPlan } from '../services/evacuationAi'
import type { EvacuationAiResult } from '../services/evacuationTypes'
import EvacuationChat from './EvacuationChat'
import {
  IconAlertTriangle,
  IconCheckCircle,
  IconRefresh,
  IconTruck,
  IconUsers,
} from './Icons'

interface EvacuationPlannerProps {
  onNavigate: (section: Section) => void
}

function displayNumber(value: number | null): string {
  return value === null ? 'Unknown' : value.toLocaleString()
}

function displayPercent(value: number | null): string {
  if (value === null) return 'Unknown'
  return `${Number.isInteger(value) ? value.toFixed(0) : value.toFixed(1)}%`
}

export default function EvacuationPlanner({ onNavigate }: EvacuationPlannerProps) {
  const { community } = useCommunity()
  const risk = useRisk()
  const plan = useEvacuationPlan()
  const [aiState, setAiState] = useState<'idle' | 'loading' | 'success' | 'error'>('idle')
  const [aiResult, setAiResult] = useState<EvacuationAiResult | null>(null)
  const [aiError, setAiError] = useState<string | null>(null)

  const generateAiPlan = async () => {
    setAiState('loading')
    setAiResult(null)
    setAiError(null)
    try {
      const result = await requestEvacuationAiPlan(plan, community, risk)
      setAiResult(result)
      setAiState('success')
    } catch (error) {
      setAiError(error instanceof Error ? error.message : 'AI assistance is unavailable.')
      setAiState('error')
    }
  }

  return (
    <div className="mx-auto max-w-5xl p-4 md:p-6">
      <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-gray-900 md:text-2xl">Evacuation Planner</h1>
          <p className="mt-0.5 text-sm text-gray-500">{community.name} · deterministic decision support</p>
        </div>
        <span className="rounded-full border border-blue-200 bg-blue-50 px-3 py-1.5 text-xs font-bold text-blue-800">
          {plan.planningStatus.replace(/_/g, ' ')}
        </span>
      </div>

      <div className="mb-5 rounded-xl border border-amber-200 bg-amber-50 px-5 py-4 text-sm text-amber-900">
        <strong>Prototype safety boundary:</strong> this planner does not issue mandatory evacuation orders, select routes, set departure times, or assume resource capacities.
      </div>

      <section className="mb-5 rounded-2xl border border-gray-200 bg-white p-5">
        <SectionTitle icon={<IconAlertTriangle size={18} />} title="Current situation" />
        <div className="mt-4 grid gap-3 sm:grid-cols-3">
          <Metric label="Flood Hazard" value={plan.hazardLevel ?? plan.riskStatus} />
          <Metric label="Hazard Score" value={plan.hazardScore === null ? 'Unavailable' : `${plan.hazardScore.toFixed(1)} / 100`} />
          <Metric label="Data Confidence" value={plan.dataConfidence === null ? 'Unavailable' : `${plan.dataConfidence.toFixed(1)} / 100`} />
        </div>
        <div className="mt-4 space-y-2 text-sm text-gray-700">
          {plan.explanations.map(explanation => <p key={explanation}>{explanation}</p>)}
        </div>
      </section>

      <div className="mb-5 grid gap-5 md:grid-cols-2">
        <section className="rounded-2xl border border-gray-200 bg-white p-5">
          <SectionTitle icon={<IconUsers size={18} />} title="Community snapshot" />
          <div className="mt-4 space-y-2 text-sm">
            <Row label="Population" value={displayNumber(plan.shelter.population)} />
            <Row label="People with disabilities" value={community.disabled.toLocaleString()} />
            <Row label="Elderly residents" value={community.elderly.toLocaleString()} />
            <Row label="Children" value={community.children.toLocaleString()} />
            <Row label="Other vulnerable residents" value={community.otherVulnerable.toLocaleString()} />
          </div>
          <p className="mt-3 text-xs text-gray-500">Groups are shown separately and are not summed because people may belong to more than one group.</p>
        </section>

        <section className="rounded-2xl border border-gray-200 bg-white p-5">
          <SectionTitle icon={<IconCheckCircle size={18} />} title="Shelter readiness" />
          <div className="mt-4 space-y-2 text-sm">
            <Row label="Reported shelters" value={displayNumber(plan.shelter.shelterCount)} />
            <Row label="Reported capacity" value={displayNumber(plan.shelter.reportedCapacity)} />
            <Row label="Coverage" value={displayPercent(plan.shelter.coveragePercent)} />
            <Row label="Confirmed shortage" value={plan.shelter.shortageConfirmed ? `${displayNumber(plan.shelter.shortage)} places` : plan.shelter.shortage === null ? 'Unknown' : 'None'} />
            <Row label="Operational status" value="Unknown — verify locally" />
          </div>
          {plan.shelter.shortageConfirmed && (
            <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-4">
              <div className="text-xs font-bold uppercase tracking-wide text-amber-800">Confirmed shelter shortfall</div>
              <div className="mt-3 grid grid-cols-2 gap-3 text-sm">
                <Metric label="Population" value={displayNumber(plan.shelter.population)} />
                <Metric label="Reported capacity" value={displayNumber(plan.shelter.reportedCapacity)} />
                <Metric label="Coverage" value={displayPercent(plan.shelter.coveragePercent)} />
                <Metric label="Shortfall" value={`${displayNumber(plan.shelter.shortage)} places`} />
              </div>
              <p className="mt-3 text-sm leading-relaxed text-amber-950">
                Reported shelter capacity covers {displayNumber(plan.shelter.reportedCapacity)} of {displayNumber(plan.shelter.population)} residents ({displayPercent(plan.shelter.coveragePercent)}), leaving a confirmed shortfall of {displayNumber(plan.shelter.shortage)} places.
              </p>
            </div>
          )}
        </section>
      </div>

      <section className="mb-5 rounded-2xl border border-gray-200 bg-white p-5">
        <SectionTitle icon={<IconTruck size={18} />} title="Transport and resources" />
        <div className="mt-4 grid gap-3 sm:grid-cols-4">
          <Metric label="Cars / pickups" value={displayNumber(plan.transport.cars)} />
          <Metric label="Large vehicles" value={displayNumber(plan.transport.trucks)} />
          <Metric label="Boats" value={displayNumber(plan.transport.boats)} />
          <Metric label="Volunteers" value={displayNumber(plan.volunteers)} />
        </div>
        <div className="mt-4 rounded-xl bg-gray-50 p-4 text-sm text-gray-700">
          Transport capacity is unknown. Inventory counts cannot determine people transportable, required trips, evacuation duration, or asset availability.
        </div>
      </section>

      <div className="mb-5 grid gap-5 md:grid-cols-3">
        <ListSection title="Priority groups" empty="No positive priority-group counts are recorded.">
          {plan.priorityGroups.map(group => (
            <li key={group.id}><strong>{group.label}:</strong> {group.count.toLocaleString()}</li>
          ))}
        </ListSection>
        <ListSection title="Resource warnings" empty="No confirmed resource warnings from supplied data.">
          {plan.resourceWarnings.map(warning => <li key={warning}>{warning}</li>)}
        </ListSection>
        <ListSection title="Missing information" empty="No planning information is missing.">
          {plan.missingInformation.map(item => <li key={item}>{item}</li>)}
        </ListSection>
      </div>

      <section className="mb-5 rounded-2xl border border-blue-200 bg-blue-50 p-5">
        <h2 className="font-semibold text-gray-900">Immediate planning priorities</h2>
        <p className="mt-1 text-xs text-gray-600">Deterministically ranked for the current planning status and confirmed community facts. These are planning priorities, not official evacuation orders.</p>
        <ol className="mt-4 space-y-2">
          {plan.immediatePriorities.map((action, index) => (
            <li key={action.id} className="flex gap-3 rounded-xl border border-blue-100 bg-white px-4 py-3">
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-blue-100 text-xs font-bold text-blue-800">
                {index + 1}
              </span>
              <div>
                <div className="text-sm font-semibold text-gray-900">{action.text}</div>
                <div className="mt-1 text-xs capitalize text-gray-500">{action.category}</div>
              </div>
            </li>
          ))}
        </ol>
      </section>

      <details className="mb-5 rounded-2xl border border-gray-200 bg-white">
        <summary className="cursor-pointer list-none rounded-2xl px-5 py-4 text-sm font-semibold text-blue-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500">
          All verified planning actions ({plan.allowedActions.length})
        </summary>
        <div className="space-y-2 border-t border-gray-100 p-5">
          <p className="pb-1 text-xs text-gray-600">Complete app-controlled action set selected by deterministic eligibility rules.</p>
          {plan.allowedActions.map(action => (
            <div key={action.id} className="rounded-xl border border-gray-200 bg-gray-50 px-4 py-3">
              <div className="text-sm font-semibold text-gray-900">{action.text}</div>
              <div className="mt-1 text-xs capitalize text-gray-500">{action.category}</div>
            </div>
          ))}
        </div>
      </details>

      <section className="rounded-2xl border border-gray-200 bg-white p-5">
        <h2 className="font-semibold text-gray-900">Optional AI-assisted plan</h2>
        <p className="mt-1 text-sm text-gray-600">AI may prioritize the verified contextual actions above. It cannot add actions or override deterministic facts.</p>
        <button
          type="button"
          onClick={generateAiPlan}
          disabled={aiState === 'loading'}
          className="mt-4 inline-flex items-center gap-2 rounded-xl bg-[#1e3a5f] px-5 py-2.5 text-sm font-semibold text-white hover:bg-[#2d5282] disabled:opacity-50"
        >
          {aiState === 'loading' && <IconRefresh size={15} className="animate-spin" />}
          {aiState === 'loading' ? 'Generating…' : 'Generate AI-assisted plan'}
        </button>

        {aiState === 'success' && aiResult && (
          <div className="mt-4 rounded-xl border border-green-200 bg-green-50 p-4">
            <h3 className="font-semibold text-green-950">AI-prioritized verified actions</h3>
            <p className="mt-1 text-sm text-green-900">{aiResult.summary}</p>
            <ul className="mt-3 space-y-2 text-sm text-gray-800">
              {aiResult.actions.map(action => <li key={action.id}>• {action.text}</li>)}
            </ul>
            {aiResult.rejectedActionIds.length > 0 && (
              <p className="mt-3 text-xs text-gray-500">Workflow validation rejected {aiResult.rejectedActionIds.length} untrusted action selection(s).</p>
            )}
          </div>
        )}
        {aiState === 'error' && (
          <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
            AI assistance is unavailable. The verified planning actions above are still available.
            {aiError && <span className="block pt-1 text-xs text-amber-700">{aiError}</span>}
          </div>
        )}

        {plan.confirmedResourceGap && (
          <button
            type="button"
            onClick={() => onNavigate('support')}
            className="ml-0 mt-3 block text-sm font-semibold text-blue-700 hover:underline sm:ml-3 sm:inline"
          >
            View confirmed gaps in Support Network
          </button>
        )}
      </section>

      <EvacuationChat risk={risk} community={community} plan={plan} />
    </div>
  )
}

function SectionTitle({ icon, title }: { icon: ReactNode; title: string }) {
  return <h2 className="flex items-center gap-2 font-semibold text-gray-900"><span className="text-blue-700">{icon}</span>{title}</h2>
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl bg-gray-50 p-3">
      <div className="text-xs text-gray-500">{label}</div>
      <div className="mt-1 font-semibold text-gray-900">{value}</div>
    </div>
  )
}

function Row({ label, value }: { label: string; value: string }) {
  return <div className="flex justify-between gap-3"><span className="text-gray-500">{label}</span><span className="text-right font-semibold text-gray-900">{value}</span></div>
}

function ListSection({ title, empty, children }: { title: string; empty: string; children: ReactNode }) {
  const items = Array.isArray(children) ? children : [children]
  const hasItems = items.some(Boolean)
  return (
    <section className="rounded-2xl border border-gray-200 bg-white p-5">
      <h2 className="font-semibold text-gray-900">{title}</h2>
      {hasItems
        ? <ul className="mt-3 space-y-2 text-sm text-gray-700">{children}</ul>
        : <p className="mt-3 text-sm text-gray-500">{empty}</p>}
    </section>
  )
}
