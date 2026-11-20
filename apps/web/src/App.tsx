import type { DanmakuEvent, Status } from '@ps5lb/shared'
import { useEffect } from 'react'
import { Navigate, Route, Routes } from 'react-router'
import { AppShell } from '@/components/app-shell'
import { useEventStream } from '@/lib/sse'
import type { LogEntry } from '@/lib/types'
import { DashboardPage } from '@/pages/dashboard'
import { DanmakuPage } from '@/pages/danmaku'
import { LogsPage } from '@/pages/logs'
import { SettingsPage } from '@/pages/settings'
import { useLiveStore } from '@/stores/live'

export function App() {
  const { status, refresh, applyStatus, pushDanmaku, pushLog } = useLiveStore()

  useEffect(() => {
    void refresh()
  }, [refresh])

  useEventStream<Status>('/api/events', applyStatus)
  useEventStream<DanmakuEvent>('/api/events/danmaku/stream', pushDanmaku)
  useEventStream<LogEntry>('/api/logs/stream', pushLog)

  return (
    <Routes>
      <Route element={<AppShell live={status?.state === 'live'} />}>
        <Route index element={<DashboardPage />} />
        <Route path="danmaku" element={<DanmakuPage />} />
        <Route path="logs" element={<LogsPage />} />
        <Route path="settings" element={<SettingsPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  )
}
