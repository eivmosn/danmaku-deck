import { useState } from 'react'
import { Link } from 'react-router'
import { LoginRequiredDialog } from '@/components/login-required-dialog'
import type { Platform } from '@danmaku-deck/shared'
import { LivePanel } from '@/components/live-panel'
import { PlatformCard } from '@/components/platform-card'
import { DanmakuList } from '@/components/danmaku-list'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { useLiveStore } from '@/stores/live'
import { formatUptime, STATE_TEXT } from '@/lib/format'

export function DashboardPage() {
  const { status, danmaku, toggle, requestEnable } = useLiveStore()
  const live = status?.state === 'live'
  const [needLogin, setNeedLogin] = useState<Platform | null>(null)

  const onToggle = (platform: Platform, enabled: boolean): void => {
    const account = status?.platforms.find((item) => item.platform === platform)?.accountName
    // 没登录就开推送 → 先引导登录，别让开关假装生效
    if (enabled && !account) {
      requestEnable(platform)
      setNeedLogin(platform)
      return
    }
    void toggle(platform, enabled)
  }

  return (
    <div className="flex flex-col gap-5">
      <header className="flex items-end justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-[var(--foreground)]">概览</h1>
          <p className="mt-1 text-sm text-[var(--muted-foreground)]">
            {live
              ? `本场已播 ${formatUptime(status?.uptimeSeconds ?? 0)}`
              : 'PS5 一旦开始直播，这里会实时显示状态'}
          </p>
        </div>
        <span
          className={`rounded-full px-3 py-1 text-xs ${
            live
              ? 'bg-emerald-500/12 text-emerald-600 dark:text-emerald-300'
              : 'bg-[var(--muted)] text-[var(--muted-foreground)]'
          }`}
        >
          {STATE_TEXT[status?.state ?? 'idle'] ?? '未知'}
        </span>
      </header>

      <LivePanel status={status} />

      <section className="grid gap-3 md:grid-cols-2">
        <PlatformCard
          platform="bilibili"
          status={status?.platforms.find((item) => item.platform === 'bilibili')}
          onToggle={(enabled) => onToggle('bilibili', enabled)}
        />
        <PlatformCard
          platform="xiaohongshu"
          status={status?.platforms.find((item) => item.platform === 'xiaohongshu')}
          onToggle={(enabled) => onToggle('xiaohongshu', enabled)}
        />
      </section>

      <Card className="flex min-h-0 flex-1 flex-col">
        <CardHeader>
          <CardTitle className="text-sm">观众弹幕</CardTitle>
          <Link
            to="/danmaku"
            className="text-[11px] text-[var(--muted-foreground)] hover:text-[var(--foreground)]"
          >
            查看全部
          </Link>
        </CardHeader>
        <CardContent className="min-h-0 flex-1">
          <DanmakuList
            items={danmaku.slice(-12)}
            className="max-h-[46vh]"
            empty={live ? '还没有人说话' : '开播后，两边的弹幕都会汇到这里'}
          />
        </CardContent>
      </Card>

      <LoginRequiredDialog platform={needLogin} onClose={() => setNeedLogin(null)} />
    </div>
  )
}
