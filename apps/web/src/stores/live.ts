import type { DanmakuEvent, Platform, Status } from '@ps5lb/shared'
import { useStorage } from '@eivmosn/utils'
import { create } from 'zustand'
import { fetchStatus } from '@/lib/api'
import type { LogEntry } from '@/lib/types'

const storage = useStorage({ prefix: 'ps5lb.', type: 'localStorage' })

interface LiveStore {
  status: Status | null
  error: string | null
  danmaku: DanmakuEvent[]
  logs: LogEntry[]
  refresh: () => Promise<void>
  applyStatus: (status: Status) => void
  pushDanmaku: (event: DanmakuEvent) => void
  pushLog: (entry: LogEntry) => void
  toggle: (platform: Platform, enabled: boolean) => Promise<void>
  serverUrl: string
  setServerUrl: (url: string) => void
}

const MAX_DANMAKU = 300
const MAX_LOGS = 300

export const useLiveStore = create<LiveStore>((set, get) => ({
  status: null,
  error: null,
  danmaku: [],
  logs: [],
  serverUrl: storage.getStorage<string>('server-url') ?? window.location.origin,

  setServerUrl: (url) => {
    storage.setStorage('server-url', url)
    set({ serverUrl: url })
  },

  refresh: async () => {
    try {
      const status = await fetchStatus()
      set({ status, error: null })
    } catch (error) {
      set({ error: error instanceof Error ? error.message : '未知错误' })
    }
  },

  applyStatus: (status) => set({ status, error: null }),

  pushDanmaku: (event) => {
    const current = get().danmaku
    const next = [...current, event]
    set({ danmaku: next.length > MAX_DANMAKU ? next.slice(-MAX_DANMAKU) : next })
  },

  pushLog: (entry) => {
    const current = get().logs
    const next = [...current, entry]
    set({ logs: next.length > MAX_LOGS ? next.slice(-MAX_LOGS) : next })
  },

  toggle: async (platform, enabled) => {
    // 先本地生效，失败再回滚
    const previous = get().status
    if (previous) {
      set({
        status: {
          ...previous,
          platforms: previous.platforms.map((item) =>
            item.platform === platform ? { ...item, enabled } : item,
          ),
        },
      })
    }
    try {
      const response = await fetch(`/api/platforms/${platform}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled }),
      })
      if (!response.ok) throw new Error(`返回 ${response.status}`)
      await get().refresh()
    } catch (error) {
      if (previous) set({ status: previous })
      set({ error: error instanceof Error ? error.message : '切换失败' })
    }
  },
}))
