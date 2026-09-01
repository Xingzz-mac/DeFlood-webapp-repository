import { useEvacuationPlan } from '../context/EvacuationContext'
import { IconAlertTriangle, IconCheckCircle } from './Icons'

export default function SupportNetwork() {
  const plan = useEvacuationPlan()
  const sample = plan.dataProvenance === 'SAMPLE'
  const displayedWarnings = plan.resourceWarnings.filter(
    warning => !warning.startsWith('Transport capacity cannot be assessed from'),
  )

  return (
    <div className="mx-auto max-w-4xl p-4 md:p-6">
      <div className="mb-5">
        <h1 className="text-xl font-bold text-gray-900 md:text-2xl">Support Network</h1>
        <p className="mt-0.5 text-sm text-gray-500">{sample ? 'Sample planning gaps' : 'Confirmed planning gaps'} from the deterministic evacuation planner</p>
      </div>

      <div className="mb-5 flex items-start gap-3 rounded-xl border border-gray-200 bg-gray-50 px-5 py-4 text-sm">
        <IconAlertTriangle size={18} className="mt-0.5 shrink-0 text-gray-600" />
        <p className="text-gray-700">
          <strong>Prototype only.</strong> No NGO or government workflow is connected. Nothing on this page sends a request or claims that support has been accepted.
        </p>
      </div>

      <section className="rounded-2xl border border-gray-200 bg-white p-5">
        <div className="flex items-center gap-2">
          <IconCheckCircle size={18} className="text-blue-700" />
          <h2 className="font-semibold text-gray-900">{sample ? 'Sample resource gaps' : 'Confirmed resource gaps'}</h2>
        </div>
        {displayedWarnings.length > 0 ? (
          <ul className="mt-4 space-y-2 text-sm text-gray-700">
            {displayedWarnings.map(warning => (
              <li key={warning} className="rounded-xl border border-amber-100 bg-amber-50 px-4 py-3">{warning}</li>
            ))}
          </ul>
        ) : (
          <p className="mt-4 text-sm text-gray-600">{sample
            ? 'No sample resource gap is currently derived from the demonstration data.'
            : 'No confirmed resource gap is currently derived from the supplied community information.'}</p>
        )}

        <button
          type="button"
          disabled
          className="mt-5 rounded-xl bg-gray-200 px-5 py-2.5 text-sm font-semibold text-gray-500"
        >
          Prepare Support Request — future workflow
        </button>
        <p className="mt-2 text-xs text-gray-500">Live routing and shared request storage are not implemented.</p>
      </section>
    </div>
  )
}
