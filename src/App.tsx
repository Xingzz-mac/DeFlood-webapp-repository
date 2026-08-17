import { useState } from 'react'
import { CommunityProvider } from './context/CommunityContext'
import SignIn from './components/SignIn'
import Sidebar from './components/Sidebar'
import Dashboard from './components/Dashboard'
import RiskAssessment from './components/RiskAssessment'
import EvacuationPlanner from './components/EvacuationPlanner'
import FloodMap from './components/FloodMap'
import SupportNetwork from './components/SupportNetwork'
import NGODashboard from './components/NGODashboard'
import CommunityInfo from './components/CommunityInfo'
import Settings from './components/Settings'
import { IconMenu } from './components/Icons'

export type Role = 'leader' | 'mayor' | 'assistant' | 'ngo' | 'government'
export type Section = 'dashboard' | 'risk' | 'evacuation' | 'map' | 'support' | 'community' | 'settings'

export interface AppUser {
  community: string
  role: Role
  name: string
}

export default function App() {
  const [user, setUser] = useState<AppUser | null>(null)
  const [section, setSection] = useState<Section>('dashboard')
  const [mobileOpen, setMobileOpen] = useState(false)

  if (!user) {
    return (
      <CommunityProvider>
        <SignIn
          onSignIn={u => {
            setUser(u)
            setSection('dashboard')
          }}
        />
      </CommunityProvider>
    )
  }

  const isNGO = user.role === 'ngo' || user.role === 'government'

  const navigate = (s: Section) => {
    setSection(s)
    setMobileOpen(false)
  }

  const renderContent = () => {
    if (isNGO && section === 'dashboard') {
      return <NGODashboard user={user} onNavigate={navigate} />
    }
    switch (section) {
      case 'dashboard': return <Dashboard user={user} onNavigate={navigate} />
      case 'risk': return <RiskAssessment onNavigate={navigate} />
      case 'evacuation': return <EvacuationPlanner onNavigate={navigate} />
      case 'map': return <FloodMap />
      case 'support': return <SupportNetwork />
      case 'community': return <CommunityInfo user={user} />
      case 'settings': return <Settings user={user} onSignOut={() => setUser(null)} />
      default: return <Dashboard user={user} onNavigate={navigate} />
    }
  }

  return (
    <CommunityProvider>
    <div className="flex h-screen bg-gray-50 overflow-hidden">
      {/* Desktop sidebar */}
      <div className="hidden md:flex md:flex-shrink-0">
        <Sidebar
          user={user}
          activeSection={section}
          onNavigate={navigate}
          onSignOut={() => setUser(null)}
        />
      </div>

      {/* Mobile sidebar overlay */}
      {mobileOpen && (
        <div className="fixed inset-0 z-50 flex md:hidden">
          <div className="fixed inset-0 bg-black/40" onClick={() => setMobileOpen(false)} />
          <div className="relative z-50 flex-shrink-0">
            <Sidebar
              user={user}
              activeSection={section}
              onNavigate={navigate}
              onSignOut={() => setUser(null)}
            />
          </div>
        </div>
      )}

      {/* Main area */}
      <div className="flex flex-col flex-1 min-w-0 overflow-hidden">
        {/* Mobile top bar */}
        <div className="md:hidden flex items-center justify-between px-4 py-3 bg-[#1e3a5f] text-white shrink-0">
          <button
            onClick={() => setMobileOpen(true)}
            className="p-1 rounded hover:bg-white/10 transition-colors"
            aria-label="Open menu"
          >
            <IconMenu size={22} />
          </button>
          <span className="font-bold text-sm tracking-tight">DeFlood.AI</span>
          <div className="w-8" />
        </div>

        {/* Scrollable page content */}
        <main className="flex-1 overflow-y-auto">
          {renderContent()}
        </main>
      </div>
    </div>
    </CommunityProvider>
  )
}
