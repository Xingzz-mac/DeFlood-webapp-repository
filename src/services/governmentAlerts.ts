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
  return alert
}
