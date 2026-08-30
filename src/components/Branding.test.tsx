import { act, create } from 'react-test-renderer'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import siteConfiguration from '../../.figma/make/site.json'
import defloodAppIcon from '../assets/branding/deflood-app-icon.png'
import defloodLogoDark from '../assets/branding/deflood-logo-dark.png'
import defloodLogoLight from '../assets/branding/deflood-logo-light.png'
import defloodShield from '../assets/branding/deflood-shield.png'
import DeFloodGuide from './DeFloodGuide'
import Sidebar from './Sidebar'
import SignIn from './SignIn'

const community = {
  name: 'Brand Test Community',
}

vi.mock('../context/CommunityContext', () => ({
  useCommunity: () => ({ community }),
}))

describe('official DeFlood.AI branding', () => {
  beforeEach(() => {
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
  })

  it('resolves all four authoritative brand assets with their canonical names', () => {
    expect(defloodShield).toContain('deflood-shield.png')
    expect(defloodAppIcon).toContain('deflood-app-icon.png')
    expect(defloodLogoLight).toContain('deflood-logo-light.png')
    expect(defloodLogoDark).toContain('deflood-logo-dark.png')
  })

  it('uses truthful deployment metadata and the official app icon', () => {
    expect(siteConfiguration.title).toBe('DeFlood.AI — Flood Risk & Evacuation Planning')
    expect(siteConfiguration.description).toBe(
      'Explainable flood-risk assessment and evacuation-planning prototype using live environmental evidence.',
    )
    expect(siteConfiguration.icons.icon).toBe('/src/assets/branding/deflood-app-icon.png')
    expect(siteConfiguration.openGraph.image).toBe('/src/assets/branding/deflood-logo-dark.png')
    expect(JSON.stringify(siteConfiguration)).not.toMatch(/Figma Make App|Streamline your workflow/i)
  })

  it('uses the horizontal light logo on sign-in and native shield branding in the sidebar', async () => {
    let signIn: ReturnType<typeof create> | null = null
    let sidebar: ReturnType<typeof create> | null = null
    await act(async () => {
      signIn = create(<SignIn onSignIn={vi.fn()} />)
      sidebar = create(
        <Sidebar
          user={{ role: 'leader', name: 'Prototype User' }}
          activeSection="dashboard"
          onNavigate={vi.fn()}
          onSignOut={vi.fn()}
        />,
      )
    })

    expect(signIn!.root.findByProps({ alt: 'DeFlood.AI — AI for Flood Resilience' }).props.src)
      .toBe(defloodLogoLight)
    const sidebarShield = sidebar!.root.findByType('img')
    expect(sidebarShield.props.src).toBe(defloodShield)
    expect(sidebarShield.props.alt).toBe('')
    expect(JSON.stringify(sidebar!.toJSON())).toContain('DeFlood.AI')
    expect(JSON.stringify(sidebar!.toJSON())).not.toContain(defloodLogoDark)
    await act(async () => {
      signIn?.unmount()
      sidebar?.unmount()
    })
  })

  it('keeps the DeFlood Guide deterministic and uses the official shield in its future artwork slot', async () => {
    let renderer: ReturnType<typeof create> | null = null
    await act(async () => {
      renderer = create(<DeFloodGuide limited />)
    })

    const slot = renderer!.root.findByProps({ 'data-guide-artwork-slot': true })
    expect(slot.findByType('img').props.src).toBe(defloodShield)
    expect(JSON.stringify(renderer!.toJSON())).toContain(
      'Rainfall evidence is available, but representative river evidence is not.',
    )
    await act(async () => renderer?.unmount())
  })
})
