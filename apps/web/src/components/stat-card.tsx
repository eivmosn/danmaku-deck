import type { LucideIcon } from 'lucide-react'
import type { ReactNode } from 'react'

interface StatCardProps {
  label: string
  value: ReactNode
  hint?: string
  icon: LucideIcon
  accent?: string
}

export function StatCard({ label, value, hint, icon: Icon, accent }: StatCardProps) {
  return (
    <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-4">
      <div className="flex items-center justify-between">
        <span className="text-[11px] text-[var(--color-muted)]">{label}</span>
        <Icon size={15} strokeWidth={1.9} className="text-[var(--color-muted)]" />
      </div>
      <div
        className="mt-2 truncate text-xl font-semibold tabular-nums text-[var(--color-fg)]"
        style={accent ? { color: accent } : undefined}
      >
        {value}
      </div>
      {hint ? <div className="mt-1 text-[11px] text-[var(--color-muted)]">{hint}</div> : null}
    </div>
  )
}
