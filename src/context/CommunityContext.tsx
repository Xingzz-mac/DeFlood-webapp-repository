import { createContext, useContext, useState, useEffect, type ReactNode } from 'react'

export interface CommunityData {
  name: string
  township: string
  region: string
  population: number
  children: number
  elderly: number
  disabled: number
  otherVulnerable: number
  leader: string
  mayor: string
  assistant: string
  phone: string
  volunteers: number
  cars: number
  trucks: number
  boats: number
  shelters: number
  shelterCapacity: number
  water: string
  food: string
  medicine: string
  equipment: string
  latitude: number
  longitude: number
  locationSource: 'manual' | 'gps'
  locationAccuracy: number | null
  locationUpdatedAt: string | null
}

const defaultData: CommunityData = {
  name: 'Ayeyarwady Delta Zone 3',
  township: 'Labutta Township',
  region: 'Ayeyarwady Region',
  population: 2340,
  children: 420,
  elderly: 310,
  disabled: 95,
  otherVulnerable: 180,
  leader: 'U Kyaw Zin',
  mayor: 'Daw Aye Myint',
  assistant: 'Ko Aung Thu',
  phone: '+95 9 765 432 100',
  volunteers: 45,
  cars: 18,
  trucks: 6,
  boats: 12,
  shelters: 3,
  shelterCapacity: 1800,
  water: 'Adequate',
  food: 'Limited',
  medicine: 'Adequate',
  equipment: 'Adequate',
  latitude: 16.5,
  longitude: 95.0,
  locationSource: 'manual',
  locationAccuracy: null,
  locationUpdatedAt: null,
}

function migrate(stored: unknown): CommunityData {
  const saved = stored && typeof stored === 'object'
    ? stored as Record<string, unknown>
    : {}

  const savedString = (key: keyof CommunityData, fallback: string) =>
    typeof saved[key] === 'string' ? saved[key] as string : fallback
  const savedCount = (key: keyof CommunityData, fallback: number) => {
    const value = saved[key]
    return typeof value === 'number' && Number.isFinite(value) && value >= 0
      ? value
      : fallback
  }
  const savedCoordinate = (key: 'latitude' | 'longitude', fallback: number, min: number, max: number) => {
    const value = saved[key]
    return typeof value === 'number' && Number.isFinite(value) && value >= min && value <= max
      ? value
      : fallback
  }

  const latitude = savedCoordinate('latitude', defaultData.latitude, -90, 90)
  const longitude = savedCoordinate('longitude', defaultData.longitude, -180, 180)
  const locationSource = saved.locationSource === 'gps' ? 'gps' : 'manual'
  const savedAccuracy = saved.locationAccuracy
  const locationAccuracy = locationSource === 'gps'
    && typeof savedAccuracy === 'number'
    && Number.isFinite(savedAccuracy)
    && savedAccuracy >= 0
    ? savedAccuracy
    : null
  const savedUpdatedAt = saved.locationUpdatedAt
  const locationUpdatedAt = typeof savedUpdatedAt === 'string'
    && Number.isFinite(Date.parse(savedUpdatedAt))
    ? savedUpdatedAt
    : null

  return {
    name: savedString('name', defaultData.name),
    township: savedString('township', defaultData.township),
    region: savedString('region', defaultData.region),
    population: savedCount('population', defaultData.population),
    children: savedCount('children', defaultData.children),
    elderly: savedCount('elderly', defaultData.elderly),
    disabled: savedCount('disabled', defaultData.disabled),
    otherVulnerable: savedCount('otherVulnerable', defaultData.otherVulnerable),
    leader: savedString('leader', defaultData.leader),
    mayor: savedString('mayor', defaultData.mayor),
    assistant: savedString('assistant', defaultData.assistant),
    phone: savedString('phone', defaultData.phone),
    volunteers: savedCount('volunteers', defaultData.volunteers),
    cars: savedCount('cars', defaultData.cars),
    trucks: savedCount('trucks', defaultData.trucks),
    boats: savedCount('boats', defaultData.boats),
    shelters: savedCount('shelters', defaultData.shelters),
    shelterCapacity: savedCount('shelterCapacity', defaultData.shelterCapacity),
    water: savedString('water', defaultData.water),
    food: savedString('food', defaultData.food),
    medicine: savedString('medicine', defaultData.medicine),
    equipment: savedString('equipment', defaultData.equipment),
    latitude,
    longitude,
    locationSource,
    locationAccuracy,
    locationUpdatedAt,
  }
}

interface CommunityContextValue {
  community: CommunityData
  updateCommunity: (data: CommunityData) => void
  setName: (name: string) => void
}

const CommunityContext = createContext<CommunityContextValue | null>(null)
const STORAGE_KEY = 'deflood-community-data'

export function CommunityProvider({ children }: { children: ReactNode }) {
  const [community, setCommunity] = useState<CommunityData>(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY)
      if (stored) return migrate(JSON.parse(stored))
    } catch {
      // fall through to default
    }
    return defaultData
  })

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(community))
    } catch {
      // ignore write errors
    }
  }, [community])

  const updateCommunity = (data: CommunityData) => setCommunity(migrate(data))
  const setName = (name: string) => setCommunity(c => ({ ...c, name }))

  return (
    <CommunityContext.Provider value={{ community, updateCommunity, setName }}>
      {children}
    </CommunityContext.Provider>
  )
}

export function useCommunity() {
  const ctx = useContext(CommunityContext)
  if (!ctx) throw new Error('useCommunity must be used within CommunityProvider')
  return ctx
}
