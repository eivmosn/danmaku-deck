import type { DanmakuEvent, Status } from '@ps5lb/shared'
import { useEffect, useState } from 'react'
import { AppShell, type PageKey } from '@/components/app-shell'
import { useEventStream } from '@/lib/sse'
import type { LogEntry } from '@/lib/types'
import { DashboardPage } from '@/pages/dashboard'
import { DanmakuPage } from '@/pages/danmaku'
import { LogsPage } from '@/pages/logs'
import { SettingsPage } from '@/pages/settings'
import { useLiveStore } from '@/stores/live'

export function App() {
  const [page, setPage] = useState<PageKey>('dashboard')
  const { status, refresh, applyStatus, pushDanmaku, pushLog } = useLiveStore()

  // 首屏拉一次，之后靠 SSE
  useEffect(() => {
    void refresh()
  }, [refresh])

  useEventStream<Status>('/api/events', applyStatus)
  useEventStream<DanmakuEvent>('/api/events/danmaku/stream', pushDanmaku)
  useEventStream<LogEntry>('/api/logs/stream', pushLog)

  return (
    <AppShell page={page} onNavigate={setPage} live={status?.state === 'live'}>
      {page === 'dashboard' ? <DashboardPage onOpenLogs={() => setPage('logs')} /> : null}
      {page === 'danmaku' ? <DanmakuPage /> : null}
      {page === 'logs' ? <LogsPage /> : null}
      {page === 'settings' ? <SettingsPage /> : null}
    </AppShell>
  )
}
