export const PROTOTYPE_SESSION_STORAGE_KEY = 'deflood-prototype-session-v1'

export type PrototypeRole = 'leader' | 'mayor' | 'assistant' | 'ngo' | 'government'

export interface PrototypeSessionUser {
  role: PrototypeRole
  name: string
}

interface PersistedPrototypeSession extends PrototypeSessionUser {
  signedIn: true
}

interface SessionStorage {
  getItem: (key: string) => string | null
  setItem: (key: string, value: string) => void
  removeItem: (key: string) => void
}

const validRoles = new Set<PrototypeRole>([
  'leader',
  'mayor',
  'assistant',
  'ngo',
  'government',
])

function browserStorage(): SessionStorage | null {
  return typeof localStorage === 'undefined' ? null : localStorage
}

function validSession(value: unknown): PersistedPrototypeSession | null {
  if (!value || typeof value !== 'object') return null
  const candidate = value as Record<string, unknown>
  if (candidate.signedIn !== true) return null
  if (typeof candidate.role !== 'string' || !validRoles.has(candidate.role as PrototypeRole)) return null
  if (typeof candidate.name !== 'string') return null
  const name = candidate.name.trim()
  if (!name || name.length > 120) return null
  return { signedIn: true, role: candidate.role as PrototypeRole, name }
}

export function restorePrototypeSession(
  storage: SessionStorage | null = browserStorage(),
): PrototypeSessionUser | null {
  if (!storage) return null
  try {
    const raw = storage.getItem(PROTOTYPE_SESSION_STORAGE_KEY)
    if (!raw) return null
    const session = validSession(JSON.parse(raw))
    if (!session) {
      storage.removeItem(PROTOTYPE_SESSION_STORAGE_KEY)
      return null
    }
    return { role: session.role, name: session.name }
  } catch {
    try {
      storage.removeItem(PROTOTYPE_SESSION_STORAGE_KEY)
    } catch {
      // Ignore unavailable or read-only browser storage.
    }
    return null
  }
}

export function persistPrototypeSession(
  user: PrototypeSessionUser,
  storage: SessionStorage | null = browserStorage(),
): void {
  if (!storage) return
  const session = validSession({ signedIn: true, role: user.role, name: user.name })
  if (!session) return
  try {
    storage.setItem(PROTOTYPE_SESSION_STORAGE_KEY, JSON.stringify(session))
  } catch {
    // The current tab remains signed in if browser storage is unavailable.
  }
}

export function clearPrototypeSession(
  storage: SessionStorage | null = browserStorage(),
): void {
  if (!storage) return
  try {
    storage.removeItem(PROTOTYPE_SESSION_STORAGE_KEY)
  } catch {
    // The in-memory session still signs out even if storage is unavailable.
  }
}
