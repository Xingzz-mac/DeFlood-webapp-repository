# DeFlood.AI — Flood Risk Assessment & Emergency Management

A flood-preparedness platform for communities in Myanmar, designed for community leaders, mayors, authorised assistants, NGOs, and government disaster-response teams. Built as a prototype for a youth AI competition.

**Tech stack:** React 19, Vite 8, TypeScript 5.7, Tailwind CSS v4.

---

## Current State

The app compiles and runs, but **all data is hardcoded** and **nothing persists**. There is no backend integration, no authentication, and no cross-component data flow. Every page renders from static demo data defined in its own component file.

---

## Architecture

### Entry & Layout

| File | Purpose |
|------|---------|
| `src/main.tsx` | React entrypoint; mounts `App` into `#root` |
| `src/App.tsx` | Root component; holds `user` and `section` state, renders sidebar + active section |
| `src/index.css` | Global CSS, font imports (Inter, JetBrains Mono), Tailwind import |
| `src/components/Sidebar.tsx` | Desktop sidebar + mobile drawer navigation; shows user info and sign-out |

`App.tsx` uses simple `useState` for navigation — no URL router. The `user` object (`{ community, role, name }`) is passed down to child components. Refreshing the browser resets everything (no session persistence).

### Roles

Five roles defined in `App.tsx`:

| Role | ID | Default dashboard |
|------|----|-------------------|
| Community Leader | `leader` | Community Dashboard |
| Mayor / Local Authority | `mayor` | Community Dashboard |
| Authorised Assistant | `assistant` | Community Dashboard |
| NGO | `ngo` | NGO Command Overview |
| Government / Disaster Response | `government` | NGO Command Overview |

If `role` is `ngo` or `government`, the Dashboard section renders `NGODashboard` instead of the community `Dashboard`.

### Pages / Components

| File | Section | Description |
|------|---------|-------------|
| `SignIn.tsx` | Sign In | Fake login: select community, choose role, enter name + 4-digit PIN. No validation against any backend; any PIN ≥4 digits is accepted. |
| `Dashboard.tsx` | Dashboard | Community overview: risk badge, alert card, confidence bar, 8 stat cards, 3 hardcoded active-request rows. Action buttons navigate to other sections. |
| `RiskAssessment.tsx` | Risk Assessment | Shows "Why is the risk HIGH?" explanation, confidence bar (87%), and 6 contributing factors (rainfall, river level, elevation, weather, flood history). All data static. |
| `EvacuationPlanner.tsx` | Evacuation Plan | Form for population/resources/supplies → generates a 4-step evacuation plan client-side. Form defaults are hardcoded and NOT synced with Community Info. Plan is not persisted. |
| `FloodMap.tsx` | Map | Hand-drawn SVG map of Ayeyarwady Delta with 6 community markers, shelter markers, flood zones. Selecting a community shows its details in a side panel. All data static. |
| `SupportNetwork.tsx` | Support Network | Assistance request form + list. New requests are added to local React state only — lost on refresh, never visible to NGO dashboard. 3 seed requests hardcoded. |
| `NGODashboard.tsx` | Dashboard (NGO/Gov) | Command overview with filter buttons, community list, detail panel with status-update buttons. Status changes are local state only. "Assign to Field Team" button has no handler. Data is a separate hardcoded copy, not synced with SupportNetwork. |
| `CommunityInfo.tsx` | Community Info | Editable form with 4 sections (details, leadership, resources, supplies). Save button shows a success toast but does not persist anywhere. Values not consumed by other pages. |
| `Settings.tsx` | Settings | Account info (read-only from `user`), notification checkboxes (`defaultChecked`, no state), static data-source info, sign-out button. |
| `RiskBadge.tsx` | (shared) | Reusable risk-level badge component (LOW/MEDIUM/HIGH). |
| `Icons.tsx` | (shared) | Hand-written SVG icon set (22 icons). |

---

## Identified Issues

### 1. Hardcoded demo data

