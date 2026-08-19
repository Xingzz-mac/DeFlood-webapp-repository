import { useEffect, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import type { AppUser } from '../App'
import { useCommunity, type CommunityData } from '../context/CommunityContext'
import { GEO_TIMEOUT_MS } from '../services/config'
import { isCurrentGpsRequestToken, nextGpsRequestToken } from '../utils/gpsRequestToken'
import { IconBuilding, IconUsers, IconTruck, IconCheckCircle, IconMap, IconRefresh } from './Icons'

interface CommunityInfoProps {
  user: AppUser
}

export default function CommunityInfo({ user: _user }: CommunityInfoProps) {
  const { community, updateCommunity } = useCommunity()
  const [saved, setSaved] = useState(false)
  const [info, setInfo] = useState<CommunityData>(community)
  const [coordinates, setCoordinates] = useState({
    latitude: String(community.latitude),
    longitude: String(community.longitude),
    source: community.locationSource,
    accuracy: community.locationAccuracy,
    updatedAt: community.locationUpdatedAt,
  })
  const [coordinateError, setCoordinateError] = useState<string | null>(null)
  const [gpsState, setGpsState] = useState<{
    status: 'idle' | 'loading' | 'success' | 'error'
    message: string | null
  }>({ status: 'idle', message: null })
  const gpsRequestTokenRef = useRef(0)

  const invalidateGpsRequest = () => {
    gpsRequestTokenRef.current = nextGpsRequestToken(gpsRequestTokenRef.current)
  }

  useEffect(() => () => {
    gpsRequestTokenRef.current = nextGpsRequestToken(gpsRequestTokenRef.current)
  }, [])

  const handleSave = (e: FormEvent) => {
    e.preventDefault()
    invalidateGpsRequest()
    const latitude = parseCoordinate(coordinates.latitude, -90, 90)
    const longitude = parseCoordinate(coordinates.longitude, -180, 180)
    if (latitude === null || longitude === null) {
      setCoordinateError(
        latitude === null
          ? 'Enter a latitude between -90 and 90.'
          : 'Enter a longitude between -180 and 180.',
      )
      return
    }

    const changed = latitude !== community.latitude
      || longitude !== community.longitude
      || coordinates.source !== community.locationSource
    const updated: CommunityData = {
      ...info,
      latitude,
      longitude,
      locationSource: coordinates.source,
      locationAccuracy: coordinates.source === 'gps' ? coordinates.accuracy : null,
      locationUpdatedAt: coordinates.source === 'gps'
        ? coordinates.updatedAt
        : changed
          ? new Date().toISOString()
          : community.locationUpdatedAt,
    }
    updateCommunity(updated)
    setInfo(updated)
    setCoordinateError(null)
    setSaved(true)
    setTimeout(() => setSaved(false), 3000)
  }

  const set = (key: keyof CommunityData, value: string | number) =>
    setInfo(i => ({ ...i, [key]: value }))

  const setManualCoordinate = (key: 'latitude' | 'longitude', value: string) => {
    invalidateGpsRequest()
    setCoordinates(current => ({
      ...current,
      [key]: value,
      source: 'manual',
      accuracy: null,
      updatedAt: null,
    }))
    setCoordinateError(null)
    setGpsState({ status: 'idle', message: null })
  }

  const useCurrentLocation = () => {
    const requestToken = nextGpsRequestToken(gpsRequestTokenRef.current)
    gpsRequestTokenRef.current = requestToken
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      setGpsState({
        status: 'error',
        message: 'Current location is not supported by this browser.',
      })
      return
    }

    setGpsState({ status: 'loading', message: 'Requesting your current location…' })
    setCoordinateError(null)
    navigator.geolocation.getCurrentPosition(
      position => {
        if (!isCurrentGpsRequestToken(gpsRequestTokenRef.current, requestToken)) return
        const latitude = position.coords.latitude
        const longitude = position.coords.longitude
        if (!Number.isFinite(latitude) || latitude < -90 || latitude > 90
          || !Number.isFinite(longitude) || longitude < -180 || longitude > 180) {
          setGpsState({ status: 'error', message: 'The browser returned invalid coordinates.' })
          return
        }
        const accuracy = Number.isFinite(position.coords.accuracy) && position.coords.accuracy >= 0
          ? position.coords.accuracy
          : null
        const updatedAt = Number.isFinite(position.timestamp)
          ? new Date(position.timestamp).toISOString()
          : new Date().toISOString()
        setCoordinates({
          latitude: String(latitude),
          longitude: String(longitude),
          source: 'gps',
          accuracy,
          updatedAt,
        })
        setGpsState({
          status: 'success',
          message: 'Location captured as a draft. Press Save Community Information to apply it.',
        })
      },
      error => {
        if (!isCurrentGpsRequestToken(gpsRequestTokenRef.current, requestToken)) return
        const message = error.code === error.PERMISSION_DENIED
          ? 'Location permission was denied. Allow access or enter coordinates manually.'
          : error.code === error.TIMEOUT
            ? 'Location request timed out. Try again or enter coordinates manually.'
            : error.code === error.POSITION_UNAVAILABLE
              ? 'Your current position is unavailable. Try again or enter coordinates manually.'
              : 'Unable to retrieve your current location.'
        setGpsState({ status: 'error', message })
      },
      { enableHighAccuracy: true, timeout: GEO_TIMEOUT_MS, maximumAge: 0 },
    )
  }

  return (
    <div className="p-4 md:p-6 max-w-4xl mx-auto">
      <div className="mb-5">
        <h1 className="text-xl md:text-2xl font-bold text-gray-900">Community Information</h1>
        <p className="text-gray-500 text-sm mt-0.5">Update community details used for source-data requests and planning prototypes</p>
      </div>

      {saved && (
        <div className="bg-green-50 border border-green-200 rounded-xl px-5 py-3 mb-4 flex items-center gap-2 text-green-800 text-sm font-medium">
          <IconCheckCircle size={16} />
          Information saved successfully
        </div>
      )}

      <form onSubmit={handleSave} className="space-y-4">
        <Section title="Community Details" icon={<IconBuilding size={17} />}>
          <div className="grid sm:grid-cols-2 gap-4">
            <TextField label="Community Name" value={info.name} onChange={v => set('name', v)} />
            <TextField label="Township" value={info.township} onChange={v => set('township', v)} />
            <TextField label="Region" value={info.region} onChange={v => set('region', v)} />
            <NumField label="Total Population" value={info.population} onChange={v => set('population', v)} />
            <NumField label="Children (under 12)" value={info.children} onChange={v => set('children', v)} />
            <NumField label="Elderly (65+)" value={info.elderly} onChange={v => set('elderly', v)} />
            <NumField label="People with Disabilities" value={info.disabled} onChange={v => set('disabled', v)} />
            <NumField label="Other Vulnerable Residents" value={info.otherVulnerable} onChange={v => set('otherVulnerable', v)} />
            <FloatField
              label="Latitude"
              value={coordinates.latitude}
              min={-90}
              max={90}
              invalid={coordinateError?.includes('latitude') ?? false}
              onChange={v => setManualCoordinate('latitude', v)}
            />
            <FloatField
              label="Longitude"
              value={coordinates.longitude}
              min={-180}
              max={180}
              invalid={coordinateError?.includes('longitude') ?? false}
              onChange={v => setManualCoordinate('longitude', v)}
            />
            <div className="sm:col-span-2 rounded-xl border border-gray-200 bg-gray-50 p-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <div className="text-sm font-medium text-gray-800">
                    Coordinate source: {coordinates.source === 'gps' ? 'GPS draft' : 'Manual'}
                  </div>
                  <div className="text-xs text-gray-500 mt-0.5">
                    {coordinates.source === 'gps' && coordinates.accuracy !== null
                      ? `Reported GPS accuracy: ±${Math.round(coordinates.accuracy)} m`
                      : 'GPS accuracy is unavailable for manually entered coordinates.'}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={useCurrentLocation}
                  disabled={gpsState.status === 'loading'}
                  className="inline-flex items-center gap-2 rounded-lg border border-blue-200 bg-blue-50 px-3.5 py-2 text-sm font-semibold text-blue-700 hover:bg-blue-100 disabled:cursor-wait disabled:opacity-60"
                >
                  {gpsState.status === 'loading'
                    ? <IconRefresh size={15} className="animate-spin" />
                    : <IconMap size={15} />}
                  {gpsState.status === 'loading' ? 'Locating…' : 'Use Current Location'}
                </button>
              </div>
              {gpsState.message && (
                <p className={`text-xs mt-3 ${gpsState.status === 'error' ? 'text-red-700' : 'text-blue-700'}`}>
                  {gpsState.message}
                </p>
              )}
              {coordinateError && <p className="text-xs text-red-700 mt-3">{coordinateError}</p>}
            </div>
          </div>
        </Section>

        <Section title="Leadership &amp; Contacts" icon={<IconUsers size={17} />}>
          <div className="grid sm:grid-cols-2 gap-4">
            <TextField label="Community Leader" value={info.leader} onChange={v => set('leader', v)} />
            <TextField label="Mayor / Local Authority" value={info.mayor} onChange={v => set('mayor', v)} />
            <TextField label="Authorised Assistant" value={info.assistant} onChange={v => set('assistant', v)} />
            <TextField label="Contact Phone" value={info.phone} onChange={v => set('phone', v)} />
          </div>
        </Section>

        <Section title="Resources" icon={<IconTruck size={17} />}>
          <div className="grid sm:grid-cols-3 gap-4">
            <NumField label="Volunteers" value={info.volunteers} onChange={v => set('volunteers', v)} />
            <NumField label="Cars / pickup trucks" value={info.cars} onChange={v => set('cars', v)} />
            <NumField label="Large trucks" value={info.trucks} onChange={v => set('trucks', v)} />
            <NumField label="Boats" value={info.boats} onChange={v => set('boats', v)} />
            <NumField label="Available shelters" value={info.shelters} onChange={v => set('shelters', v)} />
            <NumField label="Shelter capacity" value={info.shelterCapacity} onChange={v => set('shelterCapacity', v)} />
          </div>
        </Section>

        <Section title="Emergency Supplies" icon={<IconCheckCircle size={17} />}>
          <div className="grid sm:grid-cols-2 gap-4">
            {([
              { key: 'water', label: 'Drinking water' },
              { key: 'food', label: 'Food' },
              { key: 'medicine', label: 'Medicine' },
              { key: 'equipment', label: 'Emergency equipment' },
            ] as { key: keyof CommunityData; label: string }[]).map(({ key, label }) => (
              <div key={key}>
                <label className="block text-xs font-medium text-gray-600 mb-1">{label}</label>
                <select
                  value={info[key] as string}
                  onChange={e => set(key, e.target.value)}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
                >
                  <option>Adequate</option>
                  <option>Limited</option>
                  <option>Critical</option>
                  <option>None</option>
                </select>
              </div>
            ))}
          </div>
        </Section>

        <button
          type="submit"
          className="bg-[#1e3a5f] hover:bg-[#2d5282] text-white font-semibold px-8 py-3 rounded-xl text-sm transition-colors"
        >
          Save Community Information
        </button>
      </form>
    </div>
  )
}

