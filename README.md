# DeFlood.AI

DeFlood.AI is a React, Vite, TypeScript, and Tailwind prototype for community flood preparedness in Myanmar.

## Current implementation

### Stage 1 — shared community information

- A single `CommunityProvider` is mounted at the application root.
- Community information persists locally under `deflood-community-data`.
- The current saved community is shared by the dashboard, map, settings, planning prototype, and environmental-data screens.
- Sign-in selects only a user name and role. Community Information is the source of truth for the current community.

### Stage 2A — environmental source data

- Manual latitude and longitude with range validation.
- Browser GPS capture with accuracy, source, update time, and stale-callback protection.
- Independent ECMWF AIFS and IFS precipitation requests.
- Timestamp-aligned 24-hour, 48-hour, and 72-hour rainfall totals with coverage reporting.
- GloFAS seven-day modeled river-discharge forecast, near-term primary-discharge usability, three-day peak, trend, and separately reported ensemble availability.
- Open-Meteo elevation lookup.
- Coordinate-fingerprinted, schema-versioned local caching.
- Per-source fallback that keeps a better same-coordinate cached source when a refresh is degraded.
- Per-source stale-age limits based on each source's real `lastSuccessfulAt`.
- Partial source failures do not block successful sources.
- Request sequencing prevents an older coordinate response from replacing a newer one.

The Risk Assessment screen currently presents raw source values and source metadata only.

## Prototype-only screens

- The Flood Map contains one neutral current-community marker. All other markers, risk colors, shelters, and overlays are labelled sample data.
- The NGO dashboard is explicitly sample data and has no live support workflow.
- The evacuation screen is a resource-input prototype. Operational recommendations are disabled.
- Support requests remain browser-local prototype state and are not sent externally.

## Not implemented yet

- An actual LOW/MEDIUM/HIGH flood-risk engine or flood-hazard scoring.
- A historical river baseline.
- An evacuation recommendation engine.
- A live NGO/support workflow.
- Backend authentication, a database, n8n, or Groq integration.

## Development

The canonical package manager is pnpm.

```bash
pnpm install
pnpm run dev
```

The local development server uses `PORT` when set and otherwise defaults to `8443`.

## Verification

```bash
pnpm test
pnpm run typecheck
pnpm run build
git diff --check
```
