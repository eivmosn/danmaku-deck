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
import { motion } from 'motion/react'
import { useState } from 'react'
import { NavLink, Outlet } from 'react-router'
import { PlayStationLogo } from '@/components/brand-logos'
import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Separator } from '@/components/ui/separator'
import { Tooltip, TooltipPopup, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'
import { useThemeStore } from '@/stores/theme'

const NAV: Array<{ to: string; label: string; icon: LucideIcon }> = [
  { to: '/', label: '概览', icon: LayoutDashboard },
  { to: '/danmaku', label: '弹幕', icon: MessagesSquare },
  { to: '/logs', label: '日志', icon: ScrollText },
  { to: '/settings', label: '设置', icon: Settings },
  { to: '/help', label: '帮助', icon: CircleHelp },
]

const storage = useStorage({ prefix: 'ps5lb.', type: 'localStorage' })
const WIDTH = { expanded: 224, collapsed: 64 }

interface NavButtonProps {
  to?: string
  label: string
  icon: LucideIcon
  collapsed: boolean
  onClick?: () => void
}

/** 导航项：coss Button + Tooltip，收起时只显示图标 */
function NavButton({ to, label, icon: Icon, collapsed, onClick }: NavButtonProps) {
  const content = (
    <Button
      variant="ghost"
      size={collapsed ? 'icon' : 'sm'}
      className={cn(
        'justify-start overflow-hidden',
        collapsed ? 'mx-auto size-10 justify-center' : 'w-full gap-2.5 px-2',
      )}
      render={to ? <NavLink to={to} end={to === '/'} /> : undefined}
      onClick={onClick}
      aria-label={label}
    >
      <Icon size={18} strokeWidth={1.9} />
      <motion.span
        className="whitespace-nowrap"
        animate={{ width: collapsed ? 0 : 'auto', opacity: collapsed ? 0 : 1 }}
        transition={{ duration: 0.22, ease: 'easeOut' }}
      >
        {label}
      </motion.span>
    </Button>
  )

  if (!collapsed) return content
  return (
    <Tooltip>
      <TooltipTrigger render={content} />
      <TooltipPopup side="right">{label}</TooltipPopup>
    </Tooltip>
  )
}

export function AppShell({ children }: { children?: React.ReactNode }) {
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
    <TooltipProvider>
      <div className="flex h-screen overflow-hidden bg-background">
        <motion.aside
          animate={{ width: collapsed ? WIDTH.collapsed : WIDTH.expanded }}
          transition={{ type: 'spring', stiffness: 320, damping: 32 }}
          className="hidden h-screen shrink-0 flex-col overflow-hidden border-r bg-card md:flex"
        >
          <div
            className={cn('flex h-16 items-center', collapsed ? 'justify-center' : 'gap-2.5 px-3')}
          >
            <span className="inline-flex size-10 shrink-0 items-center justify-center rounded-lg bg-playstation text-white">
              <PlayStationLogo size={22} />
            </span>
            <motion.div
              className="overflow-hidden whitespace-nowrap"
              animate={{ width: collapsed ? 0 : 'auto', opacity: collapsed ? 0 : 1 }}
              transition={{ duration: 0.22, ease: 'easeOut' }}
            >
              <div className="text-sm font-semibold">直播桥</div>
              <div className="text-[11px] text-muted-foreground">Live Bridge</div>
            </motion.div>
          </div>

          <ScrollArea className="flex-1">
            <nav className={cn('flex flex-col gap-1 py-2', collapsed ? 'px-2' : 'px-2')}>
              {NAV.map((item) => (
                <NavButton
                  key={item.to}
                  to={item.to}
                  label={item.label}
                  icon={item.icon}
                  collapsed={collapsed}
                />
              ))}
            </nav>
          </ScrollArea>

          <Separator />
          <div className="flex flex-col gap-1 p-2">
            <NavButton
              collapsed={collapsed}
              label={collapsed ? '展开侧边栏' : '收起侧边栏'}
              icon={collapsed ? PanelLeftOpen : PanelLeftClose}
              onClick={() => setCollapsed(!collapsed)}
            />
            <NavButton
              collapsed={collapsed}
              label={mode === 'dark' ? '浅色模式' : '深色模式'}
              icon={mode === 'dark' ? Sun : Moon}
              onClick={toggleTheme}
            />
          </div>
        </motion.aside>

        <div className="flex min-w-0 flex-1 flex-col">
          <nav className="flex items-center gap-1 overflow-x-auto border-b bg-card p-2 md:hidden">
            {NAV.map((item) => {
              const Icon = item.icon
              return (
                <Button
                  key={item.to}
                  variant="ghost"
                  size="sm"
                  render={<NavLink to={item.to} end={item.to === '/'} />}
                >
                  <Icon size={16} />
                  {item.label}
                </Button>
              )
            })}
            <Button
              variant="ghost"
              size="icon-sm"
              className="ml-auto"
              onClick={toggleTheme}
              aria-label="切换主题"
            >
              {mode === 'dark' ? <Sun size={16} /> : <Moon size={16} />}
            </Button>
          </nav>

          <main className="min-w-0 flex-1 overflow-y-auto">
            <div className="mx-auto flex min-h-full w-full max-w-5xl flex-col p-5 md:p-7">
              {children ?? <Outlet />}
            </div>
          </main>
        </div>
      </div>
    </TooltipProvider>
  )
}
