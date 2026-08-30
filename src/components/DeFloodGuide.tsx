import defloodShield from '../assets/branding/deflood-shield.png'

export default function DeFloodGuide({ limited }: { limited: boolean }) {
  return (
    <aside className="flex max-w-md items-center gap-3 rounded-2xl border border-blue-100 bg-gradient-to-br from-blue-50 to-cyan-50 px-4 py-3 text-sm shadow-sm" aria-label="DeFlood Guide">
      <div
        data-guide-artwork-slot
        className="hidden h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#1e3a5f] text-white sm:flex"
        aria-hidden="true"
      >
        <img src={defloodShield} alt="" className="h-8 w-8 object-contain" aria-hidden="true" />
      </div>
      <div className="min-w-0">
        <div className="font-bold text-[#1e3a5f]">DeFlood Guide</div>
        <p className="mt-0.5 text-xs leading-relaxed text-slate-600">
          {limited
            ? 'Rainfall evidence is available, but representative river evidence is not.'
            : "Map markers show where DeFlood's environmental evidence comes from."}
        </p>
      </div>
    </aside>
  )
}
