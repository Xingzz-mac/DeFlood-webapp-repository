export type SampleRisk = 'LOW' | 'MEDIUM' | 'HIGH'
export type MapRisk = SampleRisk | 'NOT_CALCULATED'

export interface MapCommunity {
  id: string
  kind: 'current' | 'sample'
  name: string
  x: number
  y: number
  risk: MapRisk
  population: number
  needs: string
  status: string
}

const sampleCommunities: MapCommunity[] = [
  { id: 'sample-c2', kind: 'sample', name: 'Sample — Bogale Township', x: 28, y: 57, risk: 'HIGH', population: 4120, needs: 'Sample shelter and water request', status: 'Sample request' },
  { id: 'sample-c3', kind: 'sample', name: 'Sample — Mawlamyinegyun', x: 63, y: 34, risk: 'MEDIUM', population: 1870, needs: 'Sample monitoring record', status: 'Sample alert' },
  { id: 'sample-c4', kind: 'sample', name: 'Sample — Dedaye Township', x: 51, y: 64, risk: 'MEDIUM', population: 3100, needs: 'Sample supply record', status: 'Sample prepared state' },
  { id: 'sample-c5', kind: 'sample', name: 'Sample — Pyapon District', x: 73, y: 56, risk: 'LOW', population: 5400, needs: 'Sample: none', status: 'Sample state' },
  { id: 'sample-c6', kind: 'sample', name: 'Sample — Wakema', x: 19, y: 37, risk: 'LOW', population: 2800, needs: 'Sample: none', status: 'Sample state' },
]

export function buildMapCommunities(current: {
  name: string
  population: number
}): MapCommunity[] {
  return [
    {
      id: 'current',
      kind: 'current',
      name: current.name,
      x: 44,
      y: 43,
      risk: 'NOT_CALCULATED',
      population: current.population,
      needs: 'No operational requirement calculated',
      status: 'Monitoring / Prototype',
    },
    ...sampleCommunities,
  ]
}
