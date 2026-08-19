import { useState } from 'react'
import { useCommunity } from '../context/CommunityContext'
import { buildMapCommunities, type MapRisk } from './floodMapData'
import RiskBadge from './RiskBadge'

const riskFill: Record<MapRisk, string> = {
  LOW: '#16a34a',
  MEDIUM: '#d97706',
  HIGH: '#dc2626',
  NOT_CALCULATED: '#2563eb',
}

export default function FloodMap() {
  const { community: shared } = useCommunity()
  const communities = buildMapCommunities(shared)
  const [selectedId, setSelectedId] = useState('current')
  const selected = communities.find(community => community.id === selectedId) ?? communities[0]

  return (
    <div className="p-4 md:p-6 max-w-5xl mx-auto">
      <div className="mb-5">
        <h1 className="text-xl md:text-2xl font-bold text-gray-900">Community Flood Map</h1>
        <p className="text-gray-500 text-sm mt-0.5">Prototype map — only the blue marker represents the saved current community</p>
        <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-4 py-2 text-xs text-amber-800">
          All other communities, risk colors, shelters, and flood overlays are clearly marked sample data and are not live.
        </div>
      </div>

      <div className="grid md:grid-cols-3 gap-4">
        {/* Map SVG */}
        <div className="md:col-span-2 bg-white border border-gray-200 rounded-2xl overflow-hidden">
          <div className="relative" style={{ paddingBottom: '58%' }}>
            <svg
              className="absolute inset-0 w-full h-full cursor-pointer"
              viewBox="0 0 100 75"
              preserveAspectRatio="xMidYMid meet"
            >
              {/* Sky/land background */}
              <rect width="100" height="75" fill="#f0f7ef" />

              {/* Water — Ayeyarwady delta */}
              <path
                d="M 0 35 Q 12 32 22 38 Q 32 44 38 52 Q 44 60 54 67 Q 65 72 80 70 L 100 68 L 100 75 L 0 75 Z"
                fill="#bfdbfe" opacity="0.6"
              />
              {/* Main river channel */}
              <path d="M 38 0 Q 40 12 42 22 Q 44 32 46 44 Q 48 56 50 67" stroke="#93c5fd" strokeWidth="2.5" fill="none" />
              {/* Tributary */}
              <path d="M 0 48 Q 12 46 24 48 Q 32 50 38 48" stroke="#93c5fd" strokeWidth="1.5" fill="none" />
              {/* Secondary channel */}
              <path d="M 50 20 Q 58 24 66 22 Q 72 20 78 24" stroke="#93c5fd" strokeWidth="1" fill="none" opacity="0.6" />

              {/* Flood risk zones (semi-transparent overlay) */}
              <ellipse cx="38" cy="52" rx="16" ry="10" fill="#fca5a5" opacity="0.2" />
              <ellipse cx="28" cy="57" rx="12" ry="8" fill="#fca5a5" opacity="0.18" />

              {/* Roads */}
              <path d="M 8 62 L 92 62" stroke="#d1d5db" strokeWidth="0.6" strokeDasharray="2,1.5" />
              <path d="M 44 5 L 44 70" stroke="#d1d5db" strokeWidth="0.6" strokeDasharray="2,1.5" />

              {/* Shelter markers */}
              <rect x="42" y="18" width="5" height="4" rx="0.5" fill="#1e3a5f" opacity="0.75" />
              <text x="48.5" y="21.5" fontSize="2.8" fill="#1e3a5f" fontFamily="system-ui" opacity="0.8" fontWeight="600">Shelter A</text>
              <rect x="64" y="48" width="5" height="4" rx="0.5" fill="#1e3a5f" opacity="0.75" />
              <text x="70" y="51.5" fontSize="2.8" fill="#1e3a5f" fontFamily="system-ui" opacity="0.8" fontWeight="600">Shelter B</text>

              {/* Community markers */}
              {communities.map(c => {
                const isSelected = selectedId === c.id
                const r = c.risk === 'HIGH' ? 3.8 : 2.8
                return (
                  <g key={c.id} onClick={() => setSelectedId(c.id)}>
                    {isSelected && (
                      <circle cx={c.x} cy={c.y} r={r + 3.5} fill={riskFill[c.risk]} opacity="0.15" />
                    )}
                    <circle
                      cx={c.x} cy={c.y} r={r}
                      fill={riskFill[c.risk]}
                      stroke="white"
                      strokeWidth="1.2"
                    />
                    {c.kind === 'sample' && c.risk === 'HIGH' && (
                      <text x={c.x} y={c.y + 0.5} textAnchor="middle" fontSize="2.5" fill="white" fontWeight="700" fontFamily="system-ui">!</text>
                    )}
                    <text
                      x={c.x + r + 1.5} y={c.y + 1}
                      fontSize="2.6" fill="#111827"
                      fontFamily="system-ui" fontWeight={isSelected ? '700' : '500'}
                    >
                      {c.name.split(' ').slice(0, 2).join(' ')}
                    </text>
                  </g>
                )
              })}
            </svg>
          </div>

          {/* Legend */}
          <div className="px-5 py-3 border-t border-gray-100 flex flex-wrap gap-4 text-xs text-gray-600">
            <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-full bg-blue-600 inline-block" /> Current community — risk not calculated</span>
            <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-full bg-red-600 inline-block" /> Sample high</span>
            <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-full bg-amber-500 inline-block" /> Sample medium</span>
            <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-full bg-green-600 inline-block" /> Sample low</span>
            <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded bg-[#1e3a5f] inline-block" /> Sample shelter</span>
            <span className="flex items-center gap-1.5"><span className="w-5 h-2.5 bg-blue-200 rounded-sm inline-block" /> Sample flood overlay</span>
          </div>
        </div>

        {/* Info panel */}
        <div className="space-y-3">
          {/* Selected community */}
          <div className="bg-white border border-gray-200 rounded-2xl p-5">
            <div className="flex items-start justify-between gap-2 mb-3">
              <h2 className="font-bold text-gray-900 text-sm leading-tight">{selected.name}</h2>
              {selected.kind === 'sample' ? (
                <RiskBadge level={selected.risk as 'LOW' | 'MEDIUM' | 'HIGH'} size="sm" />
              ) : (
                <span className="rounded bg-blue-50 px-2 py-0.5 text-xs font-semibold text-blue-700">Risk not calculated</span>
              )}
            </div>
            <div className="space-y-2 text-sm mb-4">
              <InfoRow label="Population" value={selected.population.toLocaleString()} />
              <InfoRow label={selected.kind === 'sample' ? 'Sample Needs' : 'Operational Needs'} value={selected.needs} />
              <InfoRow label="Status" value={selected.status} />
            </div>
            <div className="border-t border-gray-100 pt-3">
              <p className="text-xs text-gray-400 mb-2 font-medium uppercase tracking-wide">All Communities</p>
              <div className="space-y-1">
                {communities.map(c => (
                  <button
                    key={c.id}
                    onClick={() => setSelectedId(c.id)}
                    className={`w-full text-left px-3 py-2 rounded-lg text-xs flex items-center gap-2 transition-colors ${selectedId === c.id ? 'bg-blue-50 text-blue-800 font-semibold' : 'hover:bg-gray-50 text-gray-700'}`}
                  >
                    <span className="w-2 h-2 rounded-full shrink-0" style={{ background: riskFill[c.risk] }} />
                    <span className="truncate">{c.name}</span>
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-2">
      <span className="text-gray-500 shrink-0">{label}</span>
      <span className="font-medium text-gray-900 text-right">{value}</span>
    </div>
  )
}
