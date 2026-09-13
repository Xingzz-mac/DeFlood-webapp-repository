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
import { isCommunityRole, roleSection } from './services/rolePresentation'
import {
  consumeCurrentAssistantLaunchIntent,
  currentAppLaunchIntent,
} from './services/appDeepLink'
import {
  clearPrototypeSession,
  persistPrototypeSession,
  restorePrototypeSession,
  type PrototypeRole,
} from './services/prototypeSession'

export type Role = PrototypeRole
export type Section = 'dashboard' | 'risk' | 'evacuation' | 'map' | 'support' | 'community' | 'settings'

export interface AppUser {
  role: Role
  name: string
}

export default function App() {
  const [launchIntent, setLaunchIntent] = useState(currentAppLaunchIntent)
  const [user, setUser] = useState<AppUser | null>(restorePrototypeSession)
  const [section, setSection] = useState<Section>(launchIntent.focusAssistant ? 'evacuation' : 'dashboard')
  const [mobileOpen, setMobileOpen] = useState(false)

  const signIn = (nextUser: AppUser) => {
    persistPrototypeSession(nextUser)
    setUser(nextUser)
    setSection(roleSection(nextUser.role, launchIntent.focusAssistant ? 'evacuation' : 'dashboard'))
    setMobileOpen(false)
  }

  const signOut = () => {
    clearPrototypeSession()
    setUser(null)
    setSection('dashboard')
    setMobileOpen(false)
  }

  const assistantFocusFulfilled = () => {
    if (!launchIntent.focusAssistant) return
    consumeCurrentAssistantLaunchIntent()
    setLaunchIntent({ focusAssistant: false })
  }

  return (
    <RiskProvider>
      <RiskScenarioProvider>
        <EvacuationProvider>
          {user ? <SignedInApplication
            user={user}
            section={section}
            mobileOpen={mobileOpen}
            setMobileOpen={setMobileOpen}
            setSection={setSection}
            focusAssistant={launchIntent.focusAssistant}
            onAssistantFocusFulfilled={assistantFocusFulfilled}
            onSignOut={signOut}
          /> : <div className="relative h-full min-h-0 overflow-y-auto overscroll-y-contain"><SignIn onSignIn={signIn} /></div>}
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
  focusAssistant,
  onAssistantFocusFulfilled,
  onSignOut,
}: {
  user: AppUser
  section: Section
  mobileOpen: boolean
  setMobileOpen: (open: boolean) => void
  setSection: (section: Section) => void
  focusAssistant: boolean
  onAssistantFocusFulfilled: () => void
  onSignOut: () => void
}) {
  const isNGO = !isCommunityRole(user.role)
  const accessibleSection = roleSection(user.role, section)

  const navigate = (nextSection: Section) => {
    setSection(roleSection(user.role, nextSection))
    setMobileOpen(false)
  }

  const renderContent = () => {
    if (isNGO && accessibleSection === 'dashboard') {
      return <NGODashboard user={user} onNavigate={navigate} />
    }
    switch (accessibleSection) {
      case 'dashboard': return <Dashboard user={user} onNavigate={navigate} />
      case 'risk': return <RiskAssessment onNavigate={navigate} role={user.role} />
      case 'evacuation': return (
        <EvacuationPlanner
          onNavigate={navigate}
          focusAssistant={focusAssistant}
          onAssistantFocusFulfilled={onAssistantFocusFulfilled}
        />
      )
      case 'map': return <FloodMap />
      case 'support': return <SupportNetwork role={user.role} />
      case 'community': return <CommunityInfo user={user} />
      case 'settings': return <Settings user={user} onSignOut={onSignOut} />
      default: return <Dashboard user={user} onNavigate={navigate} />
    }
  }

  return (
    <div className="relative flex h-full min-h-0 bg-gray-50 overflow-hidden">
      {/* Desktop sidebar */}
      <div className="hidden h-full min-h-0 md:flex md:flex-shrink-0">
        <Sidebar
          user={user}
          activeSection={accessibleSection}
          onNavigate={navigate}
          onSignOut={onSignOut}
        />
      </div>

      {/* Mobile sidebar overlay */}
      {mobileOpen && (
        <div className="fixed inset-0 z-50 flex md:hidden">
          <div className="fixed inset-0 bg-black/40" onClick={() => setMobileOpen(false)} />
          <div className="relative z-50 h-full min-h-0 flex-shrink-0">
            <Sidebar
              user={user}
              activeSection={accessibleSection}
              onNavigate={navigate}
              onSignOut={onSignOut}
            />
          </div>
        </div>
      )}

      {/* Main area */}
      <div className="flex flex-col flex-1 min-h-0 min-w-0 overflow-hidden">
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

        <DevelopmentScenarioSelector role={user.role} />

        {/* Scrollable page content */}
        <main className="relative flex-1 min-h-0 min-w-0 overflow-y-auto overscroll-y-contain">
          {renderContent()}
        </main>
      </div>
    </div>
  )
}
