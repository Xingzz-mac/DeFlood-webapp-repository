import { useEffect, useMemo, useState } from "react"
import type { AppUser, Section } from "../App"
import { useSupportRequests } from "../hooks/useSupportRequests"
import {
  nextSupportRequestStatus,
  supportRequestStatusLabel,
  type SupportRequest,
  type SupportRequestStatus,
} from "../services/supportNetwork"
import RiskBadge from "./RiskBadge"
import { IconClock, IconFilter, IconUsers } from "./Icons"

interface NGODashboardProps {
  user: AppUser
  onNavigate: (s: Section) => void
}

interface DashboardRow {
  id: string
  name: string
  risk: "LOW" | "MEDIUM" | "HIGH" | null
  population: number
  vulnerable: number
  assistance: string
  requestTime: string
  status: SupportRequestStatus
  source: "LOCAL_DEMO" | "SAMPLE"
  request: SupportRequest | null
}

const sampleCommunities: DashboardRow[] = [
  {
    id: "c1",
    name: "Sample — Ayeyarwady Delta Zone 3",
    risk: "HIGH",
    population: 2340,
    vulnerable: 420,
    assistance: "Sample rescue and supply request",
    requestTime: "13:45",
    status: "PENDING",
    source: "SAMPLE",
    request: null,
  },
  {
    id: "c2",
    name: "Sample — Bogale Township",
    risk: "HIGH",
    population: 4120,
    vulnerable: 780,
    assistance: "Sample shelter and water request",
    requestTime: "12:10",
    status: "IN_PROGRESS",
    source: "SAMPLE",
    request: null,
  },
  {
    id: "c3",
    name: "Sample — Dedaye Township",
    risk: "MEDIUM",
    population: 3100,
    vulnerable: 520,
    assistance: "Sample food request",
    requestTime: "10:05",
    status: "ACCEPTED",
    source: "SAMPLE",
    request: null,
  },
  {
    id: "c4",
    name: "Sample — Mawlamyinegyun",
    risk: "MEDIUM",
    population: 1870,
    vulnerable: 290,
    assistance: "Sample monitoring record",
    requestTime: "09:30",
    status: "ACCEPTED",
    source: "SAMPLE",
    request: null,
  },
  {
    id: "c5",
    name: "Sample — Pyapon District",
    risk: "LOW",
    population: 5400,
    vulnerable: 870,
    assistance: "Sample: none",
    requestTime: "—",
    status: "RESOLVED",
    source: "SAMPLE",
    request: null,
  },
  {
    id: "c6",
    name: "Sample — Wakema",
    risk: "LOW",
    population: 2800,
    vulnerable: 410,
    assistance: "Sample: none",
    requestTime: "—",
    status: "RESOLVED",
    source: "SAMPLE",
    request: null,
  },
]

type FilterType = "all" | "high" | "pending" | "inprogress"

