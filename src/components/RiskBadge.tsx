interface RiskBadgeProps {
  level: 'LOW' | 'MEDIUM' | 'HIGH'
  size?: 'sm' | 'md' | 'lg'
}

const config = {
  LOW: { bg: 'bg-green-600', text: 'text-white', dot: 'bg-green-300', label: 'LOW RISK' },
  MEDIUM: { bg: 'bg-amber-500', text: 'text-white', dot: 'bg-amber-200', label: 'MEDIUM RISK' },
  HIGH: { bg: 'bg-red-600', text: 'text-white', dot: 'bg-red-300', label: 'HIGH RISK' },
}

const sizes = {
  sm: 'text-xs px-2 py-0.5 gap-1.5',
  md: 'text-sm px-3 py-1 gap-2',
  lg: 'text-sm px-4 py-1.5 gap-2 font-bold tracking-widest',
}

export default function RiskBadge({ level, size = 'md' }: RiskBadgeProps) {
  const c = config[level]
  return (
    <span className={`inline-flex items-center rounded font-semibold tracking-wide whitespace-nowrap ${c.bg} ${c.text} ${sizes[size]}`}>
      <span className={`w-2 h-2 rounded-full shrink-0 ${c.dot}`} />
      {c.label}
    </span>
  )
}
