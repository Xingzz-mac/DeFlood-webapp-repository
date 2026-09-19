import { useEffect } from 'react'
import { divIcon } from 'leaflet'
import { MapContainer, Marker, Popup, TileLayer, useMap } from 'react-leaflet'
import { OPENSTREETMAP_ATTRIBUTION, OPENSTREETMAP_TILE_URL } from './floodMapConfig'
import { SUPPORT_STATUS_COLORS, supportRequestLocation, supportRequestStatusLabel, type SupportRequest } from '../services/supportNetwork'

function FitRequests({ points }: { points: [number, number][] }) {
  const map = useMap()
  const coordinates = JSON.stringify(points)
  useEffect(() => {
    map.invalidateSize()
    if (points.length) map.fitBounds(points, { padding: [40, 40], maxZoom: 13 })
  }, [map, coordinates])
  return null
}

export default function SupportRequestsMap({ requests, onOpen, showResolved = false }: { requests: SupportRequest[]; onOpen: (id: string) => void; showResolved?: boolean }) {
  const visible = requests.filter(request => !request.archivedAt && (request.status !== 'RESOLVED' || showResolved)).sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt))
  const groups = new Map<string, { point: [number, number]; requests: SupportRequest[] }>()
  for (const request of visible) {
    const location = supportRequestLocation(request)
    if (!location) continue
    const key = `${location.latitude},${location.longitude}`
    const group = groups.get(key) ?? { point: [location.latitude, location.longitude], requests: [] }
    group.requests.push(request)
    groups.set(key, group)
  }
  return <section aria-label="Support request map" className="space-y-3">
    {!groups.size && <p className="rounded-xl border border-dashed p-4 text-sm text-gray-600">No located requests match these filters. Check the request list for records without coordinates.</p>}
    <div className="relative isolate overflow-hidden rounded-xl border border-gray-200">
      <MapContainer center={[16.5, 95]} zoom={7} scrollWheelZoom={false} className="h-[55dvh] min-h-64 w-full">
        <TileLayer attribution={OPENSTREETMAP_ATTRIBUTION} url={OPENSTREETMAP_TILE_URL} />
        <FitRequests points={[...groups.values()].map(group => group.point)} />
        {[...groups.entries()].map(([key, group]) => {
          const newest = group.requests.find(request => request.status !== 'RESOLVED') ?? group.requests[0]
          const label = `${newest.status === 'RESOLVED' ? '✓ RESOLVED' : 'HELP'} ${group.requests.length > 1 ? group.requests.length : ''}`.trim()
          return <Marker key={key} position={group.point} title={`${label}: ${supportRequestStatusLabel(newest.status)}`} icon={divIcon({
            className: 'support-help-pin',
            html: `<div style="background:${SUPPORT_STATUS_COLORS[newest.status]};color:white;border:2px solid white;border-radius:6px;box-shadow:0 1px 5px #334155;font:bold 11px sans-serif;padding:6px 3px;text-align:center;opacity:${newest.status === 'RESOLVED' ? '.7' : '1'}">${label}</div>`,
            iconSize: [newest.status === 'RESOLVED' ? 100 : 52, 30], iconAnchor: [newest.status === 'RESOLVED' ? 50 : 26, 30],
          })}>
            <Popup><div className="max-h-72 space-y-3 overflow-y-auto">
              {group.requests.map(request => <div key={request.id} className="border-b pb-2">
                <strong>{request.community.name}</strong>
                <p>{request.community.township}, {request.community.region} · {group.point.join(', ')}</p>
                <p>{request.assistanceCategories.join(', ')} · {supportRequestStatusLabel(request.status)}</p>
                <p>People: {request.assistancePeople?.total ?? 'Not recorded'} · Elderly: {request.assistancePeople?.elderly ?? 'Not recorded'} · Children: {request.assistancePeople?.children ?? 'Not recorded'} · Disabilities: {request.assistancePeople?.disabled ?? 'Not recorded'}</p>
                <p>Risk at submission: {request.riskLevel ?? 'Unavailable'}</p>
                <p>{request.note}</p>
                <button type="button" className="font-semibold text-blue-700" onClick={() => onOpen(request.id)}>Open request</button>
              </div>)}
            </div></Popup>
          </Marker>
        })}
      </MapContainer>
    </div>
    <div className="flex flex-wrap gap-3 text-xs" aria-label="Help pin legend">
      {(['PENDING', 'ACCEPTED', 'IN_PROGRESS', ...(showResolved ? ['RESOLVED' as const] : [])] as const).map(status => <span key={status}><span style={{ background: SUPPORT_STATUS_COLORS[status] }} className="mr-1 inline-block rounded px-1.5 py-1 font-bold text-white">{status === 'RESOLVED' ? '✓ RESOLVED' : 'HELP'}</span>{supportRequestStatusLabel(status)}</span>)}
    </div>
    <p className="text-xs text-gray-500">Only active requests appear by default. Select the Resolved status filter to show completed pins; archived requests are list-only history. HELP badges show request status, not flood hazard. Co-located requests share a badge prioritizing the newest active request; open it to inspect every visible request. {visible.filter(request => !supportRequestLocation(request)).length} requests have no valid location and remain in the list.</p>
  </section>
}
