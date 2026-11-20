import { Activity, Clock, Radio, Waypoints } from 'lucide-react'
import { PlatformCard } from '@/components/platform-card'
import { StatCard } from '@/components/stat-card'
import { DanmakuList } from '@/components/danmaku-list'
import { LogList } from '@/components/log-list'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { useLiveStore } from '@/stores/live'
import { formatUptime, STATE_TEXT } from '@/lib/format'

export function DashboardPage({ onOpenLogs }: { onOpenLogs: () => void }) {
  const { status, danmaku, logs, toggle } = useLiveStore()
  const live = status?.state === 'live'

  return (
    <div className="flex flex-col gap-5">
      <header className="flex items-end justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-[var(--color-fg)]">概览</h1>
          <p className="mt-1 text-sm text-[var(--color-muted)]">PS5 推流进来到分发的全链路状态</p>
        </div>
        <span
          className={`rounded-full px-3 py-1 text-xs ${
            live
              ? 'bg-emerald-500/12 text-emerald-600 dark:text-emerald-300'
              : 'bg-[var(--color-elevated)] text-[var(--color-muted)]'
          }`}
        >
          {STATE_TEXT[status?.state ?? 'idle'] ?? '未知'}
        </span>
      </header>

      <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard
          label="状态"
          value={STATE_TEXT[status?.state ?? 'idle'] ?? '—'}
          icon={Radio}
          accent={live ? '#34d399' : undefined}
        />
        <StatCard
          label="已直播"
          value={formatUptime(status?.uptimeSeconds ?? 0)}
          hint="本场时长"
          icon={Clock}
        />
        <StatCard
          label="收流路径"
          value={status?.streamPath ?? '—'}
          hint="PS5 推流标识"
          icon={Waypoints}
        />
        <StatCard
          label="今日事件"
          value={danmaku.length}
          hint="弹幕 / 礼物 / 进场"
          icon={Activity}
          accent="var(--color-bilibili)"
        />
      </section>

      <section className="grid gap-3 md:grid-cols-2">
        <PlatformCard
          platform="bilibili"
          status={status?.platforms.find((item) => item.platform === 'bilibili')}
          onToggle={(enabled) => void toggle('bilibili', enabled)}
        />
        <PlatformCard
          platform="xiaohongshu"
          status={status?.platforms.find((item) => item.platform === 'xiaohongshu')}
          onToggle={(enabled) => void toggle('xiaohongshu', enabled)}
        />
      </section>

      <section className="grid gap-3 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">最新弹幕</CardTitle>
            <span className="text-[11px] text-[var(--color-muted)]">{danmaku.length} 条</span>
          </CardHeader>
          <CardContent>
            <DanmakuList items={danmaku.slice(-8)} className="max-h-64" empty="等 PS5 开播后出现" />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-sm">实时日志</CardTitle>
            <Button variant="ghost" size="sm" onClick={onOpenLogs}>
              全部
            </Button>
          </CardHeader>
          <CardContent>
            <LogList entries={logs.slice(-10)} className="max-h-64" />
          </CardContent>
        </Card>
      </section>
    </div>
  )
}
