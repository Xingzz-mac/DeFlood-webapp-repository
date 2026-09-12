import type { Section } from '../App'
import type { PrototypeRole } from './prototypeSession'

export function isCommunityRole(role: PrototypeRole): boolean {
  return role === 'leader' || role === 'mayor' || role === 'assistant'
}

// Presentation rules for simulated roles, not an authentication boundary.
export function canAccessSection(role: PrototypeRole, section: Section): boolean {
  return isCommunityRole(role) || !['community', 'support', 'evacuation'].includes(section)
}

export function roleSection(role: PrototypeRole, section: Section): Section {
  return canAccessSection(role, section) ? section : 'dashboard'
}

export function operationsLabel(role: PrototypeRole): string {
  return role === 'government' ? 'Regional Coordination' : 'NGO Operations'
}
