import { useEffect, useMemo, useState, type ReactNode } from "react"
import type { AppUser, Section } from "../App"
import { useCommunity, type CommunityData } from "../context/CommunityContext"
import { useEvacuationPlan } from "../context/EvacuationContext"
import { useRisk } from "../context/RiskContext"
import { useRiskScenarioOptional } from "../context/RiskScenarioContext"
import { useSupportRequests } from "../hooks/useSupportRequests"
import {
  DEMO_OPERATIONS_COMMUNITIES,
  DEMO_SCENARIOS,
} from "../services/demoScenarios"
import { calculateEvacuationPlan } from "../services/evacuationEngine"
import type { EvacuationPlanResult } from "../services/evacuationTypes"
import type { FloodHazardLevel } from "../services/riskTypes"
import {
  nextSupportRequestStatus,
  requestBelongsToCommunity,
  supportRequestStatusLabel,
  type SupportRequest,
  type SupportRequestStatus,
} from "../services/supportNetwork"
import RiskBadge from "./RiskBadge"
import { IconClock, IconFilter, IconUsers } from "./Icons"

interface NGODashboardProps {
  user: AppUser
  onNavigate: (section: Section) => void
}

type OperationsSource = "CURRENT" | "DEMO_SCENARIO" | "LOCAL_REQUEST"
type OperationsProvenance = "LIVE / CURRENT" | "SAMPLE" | "USER_CONFIRMED" | "DEMO SCENARIO"

