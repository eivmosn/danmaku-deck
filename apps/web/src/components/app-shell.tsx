import type { ReactNode } from 'react'
import { cn } from '@/lib/cn'

export type PageKey = 'dashboard' | 'danmaku' | 'logs' | 'settings'

const NAV: Array<{ key: PageKey; label: string; hint: string; icon: string }> = [
  { key: 'dashboard', label: '概览', hint: '实时状态', icon: '▦' },
  { key: 'danmaku', label: '弹幕', hint: '两平台混排', icon: '◈' },
  { key: 'logs', label: '日志', hint: '中文实时日志', icon: '≡' },
  { key: 'settings', label: '设置', hint: '服务与账号', icon: '⚙' },
]

interface AppShellProps {
  page: PageKey
  onNavigate: (page: PageKey) => void
  live: boolean
  children: ReactNode
}

export function AppShell({ page, onNavigate, live, children }: AppShellProps) {
  return (
    <div className="flex min-h-screen">
      <aside className="sticky top-0 hidden h-screen w-56 shrink-0 flex-col gap-1 border-r border-[var(--color-border)] bg-[var(--color-surface)]/60 p-4 md:flex">
        <div className="mb-5 flex items-center gap-2 px-2">
          <span className="inline-flex size-8 items-center justify-center rounded-xl bg-white text-sm font-bold text-black">
            PS
          </span>
          <div className="leading-tight">
            <div className="text-sm font-semibold">直播桥</div>
            <div className="text-[11px] text-[var(--color-muted)]">Live Bridge</div>
          </div>
        </div>

        {NAV.map((item) => {
          const active = item.key === page
          return (
            <button
              key={item.key}
              type="button"
              onClick={() => onNavigate(item.key)}
              className={cn(
                'flex items-center gap-3 rounded-xl px-3 py-2.5 text-left transition-colors',
                active
                  ? 'bg-white/10 text-white'
                  : 'text-white/60 hover:bg-white/5 hover:text-white/90',
              )}
            >
              <span className={cn('text-sm', active ? 'text-white' : 'text-white/40')}>
                {item.icon}
              </span>
              <span className="flex flex-col">
                <span className="text-sm font-medium">{item.label}</span>
                <span className="text-[11px] text-[var(--color-muted)]">{item.hint}</span>
              </span>
            </button>
          )
        })}

        <div className="mt-auto rounded-xl border border-[var(--color-border)] p-3 text-[11px] text-[var(--color-muted)]">
          <div className="flex items-center gap-2">
            <span
              className={cn(
                'inline-block size-2 rounded-full',
                live ? 'bg-emerald-400' : 'bg-white/25',
              )}
            />
            {live ? '直播中' : '未开播'}
          </div>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <nav className="flex gap-1 overflow-x-auto border-b border-[var(--color-border)] p-2 md:hidden">
          {NAV.map((item) => (
            <button
              key={item.key}
              type="button"
              onClick={() => onNavigate(item.key)}
              className={cn(
                'shrink-0 rounded-lg px-3 py-1.5 text-sm',
                item.key === page ? 'bg-white/10 text-white' : 'text-white/60',
              )}
            >
              {item.label}
            </button>
          ))}
        </nav>
        <main className="mx-auto w-full max-w-5xl flex-1 p-5 md:p-7">{children}</main>
      </div>
    </div>
  )
}
