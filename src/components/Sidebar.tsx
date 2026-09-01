import type { FC } from 'react'
import type { AppUser, Section } from '../App'
import defloodShield from '../assets/branding/deflood-shield.png'
import { useCommunity } from '../context/CommunityContext'
import {
  IconDashboard, IconShield, IconTruck, IconMap,
  IconUsers, IconBuilding, IconSettings, IconLogOut,
} from './Icons'
import GuardianLauncher from './GuardianLauncher'

interface SidebarProps {
  user: AppUser
  activeSection: Section
  onNavigate: (s: Section) => void
  onSignOut: () => void
}

interface NavItem {
  id: Section
  label: string
  Icon: FC<{ size?: number; className?: string }>
}

const navItems: NavItem[] = [
  { id: 'dashboard', label: 'Dashboard', Icon: IconDashboard },
  { id: 'risk', label: 'Risk Assessment', Icon: IconShield },
  { id: 'evacuation', label: 'Evacuation Plan', Icon: IconTruck },
  { id: 'map', label: 'Map', Icon: IconMap },
  { id: 'support', label: 'Support Network', Icon: IconUsers },
  { id: 'community', label: 'Community Info', Icon: IconBuilding },
  { id: 'settings', label: 'Settings', Icon: IconSettings },
]

const roleLabels: Record<string, string> = {
  leader: 'Community Leader',
  mayor: 'Mayor',
  assistant: 'Authorised Assistant',
  ngo: 'NGO',
  government: 'Gov. / Disaster Response',
}

export default function Sidebar({ user, activeSection, onNavigate, onSignOut }: SidebarProps) {
  const { community } = useCommunity()

  return (
    <div className="w-60 bg-[#1e3a5f] flex flex-col h-full text-white">
      {/* Logo */}
      <div className="border-b border-white/10 px-5 py-4">
        <div className="flex items-center gap-2.5">
          <img src={defloodShield} alt="" aria-hidden="true" className="h-9 w-9 shrink-0 object-contain" />
          <div className="text-[15px] font-bold tracking-tight text-white">DeFlood.AI</div>
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 px-3 py-4 space-y-0.5">
        {navItems.map(({ id, label, Icon }) => {
          const active = activeSection === id
          return (
            <button
              key={id}
              onClick={() => onNavigate(id)}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors text-left ${
                active
                  ? 'bg-white/15 text-white'
                  : 'text-blue-100 hover:bg-white/8 hover:text-white'
              }`}
            >
              <Icon size={17} />
              {label}
            </button>
          )
        })}
      </nav>

      {/* User + Sign Out */}
      <div className="px-4 py-4 border-t border-white/10">
        <GuardianLauncher />
        <div className="mb-3 px-1">
          <div className="text-sm font-semibold text-white leading-tight">{user.name}</div>
          <div className="text-xs text-blue-300 mt-0.5">{roleLabels[user.role] || user.role}</div>
          <div className="text-xs text-blue-400 mt-0.5 truncate">{community.name}</div>
        </div>
        <button
          onClick={onSignOut}
          className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm text-blue-200 hover:bg-white/10 hover:text-white transition-colors"
        >
          <IconLogOut size={15} />
          Sign Out
        </button>
      </div>
    </div>
  )
}
