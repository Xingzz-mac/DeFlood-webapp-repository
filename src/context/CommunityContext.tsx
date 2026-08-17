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
      if (stored) return { ...defaultData, ...JSON.parse(stored) }
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

  const updateCommunity = (data: CommunityData) => setCommunity(data)
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
