import { useState } from 'react'
import type { FormEvent } from 'react'
import { IconAlertTriangle, IconCheckCircle, IconClock, IconPlus } from './Icons'

type RequestType = 'Rescue assistance' | 'Boats' | 'Vehicles' | 'Food' | 'Drinking water' | 'Medicine' | 'Shelter' | 'Volunteers' | 'Other'
type Priority = 'HIGH' | 'MEDIUM' | 'LOW'
type Status = 'Pending' | 'Accepted' | 'In Progress' | 'Completed'

interface Request {
  id: string
  type: RequestType
  quantity: string
  priority: Priority
  time: string
  status: Status
  notes: string
}

const initial: Request[] = [
  { id: '1', type: 'Boats', quantity: '5 rescue boats', priority: 'HIGH', time: '13:45', status: 'Pending', notes: 'For flooded northern sector roads' },
  { id: '2', type: 'Food', quantity: '500 meals per day', priority: 'HIGH', time: '12:10', status: 'In Progress', notes: 'For evacuees at Shelter A' },
  { id: '3', type: 'Medicine', quantity: 'Basic kits x50', priority: 'MEDIUM', time: '11:30', status: 'Accepted', notes: 'For clinic and shelter medical support' },
]

const requestTypes: RequestType[] = [
  'Rescue assistance', 'Boats', 'Vehicles', 'Food', 'Drinking water', 'Medicine', 'Shelter', 'Volunteers', 'Other',
]

