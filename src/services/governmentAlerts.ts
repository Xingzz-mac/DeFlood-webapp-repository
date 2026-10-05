import type { CommunityData } from '../context/CommunityContext'
import type { PrototypeRole } from './prototypeSession'

export const ALERT_TYPES = ['Flood Warning', 'Evacuation Alert', 'Severe Weather Warning', 'Shelter / Safety Notice'] as const
export const ALERT_SEVERITIES = ['Advisory', 'Warning', 'Emergency'] as const
export const ALERT_STORAGE_KEY = 'deflood-government-alerts-v1'
export type AlertCommunity = Pick<CommunityData, 'name' | 'township' | 'region'>
export interface GovernmentAlert {
  id: string
  type: typeof ALERT_TYPES[number]
  severity: typeof ALERT_SEVERITIES[number]
  targets: { id: string; name: string }[]
  message: string
  issuedAt: string
  status: 'ISSUED'
  endedAt?: string
  archivedAt?: string
}
// Matches the existing Support Network community identity convention.
export function alertCommunityId(community: AlertCommunity): string {
  return JSON.stringify([community.name, community.township, community.region].map(value => value.trim().toLocaleLowerCase()))
}
export const ALERT_MESSAGES: Record<GovernmentAlert['type'], string> = {
  'Flood Warning': 'High flood risk has been detected in your community. Please prepare essential belongings, stay alert for official instructions, and review available evacuation guidance.',
  'Evacuation Alert': 'Please prepare essential belongings and review evacuation guidance. Follow verified local emergency instructions about when and where to move.',
  'Severe Weather Warning': 'Please review available weather information, prepare essential supplies, and follow verified local safety instructions.',
  'Shelter / Safety Notice': 'Please review available shelter and safety guidance. Confirm shelter availability and safe travel arrangements with local officials.',
}
export function loadGovernmentAlerts(): GovernmentAlert[] {
  try {
    const values: unknown = JSON.parse(localStorage.getItem(ALERT_STORAGE_KEY) ?? '[]')
    if (!Array.isArray(values)) return []
    return values.filter((a): a is GovernmentAlert => a && typeof a.id === 'string' && ALERT_TYPES.includes(a.type) && ALERT_SEVERITIES.includes(a.severity) && a.status === 'ISSUED' && typeof a.message === 'string' && Number.isFinite(Date.parse(a.issuedAt)) && Array.isArray(a.targets) && a.targets.length > 0 && a.targets.every((t: { id?: unknown; name?: unknown }) => t && typeof t.id === 'string' && typeof t.name === 'string'))
  } catch { return [] }
}
export function issueGovernmentAlert(role: PrototypeRole, draft: Pick<GovernmentAlert, 'type' | 'severity' | 'targets' | 'message'>): GovernmentAlert {
  if (role !== 'government') throw new Error('Only the Government role can issue alerts.')
  if (!ALERT_TYPES.includes(draft.type) || !ALERT_SEVERITIES.includes(draft.severity) || !draft.targets.length || draft.targets.some(t => !t.id || !t.name) || !draft.message.trim() || draft.message.length > 2000) throw new Error('Select recipients and enter a message of 1–2000 characters.')
  const alert: GovernmentAlert = { ...draft, targets: [...new Map(draft.targets.map(t => [t.id, { ...t }])).values()], message: draft.message.trim(), id: crypto.randomUUID(), issuedAt: new Date().toISOString(), status: 'ISSUED' }
  try { localStorage.setItem(ALERT_STORAGE_KEY, JSON.stringify([alert, ...loadGovernmentAlerts()])) } catch { throw new Error('Local storage is unavailable or full. Alert was not issued.') }
  notifyAlertListeners()
  return alert
}

export function isActiveGovernmentAlert(alert: GovernmentAlert): boolean {
  return !alert.endedAt && !alert.archivedAt
}

export function endGovernmentAlert(id: string, role: PrototypeRole): GovernmentAlert | null {
  return updateAlertLifecycle(id, role, 'endedAt')
}

export function archiveGovernmentAlert(id: string, role: PrototypeRole): GovernmentAlert | null {
  return updateAlertLifecycle(id, role, 'archivedAt')
}

function updateAlertLifecycle(id: string, role: PrototypeRole, field: 'endedAt' | 'archivedAt'): GovernmentAlert | null {
  if (role !== 'government') throw new Error('Only the Government role can end or archive alerts.')
  const alerts = loadGovernmentAlerts()
  const current = alerts.find(alert => alert.id === id)
  if (!current || current.archivedAt || (field === 'endedAt' ? current.endedAt : !current.endedAt)) return null
  const updated = { ...current, [field]: new Date().toISOString() }
  try { localStorage.setItem(ALERT_STORAGE_KEY, JSON.stringify(alerts.map(alert => alert.id === id ? updated : alert))) } catch { throw new Error('Local storage is unavailable or full. Alert was not changed.') }
  notifyAlertListeners()
  return updated
}

const alertListeners = new Set<() => void>()
function notifyAlertListeners() {
  alertListeners.forEach(listener => listener())
}

export function subscribeGovernmentAlerts(listener: () => void): () => void {
  alertListeners.add(listener)
  const onStorage = (event: StorageEvent) => {
    if (event.key === ALERT_STORAGE_KEY || event.key === null) listener()
  }
  if (typeof window !== 'undefined') window.addEventListener('storage', onStorage)
  return () => {
    alertListeners.delete(listener)
    if (typeof window !== 'undefined') window.removeEventListener('storage', onStorage)
  }
}
