import { describe, expect, it } from 'vitest'
import {
  clearPrototypeSession,
  persistPrototypeSession,
  PROTOTYPE_SESSION_STORAGE_KEY,
  restorePrototypeSession,
} from './prototypeSession'

class MemoryStorage {
  readonly values = new Map<string, string>()

  getItem(key: string) {
    return this.values.get(key) ?? null
  }

  setItem(key: string, value: string) {
    this.values.set(key, value)
  }

  removeItem(key: string) {
    this.values.delete(key)
  }
}

describe('prototype session persistence', () => {
  it('persists and restores only the minimum simulated user state', () => {
    const storage = new MemoryStorage()
    persistPrototypeSession({
      role: 'leader',
      name: 'Demo Leader',
      pin: '1234',
      ADMIN_TOKEN: 'secret',
    } as never, storage)

    expect(restorePrototypeSession(storage)).toEqual({ role: 'leader', name: 'Demo Leader' })
    const serialized = storage.getItem(PROTOTYPE_SESSION_STORAGE_KEY)!
    expect(JSON.parse(serialized)).toEqual({
      signedIn: true,
      role: 'leader',
      name: 'Demo Leader',
    })
    expect(serialized).not.toMatch(/pin|password|secret|token|n8n|groq|worker/i)
  })

  it('rejects and clears malformed, unsigned-in, or unknown-role state', () => {
    for (const invalid of [
      '{bad json',
      JSON.stringify({ signedIn: false, role: 'leader', name: 'Demo' }),
      JSON.stringify({ signedIn: true, role: 'administrator', name: 'Demo' }),
      JSON.stringify({ signedIn: true, role: 'leader', name: '' }),
    ]) {
      const storage = new MemoryStorage()
      storage.setItem(PROTOTYPE_SESSION_STORAGE_KEY, invalid)
      expect(restorePrototypeSession(storage)).toBeNull()
      expect(storage.getItem(PROTOTYPE_SESSION_STORAGE_KEY)).toBeNull()
    }
  })

  it('clears the persisted session on explicit sign out', () => {
    const storage = new MemoryStorage()
    persistPrototypeSession({ role: 'ngo', name: 'Demo NGO' }, storage)
    clearPrototypeSession(storage)
    expect(restorePrototypeSession(storage)).toBeNull()
  })
})
