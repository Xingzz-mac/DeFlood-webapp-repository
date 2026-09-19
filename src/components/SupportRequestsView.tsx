import { lazy, Suspense, useState } from 'react'
import type { Role } from '../App'
import { useSupportRequests } from '../hooks/useSupportRequests'
import { ASSISTANCE_CATEGORIES, nextSupportRequestStatus, supportRequestLocation, supportRequestStatusLabel, SUPPORT_STATUS_COLORS } from '../services/supportNetwork'

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
    (status === 'archived' ? Boolean(request.archivedAt) : !request.archivedAt && (status === 'all' || (status === 'active' ? request.status !== 'RESOLVED' : request.status === status))) &&
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
      <p className="mt-2 text-xs text-gray-500">Local prototype — requests and status updates stay in this browser. No real organisation is contacted or dispatched.</p>
    </header>
    <section aria-label="Request overview" className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      {[
        ['Active Requests', requests.filter(r => r.status !== 'RESOLVED').length],
        ['High-Risk Requests', requests.filter(r => r.riskLevel === 'HIGH').length],
        ['People Requesting Assistance', knownPeople],
        ['Resolved Requests', requests.filter(r => r.status === 'RESOLVED').length],
      ].map(([label, value]) => <div key={label} className="rounded-xl border border-gray-200 bg-white p-4"><div className="text-xs text-gray-600">{label}</div><strong className="text-2xl text-[#1e3a5f]">{value}</strong></div>)}
    </section>
    <p className="text-xs text-gray-500">{newCount} new {newCount === 1 ? 'request' : 'requests'}. People totals sum recorded request counts, including resolved requests; repeated requests may overlap. Older requests without a help count are excluded. Risk is the recorded assessment at submission.</p>
    <div className="flex flex-wrap gap-3">
      <label className="text-sm">Status<select aria-label="Request status filter" value={status} onChange={e => { setStatus(e.target.value); setArchiveId(null) }} className="ml-2 rounded-lg border p-2"><option value="active">Active</option><option value="all">All unarchived</option>{(['PENDING','ACCEPTED','IN_PROGRESS','RESOLVED'] as const).map(s => <option key={s} value={s}>{supportRequestStatusLabel(s)}</option>)}<option value="archived">Archived / History</option></select></label>
      <label className="text-sm">Assistance<select aria-label="Assistance filter" value={assistance} onChange={e => setAssistance(e.target.value)} className="ml-2 rounded-lg border p-2"><option value="all">All</option>{ASSISTANCE_CATEGORIES.map(c => <option key={c}>{c}</option>)}</select></label>
      <label className="text-sm">Risk<select aria-label="Risk filter" value={risk} onChange={e => setRisk(e.target.value)} className="ml-2 rounded-lg border p-2"><option value="all">All</option>{['HIGH','MEDIUM','LOW'].map(r => <option key={r}>{r}</option>)}</select></label>
    </div>
    <div className="flex gap-2">{['requests','map'].map(tab => <button key={tab} type="button" aria-pressed={view === tab} onClick={() => setView(tab)} className={`rounded-lg px-4 py-2 text-sm font-semibold ${view === tab ? 'bg-[#1e3a5f] text-white' : 'bg-gray-100 text-gray-700'}`}>{tab === 'map' ? 'Map' : 'Requests'}</button>)}</div>
    {view === 'map' ? <Suspense fallback={<p>Loading request map…</p>}><SupportRequestsMap requests={filtered} showResolved={status === 'RESOLVED'} onOpen={id => { setSelectedId(id); setView('requests') }} /></Suspense> :
      <div className="grid items-start gap-5 lg:grid-cols-2">
        <section aria-label="Submitted requests" className="space-y-3">
          {!filtered.length && <p className="rounded-xl border border-dashed p-6 text-gray-500">No requests match these filters. Choose Resolved or Archived / History to inspect completed requests.</p>}
          {filtered.map(request => <button key={request.id} type="button" onClick={() => setSelectedId(request.id)} className={`block w-full rounded-xl border p-4 text-left ${request.id === selected?.id ? 'border-blue-500 bg-blue-50' : 'border-gray-200 bg-white'}`}>
            <strong>{request.community.name}</strong><span className="ml-2 rounded px-2 py-1 text-xs font-bold text-white" style={{ background: SUPPORT_STATUS_COLORS[request.status] }}>{supportRequestStatusLabel(request.status)}</span>
            <p className="mt-2 text-sm">{request.assistanceCategories.join(', ')} · {request.assistancePeople?.total ?? 'Unrecorded'} people · {request.riskLevel ?? 'Unknown'} risk at submission</p>
            <p className="mt-1 text-xs text-gray-500">{new Date(request.createdAt).toLocaleString()} · {request.dataProvenance} · Local Demo Request</p>
          </button>)}
        </section>
        {selected && <section aria-label="Request details" className="min-w-0 space-y-3 rounded-xl border border-gray-200 bg-white p-5">
          <h2 className="text-lg font-bold">{selected.community.name}</h2><p className="break-all text-xs text-gray-500">{selected.id}</p>
          <p>{selected.assistanceCategories.join(', ')} · <strong>{supportRequestStatusLabel(selected.status)}</strong></p>
          {selected.status === 'RESOLVED' && <p className="text-sm text-green-800">Complete — no further response required.{selected.archivedAt ? ` Archived: ${new Date(selected.archivedAt).toLocaleString()}. Read-only history.` : ''}</p>}
          <p className="text-sm">{selected.community.township}, {selected.community.region} · {location ? `${location.latitude}, ${location.longitude}` : 'Location not recorded'}</p>
          <p className="text-sm">People needing help: {selected.assistancePeople?.total ?? 'Not recorded'} · Children: {selected.assistancePeople?.children ?? 'Not recorded'} · Elderly: {selected.assistancePeople?.elderly ?? 'Not recorded'} · Disabilities: {selected.assistancePeople?.disabled ?? 'Not recorded'}</p>
          <p className="text-xs text-gray-500">Vulnerable categories may overlap. Whole community population: {selected.community.population}.</p>
          <p className="text-sm">Risk at submission: {selected.riskLevel ?? 'Unavailable'} · {selected.dataProvenance} · Local Demo Request</p>
          <p className="text-sm">Submitted: {new Date(selected.createdAt).toLocaleString()}<br />Updated: {new Date(selected.updatedAt).toLocaleString()}</p>
          <p className="whitespace-pre-wrap break-words text-sm">{selected.note || 'No note supplied.'}</p>
          <h3 className="font-semibold">Recorded planning gaps</h3><ul className="space-y-1 text-sm">{selected.planningGaps.map(gap => <li key={gap}>{gap}</li>)}</ul>
          <p className="text-sm">Responder status: {selected.responderLabel ? `${supportRequestStatusLabel(selected.status)} — simulated response` : 'Not acknowledged'}</p>
          {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
          {role === 'ngo' && selected.status === 'RESOLVED' && !selected.archivedAt && <>
            <button type="button" className="rounded-lg border border-gray-300 px-4 py-2 text-sm" onClick={() => { setArchiveId(selected.id); setError(null) }}>Archive Request</button>
            {archiveId === selected.id && <section aria-label="Confirm archive" className="space-y-3 rounded-lg border border-gray-200 bg-gray-50 p-4">
              <h3 className="font-semibold">Archive this resolved request?</h3><p className="text-sm">This will remove it from active operations and the default map. The request will remain available in history.</p>
              <button type="button" className="mr-3 text-sm" onClick={() => setArchiveId(null)}>Cancel</button>
              <button type="button" className="rounded-lg bg-[#1e3a5f] px-4 py-2 text-sm text-white" onClick={() => { try { if (!archive(selected.id, role)) throw new Error('Request changed. Review its latest status.'); setArchiveId(null); setError(null) } catch (e) { setError(e instanceof Error ? e.message : 'Archive failed.') } }}>Archive</button>
            </section>}
          </>}
          {role === 'ngo' && nextStatus && <button type="button" className="rounded-lg bg-blue-700 px-4 py-2 font-semibold text-white" onClick={() => { try { const updated = transition(selected.id, nextStatus); if (!updated) throw new Error('Request changed. Review its latest status.'); setError(null) } catch (e) { setError(e instanceof Error ? e.message : 'Status could not be saved.') } }}>{selected.status === 'PENDING' ? 'Acknowledge' : selected.status === 'ACCEPTED' ? 'Start Response' : 'Resolve'}</button>}
        </section>}
      </div>}
  </div>
}
