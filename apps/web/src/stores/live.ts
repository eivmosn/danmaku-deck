import type { Platform, Status } from '@ps5lb/shared'
import { create } from 'zustand'
import { fetchStatus } from '../lib/api'

interface LiveStore {
  status: Status | null
  error: string | null
  loading: boolean
  enabled: Record<Platform, boolean>
  refresh: () => Promise<void>
  toggle: (platform: Platform) => void
}

/** 直播状态与平台开关；P0 只有本地开关，接服务端后改成乐观更新 */
export const useLiveStore = create<LiveStore>((set, get) => ({
  status: null,
  error: null,
  loading: false,
  enabled: { bilibili: true, xiaohongshu: false },

  refresh: async () => {
    set({ loading: true, error: null })
    try {
      const status = await fetchStatus()
      set({ status, loading: false })
    } catch (error) {
      set({ error: error instanceof Error ? error.message : '未知错误', loading: false })
    }
  },

  toggle: (platform) => {
    const current = get().enabled
    set({ enabled: { ...current, [platform]: !current[platform] } })
  },
}))
