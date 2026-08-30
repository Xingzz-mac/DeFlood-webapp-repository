import { useEffect, useRef, useState } from 'react'
import {
  Circle,
  CircleMarker,
  MapContainer,
  Polyline,
  Popup,
  TileLayer,
  Tooltip,
  useMap,
} from 'react-leaflet'
import { GEO_TIMEOUT_MS } from '../services/config'
import type { GeographicCoordinate } from '../services/types'
import type { FloodMapViewModel } from './floodMapData'
import {
  FLOOD_MAP_CONTAINER_CLASS,
  FLOOD_MAP_ZOOM,
  OPENSTREETMAP_ATTRIBUTION,
  OPENSTREETMAP_TILE_URL,
} from './floodMapConfig'

export interface FloodMapLayerVisibility {
  community: boolean
  riverPoint: boolean
  searchRadius: boolean
  evidenceLine: boolean
}

export interface MapDeviceLocation {
  coordinate: GeographicCoordinate
  accuracy: number | null
}

interface GeographicEvidenceMapProps {
  model: FloodMapViewModel
  communityName: string
  locationSource: 'manual' | 'gps'
  layers: FloodMapLayerVisibility
  deviceLocation: MapDeviceLocation | null
  onDeviceLocationChange: (location: MapDeviceLocation) => void
}

function latLng(coordinate: GeographicCoordinate): [number, number] {
  return [coordinate.latitude, coordinate.longitude]
}

function RecenterMap({ coordinate }: { coordinate: GeographicCoordinate }) {
  const map = useMap()
  useEffect(() => {
    map.setView(latLng(coordinate), FLOOD_MAP_ZOOM)
  }, [coordinate.latitude, coordinate.longitude, map])
  return null
}

type LocationStatus =
  | { state: 'idle'; message: null }
  | { state: 'loading' | 'success' | 'error'; message: string }

function locationErrorMessage(error: GeolocationPositionError): string {
  if (error.code === error.PERMISSION_DENIED) return 'Location permission was not granted.'
  if (error.code === error.TIMEOUT) return 'The device location request timed out.'
  return 'Your current device location could not be determined.'
}

function MapLocationControls({
  communityCoordinate,
  onDeviceLocationChange,
}: {
  communityCoordinate: GeographicCoordinate
  onDeviceLocationChange: (location: MapDeviceLocation) => void
}) {
  const map = useMap()
  const requestId = useRef(0)
  const [status, setStatus] = useState<LocationStatus>({ state: 'idle', message: null })

  const centerOnDevice = () => {
    const currentRequestId = ++requestId.current
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      setStatus({ state: 'error', message: 'Current device location is not supported by this browser.' })
      return
    }

    setStatus({ state: 'loading', message: 'Finding your current device location…' })
    navigator.geolocation.getCurrentPosition(
      position => {
        if (requestId.current !== currentRequestId) return
        const coordinate = {
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
        }
        if (!Number.isFinite(coordinate.latitude)
          || coordinate.latitude < -90
          || coordinate.latitude > 90
          || !Number.isFinite(coordinate.longitude)
          || coordinate.longitude < -180
          || coordinate.longitude > 180) {
          setStatus({ state: 'error', message: 'Your current device location could not be determined.' })
          return
        }
        const accuracy = Number.isFinite(position.coords.accuracy) && position.coords.accuracy >= 0
          ? position.coords.accuracy
          : null
        onDeviceLocationChange({ coordinate, accuracy })
        map.flyTo(latLng(coordinate), FLOOD_MAP_ZOOM, { animate: true, duration: 0.75 })
        setStatus({
          state: 'success',
          message: 'Your current device location is shown for map navigation only. The saved assessment location remains unchanged.',
        })
      },
      error => {
        if (requestId.current !== currentRequestId) return
        setStatus({ state: 'error', message: locationErrorMessage(error) })
      },
      { enableHighAccuracy: true, timeout: GEO_TIMEOUT_MS, maximumAge: 0 },
    )
  }

  const centerOnCommunity = () => {
    requestId.current += 1
    map.flyTo(latLng(communityCoordinate), FLOOD_MAP_ZOOM, { animate: true, duration: 0.75 })
    setStatus({ state: 'idle', message: null })
  }

  return (
    <div className="leaflet-top leaflet-right">
      <div
        className="leaflet-control m-3 max-w-[min(18rem,calc(100vw-5rem))] rounded-xl border border-slate-200 bg-white/95 p-2 shadow-md backdrop-blur"
        onMouseDown={event => event.stopPropagation()}
        onDoubleClick={event => event.stopPropagation()}
      >
        <div className="flex gap-1.5">
          <button
            type="button"
            onClick={centerOnDevice}
            disabled={status.state === 'loading'}
            className="min-h-9 flex-1 rounded-lg bg-blue-700 px-2.5 py-1.5 text-xs font-semibold text-white hover:bg-blue-800 disabled:cursor-wait disabled:opacity-70"
            aria-label="Center map on my current device location"
            title="Center map on my current device location"
          >
            <span aria-hidden="true">📍</span> {status.state === 'loading' ? 'Locating…' : 'My location'}
          </button>
          <button
            type="button"
            onClick={centerOnCommunity}
            className="min-h-9 flex-1 rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-800 hover:bg-slate-50"
            aria-label="Return map to saved assessment location"
            title="Return map to saved assessment location"
          >
            <span aria-hidden="true">🏠</span> Assessment location
          </button>
        </div>
        {status.message && (
          <p
            className={`mt-2 text-[11px] leading-snug ${status.state === 'error' ? 'text-red-700' : 'text-slate-600'}`}
            role="status"
            aria-live="polite"
          >
            {status.message}
          </p>
        )}
      </div>
    </div>
  )
}