function Section({ title, icon, children }: { title: string; icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="bg-white border border-gray-200 rounded-2xl p-5">
      <div className="flex items-center gap-2 mb-4 font-semibold text-sm text-gray-800">
        <span className="text-[#1e3a5f]">{icon}</span>
        {title}
      </div>
      {children}
    </div>
  )
}

function TextField({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <div>
      <label className="block text-xs font-medium text-gray-600 mb-1">{label}</label>
      <input
        type="text"
        value={value}
        onChange={e => onChange(e.target.value)}
        className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
      />
    </div>
  )
}

function NumField({ label, value, onChange }: { label: string; value: number; onChange: (v: number) => void }) {
  return (
    <div>
      <label className="block text-xs font-medium text-gray-600 mb-1">{label}</label>
      <input
        type="number"
        value={value}
        onChange={e => onChange(Math.max(0, Number(e.target.value)))}
        min={0}
        className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-blue-500"
      />
    </div>
  )
}

function parseCoordinate(value: string, min: number, max: number): number | null {
  if (value.trim() === '') return null
  const parsed = Number(value)
  return Number.isFinite(parsed) && parsed >= min && parsed <= max ? parsed : null
}

function FloatField({ label, value, min, max, invalid, onChange }: {
  label: string
  value: string
  min: number
  max: number
  invalid: boolean
  onChange: (v: string) => void
}) {
  return (
    <div>
      <label className="block text-xs font-medium text-gray-600 mb-1">{label}</label>
      <input
        type="number"
        step="any"
        value={value}
        min={min}
        max={max}
        aria-invalid={invalid}
        onChange={e => onChange(e.target.value)}
        className={`w-full border rounded-lg px-3 py-2.5 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-blue-500 ${
          invalid ? 'border-red-400' : 'border-gray-300'
        }`}
      />
    </div>
  )
}
