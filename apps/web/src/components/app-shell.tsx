import { useStorage } from '@eivmosn/utils'
import {
  CircleHelp,
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
  { to: '/help', label: '帮助', icon: CircleHelp },
]

const storage = useStorage({ prefix: 'ps5lb.', type: 'localStorage' })

interface AppShellProps {
  children?: ReactNode
}

/**
 * 收起：图标区 40×40 居中（轨道 64，内容区 48，居中后左边 12，中轴 32）
 * 展开：整行铺满，左侧内边距让图标与顶部徽章左边缘对齐
 */
const ITEM_SHAPE = {
  expanded: 'w-full gap-3 pl-2 pr-3 self-stretch',
  collapsed: 'size-10 self-center justify-center px-0 gap-0',
} as const
const LABEL_WIDTH = {
  expanded: 'max-w-[132px] opacity-100',
  collapsed: 'max-w-0 opacity-0',
} as const

interface RailItemProps {
  to?: string
  label: string
  collapsed: boolean
  icon: ReactNode
  onClick?: () => void
}

function RailItem({ to, label, collapsed, icon, onClick }: RailItemProps) {
  const content = (
    <>
      <span className="shrink-0">{icon}</span>
      <span
        className={cn(
          'overflow-hidden whitespace-nowrap text-sm font-medium transition-all duration-300 ease-out',
          collapsed ? LABEL_WIDTH.collapsed : LABEL_WIDTH.expanded,
        )}
      >
        {label}
      </span>
    </>
  )

  const base = cn(
    'flex h-10 items-center rounded-[10px] transition-all duration-300 ease-out',
    collapsed ? ITEM_SHAPE.collapsed : ITEM_SHAPE.expanded,
  )

  if (to) {
    return (
      <NavLink
        to={to}
        end={to === '/'}
        title={label}
        className={({ isActive }) =>
          cn(
            base,
            isActive
              ? 'bg-[var(--muted)] text-[var(--foreground)]'
              : 'text-[var(--muted-foreground)] hover:bg-[var(--accent)] hover:text-[var(--foreground)]',
          )
        }
      >
        {content}
      </NavLink>
    )
  }

  return (
    <button
      type="button"
      title={label}
      onClick={onClick}
      className={cn(
        base,
        'w-full text-[var(--muted-foreground)] hover:bg-[var(--accent)] hover:text-[var(--foreground)]',
      )}
    >
      {content}
    </button>
  )
}

export function AppShell({ children }: AppShellProps) {
  const { mode, toggle: toggleTheme } = useThemeStore()
  const [collapsed, setCollapsedState] = useState<boolean>(() => {
    // 支持 ?sidebar=collapsed 深链，方便截图与分享
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
    <div className="flex h-screen overflow-hidden bg-[var(--color-bg)]">
      <aside
        className={cn(
          'sticky top-0 hidden h-screen shrink-0 flex-col overflow-hidden border-r border-[var(--border)]',
          'bg-[var(--card)] transition-[width] duration-300 ease-out md:flex',
          collapsed ? 'w-16' : 'w-56',
        )}
      >
        <div
          className={cn(
            'flex h-16 shrink-0 items-center gap-2.5 transition-[padding] duration-300 ease-out',
            collapsed ? 'pl-3' : 'pl-4',
          )}
        >
          <span className="inline-flex size-10 shrink-0 items-center justify-center rounded-[10px] bg-[#003791] text-white">
            <PlayStationLogo size={22} />
          </span>
          <div
            className={cn(
              'overflow-hidden whitespace-nowrap transition-all duration-300 ease-out',
              collapsed ? 'max-w-0 opacity-0' : 'max-w-[140px] opacity-100',
            )}
          >
            <div className="text-sm font-semibold text-[var(--foreground)]">直播桥</div>
            <div className="text-[11px] text-[var(--muted-foreground)]">Live Bridge</div>
          </div>
        </div>

        <nav className="flex flex-1 flex-col gap-1 overflow-hidden px-2">
          {NAV.map((item) => {
            const Icon = item.icon
            return (
              <RailItem
                key={item.to}
                to={item.to}
                collapsed={collapsed}
                label={item.label}
                icon={<Icon size={18} strokeWidth={1.9} />}
              />
            )
          })}
        </nav>

        <div className="flex flex-col gap-1 border-t border-[var(--border)] p-2">
          <RailItem
            collapsed={collapsed}
            label={collapsed ? '展开' : '收起侧边栏'}
            icon={collapsed ? <PanelLeftOpen size={18} /> : <PanelLeftClose size={18} />}
            onClick={() => setCollapsed(!collapsed)}
          />
          <RailItem
            collapsed={collapsed}
            label={mode === 'dark' ? '浅色模式' : '深色模式'}
            icon={mode === 'dark' ? <Sun size={18} /> : <Moon size={18} />}
            onClick={toggleTheme}
          />
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <nav className="flex items-center gap-1 overflow-x-auto border-b border-[var(--border)] bg-[var(--card)] p-2 md:hidden">
          {NAV.map((item) => {
            const Icon = item.icon
            return (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.to === '/'}
                className={({ isActive }) =>
                  cn(
                    'flex shrink-0 items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm',
                    isActive
                      ? 'bg-[var(--muted)] text-[var(--foreground)]'
                      : 'text-[var(--muted-foreground)]',
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
            className="ml-auto rounded-lg p-2 text-[var(--muted-foreground)]"
          >
            {mode === 'dark' ? <Sun size={16} /> : <Moon size={16} />}
          </button>
        </nav>

        <main className="min-w-0 flex-1 overflow-y-auto">
          <div className="mx-auto flex min-h-full w-full max-w-5xl flex-col p-5 md:p-7">
            {children ?? <Outlet />}
          </div>
        </main>
      </div>
    </div>
  )
}
