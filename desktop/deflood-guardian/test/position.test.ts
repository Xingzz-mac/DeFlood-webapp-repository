import { describe, expect, it } from 'vitest'
import {
  clampPositionToWorkArea,
  isPositionVisible,
  resolveGuardianPosition,
  type DisplayWorkArea,
} from '../src/shared/position.js'

const windowSize = { width: 300, height: 190 }
const primary: DisplayWorkArea = {
  id: 'primary',
  workArea: { x: 0, y: 0, width: 1440, height: 875 },
}
const secondary: DisplayWorkArea = {
  id: 'secondary',
  workArea: { x: 1440, y: 0, width: 1920, height: 1040 },
}

describe('DeFlood Guardian saved position', () => {
  it('restores a saved position on any currently connected display', () => {
    const saved = { x: 2400, y: 500 }
    expect(isPositionVisible(saved, windowSize, [primary, secondary])).toBe(true)
    expect(resolveGuardianPosition(saved, windowSize, [primary, secondary], primary)).toEqual(saved)
  })

  it('falls back to a safe bottom-right position when a saved monitor is absent', () => {
    expect(resolveGuardianPosition({ x: 2400, y: 500 }, windowSize, [primary], primary))
      .toEqual({ x: 1120, y: 665 })
  })

  it('rejects partially off-screen positions and clamps active dragging', () => {
    expect(isPositionVisible({ x: 1300, y: 800 }, windowSize, [primary])).toBe(false)
    expect(clampPositionToWorkArea({ x: 1500, y: -40 }, windowSize, primary.workArea))
      .toEqual({ x: 1140, y: 0 })
  })
})
