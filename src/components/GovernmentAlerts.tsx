import { useState } from 'react'
import type { Role } from '../App'
import { ALERT_MESSAGES, ALERT_SEVERITIES, ALERT_TYPES, alertCommunityId, issueGovernmentAlert, loadGovernmentAlerts, type AlertCommunity, type GovernmentAlert } from '../services/governmentAlerts'

export interface AlertCandidate {
  community: AlertCommunity
  risk: string | null
  provenance: string
  assessment: string
}
export default function GovernmentAlerts({ role, candidates }: { role: Role; candidates: AlertCandidate[] }) {
  const [alerts, setAlerts] = useState(loadGovernmentAlerts)
  const [targets, setTargets] = useState<string[] | null>(null)
  const [type, setType] = useState<GovernmentAlert['type']>('Flood Warning')
  const [severity, setSeverity] = useState<GovernmentAlert['severity']>('Warning')
  const [message, setMessage] = useState(ALERT_MESSAGES['Flood Warning'])
  const [preview, setPreview] = useState(false)
  const [feedback, setFeedback] = useState('')
  const communities = [...new Map(candidates.map(c => [alertCommunityId(c.community), c])).values()]
  const high = communities.filter(c => c.risk === 'HIGH')
  if (role !== 'government') return null
  function review(ids: string[]) {
    setTargets(ids); setType('Flood Warning'); setSeverity('Warning'); setMessage(ALERT_MESSAGES['Flood Warning']); setPreview(false); setFeedback('')
  }
  const recipients = communities.filter(c => targets?.includes(alertCommunityId(c.community)))
  return <section aria-label="Government alerts" className="mx-auto max-w-7xl space-y-6 p-4 md:p-6">
    <header><h1 className="text-2xl font-bold text-[#1e3a5f]">Government Alerts</h1><p className="mt-2 text-sm text-gray-600">Review DeFlood risk recommendations and issue targeted public-safety alerts to affected communities.</p><p className="mt-2 text-sm font-semibold text-[#1e3a5f]">DeFlood recommends; authorized officials issue alerts.</p></header>
    <section aria-label="Communities Requiring Attention" className="space-y-4 rounded-2xl border border-gray-200 bg-white p-4 md:p-5">
    <div><h2 className="text-lg font-bold text-[#1e3a5f]">Communities Requiring Attention</h2><p className="mt-1 font-semibold text-red-700">{high.length} High-Risk {high.length === 1 ? 'Community' : 'Communities'} Detected</p></div>
    {!high.length && <p className="text-sm text-gray-500">No HIGH-risk assessments available. No alert is issued automatically.</p>}
    <div className="grid gap-3 md:grid-cols-2">{high.map(c => <article key={alertCommunityId(c.community)} className="rounded-xl border border-red-200 bg-red-50 p-4"><strong>{c.community.name}</strong><span className="ml-2 rounded bg-red-700 px-2 py-1 text-xs font-bold text-white">HIGH</span><p className="mt-2 text-sm">{c.community.township}, {c.community.region}</p><p className="text-xs text-gray-600">{c.provenance} · {c.assessment}{c.assessment === 'Recorded snapshot' ? ' — not a current live assessment' : ''}</p><button type="button" className="mt-3 rounded-lg bg-[#1e3a5f] px-4 py-2 text-sm font-semibold text-white" onClick={() => review([alertCommunityId(c.community)])}>Review Alert for {c.community.name}</button></article>)}</div>
    <button type="button" className="rounded-lg border px-4 py-2 text-sm" onClick={() => review([])}>Create Alert</button>
    </section>
    {targets !== null && <section aria-label="Review government alert" className="space-y-4 rounded-xl border border-blue-200 bg-blue-50 p-4">
      <h3 className="font-bold">Review &amp; Issue Alert</h3>
      <label className="block text-sm">Alert Type<select aria-label="Alert Type" disabled={preview} value={type} onChange={e => { const next = e.target.value as GovernmentAlert['type']; setType(next); setMessage(ALERT_MESSAGES[next]) }} className="ml-2 rounded border bg-white p-2">{ALERT_TYPES.map(t => <option key={t}>{t}</option>)}</select></label>
      <label className="block text-sm">Severity<select aria-label="Severity" disabled={preview} value={severity} onChange={e => setSeverity(e.target.value as GovernmentAlert['severity'])} className="ml-2 rounded border bg-white p-2">{ALERT_SEVERITIES.map(s => <option key={s}>{s}</option>)}</select></label>
      <fieldset disabled={preview}><legend className="mb-2 text-sm font-semibold">Target Communities</legend>{communities.map(c => { const id = alertCommunityId(c.community); return <label key={id} className="mb-2 flex items-start gap-2 text-sm"><input type="checkbox" checked={targets.includes(id)} onChange={e => setTargets(e.target.checked ? [...targets, id] : targets.filter(t => t !== id))} />{c.community.name} — {c.risk ?? 'Unavailable'} · {c.provenance}</label> })}</fieldset>
      <label className="block text-sm font-semibold">Alert Message<textarea aria-label="Alert Message" readOnly={preview} maxLength={2000} value={message} onChange={e => setMessage(e.target.value)} className="mt-1 min-h-28 w-full rounded-lg border bg-white p-3 font-normal" /></label>
      {preview && <p className="text-sm font-semibold">Ready to issue {type} ({severity}) to {recipients.length} selected communities. Review the recipients and message above; Send is manual.</p>}
      <div className="flex flex-wrap gap-3">{!preview ? <button type="button" disabled={!recipients.length || !message.trim()} onClick={() => setPreview(true)} className="rounded-lg bg-[#1e3a5f] px-4 py-2 text-white disabled:opacity-50">Preview Alert</button> : <><button type="button" onClick={() => { try { const issued = issueGovernmentAlert(role, { type, severity, message, targets: recipients.map(c => ({ id: alertCommunityId(c.community), name: c.community.name })) }); setAlerts(loadGovernmentAlerts()); setTargets(null); setFeedback(`Alert Issued Successfully — ${issued.type} issued to ${issued.targets.length} communities.`) } catch (e) { setFeedback(e instanceof Error ? e.message : 'Alert could not be issued.') } }} className="rounded-lg bg-red-700 px-4 py-2 text-white">Send Alert</button><button type="button" onClick={() => setPreview(false)}>Edit Alert</button></>}<button type="button" onClick={() => setTargets(null)}>Cancel</button></div>
    </section>}
    {feedback && <p role="status" className="rounded-lg border p-3 text-sm">{feedback}</p>}
    <section aria-label="Recent Alerts" className="rounded-2xl border border-gray-200 bg-white p-4 md:p-5"><h2 className="text-lg font-bold text-[#1e3a5f]">Recent Alerts</h2>{!alerts.length && <p className="mt-2 text-sm text-gray-500">No alerts issued yet.</p>}{alerts.slice(0, 10).map(a => <article key={a.id} className="mt-3 rounded-lg border p-3"><strong>{a.type} · {a.severity}</strong><p className="text-xs text-gray-500">Issued · {new Date(a.issuedAt).toLocaleString()}</p><p className="text-sm">{a.targets.map(t => t.name).join(', ')}</p><details className="mt-2 text-sm"><summary className="cursor-pointer text-blue-800">View message</summary><p className="mt-2 whitespace-pre-wrap break-words">{a.message}</p></details></article>)}</section>
  </section>
}
