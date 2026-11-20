import type { ReactNode } from 'react'

interface StatCardProps {
  label: string
  value: ReactNode
  hint?: string
  accent?: string
}

export function StatCard({ label, value, hint, accent }: StatCardProps) {
  return (
    <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)]/70 p-4">
      <div className="text-[11px] text-[var(--color-muted)]">{label}</div>
      <div
        className="mt-1.5 text-xl font-semibold tabular-nums"
        style={accent ? { color: accent } : undefined}
      >
        {value}
      </div>
      {hint ? <div className="mt-1 text-[11px] text-[var(--color-muted)]">{hint}</div> : null}
    </div>
  )
}
