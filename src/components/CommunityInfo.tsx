import { useState } from 'react'
import type { FormEvent } from 'react'
import type { AppUser } from '../App'
import { useCommunity, type CommunityData } from '../context/CommunityContext'
import { IconBuilding, IconUsers, IconTruck, IconCheckCircle } from './Icons'

interface CommunityInfoProps {
  user: AppUser
}

export default function CommunityInfo({ user: _user }: CommunityInfoProps) {
  const { community, updateCommunity } = useCommunity()
  const [saved, setSaved] = useState(false)
  const [info, setInfo] = useState<CommunityData>(community)

  const handleSave = (e: FormEvent) => {
    e.preventDefault()
    updateCommunity(info)
    setSaved(true)
    setTimeout(() => setSaved(false), 3000)
  }

  const set = (key: keyof CommunityData, value: string | number) =>
    setInfo(i => ({ ...i, [key]: value }))

  return (
    <div className="p-4 md:p-6 max-w-4xl mx-auto">
      <div className="mb-5">
        <h1 className="text-xl md:text-2xl font-bold text-gray-900">Community Information</h1>
        <p className="text-gray-500 text-sm mt-0.5">Update community details used in risk assessment and planning</p>
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
            <FloatField label="Latitude" value={info.latitude} onChange={v => set('latitude', v)} />
            <FloatField label="Longitude" value={info.longitude} onChange={v => set('longitude', v)} />
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

function FloatField({ label, value, onChange }: { label: string; value: number; onChange: (v: number) => void }) {
  return (
    <div>
      <label className="block text-xs font-medium text-gray-600 mb-1">{label}</label>
      <input
        type="number"
        step="any"
        value={value}
        onChange={e => onChange(Number(e.target.value))}
        className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-blue-500"
      />
    </div>
  )
}
