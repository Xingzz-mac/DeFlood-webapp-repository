import { useState } from 'react'
import type { ReactNode, FormEvent } from 'react'
import type { Section } from '../App'
import { useCommunity } from '../context/CommunityContext'
import { IconUsers, IconTruck, IconAlertTriangle, IconCheckCircle } from './Icons'

interface EvacuationPlannerProps {
  onNavigate: (s: Section) => void
}

export default function EvacuationPlanner({ onNavigate }: EvacuationPlannerProps) {
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

  const vulnerable = pop.children + pop.elderly + pop.disabled + pop.other
  const deficit = pop.total - res.capacity

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
          Prototype only — no risk recommendation
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
            Generate Evacuation Plan
          </button>
        </form>

        {/* Right: Generated plan */}
        <div>
          {generated ? (
            <div className="bg-white border border-gray-200 rounded-2xl p-5 space-y-3">
              <div className="flex items-center gap-2 pb-3 border-b border-gray-100">
                <IconCheckCircle size={19} className="text-green-600" />
                <h2 className="font-bold text-gray-900">Evacuation Plan</h2>
              </div>

              <PlanStep number={1} title="Priority 1 — Vulnerable Residents" color="red">
                <p>
                  Immediately evacuate <strong>{vulnerable.toLocaleString()} vulnerable residents</strong>: {pop.elderly} elderly,{' '}
                  {pop.children} children, {pop.disabled} people with disabilities, and {pop.other} other vulnerable residents.
                </p>
                <p className="mt-1">
                  Assign {Math.min(res.volunteers, 20)} volunteers to assist. Use boats for flooded routes.
                </p>
              </PlanStep>

              <PlanStep number={2} title="Priority 2 — Community-Defined Areas" color="orange">
                <p>
                  Identify priority areas using verified local instructions before acting.
                  This prototype does not calculate flood-risk areas or elevation thresholds.
                </p>
              </PlanStep>

              <PlanStep number={3} title="Transport Assignment" color="blue">
                <ul className="space-y-1">
                  <li><strong>{res.boats} boats</strong> — flooded streets and river-adjacent zones</li>
                  <li><strong>{res.trucks} trucks</strong> — large groups and supplies</li>
                  <li><strong>{res.cars} cars</strong> — smaller groups and medical needs</li>
                  <li><strong>{res.volunteers} volunteers</strong> — assist residents and direct movement</li>
                </ul>
              </PlanStep>

              <PlanStep number={4} title="Shelter Destination" color="green">
                <p>
                  Move all residents to <strong>{res.shelters} designated shelters</strong> with combined capacity of{' '}
                  <strong>{res.capacity.toLocaleString()} people</strong>.
                </p>
                {deficit > 0 && (
                  <div className="mt-2 bg-amber-50 border border-amber-200 rounded-lg p-2.5 text-xs text-amber-800">
                    <strong>Warning:</strong> Shelter capacity is short by {deficit.toLocaleString()} people.
                    Request additional shelter immediately.
                  </div>
                )}
              </PlanStep>

              {(sup.food === 'Limited' || sup.food === 'Critical' || sup.food === 'None') && (
                <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 text-sm text-amber-800">
                  <strong>Supply Alert:</strong> Food is {sup.food.toLowerCase()}. Request emergency food assistance now.
                </div>
              )}

              <button
                onClick={() => onNavigate('support')}
                className="w-full bg-red-600 hover:bg-red-700 text-white font-semibold py-2.5 rounded-xl text-sm transition-colors mt-1"
              >
                Request Assistance Now
              </button>
            </div>
          ) : (
            <div className="bg-gray-50 border-2 border-dashed border-gray-200 rounded-2xl p-10 text-center">
              <IconTruck size={40} className="mx-auto mb-3 text-gray-300" />
              <p className="text-sm text-gray-400 leading-relaxed">
                Fill in the community data and click<br />
                <strong className="text-gray-500">Generate Evacuation Plan</strong>
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

function PlanStep({ number, title, color, children }: {
  number: number
  title: string
  color: 'red' | 'orange' | 'blue' | 'green'
  children: ReactNode
}) {
  const dot = {
    red: 'bg-red-600',
    orange: 'bg-amber-500',
    blue: 'bg-blue-600',
    green: 'bg-green-600',
  }[color]

  return (
    <div className="border border-gray-200 rounded-xl p-4">
      <div className="flex items-start gap-3">
        <div className={`w-7 h-7 rounded-full flex items-center justify-center text-sm font-bold text-white shrink-0 ${dot}`}>
          {number}
        </div>
        <div>
          <div className="font-semibold text-gray-900 text-sm mb-1">{title}</div>
          <div className="text-sm text-gray-600 leading-relaxed space-y-0.5">{children}</div>
        </div>
      </div>
    </div>
  )
}
