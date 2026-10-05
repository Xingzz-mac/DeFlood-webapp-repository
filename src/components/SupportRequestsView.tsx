import { lazy, Suspense, useState } from 'react'
import type { Role } from '../App'
import { useSupportRequests } from '../hooks/useSupportRequests'
import { ASSISTANCE_CATEGORIES, isActiveSupportRequest, nextSupportRequestStatus, supportRequestLocation, supportRequestStatusLabel, SUPPORT_STATUS_COLORS } from '../services/supportNetwork'

const SupportRequestsMap = lazy(() => import('./SupportRequestsMap'))

export default function SupportRequestsView({ role }: { role: Role }) {
  const { requests, transition, archive } = useSupportRequests()
  const [status, setStatus] = useState('active')
  const [archiveId, setArchiveId] = useState<string | null>(null)
  const [assistance, setAssistance] = useState('all')
  const [risk, setRisk] = useState('all')
  const [view, setView] = useState('requests')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const filtered = [...requests].sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt)).filter(request =>
    (status === 'archived' ? Boolean(request.archivedAt) : !request.archivedAt && (status === 'all' || (status === 'active' ? isActiveSupportRequest(request) : request.status === status))) &&
    (assistance === 'all' || request.assistanceCategories.some(category => category === assistance)) &&
    (risk === 'all' || request.riskLevel === risk))
  const selected = filtered.find(request => request.id === selectedId) ?? filtered[0]
  const location = selected && supportRequestLocation(selected)
  const nextStatus = selected && nextSupportRequestStatus(selected.status)
  const knownPeople = requests.reduce((sum, request) => sum + (request.assistancePeople?.total ?? 0), 0)
  const newCount = requests.filter(r => r.status === 'PENDING').length
  return <div className="mx-auto max-w-7xl space-y-5 p-4 md:p-6">
    <header><h1 className="text-2xl font-bold text-gray-900">{role === 'government' ? 'Support-Request Activity' : 'Assistance Requests'}</h1>
      <p className="mt-1 text-sm text-gray-600">{role === 'government' ? 'Preparedness oversight across submitted community requests.' : 'Review community needs and coordinate your response.'}</p>
    </header>
    <section aria-label="Request overview" className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      {[
        ['Active Requests', requests.filter(isActiveSupportRequest).length],
        ['High-Risk Requests', requests.filter(r => r.riskLevel === 'HIGH').length],
        ['People Requesting Assistance', knownPeople],
        ['Resolved Requests', requests.filter(r => r.status === 'RESOLVED').length],
      ].map(([label, value]) => <div key={label} className="rounded-xl border border-gray-200 bg-white p-4"><div className="text-xs text-gray-600">{label}</div><strong className="text-2xl text-[#1e3a5f]">{value}</strong></div>)}
    </section>
    <p className="text-xs text-gray-500">{newCount} new {newCount === 1 ? 'request' : 'requests'}. People totals sum recorded request counts, including resolved requests; repeated requests may overlap. Older requests without a help count are excluded. Risk is the recorded assessment at submission.</p>
    <div className="flex flex-wrap gap-3">
      <label className="text-sm">Status<select aria-label="Request status filter" value={status} onChange={e => { setStatus(e.target.value); setArchiveId(null) }} className="ml-2 rounded-lg border p-2"><option value="active">Active</option><option value="all">All unarchived</option>{(['PENDING','ACCEPTED','IN_PROGRESS','RESOLVED','CANCELLED'] as const).map(s => <option key={s} value={s}>{supportRequestStatusLabel(s)}</option>)}<option value="archived">Archived / History</option></select></label>
      <label className="text-sm">Assistance<select aria-label="Assistance filter" value={assistance} onChange={e => setAssistance(e.target.value)} className="ml-2 rounded-lg border p-2"><option value="all">All</option>{ASSISTANCE_CATEGORIES.map(c => <option key={c}>{c}</option>)}</select></label>
      <label className="text-sm">Risk<select aria-label="Risk filter" value={risk} onChange={e => setRisk(e.target.value)} className="ml-2 rounded-lg border p-2"><option value="all">All</option>{['HIGH','MEDIUM','LOW'].map(r => <option key={r}>{r}</option>)}</select></label>
    </div>
    <div className="flex gap-2">{['requests','map'].map(tab => <button key={tab} type="button" aria-pressed={view === tab} onClick={() => setView(tab)} className={`rounded-lg px-4 py-2 text-sm font-semibold ${view === tab ? 'bg-[#1e3a5f] text-white' : 'bg-gray-100 text-gray-700'}`}>{tab === 'map' ? 'Map' : 'Requests'}</button>)}</div>
    {view === 'map' ? <Suspense fallback={<p>Loading request map…</p>}><SupportRequestsMap requests={filtered} showResolved={status === 'RESOLVED'} showCancelled={status === 'CANCELLED' || status === 'all'} onOpen={id => { setSelectedId(id); setView('requests') }} /></Suspense> :
      <div className="grid items-start gap-5 lg:grid-cols-2">
        <section aria-label="Submitted requests" className="space-y-3">
          {!filtered.length && <p className="rounded-xl border border-dashed p-6 text-gray-500">No requests match these filters. Choose Resolved, Cancelled, or Archived / History to inspect completed requests.</p>}
          {filtered.map(request => <button key={request.id} type="button" onClick={() => setSelectedId(request.id)} className={`block w-full rounded-xl border p-4 text-left ${request.id === selected?.id ? 'border-blue-500 bg-blue-50' : 'border-gray-200 bg-white'}`}>
            <strong>{request.community.name}</strong><span className="ml-2 rounded px-2 py-1 text-xs font-bold text-white" style={{ background: SUPPORT_STATUS_COLORS[request.status] }}>{supportRequestStatusLabel(request.status)}</span>
            <p className="mt-2 text-sm">{request.assistanceCategories.join(', ')} · {request.assistancePeople ? `${request.assistancePeople.total} people need assistance` : 'Assistance count not recorded'} · {request.riskLevel ?? 'Unknown'} risk at submission</p>
            <p className="mt-1 text-xs text-gray-500">{new Date(request.createdAt).toLocaleString()} · {request.dataProvenance}</p>
          </button>)}
        </section>
        {selected && <section aria-label="Request details" className="min-w-0 space-y-5 rounded-xl border border-gray-200 bg-white p-5">
          <header className="space-y-2">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <h2 className="min-w-0 break-words text-lg font-bold text-[#1e3a5f]">{selected.community.name}</h2>
              <span className="shrink-0 rounded px-2 py-1 text-xs font-bold text-white" style={{ background: SUPPORT_STATUS_COLORS[selected.status] }}>{supportRequestStatusLabel(selected.status)}</span>
            </div>
            <p className="text-sm font-semibold text-gray-900">{selected.assistanceCategories.join(', ')}</p>
            <p className="text-sm text-gray-600">{selected.community.township}, {selected.community.region}</p>
            <p className="text-sm text-gray-600">Risk at submission: <strong className="font-semibold text-gray-900">{selected.riskLevel ?? 'Unavailable'}</strong></p>
          </header>
          <section aria-label="People needing assistance" className="space-y-2 border-t border-gray-100 pt-4 text-sm">
            <h3 className="font-semibold text-[#1e3a5f]">People needing assistance</h3>
            <p className="text-lg font-bold tabular-nums text-gray-900">Total: {selected.assistancePeople?.total ?? 'Not recorded'}</p>
            <p className="text-xs text-gray-500">Of those:</p>
            <dl className="space-y-1">
              {([['Children', 'children'], ['Elderly people', 'elderly'], ['People with disabilities', 'disabled']] as const).map(([label, key]) => (
                <div key={key} className="flex justify-between gap-3"><dt className="text-gray-600">{label}</dt><dd className="shrink-0 font-medium tabular-nums text-gray-900">{selected.assistancePeople?.[key] ?? 'Not recorded'}</dd></div>
              ))}
            </dl>
            <small className="block text-xs leading-relaxed text-gray-500">Vulnerable-group counts are included within the total and may overlap.</small>
          </section>
          <section className="space-y-2 border-t border-gray-100 pt-4">
            <h3 className="text-sm font-semibold text-[#1e3a5f]">Request note</h3>
            <p className="whitespace-pre-wrap break-words text-sm leading-relaxed text-gray-700">{selected.note || 'No note supplied.'}</p>
          </section>
          <section className="space-y-2 border-t border-gray-100 pt-4">
            <h3 className="text-sm font-semibold text-[#1e3a5f]">Recorded planning gaps</h3>
            <ul className="list-disc space-y-1.5 pl-4 text-sm leading-relaxed text-gray-700">{selected.planningGaps.map(gap => <li key={gap}>{gap}</li>)}</ul>
          </section>
          <div className="space-y-1 border-t border-gray-100 pt-4 text-xs leading-relaxed text-gray-500">
            <p className="break-all">Request ID: {selected.id}</p>
            <p>Coordinates: {location ? `${location.latitude}, ${location.longitude}` : 'Location not recorded'}</p>
            <p>Whole community population: {selected.community.population} · {selected.dataProvenance}</p>
            <p>Submitted: {new Date(selected.createdAt).toLocaleString()}{selected.updatedAt !== selected.createdAt && <><br />Updated: {new Date(selected.updatedAt).toLocaleString()}</>}</p>
          </div>
          <section className="space-y-3 border-t border-gray-100 pt-4">
          <h3 className="text-sm font-semibold text-[#1e3a5f]">Response</h3>
          <p className="text-sm text-gray-600">Responder status: <span className="font-medium text-gray-900">{selected.status === 'CANCELLED' ? 'Cancelled by Community' : selected.responderLabel ? `${supportRequestStatusLabel(selected.status)}` : 'Not acknowledged'}</span></p>
          {selected.status === 'RESOLVED' && <p className="text-sm text-green-800">Complete — no further response required.{selected.archivedAt ? ` Archived: ${new Date(selected.archivedAt).toLocaleString()}. Read-only history.` : ''}</p>}
          {selected.archivedAt && selected.status === 'CANCELLED' && <p className="text-xs text-gray-500">Archived: {new Date(selected.archivedAt).toLocaleString()}. Read-only history.</p>}
          {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
          {role === 'ngo' && (selected.status === 'RESOLVED' || selected.status === 'CANCELLED') && !selected.archivedAt && <>
            <button type="button" className="rounded-lg border border-gray-300 px-4 py-2 text-sm" onClick={() => { setArchiveId(selected.id); setError(null) }}>Archive Request</button>
            {archiveId === selected.id && <section aria-label="Confirm archive" className="space-y-3 rounded-lg border border-gray-200 bg-gray-50 p-4">
              <h3 className="font-semibold">Archive this completed request?</h3><p className="text-sm">This will remove it from active operations and the default map. The request will remain available in history.</p>
              <button type="button" className="mr-3 text-sm" onClick={() => setArchiveId(null)}>Cancel</button>
              <button type="button" className="rounded-lg bg-[#1e3a5f] px-4 py-2 text-sm text-white" onClick={() => { try { if (!archive(selected.id, role)) throw new Error('Request changed. Review its latest status.'); setArchiveId(null); setError(null) } catch (e) { setError(e instanceof Error ? e.message : 'Archive failed.') } }}>Archive</button>
            </section>}
          </>}
          {role === 'ngo' && nextStatus && <button type="button" className="rounded-lg bg-blue-700 px-4 py-2 font-semibold text-white" onClick={() => { try { const updated = transition(selected.id, nextStatus); if (!updated) throw new Error('Request changed. Review its latest status.'); setError(null) } catch (e) { setError(e instanceof Error ? e.message : 'Status could not be saved.') } }}>{selected.status === 'PENDING' ? 'Acknowledge' : selected.status === 'ACCEPTED' ? 'Start Response' : 'Resolve'}</button>}
          </section>
        </section>}
      </div>}
  </div>
}
