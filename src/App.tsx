import { useState } from 'react'
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
import defloodShield from './assets/branding/deflood-shield.png'
import { RiskProvider } from './context/RiskContext'
import { EvacuationProvider } from './context/EvacuationContext'
import { RiskScenarioProvider } from './context/RiskScenarioContext'
import DevelopmentScenarioSelector from './components/DevelopmentScenarioSelector'

export type Role = 'leader' | 'mayor' | 'assistant' | 'ngo' | 'government'
export type Section = 'dashboard' | 'risk' | 'evacuation' | 'map' | 'support' | 'community' | 'settings'

export interface AppUser {
  role: Role
  name: string
}

export default function App() {
  const [user, setUser] = useState<AppUser | null>(null)
  const [section, setSection] = useState<Section>('dashboard')
  const [mobileOpen, setMobileOpen] = useState(false)

  if (!user) {
    return (
      <SignIn
        onSignIn={u => {
          setUser(u)
          setSection('dashboard')
        }}
      />
    )
  }

  return (
    <RiskProvider>
      <RiskScenarioProvider>
        <EvacuationProvider>
          <SignedInApplication
            user={user}
            section={section}
            mobileOpen={mobileOpen}
            setMobileOpen={setMobileOpen}
            setSection={setSection}
            onSignOut={() => setUser(null)}
          />
        </EvacuationProvider>
      </RiskScenarioProvider>
    </RiskProvider>
  )
}

function SignedInApplication({
  user,
  section,
  mobileOpen,
  setMobileOpen,
  setSection,
  onSignOut,
}: {
  user: AppUser
  section: Section
  mobileOpen: boolean
  setMobileOpen: (open: boolean) => void
  setSection: (section: Section) => void
  onSignOut: () => void
}) {
  const isNGO = user.role === 'ngo' || user.role === 'government'

  const navigate = (nextSection: Section) => {
    setSection(nextSection)
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
      case 'settings': return <Settings user={user} onSignOut={onSignOut} />
      default: return <Dashboard user={user} onNavigate={navigate} />
    }
  }

  return (
    <div className="flex h-screen bg-gray-50 overflow-hidden">
      {/* Desktop sidebar */}
      <div className="hidden md:flex md:flex-shrink-0">
        <Sidebar
          user={user}
          activeSection={section}
          onNavigate={navigate}
          onSignOut={onSignOut}
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
              onSignOut={onSignOut}
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
          <div className="flex items-center gap-2">
            <img src={defloodShield} alt="" className="h-7 w-7 object-contain" aria-hidden="true" />
            <span className="font-bold text-sm tracking-tight">DeFlood.AI</span>
          </div>
          <div className="w-8" />
        </div>

        {import.meta.env.DEV && <DevelopmentScenarioSelector />}

        {/* Scrollable page content */}
        <main className="flex-1 overflow-y-auto">
          {renderContent()}
        </main>
      </div>
    </div>
  )
}
