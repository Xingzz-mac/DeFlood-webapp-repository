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

The Risk Assessment screen presents the shared deterministic result alongside raw source values and source metadata.

### Stage 2B — weather-model agreement

- Weighted AIFS/IFS comparison across 24-hour, 48-hour, and 72-hour rainfall accumulations.
- Continuous agreement score plus Strong, Moderate, Weak, or Poor labels.
- Two-model rainfall consensus, with single-model fallback when only one model is usable.
- Agreement affects Data Confidence only; it does not directly alter physical Flood Hazard.

### Stage 2C — deterministic prototype risk engine

- A separately cached same-calendar-month GloFAS historical primary-discharge baseline beginning in 1984 and ending with the last completed calendar year.
- Historical coverage checks requiring at least 10 distinct years and 100 valid daily samples.
- Three-day forecast peak percentile and continuous river-abnormality scoring.
- Continuous rainfall, river trend, and low-elevation contextual scores.
- Deterministic Flood Hazard with explicit COMPLETE, INCOMPLETE, and NOT_CALCULATED states.
- Separate Data Confidence based on completeness, model agreement, aligned GloFAS ensemble consistency, and per-source freshness.
- A coordinate-, engine-, evidence-timestamp-, and expiry-bound derived risk cache.
- One signed-in `RiskProvider` that owns the existing environmental hook and shares one result with Dashboard and Risk Assessment.
- Deterministic contributing-factor explanations generated in code without an LLM.

All current thresholds and weights are prototype decision-support heuristics that require regional calibration and operational validation.

## Prototype-only screens

- The Flood Map contains one neutral current-community marker. All other markers, risk colors, shelters, and overlays are labelled sample data.
- The NGO dashboard is explicitly sample data and has no live support workflow.
- The evacuation screen is a resource-input prototype. Operational recommendations are disabled.
- Support requests remain browser-local prototype state and are not sent externally.

## Not implemented yet

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
