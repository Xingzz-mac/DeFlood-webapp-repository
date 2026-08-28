import type { AppUser } from '../App'
import { useCommunity } from '../context/CommunityContext'
import { IconLogOut } from './Icons'

interface SettingsProps {
  user: AppUser
  onSignOut: () => void
}

const roleLabels: Record<string, string> = {
  leader: 'Community Leader',
  mayor: 'Mayor / Local Authority',
  assistant: 'Authorised Assistant',
  ngo: 'NGO',
  government: 'Government / Disaster Response',
}

export default function Settings({ user, onSignOut }: SettingsProps) {
  const { community } = useCommunity()

  return (
    <div className="p-4 md:p-6 max-w-2xl mx-auto">
      <div className="mb-5">
        <h1 className="text-xl md:text-2xl font-bold text-gray-900">Settings</h1>
      </div>

      <div className="space-y-4">
        <div className="bg-white border border-gray-200 rounded-2xl p-5">
          <h2 className="font-semibold text-gray-900 mb-4 text-sm">Account</h2>
          <div className="space-y-0">
            <Row label="Name" value={user.name} />
            <Row label="Role" value={roleLabels[user.role] || user.role} />
            <Row label="Community" value={community.name} last />
          </div>
        </div>

        <div className="bg-white border border-gray-200 rounded-2xl p-5">
          <h2 className="font-semibold text-gray-900 text-sm">Notifications</h2>
          <p className="mb-4 mt-1 text-xs text-gray-500">Future prototype feature — not currently active.</p>
          <div className="space-y-3">
            {[
              'Risk-level change notifications',
              'Assistance-request notifications',
              'Weather and flood alert notifications',
              'Response-status notifications',
            ].map(item => (
              <label key={item} className="flex cursor-not-allowed items-center justify-between gap-4 opacity-60">
                <span className="text-sm text-gray-700">{item}</span>
                <input
                  type="checkbox"
                  disabled
                  aria-label={item}
                  className="h-4 w-4 accent-blue-600"
                />
              </label>
            ))}
          </div>
          <p className="mt-4 text-xs text-gray-500">DeFlood does not issue official evacuation orders.</p>
        </div>

        <div className="bg-white border border-gray-200 rounded-2xl p-5">
          <h2 className="font-semibold text-gray-900 mb-3 text-sm">Data Sources</h2>
          <p className="text-sm text-gray-500 leading-relaxed mb-4">
            Environmental source data is requested for the current community coordinates.
            Flood Hazard and Data Confidence are calculated using the current DeFlood prototype risk engine. Thresholds are experimental and not operationally validated.
          </p>
          <div className="space-y-1 text-xs text-gray-400">
            <div>Weather forecasts: Open-Meteo ECMWF AIFS and IFS</div>
            <div>Modeled river discharge: Open-Meteo Flood API (GloFAS)</div>
            <div>Terrain elevation: Open-Meteo Elevation API</div>
          </div>
        </div>

        <button
          onClick={onSignOut}
          className="w-full flex items-center justify-center gap-2 border border-red-200 bg-red-50 hover:bg-red-100 text-red-700 font-semibold py-3 rounded-2xl text-sm transition-colors"
        >
          <IconLogOut size={16} />
          Sign Out
        </button>
      </div>
    </div>
  )
}

function Row({ label, value, last }: { label: string; value: string; last?: boolean }) {
  return (
    <div className={`flex justify-between py-2.5 text-sm ${!last ? 'border-b border-gray-100' : ''}`}>
      <span className="text-gray-500">{label}</span>
      <span className="font-medium text-gray-900">{value}</span>
    </div>
  )
}
