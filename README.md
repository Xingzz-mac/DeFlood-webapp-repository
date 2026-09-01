# DeFlood.AI

AI-assisted flood preparedness and evacuation-support platform designed for flood-prone communities in Myanmar.

🌐 Live Demo: https://deflood-ai.pages.dev/

💻 Tech: React · TypeScript · Vite · Open-Meteo · GloFAS · n8n · Groq · Cloudflare Workers

## What it does:

1. Combines multiple weather models to assess flood-related conditions.
   
2. Uses river-discharge, rainfall and elevation data in a deterministic flood-risk engine.
   
3. Generates resource-aware evacuation-planning guidance.
   
4. Optionally uses AI to assist with planning while keeping deterministic safety constraints.
   
5. Provides community, support-network and flood-map interfaces.
   
## Project Context:

Developed as DeFlood.AI for the Myanmar Youth AI Competition 2026 — Social Innovation category.

## Screenshot
<img width="1470" height="837" alt="image" src="https://github.com/user-attachments/assets/b7ab1e30-fea5-48d8-8f1a-27f2e19154dc" />


## Current implementation

### Stage 1 — shared community information

- A single `CommunityProvider` is mounted at the application root.
- Community information persists locally under `deflood-community-data`.
- The current saved community is shared by the dashboard, map, settings, planning prototype, and environmental-data screens.
- Prototype access collects a user name, simulated role, and demonstration-only PIN; it is not production authentication. Community Information is the source of truth for the current community.

### Stage 2A — environmental source data

- Manual latitude and longitude with range validation.
- Browser GPS capture with accuracy, source, update time, and stale-callback protection.
- Independent precipitation requests for ECMWF AIFS Single, ECMWF IFS HRES, NOAA GFS Global, and UKMO Global deterministic forecasts.
- Timestamp-aligned 24-hour, 48-hour, and 72-hour rainfall totals with coverage reporting.
- GloFAS seven-day modeled river-discharge forecast, near-term primary-discharge usability, three-day peak, trend, and separately reported ensemble availability.
- Open-Meteo elevation lookup.
- Coordinate-fingerprinted, schema-versioned local caching.
- Per-source fallback that keeps a better same-coordinate cached source when a refresh is degraded.
- Per-source stale-age limits based on each source's real `lastSuccessfulAt`.
- Partial source failures do not block successful sources.
- Request sequencing prevents an older coordinate response from replacing a newer one.

The Risk Assessment screen leads with Flood Hazard, Data Confidence, plain-language meaning, contributing factors, and next steps. Raw source values and metadata remain available in a collapsed supporting-data section.

### Stage 2B — multi-model rainfall consensus and agreement

- Per-horizon rainfall consensus across 24-hour, 48-hour, and 72-hour accumulations from ECMWF AIFS Single, ECMWF IFS HRES, NOAA GFS Global, and UKMO Global deterministic forecasts.
- Three or four usable models use the median; exactly two use the arithmetic mean; one uses a single-model fallback with a confidence penalty; zero makes rainfall unavailable.
- Multi-model disagreement produces a continuous agreement score plus Strong, Moderate, Weak, or Poor labels.
- Multi-model disagreement affects Data Confidence only; it does not directly modify physical Flood Hazard.

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

### Stage 3 — deterministic evacuation and resource planning

- A separate deterministic planning engine consumes the shared Stage 2 risk result and saved Community Information without fetching environmental data again.
- Planning states are `NOT_READY`, `PREPAREDNESS`, `READINESS`, and `URGENT_PLANNING`; they are not official evacuation-order states.
- Shelter shortage and coverage use only reported population and shelter capacity.
- Cars, trucks, and boats remain inventory counts. Carrying capacity, trips, duration, and transport shortage are not inferred.
- Priority groups remain separate because children, elderly residents, people with disabilities, and other vulnerable residents may overlap.
- Missing information, confirmed resource warnings, and planning actions are selected by deterministic code from a trusted action registry.
- The Evacuation Planner remains usable without AI or network access.
- Support Network only displays confirmed deterministic gaps and does not send requests.

### Optional AI-assisted planning

The frontend can call the existing externally managed n8n/Groq workflow through:

```bash
VITE_EVACUATION_WEBHOOK_URL=https://your-stable-production-webhook.example
```

Copy `.env.example` to a local `.env` and set the stable production webhook URL. Do not commit temporary Cloudflare Quick Tunnel URLs.

The request contains deterministic risk, community, resource, and trusted `allowedActions` values. Only final validated `output.actions` selections are accepted. Unknown or rejected IDs and model-authored factual replacements are ignored. Timeouts, offline workflows, invalid JSON, and malformed responses fall back to the deterministic planner.

For production browser calls, configure the n8n webhook or its reverse proxy to allow the deployed frontend origin with appropriate CORS headers. The frontend does not use `no-cors` or an insecure CORS workaround.

## Prototype-only screens

- The Flood Map contains one neutral current-community marker. All other markers, risk colors, shelters, and overlays are labelled sample data.
- The NGO dashboard is explicitly sample data and has no live support workflow.
- The evacuation screen provides deterministic planning guidance but never issues official orders, routes, or departure times.
- Support requests are not routed or stored externally.

## Not implemented yet

- A live NGO/support workflow.
- Backend authentication or a shared database.
- Automatic evacuation orders, routes, notifications, SMS, or USSD.
- A frontend-managed n8n/Groq workflow; the optional client expects the existing external validated workflow.

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
