import { useState } from 'react'
import { useCommunity } from '../context/CommunityContext'
import { useRisk } from '../context/RiskContext'
import DeFloodGuide from './DeFloodGuide'
import GeographicEvidenceMap, {
  type FloodMapLayerVisibility,
  type MapDeviceLocation,
} from './GeographicEvidenceMap'
import { buildFloodMapViewModel } from './floodMapData'

const initialLayers: FloodMapLayerVisibility = {
  community: true,
  riverPoint: true,
  searchRadius: true,
  evidenceLine: true,
}

function score(value: number | null): string {
  return value === null ? 'Unavailable' : `${value.toFixed(1)} / 100`
}

function measurement(value: number | null, unit: string): string {
  return value === null ? 'Unavailable' : `${value.toFixed(2)} ${unit}`
}

export default function FloodMap() {
  const { community } = useCommunity()
  const risk = useRisk()
  const model = buildFloodMapViewModel(community, risk, risk.environmentalData)
  const [layers, setLayers] = useState<FloodMapLayerVisibility>(initialLayers)
  const [deviceLocation, setDeviceLocation] = useState<MapDeviceLocation | null>(null)
  const demoRiskActive = risk.assessmentProvenance === 'DEMO'
    || risk.engineVersion.startsWith('deflood-dev-scenario')

  const toggleLayer = (layer: keyof FloodMapLayerVisibility) => {
    setLayers(current => ({ ...current, [layer]: !current[layer] }))
  }

  if (!model.hasSavedCoordinate) {
    return (
      <div className="mx-auto max-w-5xl p-4 md:p-6">
        <h1 className="text-xl font-bold text-gray-900 md:text-2xl">Flood evidence / assessment map</h1>
        <div className="mt-5 rounded-2xl border border-gray-300 bg-gray-50 p-6 text-sm text-gray-700" role="status">
          No valid saved assessment coordinate is available. Save a location in Community Information to open the geographic map.
        </div>
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-6xl p-4 md:p-6">
      <div className="mb-5 flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-900 md:text-2xl">Flood evidence / assessment map</h1>
          <p className="mt-1 max-w-3xl text-sm text-gray-500">
            A real geographic basemap centered on the saved Community Information coordinate. Coordinates—not the community name—determine the map location.
          </p>
        </div>
        <DeFloodGuide limited={model.presentation.mode === 'LIMITED'} />
      </div>

      {demoRiskActive && (
        <div className="mb-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          <strong>Demo risk scenario</strong> — assessment evidence and its river marker are synthetic. The saved community coordinate remains the location context.
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(280px,1fr)]">
        <div className="min-w-0 space-y-4">
          <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm">
            <GeographicEvidenceMap
              model={model}
              communityName={community.name}
              locationSource={community.locationSource}
              layers={layers}
              deviceLocation={deviceLocation}
              onDeviceLocationChange={setDeviceLocation}
            />
          </div>

          <fieldset className="rounded-2xl border border-gray-200 bg-white p-4">
            <legend className="px-1 text-sm font-semibold text-gray-900">Map layers</legend>
            <div className="grid gap-2 text-sm sm:grid-cols-2 lg:grid-cols-4">
              <LayerToggle
                label="Assessment location"
                checked={layers.community}
                onChange={() => toggleLayer('community')}
              />
              {model.riverPoint && (
                <LayerToggle
                  label="GloFAS modeled river point"
                  checked={layers.riverPoint}
                  onChange={() => toggleLayer('riverPoint')}
                />
              )}
              <LayerToggle
                label="River-data search radius"
                checked={layers.searchRadius}
                onChange={() => toggleLayer('searchRadius')}
              />
              {model.evidenceLine && (
                <LayerToggle
                  label="Evidence-distance line"
                  checked={layers.evidenceLine}
                  onChange={() => toggleLayer('evidenceLine')}
                />
              )}
            </div>
          </fieldset>

          <div className="rounded-2xl border border-gray-200 bg-white p-4" aria-label="Map legend">
            <h2 className="text-sm font-semibold text-gray-900">Legend</h2>
            <div className="mt-3 grid gap-3 text-xs text-gray-600 sm:grid-cols-2">
              <LegendItem color="#1e3a5f" label="Assessment location" detail="Saved location used for DeFlood's flood assessment" />
              {deviceLocation && (
                <LegendItem color="#2563eb" label="Your current device location" detail="Temporary map-navigation position only; the saved assessment location remains unchanged" />
              )}
              <LegendItem color="#0891b2" label="GloFAS modeled river point" detail="Modeled environmental evidence location; not a gauge or sensor" />
              <LegendItem color="#64748b" label="River-data search radius" detail="15 km evidence-search limit, not flood extent" dashed />
              <LegendItem color="#7c3aed" label="Evidence-distance line" detail="Point-to-point evidence distance, not a route or river" dashed />
            </div>
          </div>
        </div>

        <aside className="space-y-4" aria-label="Flood map evidence summary">
          <section className="rounded-2xl border border-gray-200 bg-white p-5">
            <div className="text-xs font-semibold uppercase tracking-wide text-gray-500">Assessment location</div>
            <h2 className="mt-1 text-lg font-bold text-gray-900">{community.name}</h2>
            <div className="mt-3 space-y-2 text-sm">
              <InfoRow label="Latitude" value={community.latitude.toFixed(5)} mono />
              <InfoRow label="Longitude" value={community.longitude.toFixed(5)} mono />
              <InfoRow label="Location source" value={community.locationSource === 'gps' ? 'GPS' : 'Manual'} />
              {community.locationSource === 'gps' && community.locationAccuracy !== null && (
                <InfoRow label="Reported accuracy" value={`±${Math.round(community.locationAccuracy)} m`} />
              )}
            </div>
            <p className="mt-3 text-xs text-gray-500">
              Saving a different GPS or manual coordinate updates this map and the shared environmental assessment together.
            </p>
          </section>

          <section className="rounded-2xl border border-gray-200 bg-white p-5" aria-live="polite">
            <div className="text-xs font-semibold uppercase tracking-wide text-gray-500">Current assessment</div>
            <div className={`mt-1 text-xl font-bold ${model.presentation.mode === 'LIMITED' ? 'text-amber-700' : 'text-gray-900'}`}>
              {model.presentation.label}
            </div>
            {model.presentation.mode === 'COMPLETE' ? (
              <div className="mt-3 space-y-2 text-sm">
                <InfoRow label="Flood Hazard score" value={score(model.hazardScore)} />
                <InfoRow label="Data Confidence" value={score(model.confidenceScore)} />
                <InfoRow label="Current modeled discharge" value={measurement(model.currentDischarge, model.dischargeUnit)} />
                <InfoRow label="River trend" value={model.riverTrend ?? 'Unavailable'} />
                <InfoRow label="Historical percentile" value={model.riverPercentile === null ? 'Unavailable' : `${model.riverPercentile.toFixed(1)}th`} />
              </div>
            ) : model.presentation.mode === 'LIMITED' ? (
              <div className="mt-3 space-y-2 text-sm">
                <InfoRow label="Rainfall severity" value={score(model.rainfallSeverity)} />
                <InfoRow label="Required river evidence" value="Unavailable" />
                <InfoRow label="Data Confidence" value={score(model.confidenceScore)} />
                <p className="pt-1 text-xs text-amber-800">Rainfall signal is not the full Flood Hazard score.</p>
              </div>
            ) : (
              <p className="mt-3 text-sm text-gray-600">A complete or limited flood assessment is not currently available.</p>
            )}
            <div className="mt-4 border-t border-gray-100 pt-3 text-sm">
              <InfoRow label="Weather models" value={`${model.usableWeatherModels} / ${model.totalWeatherModels}`} />
              <InfoRow label="Model agreement" value={model.agreementLabel} />
            </div>
            <p className="mt-3 text-xs text-gray-500">Data Confidence describes evidence quality, not flood probability.</p>
          </section>

          <section className="rounded-2xl border border-gray-200 bg-white p-5">
            <div className="text-xs font-semibold uppercase tracking-wide text-gray-500">River spatial evidence</div>
            {model.riverPoint ? (
              <>
                <div className="mt-2 font-semibold text-cyan-800">GloFAS modeled river point</div>
                <p className="mt-2 text-sm leading-relaxed text-gray-700">{model.riverPoint.provenanceText}</p>
                <div className="mt-3 space-y-2 text-sm">
                  <InfoRow label="Latitude" value={model.riverPoint.coordinate.latitude.toFixed(5)} mono />
                  <InfoRow label="Longitude" value={model.riverPoint.coordinate.longitude.toFixed(5)} mono />
                  <InfoRow label="Recorded distance" value={model.riverPoint.distanceKm === null ? 'Unavailable' : `${model.riverPoint.distanceKm.toFixed(1)} km`} />
                </div>
                <p className="mt-3 text-xs text-gray-500">This is modeled discharge evidence, not an observed station or river-height gauge.</p>
              </>
            ) : (
              <p className="mt-2 text-sm leading-relaxed text-gray-700">{model.riverUnavailableMessage}</p>
            )}
          </section>

          <section className="rounded-2xl border border-slate-200 bg-slate-50 p-5 text-sm text-slate-700">
            <div className="font-semibold text-slate-900">River-data search radius: {model.searchRadiusKm} km</div>
            <p className="mt-2 leading-relaxed">
              When the exact community query has no usable GloFAS discharge series, DeFlood searches for eligible modeled river evidence within this maximum radius.
            </p>
            <p className="mt-2 text-xs font-medium">This is not flood extent, an inundation area, a hazard radius, or an evacuation zone.</p>
          </section>
        </aside>
      </div>
    </div>
  )
}

function LayerToggle({ label, checked, onChange }: {
  label: string
  checked: boolean
  onChange: () => void
}) {
  return (
    <label className="flex cursor-pointer items-center gap-2 rounded-lg px-2 py-2 text-gray-700 hover:bg-gray-50">
      <input
        type="checkbox"
        checked={checked}
        onChange={onChange}
        className="h-4 w-4 rounded border-gray-300 text-blue-700"
      />
      <span>{label}</span>
    </label>
  )
}

function LegendItem({ color, label, detail, dashed = false }: {
  color: string
  label: string
  detail: string
  dashed?: boolean
}) {
  return (
    <div className="flex items-start gap-2">
      <span
        className={`mt-1 inline-block h-3 w-5 shrink-0 ${dashed ? 'border-t-2 border-dashed' : 'rounded-full'}`}
        style={dashed ? { borderColor: color } : { backgroundColor: color }}
        aria-hidden="true"
      />
      <span><strong className="text-gray-800">{label}:</strong> {detail}</span>
    </div>
  )
}

function InfoRow({ label, value, mono = false }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex justify-between gap-3">
      <span className="shrink-0 text-gray-500">{label}</span>
      <span className={`text-right font-medium text-gray-900 ${mono ? 'font-mono' : ''}`}>{value}</span>
    </div>
  )
}
