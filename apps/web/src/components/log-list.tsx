import type { LogEntry } from '@/lib/types'
import { cn } from '@/lib/cn'

const LEVEL_COLOR: Record<LogEntry['level'], string> = {
  debug: 'text-[var(--muted-foreground)]',
  info: 'text-sky-600 dark:text-sky-300',
  warn: 'text-amber-600 dark:text-amber-300',
  error: 'text-red-600 dark:text-red-400',
}

const SCOPE_COLOR: Record<string, string> = {
  系统: 'text-[var(--foreground)]',
  收流: 'text-fuchsia-600 dark:text-fuchsia-300',
  B站: 'text-[var(--bilibili)]',
  小红书: 'text-[var(--xiaohongshu)]',
  代理: 'text-blue-600 dark:text-blue-300',
  推送: 'text-emerald-600 dark:text-emerald-300',
}

export function LogList({ entries, className }: { entries: LogEntry[]; className?: string }) {
  if (entries.length === 0) {
    return (
      <div className="flex h-40 items-center justify-center rounded-xl border border-dashed border-[var(--border)] text-sm text-[var(--muted-foreground)]">
        还没有日志
      </div>
    )
  }

  return (
    <ul className={cn('flex flex-col gap-0.5 overflow-y-auto font-mono text-[12px]', className)}>
      {entries.toReversed().map((entry) => (
        <li
          key={entry.id}
          className="flex gap-2 rounded px-2 py-1 transition-colors hover:bg-[var(--accent)]"
        >
          <span className="shrink-0 text-[var(--muted-foreground)]/70">
            {entry.atLocal.slice(11)}
          </span>
          <span
            className={cn('shrink-0', SCOPE_COLOR[entry.scope] ?? 'text-[var(--muted-foreground)]')}
          >
            [{entry.scope}]
          </span>
          <span className={LEVEL_COLOR[entry.level]}>{entry.message}</span>
        </li>
      ))}
    </ul>
  )
}
