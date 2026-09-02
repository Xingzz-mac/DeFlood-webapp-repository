import { useMemo, useRef, useState } from "react"
import { useCommunity } from "../context/CommunityContext"
import { useEvacuationPlan } from "../context/EvacuationContext"
import { useSupportRequests } from "../hooks/useSupportRequests"
import {
  ASSISTANCE_CATEGORIES,
  buildSupportRequestDraft,
  planningGapsFromPlan,
  requestBelongsToCommunity,
  supportRequestStatusLabel,
  supportRequestStatusMessage,
  type AssistanceCategory,
  type SupportRequest,
  type SupportRequestDraft,
  type SupportRequestStatus,
} from "../services/supportNetwork"
import { IconAlertTriangle, IconCheckCircle, IconClock, IconX } from "./Icons"

export default function SupportNetwork() {
  const plan = useEvacuationPlan()
  const { community } = useCommunity()
  const { requests, submit } = useSupportRequests()
  const [draft, setDraft] = useState<SupportRequestDraft | null>(null)
  const [selectedCategories, setSelectedCategories] =
    useState<AssistanceCategory[]>([])
  const [note, setNote] = useState("")
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [lastSubmittedId, setLastSubmittedId] = useState<string | null>(null)
  const submissionLocked = useRef(false)
  const sample = plan.dataProvenance === "SAMPLE"
  const displayedWarnings = planningGapsFromPlan(plan)
  const communityRequests = useMemo(
    () =>
      requests.filter((request) =>
        requestBelongsToCommunity(request, community),
      ),
    [community, requests],
  )

  const prepareRequest = () => {
    setDraft(buildSupportRequestDraft(community, plan))
    setSelectedCategories([])
    setNote("")
    setError(null)
    setSubmitting(false)
    submissionLocked.current = false
  }

  const closeRequest = () => {
    if (submitting) return
    setDraft(null)
    setError(null)
  }

  const toggleCategory = (category: AssistanceCategory) => {
    setSelectedCategories((current) =>
      current.includes(category)
        ? current.filter((item) => item !== category)
        : [...current, category],
    )
  }

  const submitRequest = () => {
    if (!draft || submissionLocked.current || selectedCategories.length === 0)
      return
    submissionLocked.current = true
    setSubmitting(true)
    setError(null)
    try {
      const request = submit({
        ...draft,
        assistanceCategories: selectedCategories,
        note,
      })
      setLastSubmittedId(request.id)
      setDraft(null)
    } catch (submitError) {
      submissionLocked.current = false
      setSubmitting(false)
      setError(
        submitError instanceof Error
          ? submitError.message
          : "The demo request could not be stored.",
      )
    }
  }

  return (
    <div className="mx-auto max-w-5xl p-4 md:p-6">
      <div className="mb-5">
        <h1 className="text-xl font-bold text-gray-900 md:text-2xl">
          Support Network
        </h1>
        <p className="mt-0.5 text-sm text-gray-500">
          {sample ? "Sample planning gaps" : "Confirmed planning gaps"} from the
          deterministic evacuation planner
        </p>
      </div>

      <div className="mb-5 rounded-xl border border-amber-300 bg-amber-50 px-5 py-4 text-sm text-amber-950">
        <div className="flex items-start gap-3">
          <IconAlertTriangle
            size={18}
            className="mt-0.5 shrink-0 text-amber-700"
          />
          <p>
            <strong>Demonstration Support Network.</strong> Requests are stored
            locally in this browser and are not sent to real NGOs, governments,
            rescue teams, or emergency services.
          </p>
        </div>
      </div>

      <div
        aria-label="Support request information flow"
        className="mb-5 flex flex-wrap items-center gap-2 text-xs font-semibold text-gray-600"
      >
        <span className="rounded-full border border-blue-200 bg-blue-50 px-3 py-1.5">
          Risk Assessment
        </span>
        <span aria-hidden="true" className="text-gray-400">
          →
        </span>
        <span className="rounded-full border border-blue-200 bg-blue-50 px-3 py-1.5">
          Evacuation Planner
        </span>
        <span aria-hidden="true" className="text-gray-400">
          →
        </span>
        <span className="rounded-full border border-blue-700 bg-blue-700 px-3 py-1.5 text-white">
          Support Request
        </span>
      </div>

      <section className="rounded-2xl border border-gray-200 bg-white p-5">
        <div className="flex items-center gap-2">
          <IconCheckCircle size={18} className="text-blue-700" />
          <h2 className="font-semibold text-gray-900">
            {sample ? "Sample resource gaps" : "Confirmed resource gaps"}
          </h2>
        </div>
        {displayedWarnings.length > 0 ? (
          <ul className="mt-4 space-y-2 text-sm text-gray-700">
            {displayedWarnings.map((warning) => (
              <li
                key={warning}
                className="rounded-xl border border-amber-100 bg-amber-50 px-4 py-3"
              >
                {warning}
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-4 text-sm text-gray-600">
            {sample
              ? "No sample resource gap is currently derived from the demonstration data."
              : "No confirmed resource gap is currently derived from the supplied community information."}
          </p>
        )}

        <button
          type="button"
          onClick={prepareRequest}
          aria-expanded={draft !== null}
          className="mt-5 min-h-11 rounded-xl bg-[#1e3a5f] px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-[#274b76] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-700"
        >
          Prepare Support Request
        </button>
        <p className="mt-2 text-xs text-gray-500">
          Preparation never submits automatically, including when risk is high.
        </p>
      </section>

      {draft && (
        <section
          aria-label="Prepare demo support request"
          className="mt-5 rounded-2xl border border-blue-200 bg-white p-5 shadow-sm md:p-6"
        >
          <div className="flex items-start justify-between gap-4">
            <div>
              <h2 className="text-lg font-bold text-gray-900">
                Prepare Support Request
              </h2>
              <p className="mt-1 text-sm text-gray-600">
                Review the planner snapshot and choose what assistance to
                request.
              </p>
            </div>
            <button
              type="button"
              onClick={closeRequest}
              aria-label="Close support request panel"
              className="rounded-lg p-2 text-gray-500 hover:bg-gray-100 hover:text-gray-800"
            >
              <IconX size={18} />
            </button>
          </div>

          {draft.riskLevel === "HIGH" && (
            <div className="mt-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-900">
              <strong>High risk detected.</strong> DeFlood has prepared a
              support request using the current{" "}
              {draft.dataProvenance === "SAMPLE"
                ? "sample demonstration"
                : "user-confirmed"}{" "}
              planning information. Review it before submitting.
            </div>
          )}

          <div className="mt-5 grid gap-4 md:grid-cols-2">
            <div className="rounded-xl border border-gray-200 bg-gray-50 p-4 text-sm">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h3 className="font-semibold text-gray-900">
                  Request snapshot
                </h3>
                <span
                  className={`rounded-full px-2.5 py-1 text-xs font-semibold ${
                    draft.dataProvenance === "SAMPLE"
                      ? "bg-amber-100 text-amber-800"
                      : "bg-blue-100 text-blue-800"
                  }`}
                >
                  {draft.dataProvenance === "SAMPLE"
                    ? "Sample / demo inputs"
                    : "User-confirmed inputs"}
                </span>
              </div>
              <dl className="mt-3 space-y-2">
                <SummaryRow label="Community" value={draft.community.name} />
                <SummaryRow
                  label="Location"
                  value={
                    [draft.community.township, draft.community.region]
                      .filter(Boolean)
                      .join(", ") || "Not supplied"
                  }
                />
                <SummaryRow
                  label="Population"
                  value={draft.community.population.toLocaleString()}
                />
                <SummaryRow
                  label="Risk"
                  value={draft.riskLevel ?? "Not calculated"}
                />
                <SummaryRow
                  label="Shelter capacity"
                  value={`${draft.resourceConditions.shelterCapacity.toLocaleString()} across ${draft.resourceConditions.shelters.toLocaleString()} shelters`}
                />
                <SummaryRow
                  label="Transport"
                  value={`${draft.resourceConditions.cars} cars · ${draft.resourceConditions.trucks} trucks · ${draft.resourceConditions.boats} boats`}
                />
              </dl>
            </div>

            <div className="rounded-xl border border-gray-200 bg-gray-50 p-4 text-sm">
              <h3 className="font-semibold text-gray-900">
                Planner-derived gaps
              </h3>
              {draft.planningGaps.length > 0 ? (
                <ul className="mt-3 space-y-2 text-gray-700">
                  {draft.planningGaps.map((gap) => (
                    <li key={gap}>• {gap}</li>
                  ))}
                </ul>
              ) : (
                <p className="mt-3 text-gray-600">
                  No resource gaps are currently reported by the deterministic
                  plan.
                </p>
              )}
            </div>
          </div>

          <fieldset className="mt-5">
            <legend className="text-sm font-semibold text-gray-900">
              Requested assistance
            </legend>
            <p className="mt-1 text-xs text-gray-500">
              Select at least one category. Categories are chosen by you, not
              generated by AI.
            </p>
            <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {ASSISTANCE_CATEGORIES.map((category) => (
                <label
                  key={category}
                  className="flex min-h-11 cursor-pointer items-center gap-3 rounded-xl border border-gray-200 px-3 py-2.5 text-sm text-gray-800 hover:bg-gray-50"
                >
                  <input
                    type="checkbox"
                    aria-label={category}
                    checked={selectedCategories.includes(category)}
                    onChange={() => toggleCategory(category)}
                    className="h-4 w-4 rounded border-gray-300 text-blue-700"
                  />
                  {category}
                </label>
              ))}
            </div>
          </fieldset>

          <label className="mt-5 block text-sm font-semibold text-gray-900">
            Optional note
            <textarea
              value={note}
              onChange={(event) => setNote(event.target.value)}
              maxLength={500}
              rows={3}
              placeholder="Add short local context for this demonstration request"
              className="mt-2 w-full rounded-xl border border-gray-300 px-3 py-2.5 text-sm font-normal text-gray-900 outline-none focus:border-blue-600 focus:ring-2 focus:ring-blue-100"
            />
          </label>

          <div className="mt-5 rounded-xl border border-blue-100 bg-blue-50 p-4 text-sm text-blue-950">
            <h3 className="font-semibold">Submission summary</h3>
            <p className="mt-1">
              {draft.community.name} ·{" "}
              {draft.riskLevel ?? "Risk not calculated"} ·{" "}
              {selectedCategories.length > 0
                ? selectedCategories.join(", ")
                : "No assistance category selected yet"}
            </p>
            <p className="mt-1 text-xs text-blue-800">
              This creates one local browser record. It does not contact or
              dispatch any organisation.
            </p>
          </div>

          {error && (
            <p role="alert" className="mt-3 text-sm font-medium text-red-700">
              {error}
            </p>
          )}
          <div className="mt-5 flex flex-wrap gap-3">
            <button
              type="button"
              onClick={submitRequest}
              disabled={submitting || selectedCategories.length === 0}
              className="min-h-11 rounded-xl bg-blue-700 px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-blue-800 disabled:cursor-not-allowed disabled:bg-gray-300"
            >
              {submitting ? "Storing Demo Request…" : "Submit Demo Request"}
            </button>
            <button
              type="button"
              onClick={closeRequest}
              disabled={submitting}
              className="min-h-11 rounded-xl border border-gray-300 px-5 py-2.5 text-sm font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-50"
            >
              Cancel
            </button>
          </div>
        </section>
      )}

      <section className="mt-5">
        <div className="mb-3 flex items-end justify-between gap-3">
          <div>
            <h2 className="font-bold text-gray-900">
              This community’s demo requests
            </h2>
            <p className="mt-0.5 text-xs text-gray-500">
              Newest first · stored only in this browser
            </p>
          </div>
          <span className="rounded-full bg-gray-100 px-2.5 py-1 text-xs font-semibold text-gray-700">
            {communityRequests.length}
          </span>
        </div>
        {communityRequests.length > 0 ? (
          <div className="space-y-3">
            {communityRequests.map((request) => (
              <RequestCard
                key={request.id}
                request={request}
                highlighted={request.id === lastSubmittedId}
              />
            ))}
          </div>
        ) : (
          <div className="rounded-2xl border-2 border-dashed border-gray-200 bg-gray-50 p-7 text-center text-sm text-gray-500">
            No local demo requests have been submitted for this community.
          </div>
        )}
      </section>
    </div>
  )
}

function RequestCard({
  request,
  highlighted,
}: {
  request: SupportRequest
  highlighted: boolean
}) {
  return (
    <article
      className={`rounded-2xl border bg-white p-5 ${
        highlighted ? "border-blue-400 ring-2 ring-blue-100" : "border-gray-200"
      }`}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="font-semibold text-gray-900">Local Demo Request</h3>
            <StatusPill status={request.status} />
            <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-600">
              {request.dataProvenance === "SAMPLE"
                ? "Sample inputs"
                : "User-confirmed inputs"}
            </span>
          </div>
          <p className="mt-1 break-all font-mono text-xs text-gray-500">
            {request.id}
          </p>
        </div>
        <div className="flex items-center gap-1.5 text-xs text-gray-500">
          <IconClock size={13} />
          <time dateTime={request.createdAt}>
            {formatDateTime(request.createdAt)}
          </time>
        </div>
      </div>

      <p className="mt-3 text-sm font-medium text-gray-800">
        {supportRequestStatusMessage(request)}
      </p>
      {request.responderLabel && (
        <p className="mt-1 text-xs text-gray-500">
          Responder: {request.responderLabel}
        </p>
      )}

      <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
        <SummaryRow
          label="Categories"
          value={request.assistanceCategories.join(", ") || "None selected"}
        />
        <SummaryRow
          label="Risk at submission"
          value={request.riskLevel ?? "Not calculated"}
        />
      </dl>
      <div className="mt-4">
        <h4 className="text-xs font-semibold uppercase tracking-wide text-gray-500">
          Planning gaps at submission
        </h4>
        {request.planningGaps.length > 0 ? (
          <ul className="mt-2 space-y-1.5 text-sm text-gray-700">
            {request.planningGaps.map((gap) => (
              <li key={gap}>• {gap}</li>
            ))}
          </ul>
        ) : (
          <p className="mt-2 text-sm text-gray-600">
            No planner-derived resource gaps were recorded.
          </p>
        )}
      </div>
      {request.note && (
        <p className="mt-4 rounded-xl bg-gray-50 px-4 py-3 text-sm text-gray-700">
          <strong>Note:</strong> {request.note}
        </p>
      )}
    </article>
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

interface SummaryRowProps {
  label: string
  value: string
}

function SummaryRow({ label, value }: SummaryRowProps) {
  return (
    <div className="flex justify-between gap-3">
      <dt className="shrink-0 text-gray-500">{label}</dt>
      <dd className="text-right font-medium text-gray-900">{value}</dd>
    </div>
  )
}

function formatDateTime(value: string): string {
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value))
}
