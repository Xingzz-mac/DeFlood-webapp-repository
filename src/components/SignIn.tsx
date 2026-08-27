import { useState } from 'react'
import type { FormEvent } from 'react'
import type { AppUser, Role } from '../App'
import { useCommunity } from '../context/CommunityContext'
import { IconGlobe } from './Icons'

interface SignInProps {
  onSignIn: (user: AppUser) => void
}

const roles: { id: Role; label: string }[] = [
  { id: 'leader', label: 'Community Leader' },
  { id: 'mayor', label: 'Mayor / Local Authority' },
  { id: 'assistant', label: 'Authorised Assistant' },
  { id: 'ngo', label: 'NGO' },
  { id: 'government', label: 'Government / Disaster Response' },
]

export default function SignIn({ onSignIn }: SignInProps) {
  const { community } = useCommunity()
  const [role, setRole] = useState<Role>('leader')
  const [name, setName] = useState('')
  const [pin, setPin] = useState('')
  const [error, setError] = useState('')

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault()
    if (!name.trim()) { setError('Please enter your name.'); return }
    if (pin.length < 4) { setError('Please enter a 4-digit PIN.'); return }
    onSignIn({ role, name: name.trim() })
  }

  return (
    <div className="min-h-screen bg-[#1e3a5f] flex flex-col items-center justify-center px-4 py-8">
      <div className="w-full max-w-md">
        {/* Logo */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 bg-blue-400 rounded-2xl mb-4 shadow-lg">
            <IconGlobe size={30} className="text-white" />
          </div>
          <h1 className="text-3xl font-bold text-white tracking-tight">DeFlood.AI</h1>
          <p className="text-blue-200 mt-1 text-sm">Flood Risk Assessment &amp; Emergency Management</p>
          <p className="text-blue-300 mt-0.5 text-xs">Myanmar Community Platform</p>
        </div>

        {/* Card */}
        <div className="bg-white rounded-2xl p-8 shadow-2xl">
          <h2 className="text-base font-semibold text-gray-900 mb-5">Community Access</h2>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-2.5">
              <div className="text-xs font-medium text-gray-500">Current community</div>
              <div className="mt-0.5 text-sm font-semibold text-gray-900">{community.name}</div>
              <div className="mt-0.5 text-xs text-gray-500">
                Community Information is the source of truth for this single-community prototype.
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Your Role</label>
              <div className="space-y-1.5">
                {roles.map(r => (
                  <label
                    key={r.id}
                    className={`flex items-center gap-3 px-3 py-2 rounded-lg cursor-pointer border transition-colors ${role === r.id ? 'border-blue-500 bg-blue-50' : 'border-gray-200 hover:bg-gray-50'}`}
                  >
                    <input
                      type="radio"
                      name="role"
                      value={r.id}
                      checked={role === r.id}
                      onChange={() => setRole(r.id)}
                      className="accent-blue-600"
                    />
                    <span className="text-sm text-gray-700">{r.label}</span>
                  </label>
                ))}
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Your Name</label>
              <input
                type="text"
                value={name}
                onChange={e => setName(e.target.value)}
                placeholder="Enter your name"
                className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Demonstration PIN</label>
              <input
                type="password"
                value={pin}
                onChange={e => setPin(e.target.value.replace(/\D/g, '').slice(0, 6))}
                placeholder="Enter demo PIN"
                inputMode="numeric"
                className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm font-mono tracking-[0.4em] focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <p className="mt-1 text-xs text-gray-500">Demo only — this PIN is not a security credential.</p>
            </div>

            {error && <p className="text-red-600 text-sm font-medium">{error}</p>}

            <button
              type="submit"
              className="w-full bg-[#1e3a5f] hover:bg-[#2d5282] text-white font-semibold py-3 rounded-xl transition-colors mt-1 text-sm"
            >
              Sign In
            </button>
          </form>
        </div>

        <p className="text-blue-300 text-xs text-center mt-5">
          Prototype access — roles are simulated for demonstration.
        </p>
      </div>
    </div>
  )
}
