import { useStorage } from '@eivmosn/utils'
import {
  LayoutDashboard,
  MessagesSquare,
  Moon,
  PanelLeftClose,
  PanelLeftOpen,
  ScrollText,
  Settings,
  Sun,
  type LucideIcon,
} from 'lucide-react'
import { useState, type ReactNode } from 'react'
import { NavLink, Outlet } from 'react-router'
import { PlayStationLogo } from '@/components/brand-logos'
import { cn } from '@/lib/cn'
import { useThemeStore } from '@/stores/theme'

const NAV: Array<{ to: string; label: string; icon: LucideIcon }> = [
  { to: '/', label: '概览', icon: LayoutDashboard },
  { to: '/danmaku', label: '弹幕', icon: MessagesSquare },
  { to: '/logs', label: '日志', icon: ScrollText },
  { to: '/settings', label: '设置', icon: Settings },
]

const storage = useStorage({ prefix: 'ps5lb.', type: 'localStorage' })

interface AppShellProps {
  live: boolean
}

const RAIL_CLASS = (collapsed: boolean, active: boolean): string =>
  cn(
    'flex h-10 items-center rounded-xl transition-colors duration-200',
    collapsed ? 'mx-auto w-10 justify-center' : 'w-full gap-3 px-3',
    active
      ? 'bg-[var(--color-elevated)] text-[var(--color-fg)]'
      : 'text-[var(--color-muted)] hover:bg-[var(--color-hover)] hover:text-[var(--color-fg)]',
  )

interface RailItemProps {
  to: string
  label: string
  collapsed: boolean
  icon: ReactNode
}

/** 收起时固定 40×40 居中，展开时整行左对齐 —— 两种状态各自对称 */
function RailItem({ to, label, collapsed, icon }: RailItemProps) {
  return (
    <NavLink
      end={to === '/'}
      to={to}
      title={label}
      className={({ isActive }) => RAIL_CLASS(collapsed, isActive)}
    >
      {icon}
      {collapsed ? null : <span className="whitespace-nowrap text-sm font-medium">{label}</span>}
    </NavLink>
  )
}

export function AppShell({ live }: AppShellProps) {
  const { mode, toggle: toggleTheme } = useThemeStore()
  const [collapsed, setCollapsedState] = useState<boolean>(() => {
    const forced = new URLSearchParams(window.location.search).get('sidebar')
    if (forced === 'collapsed') return true
    if (forced === 'expanded') return false
    return storage.getStorage<boolean>('sidebar-collapsed') ?? false
  })

  const setCollapsed = (value: boolean): void => {
    storage.setStorage('sidebar-collapsed', value)
    setCollapsedState(value)
  }

  return (
    <div className="flex min-h-screen bg-[var(--color-bg)]">
      <aside
        className={cn(
          'sticky top-0 hidden h-screen shrink-0 flex-col overflow-hidden border-r border-[var(--color-border)]',
          'bg-[var(--color-surface)] transition-[width] duration-300 ease-out md:flex',
          collapsed ? 'w-16' : 'w-56',
        )}
      >
        <div
          className={cn('flex h-16 items-center', collapsed ? 'justify-center' : 'gap-2.5 px-4')}
        >
          <span className="inline-flex shrink-0 items-center justify-center rounded-2xl bg-[#003791] p-2.5 text-white">
            <PlayStationLogo size={22} />
          </span>
          {collapsed ? null : (
            <div className="whitespace-nowrap leading-tight">
              <div className="whitespace-nowrap text-sm font-semibold text-[var(--color-fg)]">
                直播桥
              </div>
              <div className="whitespace-nowrap text-[11px] text-[var(--color-muted)]">
                Live Bridge
              </div>
            </div>
          )}
        </div>

        <nav className={cn('flex flex-1 flex-col gap-1', collapsed ? 'px-2' : 'px-2')}>
          {NAV.map((item) => {
            const Icon = item.icon
            return (
              <RailItem
                key={item.to}
                to={item.to}
                collapsed={collapsed}
                label={item.label}
                icon={<Icon size={18} strokeWidth={1.9} className="shrink-0" />}
              />
            )
          })}
        </nav>

        <div className="flex flex-col gap-1 border-t border-[var(--color-border)] p-2">
          <button
            type="button"
            title={collapsed ? '展开侧边栏' : '收起侧边栏'}
            onClick={() => setCollapsed(!collapsed)}
            className={RAIL_CLASS(collapsed, false)}
          >
            {collapsed ? (
              <PanelLeftOpen size={18} className="shrink-0" />
            ) : (
              <PanelLeftClose size={18} className="shrink-0" />
            )}
            {collapsed ? null : (
              <span className="whitespace-nowrap text-sm font-medium">收起侧边栏</span>
            )}
          </button>
          <button
            type="button"
            title="切换主题"
            onClick={toggleTheme}
            className={RAIL_CLASS(collapsed, false)}
          >
            {mode === 'dark' ? (
              <Sun size={18} className="shrink-0" />
            ) : (
              <Moon size={18} className="shrink-0" />
            )}
            {collapsed ? null : (
              <span className="whitespace-nowrap text-sm font-medium">
                {mode === 'dark' ? '浅色模式' : '深色模式'}
              </span>
            )}
          </button>
          <div
            className={cn(
              'flex h-9 items-center text-[11px] text-[var(--color-muted)]',
              collapsed ? 'justify-center' : 'gap-2 px-3',
            )}
          >
            <span
              className={cn(
                'size-2 shrink-0 rounded-full',
                live
                  ? 'bg-emerald-500 shadow-[0_0_8px] shadow-emerald-500/60'
                  : 'bg-[var(--color-muted)]/40',
              )}
            />
            {collapsed ? null : (
              <span className="whitespace-nowrap">{live ? '直播中' : '未开播'}</span>
            )}
          </div>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <nav className="flex items-center gap-1 overflow-x-auto border-b border-[var(--color-border)] bg-[var(--color-surface)] p-2 md:hidden">
          {NAV.map((item) => {
            const Icon = item.icon
            return (
              <NavLink
                key={item.to}
                end={item.to === '/'}
                to={item.to}
                className={({ isActive }) =>
                  cn(
                    'flex shrink-0 items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm',
                    isActive
                      ? 'bg-[var(--color-elevated)] text-[var(--color-fg)]'
                      : 'text-[var(--color-muted)]',
                  )
                }
              >
                <Icon size={16} />
                {item.label}
              </NavLink>
            )
          })}
          <button
            type="button"
            onClick={toggleTheme}
            aria-label="切换主题"
            className="ml-auto rounded-lg p-2 text-[var(--color-muted)]"
          >
            {mode === 'dark' ? <Sun size={16} /> : <Moon size={16} />}
          </button>
        </nav>

        <main className="mx-auto w-full max-w-5xl flex-1 p-5 md:p-7">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
