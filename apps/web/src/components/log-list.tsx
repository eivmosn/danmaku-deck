import type { LogEntry } from '@/lib/types'
import { cn } from '@/lib/cn'

const LEVEL_COLOR: Record<LogEntry['level'], string> = {
  debug: 'text-white/40',
  info: 'text-cyan-300',
  warn: 'text-amber-300',
  error: 'text-red-400',
}

const SCOPE_COLOR: Record<string, string> = {
  系统: 'text-white',
  收流: 'text-fuchsia-300',
  B站: 'text-[var(--color-bilibili)]',
  小红书: 'text-[var(--color-xiaohongshu)]',
  代理: 'text-blue-300',
  推送: 'text-emerald-300',
}

export function LogList({ entries, className }: { entries: LogEntry[]; className?: string }) {
  if (entries.length === 0) {
    return (
      <div className="flex h-40 items-center justify-center rounded-xl border border-dashed border-[var(--color-border)] text-sm text-[var(--color-muted)]">
        还没有日志
      </div>
    )
  }

  return (
    <ul className={cn('flex flex-col gap-1 overflow-y-auto font-mono text-[12px]', className)}>
      {entries.toReversed().map((entry) => (
        <li key={entry.id} className="flex gap-2 rounded px-2 py-1 hover:bg-white/[0.03]">
          <span className="shrink-0 text-white/30">{entry.atLocal.slice(11)}</span>
          <span className={cn('shrink-0', SCOPE_COLOR[entry.scope] ?? 'text-white/60')}>
            [{entry.scope}]
          </span>
          <span className={LEVEL_COLOR[entry.level]}>{entry.message}</span>
        </li>
      ))}
    </ul>
  )
}