export default function NGODashboard({ user }: NGODashboardProps) {
  const { requests, transition } = useSupportRequests()
  const [filter, setFilter] = useState<FilterType>("all")
  const [selectedId, setSelectedId] = useState<string | null>(
    () => requests[0]?.id ?? sampleCommunities[0].id,
  )
  const [samples, setSamples] = useState<DashboardRow[]>(sampleCommunities)
  const localRows = useMemo(
    () => requests.map(requestToDashboardRow),
    [requests],
  )
  const rows = useMemo(() => [...localRows, ...samples], [localRows, samples])
  const selected = rows.find((row) => row.id === selectedId) ?? null

  useEffect(() => {
    if (!selected && rows.length > 0) setSelectedId(rows[0].id)
  }, [rows, selected])

  const filtered = rows.filter((row) => {
    if (filter === "high") return row.risk === "HIGH"
    if (filter === "pending") return row.status === "PENDING"
    if (filter === "inprogress") return row.status === "IN_PROGRESS"
    return true
  })

  const advanceStatus = (row: DashboardRow) => {
    const nextStatus = nextSupportRequestStatus(row.status)
    if (!nextStatus) return
    if (row.source === "LOCAL_DEMO") {
      transition(row.id, nextStatus)
      return
    }
    setSamples((current) =>
      current.map((sample) =>
        sample.id === row.id ? { ...sample, status: nextStatus } : sample,
      ),
    )
  }

  const highCount = rows.filter((row) => row.risk === "HIGH").length
  const pendingCount = rows.filter((row) => row.status === "PENDING").length
  const inProgressCount = rows.filter(
    (row) => row.status === "IN_PROGRESS",
  ).length

  return (
    <div className="mx-auto max-w-6xl p-4 md:p-6">
      <div className="mb-5">
        <h1 className="text-xl font-bold text-gray-900 md:text-2xl">
          Response Dashboard — Local Demonstration
        </h1>
        <p className="mt-0.5 text-sm text-gray-500">
          {user.role === "government"
            ? "Government response role"
            : "NGO coordinator role"}{" "}
          · browser-only prototype
        </p>
      </div>

      <div className="mb-5 rounded-xl border border-amber-300 bg-amber-50 px-5 py-4 text-sm text-amber-950">
        <strong>Demonstration only — not a connected response system.</strong>{" "}
        Local requests and sample records on this page never contact an NGO,
        government body, rescue team, field team, or emergency service.
      </div>

      <div className="mb-5 grid grid-cols-2 gap-3 md:grid-cols-4">
        <SummaryStat
          label="Local Demo Requests"
          value={localRows.length}
          color="gray"
        />
        <SummaryStat label="Demo High Risk" value={highCount} color="red" />
        <SummaryStat label="Demo Pending" value={pendingCount} color="orange" />
        <SummaryStat
          label="Demo In Progress"
          value={inProgressCount}
          color="blue"
        />
      </div>

      <div className="grid gap-5 md:grid-cols-3">
        <div className="md:col-span-2">
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <IconFilter size={13} className="text-gray-400" />
            {[
              { id: "all" as FilterType, label: "All" },
              { id: "high" as FilterType, label: "Highest Risk" },
              { id: "pending" as FilterType, label: "Pending" },
              { id: "inprogress" as FilterType, label: "In Progress" },
            ].map((filterOption) => (
              <button
                key={filterOption.id}
                type="button"
                onClick={() => setFilter(filterOption.id)}
                className={`min-h-9 rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                  filter === filterOption.id
                    ? "bg-[#1e3a5f] text-white"
                    : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                }`}
              >
                {filterOption.label}
              </button>
            ))}
          </div>

          <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white">
            {filtered.length > 0 ? (
              <div className="divide-y divide-gray-100">
                {filtered.map((row) => (
                  <button
                    key={`${row.source}-${row.id}`}
                    type="button"
                    onClick={() => setSelectedId(row.id)}
                    className={`w-full px-5 py-4 text-left transition-colors ${
                      selected?.id === row.id
                        ? "bg-blue-50"
                        : "hover:bg-gray-50"
                    }`}
                  >
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <div className="text-sm font-semibold text-gray-900">
                            {row.name}
                          </div>
                          <span
                            className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                              row.source === "LOCAL_DEMO"
                                ? "bg-blue-100 text-blue-800"
                                : "bg-gray-100 text-gray-600"
                            }`}
                          >
                            {row.source === "LOCAL_DEMO"
                              ? "Local Demo Request"
                              : "Sample Record"}
                          </span>
                        </div>
                        <div className="mt-0.5 text-xs text-gray-500">
                          Pop:{" "}
                          <strong>{row.population.toLocaleString()}</strong> ·
                          Vulnerable:{" "}
                          <strong>{row.vulnerable.toLocaleString()}</strong>
                        </div>
                        <div className="mt-1 truncate text-xs text-gray-600">
                          {row.assistance}
                        </div>
                      </div>
                      <div className="flex shrink-0 flex-col items-end gap-1.5">
                        {row.risk ? (
                          <RiskBadge level={row.risk} size="sm" />
                        ) : (
                          <span className="text-xs text-gray-500">
                            Risk unavailable
                          </span>
                        )}
                        <StatusPill status={row.status} />
                      </div>
                    </div>
                    {row.requestTime !== "—" && (
                      <div className="mt-2 flex items-center gap-1 text-xs text-gray-400">
                        <IconClock size={11} />
                        {row.source === "LOCAL_DEMO"
                          ? "Submitted "
                          : "Sample time "}
                        {row.requestTime}
                      </div>
                    )}
                  </button>
                ))}
              </div>
            ) : (
              <p className="p-8 text-center text-sm text-gray-500">
                No demo records match this filter.
              </p>
            )}
          </div>
        </div>

        <div>
          {selected ? (
            <div className="rounded-2xl border border-gray-200 bg-white p-5">
              <div className="mb-4 flex items-start justify-between gap-2">
                <div>
                  <span
                    className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                      selected.source === "LOCAL_DEMO"
                        ? "bg-blue-100 text-blue-800"
                        : "bg-gray-100 text-gray-600"
                    }`}
                  >
                    {selected.source === "LOCAL_DEMO"
                      ? "Local Demo Request"
                      : "Sample Record"}
                  </span>
                  <h2 className="mt-2 text-sm font-bold leading-tight text-gray-900">
                    {selected.name}
                  </h2>
                </div>
                {selected.risk && <RiskBadge level={selected.risk} size="sm" />}
              </div>

              {selected.request ? (
                <LocalRequestDetails request={selected.request} />
              ) : (
                <SampleDetails row={selected} />
              )}

              <div className="mt-5 space-y-2">
                {nextSupportRequestStatus(selected.status) ? (
                  <button
                    type="button"
                    onClick={() => advanceStatus(selected)}
                    className="min-h-11 w-full rounded-xl bg-blue-700 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-blue-800"
                  >
                    {actionLabel(selected.status)}
                  </button>
                ) : (
                  <div className="py-2 text-center text-sm font-semibold text-green-700">
                    Demo request resolved
                  </div>
                )}
                <p className="text-center text-[11px] leading-4 text-gray-500">
                  This changes local demo status only. No responder is
                  dispatched.
                </p>
              </div>
            </div>
          ) : (
            <div className="rounded-2xl border-2 border-dashed border-gray-200 bg-gray-50 p-8 text-center">
              <IconUsers size={32} className="mx-auto mb-2 text-gray-300" />
              <p className="text-sm text-gray-400">
                Select a demo request or sample record to view details
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function requestToDashboardRow(request: SupportRequest): DashboardRow {
  const vulnerable = Object.values(request.vulnerableGroups).reduce(
    (total, count) => total + count,
    0,
  )
  return {
    id: request.id,
    name: request.community.name,
    risk: request.riskLevel,
    population: request.community.population,
    vulnerable,
    assistance:
      request.assistanceCategories.join(", ") ||
      "No assistance categories selected",
    requestTime: formatDateTime(request.createdAt),
    status: request.status,
    source: "LOCAL_DEMO",
    request,
  }
}

function LocalRequestDetails({ request }: { request: SupportRequest }) {
  const groups = request.vulnerableGroups
  const coordinates =
    request.community.latitude !== null && request.community.longitude !== null
      ? `${request.community.latitude.toFixed(4)}, ${request.community.longitude.toFixed(4)}`
      : "Not available"
  return (
    <div className="space-y-4 text-sm">
      <dl className="space-y-2.5">
        <DetailRow
          label="Township / region"
          value={
            [request.community.township, request.community.region]
              .filter(Boolean)
              .join(", ") || "Not supplied"
          }
        />
        <DetailRow
          label="Population"
          value={request.community.population.toLocaleString()}
        />
        <DetailRow label="Children" value={groups.children.toLocaleString()} />
        <DetailRow label="Elderly" value={groups.elderly.toLocaleString()} />
        <DetailRow label="Disabled" value={groups.disabled.toLocaleString()} />
        <DetailRow
          label="Other vulnerable"
          value={groups.otherVulnerable.toLocaleString()}
        />
        <DetailRow label="Coordinates" value={coordinates} />
        <DetailRow
          label="Categories"
          value={request.assistanceCategories.join(", ")}
        />
        <DetailRow
          label="Submitted"
          value={formatDateTime(request.createdAt)}
        />
        <DetailRow label="Request ID" value={request.id} breakWords />
        <DetailRow
          label="Input provenance"
          value={
            request.dataProvenance === "SAMPLE"
              ? "Sample / demo inputs"
              : "User-confirmed inputs"
          }
        />
        {request.responderLabel && (
          <DetailRow label="Responder" value={request.responderLabel} />
        )}
        <div className="flex items-center justify-between gap-2">
          <dt className="text-gray-500">Status</dt>
          <dd>
            <StatusPill status={request.status} />
          </dd>
        </div>
      </dl>

      <div>
        <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-500">
          Planner-derived gaps
        </h3>
        {request.planningGaps.length > 0 ? (
          <ul className="mt-2 space-y-1.5 text-gray-700">
            {request.planningGaps.map((gap) => (
              <li key={gap}>• {gap}</li>
            ))}
          </ul>
        ) : (
          <p className="mt-2 text-gray-600">
            No planner-derived gaps recorded.
          </p>
        )}
      </div>
      {request.note && (
        <div>
          <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-500">
            Community note
          </h3>
          <p className="mt-2 rounded-xl bg-gray-50 px-3 py-2.5 text-gray-700">
            {request.note}
          </p>
        </div>
      )}
    </div>
  )
}

function SampleDetails({ row }: { row: DashboardRow }) {
  return (
    <dl className="space-y-2.5 text-sm">
      <DetailRow label="Population" value={row.population.toLocaleString()} />
      <DetailRow label="Vulnerable" value={row.vulnerable.toLocaleString()} />
      <DetailRow label="Needs" value={row.assistance} />
      <DetailRow label="Sample time" value={row.requestTime} />
      <div className="flex items-center justify-between gap-2">
        <dt className="text-gray-500">Status</dt>
        <dd>
          <StatusPill status={row.status} />
        </dd>
      </div>
    </dl>
  )
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
      ? "text-red-600"
      : color === "orange"
        ? "text-amber-600"
        : color === "blue"
          ? "text-blue-600"
          : "text-gray-800"
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4">
      <div className="mb-1 text-xs text-gray-500">{label}</div>
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
    <div className="flex justify-between gap-2">
      <dt className="shrink-0 text-gray-500">{label}</dt>
      <dd
        className={`text-right font-medium text-gray-900 ${
          breakWords ? "break-all" : ""
        }`}
      >
        {value}
      </dd>
    </div>
  )
}

function formatDateTime(value: string): string {
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value))
}
