import { useState } from 'react'
import type { ReactNode, FormEvent } from 'react'
import type { Section } from '../App'
import { useCommunity } from '../context/CommunityContext'
import { IconUsers, IconTruck, IconAlertTriangle, IconCheckCircle } from './Icons'

interface EvacuationPlannerProps {
  onNavigate: (s: Section) => void
}

export default function EvacuationPlanner({ onNavigate: _onNavigate }: EvacuationPlannerProps) {
  const { community } = useCommunity()
  const [pop, setPop] = useState({
    total: community.population,
    children: community.children,
    elderly: community.elderly,
    disabled: community.disabled,
    other: community.otherVulnerable,
  })
  const [res, setRes] = useState({
    volunteers: community.volunteers,
    cars: community.cars,
    trucks: community.trucks,
    boats: community.boats,
    shelters: community.shelters,
    capacity: community.shelterCapacity,
  })
  const [sup, setSup] = useState({
    water: community.water,
    food: community.food,
    medicine: community.medicine,
    equipment: community.equipment,
  })
  const [generated, setGenerated] = useState(false)

  const vulnerableTotal = pop.children + pop.elderly + pop.disabled + pop.other
  const capacityDifference = res.capacity - pop.total

  const handleGenerate = (e: FormEvent) => {
    e.preventDefault()
    setGenerated(true)
  }

  return (
    <div className="p-4 md:p-6 max-w-5xl mx-auto">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-5">
        <div>
          <h1 className="text-xl md:text-2xl font-bold text-gray-900">Evacuation Planner</h1>
          <p className="text-gray-500 text-sm mt-0.5">{community.name}</p>
        </div>
        <div className="flex items-center gap-2 bg-gray-50 border border-gray-200 rounded-lg px-4 py-2 text-sm text-gray-700 font-semibold">
          <IconAlertTriangle size={15} />
          Evacuation planning prototype — operational recommendations are not enabled yet.
        </div>
      </div>

      <div className="grid md:grid-cols-2 gap-5">
        {/* Left: Input form */}
        <form onSubmit={handleGenerate} className="space-y-4">
          <FormCard title="Population" icon={<IconUsers size={17} />}>
            <NumField label="Total residents" value={pop.total} onChange={v => setPop(p => ({ ...p, total: v }))} />
            <NumField label="Children (under 12)" value={pop.children} onChange={v => setPop(p => ({ ...p, children: v }))} />
            <NumField label="Elderly (65+)" value={pop.elderly} onChange={v => setPop(p => ({ ...p, elderly: v }))} />
            <NumField label="People with disabilities" value={pop.disabled} onChange={v => setPop(p => ({ ...p, disabled: v }))} />
            <NumField label="Other vulnerable residents" value={pop.other} onChange={v => setPop(p => ({ ...p, other: v }))} />
          </FormCard>

          <FormCard title="Available Resources" icon={<IconTruck size={17} />}>
            <NumField label="Volunteers" value={res.volunteers} onChange={v => setRes(r => ({ ...r, volunteers: v }))} />
            <NumField label="Cars / pickup trucks" value={res.cars} onChange={v => setRes(r => ({ ...r, cars: v }))} />
            <NumField label="Trucks / large vehicles" value={res.trucks} onChange={v => setRes(r => ({ ...r, trucks: v }))} />
            <NumField label="Boats" value={res.boats} onChange={v => setRes(r => ({ ...r, boats: v }))} />
            <NumField label="Available shelters" value={res.shelters} onChange={v => setRes(r => ({ ...r, shelters: v }))} />
            <NumField label="Total shelter capacity" value={res.capacity} onChange={v => setRes(r => ({ ...r, capacity: v }))} />
          </FormCard>

          <FormCard title="Supplies" icon={<IconCheckCircle size={17} />}>
            {(['water', 'food', 'medicine', 'equipment'] as const).map(key => {
              const labels = { water: 'Drinking water', food: 'Food', medicine: 'Medicine', equipment: 'Emergency equipment' }
              return (
                <div key={key} className="flex items-center justify-between gap-3">
                  <label className="text-sm text-gray-700">{labels[key]}</label>
                  <select
                    value={sup[key]}
                    onChange={e => setSup(s => ({ ...s, [key]: e.target.value }))}
                    className="border border-gray-300 rounded-lg px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
                  >
                    <option>Adequate</option>
                    <option>Limited</option>
                    <option>Critical</option>
                    <option>None</option>
                  </select>
                </div>
              )
            })}
          </FormCard>

          <button
            type="submit"
            className="w-full bg-[#1e3a5f] hover:bg-[#2d5282] text-white font-semibold py-3 rounded-xl text-sm transition-colors"
          >
            Review Prototype Inputs
          </button>
        </form>

        {/* Right: non-operational prototype summary */}
        <div>
          {generated ? (
            <div className="bg-white border border-gray-200 rounded-2xl p-5 space-y-3">
              <div className="flex items-center gap-2 pb-3 border-b border-gray-100">
                <IconCheckCircle size={19} className="text-blue-600" />
                <h2 className="font-bold text-gray-900">Prototype Planning Summary</h2>
              </div>
              <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
                This summary only echoes planning inputs. It does not decide whether, when, where, or how anyone should evacuate.
              </div>
              <div className="space-y-2 rounded-xl bg-gray-50 p-4 text-sm">
                <SummaryRow label="Saved residents" value={pop.total.toLocaleString()} />
                <SummaryRow label="Vulnerable residents recorded" value={vulnerableTotal.toLocaleString()} />
                <SummaryRow label="Volunteers recorded" value={res.volunteers.toLocaleString()} />
                <SummaryRow label="Vehicles recorded" value={(res.cars + res.trucks).toLocaleString()} />
                <SummaryRow label="Boats recorded" value={res.boats.toLocaleString()} />
                <SummaryRow label="Shelters recorded" value={res.shelters.toLocaleString()} />
                <SummaryRow label="Shelter capacity difference" value={capacityDifference.toLocaleString()} />
              </div>
              <div className="rounded-xl border border-gray-200 p-4 text-sm text-gray-600">
                Supply entries: water {sup.water.toLowerCase()}, food {sup.food.toLowerCase()}, medicine {sup.medicine.toLowerCase()}, equipment {sup.equipment.toLowerCase()}.
              </div>
            </div>
          ) : (
            <div className="bg-gray-50 border-2 border-dashed border-gray-200 rounded-2xl p-10 text-center">
              <IconTruck size={40} className="mx-auto mb-3 text-gray-300" />
              <p className="text-sm text-gray-400 leading-relaxed">
                Review the saved resource inputs and click<br />
                <strong className="text-gray-500">Review Prototype Inputs</strong>
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function FormCard({ title, icon, children }: { title: string; icon: ReactNode; children: ReactNode }) {
  return (
    <div className="bg-white border border-gray-200 rounded-xl p-4">
      <div className="flex items-center gap-2 mb-3 font-semibold text-sm text-gray-800">
        <span className="text-[#1e3a5f]">{icon}</span>
        {title}
      </div>
      <div className="space-y-2.5">{children}</div>
    </div>
  )
}

function NumField({ label, value, onChange }: { label: string; value: number; onChange: (v: number) => void }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <label className="text-sm text-gray-600 flex-1 leading-tight">{label}</label>
      <input
        type="number"
        value={value}
        onChange={e => onChange(Math.max(0, Number(e.target.value)))}
        className="w-24 border border-gray-300 rounded-lg px-2.5 py-1.5 text-sm font-mono text-right focus:outline-none focus:ring-2 focus:ring-blue-500"
        min={0}
      />
    </div>
  )
}

function SummaryRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-3">
      <span className="text-gray-500">{label}</span>
      <span className="font-mono font-semibold text-gray-900">{value}</span>
    </div>
  )
}