interface OperationsRow {
  id: string
  source: OperationsSource
  provenance: OperationsProvenance
  community: Pick<CommunityData, "name" | "township" | "region" | "latitude" | "longitude" | "population" | "children" | "elderly" | "disabled" | "otherVulnerable">
  resources: {
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
  risk: FloodHazardLevel | null
  hazardScore: number | null
  confidence: number | null
  assessment: "Live" | "Limited" | "Demo" | "Unavailable" | "Recorded snapshot"
  evidenceSummary: string[]
  plan: EvacuationPlanResult | null
  request: SupportRequest | null
}

type FilterType = "all" | "high" | "open" | "inprogress"

const RISK_ORDER: Record<FloodHazardLevel, number> = {
  HIGH: 0,
  MEDIUM: 1,
  LOW: 2,
}

function vulnerableCount(row: OperationsRow): number {
  return (
    row.community.children +
    row.community.elderly +
    row.community.disabled +
    row.community.otherVulnerable
  )
}

function requestOrder(request: SupportRequest | null): number {
  if (request && request.status !== "RESOLVED") return 0
  if (!request) return 1
  return 2
}

export function sortOperationsRows(rows: OperationsRow[]): OperationsRow[] {
  return [...rows].sort((first, second) => {
    const riskDifference =
      (first.risk ? RISK_ORDER[first.risk] : 3) -
      (second.risk ? RISK_ORDER[second.risk] : 3)
    if (riskDifference !== 0) return riskDifference
    const requestDifference =
      requestOrder(first.request) - requestOrder(second.request)
    if (requestDifference !== 0) return requestDifference
    return first.community.name.localeCompare(second.community.name)
  })
}

function requestRow(request: SupportRequest): OperationsRow {
  return {
    id: `request-${request.id}`,
    source: "LOCAL_REQUEST",
    provenance: request.dataProvenance,
    community: {
      ...request.community,
      latitude: request.community.latitude ?? 0,
      longitude: request.community.longitude ?? 0,
      children: request.vulnerableGroups.children,
      elderly: request.vulnerableGroups.elderly,
      disabled: request.vulnerableGroups.disabled,
      otherVulnerable: request.vulnerableGroups.otherVulnerable,
    },
    resources: request.resourceConditions,
    risk: request.riskLevel,
    hazardScore: null,
    confidence: null,
    assessment: "Recorded snapshot",
    evidenceSummary:
      request.planningGaps.length > 0
        ? request.planningGaps
        : ["No planner-derived resource gap was stored with this request."],
    plan: null,
    request,
  }
}

export default function NGODashboard({ user }: NGODashboardProps) {
  const { community, isSampleData } = useCommunity()
  const risk = useRisk()
  const currentPlan = useEvacuationPlan()
  const scenario = useRiskScenarioOptional()
  const { requests, transition } = useSupportRequests()
  const [filter, setFilter] = useState<FilterType>("all")
  const [selectedId, setSelectedId] = useState<string | null>(null)

  const rows = useMemo(() => {
    const currentRequest =
      requests.find((request) =>
        requestBelongsToCommunity(request, community),
      ) ?? null
    const currentAssessment: OperationsRow = {
      id: "current-community",
      source: "CURRENT",
      provenance: scenario.demoActive
        ? "DEMO SCENARIO"
        : isSampleData
          ? "SAMPLE"
          : "USER_CONFIRMED",
      community,
      resources: community,
      risk: risk.hazardLevel,
      hazardScore: risk.hazardScore,
      confidence:
        risk.calculationStatus === "NOT_CALCULATED"
          ? null
          : risk.confidenceScore,
      assessment: scenario.demoActive
        ? "Demo"
        : risk.calculationStatus === "COMPLETE"
          ? "Live"
          : risk.rainfallSeverity !== null
            ? "Limited"
            : "Unavailable",
      evidenceSummary: scenario.selectedDemo
        ? [scenario.selectedDemo.evidenceSummary, ...risk.contributingFactors]
        : risk.contributingFactors,
      plan: currentPlan,
      request: currentRequest,
    }
    const demoRows = DEMO_OPERATIONS_COMMUNITIES.map((entry): OperationsRow => {
      const demo = DEMO_SCENARIOS[entry.scenarioId]
      return {
        id: entry.id,
        source: "DEMO_SCENARIO",
        provenance: "DEMO SCENARIO",
        community: entry.community,
        resources: entry.community,
        risk: demo.result.hazardLevel,
        hazardScore: demo.result.hazardScore,
        confidence: demo.result.confidenceScore,
        assessment: "Demo",
        evidenceSummary: [
          demo.evidenceSummary,
          ...demo.result.contributingFactors,
        ],
        plan: calculateEvacuationPlan(entry.community, demo.result, "SAMPLE"),
        request: null,
      }
    })
    const otherRequestRows = requests
      .filter((request) => request.id !== currentRequest?.id)
      .map(requestRow)
    return sortOperationsRows([
      currentAssessment,
      ...demoRows,
      ...otherRequestRows,
    ])
  }, [community, currentPlan, isSampleData, requests, risk, scenario])

  const filteredRows = rows.filter((row) => {
    if (filter === "high") return row.risk === "HIGH"
    if (filter === "open")
      return Boolean(row.request && row.request.status !== "RESOLVED")
    if (filter === "inprogress") return row.request?.status === "IN_PROGRESS"
    return true
  })
  const selected =
    filteredRows.find((row) => row.id === selectedId) ?? filteredRows[0] ?? null

  useEffect(() => {
    if (selected && selected.id !== selectedId) setSelectedId(selected.id)
  }, [selected, selectedId])

  const highCount = rows.filter((row) => row.risk === "HIGH").length
  const mediumCount = rows.filter((row) => row.risk === "MEDIUM").length
  const openRequestCount = requests.filter(
    (request) => request.status !== "RESOLVED",
  ).length
  const inProgressCount = requests.filter(
    (request) => request.status === "IN_PROGRESS",
  ).length

  return (
    <div className="mx-auto max-w-7xl p-4 md:p-6">
      <header className="mb-5 flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="text-xs font-bold uppercase tracking-[0.15em] text-blue-700">
            Demo Operations View
          </div>
          <h1 className="mt-1 text-xl font-bold text-gray-900 md:text-2xl">
            NGO / Government Risk Triage
          </h1>
          <p className="mt-1 max-w-3xl text-sm leading-relaxed text-gray-600">
            Combines deterministic risk evidence, community preparedness, and
            browser-local support requests for presentation triage. This is not
            connected to real organisations or emergency services.
          </p>
        </div>
        <span className="rounded-full border border-gray-200 bg-white px-3 py-1.5 text-xs font-semibold text-gray-700">
          {user.role === "government"
            ? "Government response role"
            : "NGO coordinator role"}
        </span>
      </header>

      <div className="mb-5 rounded-xl border border-amber-300 bg-amber-50 px-5 py-4 text-sm text-amber-950">
        <strong>Demonstration only — not a connected response system.</strong>{" "}
        No request on this page contacts an NGO, government body, rescue team,
        field team, or emergency service.
      </div>

      <section
        aria-label="Operations summary"
        className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4"
      >
        <SummaryStat label="High Risk" value={highCount} color="red" />
        <SummaryStat label="Medium Risk" value={mediumCount} color="orange" />
        <SummaryStat
          label="Open Demo Requests"
          value={openRequestCount}
          color="gray"
        />
        <SummaryStat
          label="Requests In Progress"
          value={inProgressCount}
          color="blue"
        />
      </section>

      <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1.25fr)_minmax(360px,0.75fr)]">
        <section aria-label="Community triage list" className="min-w-0">
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <IconFilter size={14} className="text-gray-400" />
            {([
              ["all", "All communities"],
              ["high", "High Risk"],
              ["open", "Open Requests"],
              ["inprogress", "In Progress"],
            ] as const).map(([id, label]) => (
              <button
                key={id}
                type="button"
                onClick={() => setFilter(id)}
                className={`min-h-9 rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                  filter === id
                    ? "bg-[#1e3a5f] text-white"
                    : "bg-gray-100 text-gray-700 hover:bg-gray-200"
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white">
            {filteredRows.length > 0 ? (
              <div className="divide-y divide-gray-100">
                {filteredRows.map((row) => (
                  <OperationsListItem
                    key={row.id}
                    row={row}
                    selected={selected?.id === row.id}
                    onSelect={() => setSelectedId(row.id)}
                  />
                ))}
              </div>
            ) : (
              <p className="p-8 text-center text-sm text-gray-500">
                No demonstration records match this filter.
              </p>
            )}
          </div>
        </section>

        <aside className="min-w-0 lg:sticky lg:top-4">
          {selected ? (
            <OperationsDetails row={selected} transition={transition} />
          ) : (
            <div className="rounded-2xl border-2 border-dashed border-gray-200 bg-gray-50 p-8 text-center">
              <IconUsers size={32} className="mx-auto mb-2 text-gray-300" />
              <p className="text-sm text-gray-500">
                Select a community to inspect its evidence.
              </p>
            </div>
          )}
        </aside>
      </div>
    </div>
  )
}

function OperationsListItem({
  row,
  selected,
  onSelect,
}: {
  row: OperationsRow
  selected: boolean
  onSelect: () => void
}) {
  const gaps = importantGaps(row)
  return (
    <button
      type="button"
      onClick={onSelect}
      className={`w-full px-4 py-4 text-left transition-colors md:px-5 ${
        selected ? "bg-blue-50" : "hover:bg-gray-50"
      }`}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-semibold text-gray-950">
              {row.community.name}
            </span>
            <SourceBadge row={row} />
            {row.request && <RequestBadge />}
          </div>
          <div className="mt-1 text-xs text-gray-500">
            {row.community.township}, {row.community.region}
          </div>
          <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-gray-700">
            <span>
              Population{" "}
              <strong>{row.community.population.toLocaleString()}</strong>
            </span>
            <span>
              Vulnerable-group entries{" "}
              <strong>{vulnerableCount(row).toLocaleString()}</strong>
            </span>
            <span>
              Confidence <strong>{scoreText(row.confidence)}</strong>
            </span>
          </div>
          <p className="mt-2 line-clamp-2 text-xs leading-relaxed text-gray-600">
            <strong>Important gaps:</strong> {gaps.join(" · ")}
          </p>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-1.5">
          {row.risk ? (
            <RiskBadge level={row.risk} size="sm" />
          ) : (
            <span className="rounded-full bg-gray-100 px-2.5 py-1 text-xs font-semibold text-gray-700">
              Risk unavailable
            </span>
          )}
          {row.request ? (
            <StatusPill status={row.request.status} />
          ) : (
            <span className="text-xs font-medium text-gray-500">
              No request
            </span>
          )}
        </div>
      </div>
    </button>
  )
}

function OperationsDetails({
  row,
  transition,
}: {
  row: OperationsRow
  transition: (id: string, status: SupportRequestStatus) => unknown
}) {
  const nextStatus = row.request
    ? nextSupportRequestStatus(row.request.status)
    : null
  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-gray-100 pb-4">
        <div className="min-w-0">
          <div className="flex flex-wrap gap-2">
            <SourceBadge row={row} />
            {row.request && <RequestBadge />}
          </div>
          <h2 className="mt-2 text-lg font-bold leading-tight text-gray-950">
            {row.community.name}
          </h2>
          <p className="mt-1 text-xs text-gray-500">
            {row.community.township}, {row.community.region}
          </p>
        </div>
        {row.risk && <RiskBadge level={row.risk} size="sm" />}
      </div>

      <DetailSection title="Risk evidence">
        <DetailRow label="Assessment" value={row.assessment} />
        <DetailRow label="Hazard level" value={row.risk ?? "Unavailable"} />
        <DetailRow label="Hazard score" value={scoreText(row.hazardScore)} />
        <DetailRow label="Data confidence" value={scoreText(row.confidence)} />
        <ul className="mt-3 space-y-1.5 text-xs leading-relaxed text-gray-700">
          {row.evidenceSummary.slice(0, 4).map((item) => (
            <li key={item}>• {item}</li>
          ))}
        </ul>
      </DetailSection>

      <DetailSection title="Community">
        <DetailRow
          label="Population"
          value={row.community.population.toLocaleString()}
        />
        <DetailRow
          label="Children"
          value={row.community.children.toLocaleString()}
        />
        <DetailRow
          label="Elderly"
          value={row.community.elderly.toLocaleString()}
        />
        <DetailRow
          label="People with disabilities"
          value={row.community.disabled.toLocaleString()}
        />
        <DetailRow
          label="Other vulnerable"
          value={row.community.otherVulnerable.toLocaleString()}
        />
        <DetailRow label="Coordinates" value={coordinateText(row)} />
      </DetailSection>

      <DetailSection title="Planning and resources">
        {row.plan ? (
          <PlanDetails plan={row.plan} resources={row.resources} />
        ) : (
          <RequestResourceDetails request={row.request!} />
        )}
      </DetailSection>

      <DetailSection title="Support request">
        {row.request ? (
          <RequestDetails request={row.request} />
        ) : (
          <div className="rounded-xl border border-gray-200 bg-gray-50 px-3 py-3 text-sm text-gray-700">
            <strong>
              {row.source === "DEMO_SCENARIO"
                ? "No support request has been submitted for this demonstration scenario."
                : "No support request has been submitted for this assessment record."}
            </strong>
            {row.risk === "HIGH" && (
              <p className="mt-2 text-red-800">
                High risk identified, but no support request has been sent.
                Review needs and prepare manually if required.
              </p>
            )}
          </div>
        )}
      </DetailSection>

      {row.request && (
        <div className="mt-5 border-t border-gray-100 pt-4">
          {nextStatus ? (
            <button
              type="button"
              onClick={() => transition(row.request!.id, nextStatus)}
              className="min-h-11 w-full rounded-xl bg-blue-700 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-blue-800"
            >
              {actionLabel(row.request.status)}
            </button>
          ) : (
            <div className="py-2 text-center text-sm font-semibold text-green-700">
              Local demo request resolved
            </div>
          )}
          <p className="mt-2 text-center text-[11px] leading-4 text-gray-500">
            This changes browser-local demo status only. No responder is
            dispatched.
          </p>
        </div>
      )}
    </div>
  )
}

function PlanDetails({
  plan,
  resources,
}: {
  plan: EvacuationPlanResult
  resources: OperationsRow["resources"]
}) {
  return (
    <>
      <DetailRow
        label="Shelter capacity"
        value={numberText(plan.shelter.reportedCapacity)}
      />
      <DetailRow
        label="Shelter shortage"
        value={numberText(plan.shelter.shortage)}
      />
      <DetailRow label="Food" value={resources.food || "Unavailable"} />
      <DetailRow label="Water" value={resources.water || "Unavailable"} />
      <DetailRow label="Medicine" value={resources.medicine || "Unavailable"} />
      <DetailRow label="Vehicles" value={numberText(plan.transport.vehicles)} />
      <DetailRow label="Boats" value={numberText(plan.transport.boats)} />
      <DetailRow
        label="Planning status"
        value={plan.planningStatus.replace(/_/g, " ")}
      />
      <ListDetail
        label="Existing warnings"
        values={plan.resourceWarnings}
        empty="No resource warnings derived."
      />
      <ListDetail
        label="Missing information"
        values={plan.missingInformation}
        empty="No missing information recorded."
      />
    </>
  )
}

function RequestResourceDetails({ request }: { request: SupportRequest }) {
  const resources = request.resourceConditions
  const shelterShortage = Math.max(
    request.community.population - resources.shelterCapacity,
    0,
  )
  return (
    <>
      <DetailRow
        label="Shelter capacity"
        value={resources.shelterCapacity.toLocaleString()}
      />
      <DetailRow
        label="Shelter shortage"
        value={shelterShortage.toLocaleString()}
      />
      <DetailRow label="Food" value={resources.food || "Unavailable"} />
      <DetailRow label="Water" value={resources.water || "Unavailable"} />
      <DetailRow label="Medicine" value={resources.medicine || "Unavailable"} />
      <DetailRow
        label="Vehicles"
        value={(resources.cars + resources.trucks).toLocaleString()}
      />
      <DetailRow label="Boats" value={resources.boats.toLocaleString()} />
      <ListDetail
        label="Stored planning gaps"
        values={request.planningGaps}
        empty="No stored planning gaps."
      />
    </>
  )
}

function RequestDetails({ request }: { request: SupportRequest }) {
  return (
    <>
      <div className="mb-2 flex items-center justify-between gap-2">
        <span className="text-xs text-gray-500">Status</span>
        <StatusPill status={request.status} />
      </div>
      <DetailRow
        label="Categories"
        value={request.assistanceCategories.join(", ") || "None selected"}
      />
      <DetailRow label="Request ID" value={request.id} breakWords />
      <DetailRow label="Submitted" value={formatDateTime(request.createdAt)} />
      <DetailRow
        label="Responder"
        value={request.responderLabel ?? "Not assigned"}
      />
      <div className="mt-3 rounded-xl bg-gray-50 px-3 py-2.5 text-xs text-gray-700">
        <strong>Community note:</strong> {request.note || "No note supplied."}
      </div>
    </>
  )
}

function SourceBadge({ row }: { row: OperationsRow }) {
  const style =
    row.source === "DEMO_SCENARIO"
      ? "bg-amber-100 text-amber-900"
      : row.provenance === "LIVE / CURRENT"
        ? "bg-green-100 text-green-800"
        : row.provenance === "USER_CONFIRMED"
          ? "bg-blue-100 text-blue-800"
          : "bg-gray-100 text-gray-700"
  const label =
    row.source === "LOCAL_REQUEST"
      ? row.provenance === "USER_CONFIRMED"
        ? "USER_CONFIRMED"
        : "SAMPLE"
      : row.provenance
  return (
    <>
      {row.source === "CURRENT" && row.provenance !== "DEMO SCENARIO" && (
        <span className="rounded-full bg-green-100 px-2 py-0.5 text-[10px] font-bold tracking-wide text-green-800">
          LIVE / CURRENT
        </span>
      )}
      <span
        className={`rounded-full px-2 py-0.5 text-[10px] font-bold tracking-wide ${style}`}
      >
        {label}
      </span>
    </>
  )
}

function RequestBadge() {
  return (
    <span className="rounded-full bg-blue-100 px-2 py-0.5 text-[10px] font-bold tracking-wide text-blue-800">
      Local Demo Request
    </span>
  )
}

function DetailSection({
  title,
  children,
}: {
  title: string
  children: ReactNode
}) {
  return (
    <section className="border-b border-gray-100 py-4 last:border-b-0">
      <h3 className="mb-2 text-xs font-bold uppercase tracking-wide text-gray-500">
        {title}
      </h3>
      {children}
    </section>
  )
}

function ListDetail({
  label,
  values,
  empty,
}: {
  label: string
  values: string[]
  empty: string
}) {
  return (
    <div className="mt-3">
      <div className="text-xs font-semibold text-gray-700">{label}</div>
      <ul className="mt-1 space-y-1 text-xs leading-relaxed text-gray-600">
        {values.length > 0 ? (
          values.map((value) => <li key={value}>• {value}</li>)
        ) : (
          <li>{empty}</li>
        )}
      </ul>
    </div>
  )
}

function importantGaps(row: OperationsRow): string[] {
  const gaps = row.plan?.resourceWarnings ?? row.request?.planningGaps ?? []
  return gaps.length > 0
    ? gaps.slice(0, 2)
    : ["No important resource gap recorded"]
}

function coordinateText(row: OperationsRow): string {
  if (
    row.source === "LOCAL_REQUEST" &&
    row.request &&
    (row.request.community.latitude === null ||
      row.request.community.longitude === null)
  ) {
    return "Unavailable"
  }
  return `${row.community.latitude.toFixed(4)}, ${row.community.longitude.toFixed(4)}`
}

function actionLabel(status: SupportRequestStatus): string {
  if (status === "PENDING") return "Accept Request"
  if (status === "ACCEPTED") return "Mark In Progress"
  return "Resolve Request"
}

function SummaryStat({
  label,
  value,
  color,
}: {
  label: string
  value: number
  color: "red" | "orange" | "blue" | "gray"
}) {
  const textColor =
    color === "red"
      ? "text-red-700"
      : color === "orange"
        ? "text-amber-700"
        : color === "blue"
          ? "text-blue-700"
          : "text-gray-900"
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4">
      <div className="mb-1 text-xs font-medium text-gray-600">{label}</div>
      <div className={`font-mono text-2xl font-bold ${textColor}`}>{value}</div>
    </div>
  )
}

function StatusPill({ status }: { status: SupportRequestStatus }) {
  const style =
    status === "PENDING"
      ? "bg-gray-100 text-gray-700"
      : status === "ACCEPTED"
        ? "bg-blue-50 text-blue-700"
        : status === "IN_PROGRESS"
          ? "bg-blue-100 text-blue-800"
          : "bg-green-50 text-green-700"
  return (
    <span className={`rounded px-2 py-0.5 text-xs font-semibold ${style}`}>
      {supportRequestStatusLabel(status)}
    </span>
  )
}

function DetailRow({
  label,
  value,
  breakWords = false,
}: {
  label: string
  value: string
  breakWords?: boolean
}) {
  return (
    <div className="flex justify-between gap-3 py-1 text-sm">
      <span className="shrink-0 text-gray-500">{label}</span>
      <span
        className={`text-right font-medium text-gray-900 ${
          breakWords ? "break-all" : ""
        }`}
      >
        {value}
      </span>
    </div>
  )
}

function scoreText(value: number | null): string {
  return value === null ? "Unavailable" : `${value.toFixed(1)} / 100`
}

function numberText(value: number | null): string {
  return value === null ? "Unavailable" : value.toLocaleString()
}

function formatDateTime(value: string): string {
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value))
}
