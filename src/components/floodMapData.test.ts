import { describe, expect, it } from 'vitest'
import { buildMapCommunities } from './floodMapData'

describe('current-community map data', () => {
  it('never assigns the saved current community a fake HIGH or evacuation state', () => {
    const current = buildMapCommunities({ name: 'Current Community', population: 1234 })[0]

    expect(current).toMatchObject({
      id: 'current',
      kind: 'current',
      risk: 'NOT_CALCULATED',
      status: 'Monitoring / Prototype',
      needs: 'No operational requirement calculated',
    })
  })
})