Every page reads from constants defined inside its own component file:

- **Dashboard** — risk level `HIGH`, confidence `87%`, all 8 stat values, timestamps, 3 request rows
- **RiskAssessment** — 6-factor array with values, confidence `87%`, explanation text
- **EvacuationPlanner** — default population (2340), resources (45 volunteers, 18 cars, 12 boats, etc.), supplies
- **FloodMap** — 6 communities with coordinates, risk, population, needs, status
- **SupportNetwork** — 3 seed requests
- **NGODashboard** — 6 communities (separate copy from FloodMap, with different fields)
- **CommunityInfo** — leader name, mayor name, phone, all resource counts
- **Settings** — data-source text, last-sync timestamp

### 2. Forms/buttons that do nothing

| Location | Issue |
|----------|-------|
| `Settings.tsx` | Notification checkboxes use `defaultChecked` with no state — toggling has no effect |
| `NGODashboard.tsx` | "Assign to Field Team" button has no `onClick` handler |
| `CommunityInfo.tsx` | "Save" button shows a toast but doesn't persist data anywhere |
| `EvacuationPlanner.tsx` | Generated plan is not saved or shared |
| `SignIn.tsx` | PIN is accepted if ≥4 digits; no real authentication |

### 3. No cross-component data flow

- **SupportNetwork → NGODashboard**: Requests created by a community never appear in the NGO dashboard. They use separate hardcoded datasets and separate local state.
- **CommunityInfo → Dashboard/Risk/Evacuation**: Community info form values (population, resources, supplies) are not consumed by the Dashboard stats, Risk Assessment, or Evacuation Planner — each has its own hardcoded copy.
- **FloodMap ↔ NGODashboard**: Both show community lists but from separate hardcoded arrays with different schemas.

### 4. No persistence

- Session is lost on browser refresh (no auth/session storage)
- Assistance requests lost on refresh
- Community info edits lost on refresh
- NGO status updates lost on refresh

### 5. Navigation

- Section switching works correctly via `useState` in `App.tsx`
- No URL-based routing (no deep linking, no back button)
- Mobile sidebar overlay works correctly

---

## Recommended Implementation Order

To turn this into a functional competition prototype, implement in this order:

### Phase 1 — Data persistence with Supabase (highest impact)

1. **Assistance requests pipeline** — Create a `requests` table. SupportNetwork writes to it; NGODashboard reads from it. This connects the two main user flows (community requests → NGO response) and is the most impressive demo feature. Enable real-time updates so the NGO dashboard live-updates when a community submits a request.

2. **Community info persistence** — Create a `communities` table. CommunityInfo form saves to it; Dashboard, RiskAssessment, EvacuationPlanner, and FloodMap all read from it. This eliminates the duplicate hardcoded data and makes the app feel cohesive.

3. **NGO status updates** — When NGO accepts/marks-in-progress/resolves, update the `requests` table. Community SupportNetwork page reflects the updated status.

### Phase 2 — Authentication

4. **Supabase email/password auth** — Replace fake PIN login with real auth. Persist session across refreshes. Store role and community association in a `profiles` table.

### Phase 3 — Dynamic risk data

5. **Risk assessment table** — Store risk factors (rainfall, river level, forecast, elevation) in a `risk_assessments` table keyed by community. Dashboard and RiskAssessment read from it instead of hardcoded values. For the competition, this can be manually updated or seeded with realistic data — no need for a live weather API.

### Phase 4 — Polish

6. **Settings notifications** — Persist notification preferences in the `profiles` table.
7. **Evacuation plan persistence** — Save generated plans to an `evacuation_plans` table so they can be reviewed later.
8. **FloodMap data** — Pull community markers from the `communities` + `risk_assessments` tables instead of hardcoded array.

**Phase 1 alone** (requests + community info persistence) would transform the demo from a static mockup into a working multi-user application where a community leader can submit a request and an NGO coordinator can see and respond to it in real time.
