import { describe, expect, it } from 'vitest'
import { isCurrentGpsRequestToken, nextGpsRequestToken } from './gpsRequestToken'

describe('GPS request token', () => {
  it('rejects a stale callback after a manual-edit invalidation', () => {
    const gpsCallbackToken = nextGpsRequestToken(0)
    const tokenAfterManualEdit = nextGpsRequestToken(gpsCallbackToken)

    expect(isCurrentGpsRequestToken(tokenAfterManualEdit, gpsCallbackToken)).toBe(false)
  })
})