export default function GeographicEvidenceMap({
  model,
  communityName,
  locationSource,
  layers,
  deviceLocation,
  onDeviceLocationChange,
}: GeographicEvidenceMapProps) {
  if (!model.center || !model.communityPoint) return null
  const center = latLng(model.center)

  return (
    <MapContainer
      center={center}
      zoom={FLOOD_MAP_ZOOM}
      scrollWheelZoom
      className={FLOOD_MAP_CONTAINER_CLASS}
      aria-label="Interactive flood evidence map centered on the saved assessment coordinates"
    >
      <RecenterMap coordinate={model.center} />
      <MapLocationControls
        communityCoordinate={model.center}
        onDeviceLocationChange={onDeviceLocationChange}
      />
      <TileLayer
        url={OPENSTREETMAP_TILE_URL}
        attribution={OPENSTREETMAP_ATTRIBUTION}
        maxZoom={19}
      />

      {layers.searchRadius && (
        <Circle
          center={center}
          radius={model.searchRadiusKm * 1000}
          pathOptions={{ color: '#64748b', weight: 2, dashArray: '7 7', fill: false }}
        >
          <Tooltip>River-data search radius — not flood extent or an evacuation zone</Tooltip>
        </Circle>
      )}

      {layers.evidenceLine && model.evidenceLine && (
        <Polyline
          positions={model.evidenceLine.map(latLng)}
          pathOptions={{ color: '#7c3aed', weight: 3, dashArray: '6 6' }}
        >
          <Tooltip>Distance to modeled river evidence — not a route, river course, or flood path</Tooltip>
        </Polyline>
      )}

      {layers.community && (
        <CircleMarker
          center={latLng(model.communityPoint.coordinate)}
          radius={9}
          pathOptions={{ color: '#ffffff', weight: 3, fillColor: '#1e3a5f', fillOpacity: 1 }}
        >
          <Tooltip permanent direction="top" offset={[0, -8]}>Assessment location</Tooltip>
          <Popup>
            <strong>Assessment location</strong><br />
            {communityName}<br />
            Latitude: {model.communityPoint.coordinate.latitude.toFixed(5)}<br />
            Longitude: {model.communityPoint.coordinate.longitude.toFixed(5)}<br />
            Location source: {locationSource === 'gps' ? 'GPS' : 'Manual'}
          </Popup>
        </CircleMarker>
      )}

      {deviceLocation && (
        <>
          {deviceLocation.accuracy !== null && (
            <Circle
              center={latLng(deviceLocation.coordinate)}
              radius={deviceLocation.accuracy}
              pathOptions={{ color: '#2563eb', weight: 1, fillColor: '#60a5fa', fillOpacity: 0.12 }}
            />
          )}
          <CircleMarker
            center={latLng(deviceLocation.coordinate)}
            radius={7}
            pathOptions={{ color: '#ffffff', weight: 3, fillColor: '#2563eb', fillOpacity: 1 }}
          >
            <Tooltip direction="bottom" offset={[0, 7]}>Your current device location</Tooltip>
            <Popup>
              <strong>Your current device location</strong><br />
              Map navigation only. The saved assessment location remains unchanged.
              {deviceLocation.accuracy !== null && <><br />Reported accuracy: ±{Math.round(deviceLocation.accuracy)} m</>}
            </Popup>
          </CircleMarker>
        </>
      )}

      {layers.riverPoint && model.riverPoint && (
        <CircleMarker
          center={latLng(model.riverPoint.coordinate)}
          radius={8}
          pathOptions={{ color: '#ffffff', weight: 3, fillColor: '#0891b2', fillOpacity: 1 }}
        >
          <Tooltip direction="top" offset={[0, -7]}>GloFAS modeled river point</Tooltip>
          <Popup>
            <strong>GloFAS modeled river point</strong><br />
            {model.riverPoint.provenanceText}<br />
            Modeled discharge grid point — not a gauge, sensor, or observed station.
          </Popup>
        </CircleMarker>
      )}
    </MapContainer>
  )
}
