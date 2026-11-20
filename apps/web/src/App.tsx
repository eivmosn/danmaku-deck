import { formatDate } from '@eivmosn/utils'
import { useEffect } from 'react'
import { PlatformCard } from './components/platform-card'
import { Badge } from './components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from './components/ui/card'
import { useLiveStore } from './stores/live'

const STATE_TEXT: Record<string, string> = {
  idle: '未开播',
  starting: '启动中',
  live: '直播中',
  stopping: '收尾中',
  error: '出错',
}

export function App() {
  const { status, error, enabled, refresh, toggle } = useLiveStore()

  useEffect(() => {
    void refresh()
    const timer = setInterval(() => void refresh(), 5000)
    return () => clearInterval(timer)
  }, [refresh])

  return (
    <main className="mx-auto flex max-w-3xl flex-col gap-5 p-6">
      <header className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">PS5 直播桥</h1>
        <div className="flex items-center gap-3">
          {status ? (
            <span className="text-xs text-[var(--color-muted)]">
              更新于 {formatDate(status.updatedAt, 'HH:mm:ss')}
            </span>
          ) : null}
          <Badge tone={status?.state === 'live' ? 'success' : 'neutral'}>
            {STATE_TEXT[status?.state ?? 'idle'] ?? '未知'}
          </Badge>
        </div>
      </header>

      {error ? (
        <Card>
          <CardHeader>
            <CardTitle>连接失败</CardTitle>
          </CardHeader>
          <CardContent>{error}</CardContent>
        </Card>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-2">
        <PlatformCard
          platform="bilibili"
          enabled={enabled.bilibili}
          accountName={
            status?.platforms.find((item) => item.platform === 'bilibili')?.accountName ?? null
          }
          live={status?.state === 'live'}
          onToggle={() => toggle('bilibili')}
        />
        <PlatformCard
          platform="xiaohongshu"
          enabled={enabled.xiaohongshu}
          accountName={
            status?.platforms.find((item) => item.platform === 'xiaohongshu')?.accountName ?? null
          }
          live={status?.state === 'live'}
          onToggle={() => toggle('xiaohongshu')}
        />
      </div>
    </main>
  )
}
