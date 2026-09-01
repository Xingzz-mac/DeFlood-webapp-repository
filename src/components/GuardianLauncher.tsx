import { useState } from 'react'
import defloodShield from '../assets/branding/deflood-shield.png'
import { buildGuardianProtocolUrl } from '../services/guardianProtocol'

const guardianShowUrl = buildGuardianProtocolUrl('show')

export default function GuardianLauncher() {
  const [launchRequested, setLaunchRequested] = useState(false)

  return (
    <div className="mb-3 rounded-lg border border-white/10 bg-white/5 p-3">
      <a
        href={guardianShowUrl}
        onClick={() => setLaunchRequested(true)}
        className="flex w-full items-center gap-2 rounded-md px-2 py-2 text-sm font-medium text-blue-100 transition-colors hover:bg-white/10 hover:text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
        aria-describedby={launchRequested ? 'guardian-launch-help' : undefined}
      >
        <img src={defloodShield} alt="" aria-hidden="true" className="h-5 w-5 object-contain" />
        Launch Guardian
      </a>
      {launchRequested && (
        <p id="guardian-launch-help" role="status" className="mt-2 px-2 text-[11px] leading-4 text-blue-200">
          Guardian launch requested. If it did not open, the desktop companion may need to be installed or opened once.
        </p>
      )}
    </div>
  )
}