export default function SupportNetwork() {
  const [requests, setRequests] = useState<Request[]>(initial)
  const [showForm, setShowForm] = useState(false)
  const [confirmed, setConfirmed] = useState(false)
  const [form, setForm] = useState({ type: 'Boats' as RequestType, quantity: '', priority: 'HIGH' as Priority, notes: '' })

  const submit = (e: FormEvent) => {
    e.preventDefault()
    const newReq: Request = {
      id: String(Date.now()),
      type: form.type,
      quantity: form.quantity,
      priority: form.priority,
      time: new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }),
      status: 'Pending',
      notes: form.notes,
    }
    setRequests(r => [newReq, ...r])
    setShowForm(false)
    setConfirmed(true)
    setForm({ type: 'Boats', quantity: '', priority: 'HIGH', notes: '' })
  }

  return (
    <div className="p-4 md:p-6 max-w-4xl mx-auto">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-5">
        <div>
          <h1 className="text-xl md:text-2xl font-bold text-gray-900">Support Network</h1>
          <p className="text-gray-500 text-sm mt-0.5">Request assistance for your community</p>
        </div>
        <button
          onClick={() => { setShowForm(true); setConfirmed(false) }}
          className="flex items-center gap-2 bg-red-600 hover:bg-red-700 text-white font-semibold px-4 py-2.5 rounded-xl text-sm transition-colors"
        >
          <IconPlus size={15} />
          Request Assistance
        </button>
      </div>

      {/* High risk notice */}
      <div className="bg-red-50 border border-red-200 rounded-xl px-5 py-3.5 mb-4 flex items-start gap-3 text-sm">
        <IconAlertTriangle size={17} className="text-red-600 shrink-0 mt-0.5" />
        <p className="text-red-700">
          <strong>HIGH RISK situation active.</strong>{' '}
          Emergency requests are visible immediately to all registered NGOs and government agencies in this region.
        </p>
      </div>

      {/* Success confirmation */}
      {confirmed && (
        <div className="bg-green-50 border border-green-200 rounded-xl px-5 py-4 mb-4 flex items-start gap-3">
          <IconCheckCircle size={19} className="text-green-600 shrink-0 mt-0.5" />
          <div>
            <div className="font-semibold text-green-800 text-sm">Assistance request submitted</div>
            <div className="text-sm text-green-700 mt-0.5">
              Registered organisations have been notified. You will receive an update when the request is accepted.
            </div>
          </div>
        </div>
      )}

      {/* Request form */}
      {showForm && (
        <div className="bg-white border border-gray-200 rounded-2xl p-5 mb-5">
          <h2 className="font-semibold text-gray-900 mb-4 text-sm">New Assistance Request</h2>
          <form onSubmit={submit} className="space-y-4">
            <div className="grid sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Type of Assistance</label>
                <select
                  value={form.type}
                  onChange={e => setForm(f => ({ ...f, type: e.target.value as RequestType }))}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
                >
                  {requestTypes.map(t => <option key={t}>{t}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Priority</label>
                <div className="flex gap-2">
                  {(['HIGH', 'MEDIUM', 'LOW'] as Priority[]).map(p => {
                    const active = form.priority === p
                    const base = 'flex-1 py-2 rounded-lg text-xs font-semibold border transition-colors'
                    const style = active
                      ? p === 'HIGH' ? 'bg-red-600 text-white border-red-600' : p === 'MEDIUM' ? 'bg-amber-500 text-white border-amber-500' : 'bg-green-600 text-white border-green-600'
                      : 'border-gray-300 text-gray-600 hover:bg-gray-50'
                    return (
                      <button key={p} type="button" onClick={() => setForm(f => ({ ...f, priority: p }))} className={`${base} ${style}`}>
                        {p}
                      </button>
                    )
                  })}
                </div>
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Quantity / Details</label>
              <input
                type="text"
                value={form.quantity}
                onChange={e => setForm(f => ({ ...f, quantity: e.target.value }))}
                placeholder="e.g. 5 boats, 200 food packages, 3 medical teams"
                required
                className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Additional Notes (optional)</label>
              <textarea
                value={form.notes}
                onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
                rows={2}
                className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
                placeholder="Location, urgency details, contact person..."
              />
            </div>
            <div className="flex gap-3">
              <button type="submit" className="flex-1 bg-red-600 hover:bg-red-700 text-white font-semibold py-2.5 rounded-xl text-sm transition-colors">
                Submit Request
              </button>
              <button type="button" onClick={() => setShowForm(false)} className="px-5 py-2.5 border border-gray-300 rounded-xl text-sm text-gray-700 hover:bg-gray-50 transition-colors font-medium">
                Cancel
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Request list */}
      <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
          <h2 className="font-semibold text-gray-900 text-sm">Active Requests ({requests.length})</h2>
        </div>
        <div className="divide-y divide-gray-100">
          {requests.map(r => <RequestCard key={r.id} req={r} />)}
        </div>
      </div>
    </div>
  )
}

function RequestCard({ req }: { req: Request }) {
  const pBg = req.priority === 'HIGH' ? 'bg-red-50 text-red-700' : req.priority === 'MEDIUM' ? 'bg-amber-50 text-amber-700' : 'bg-green-50 text-green-700'
  const sColor = req.status === 'Pending' ? 'text-gray-600'
    : req.status === 'Accepted' ? 'text-blue-600'
    : req.status === 'In Progress' ? 'text-blue-700 font-semibold'
    : 'text-green-700 font-semibold'

  return (
    <div className="px-5 py-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <span className={`text-xs font-bold px-2 py-0.5 rounded shrink-0 mt-0.5 ${pBg}`}>{req.priority}</span>
          <div>
            <div className="font-semibold text-gray-900 text-sm">{req.type}</div>
            <div className="text-xs text-gray-500 mt-0.5">{req.quantity}</div>
            {req.notes && <div className="text-xs text-gray-400 mt-0.5 italic">{req.notes}</div>}
          </div>
        </div>
        <div className="text-right shrink-0">
          <div className={`text-sm flex items-center gap-1 justify-end ${sColor}`}>
            {req.status === 'In Progress' && <IconClock size={13} />}
            {req.status === 'Completed' && <IconCheckCircle size={13} />}
            {req.status}
          </div>
          <div className="text-xs text-gray-400 mt-0.5 font-mono">{req.time}</div>
        </div>
      </div>
    </div>
  )
}
