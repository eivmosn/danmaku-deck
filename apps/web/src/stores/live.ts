import type { Platform, Status } from '@ps5lb/shared'
import { useStorage } from '@eivmosn/utils'
import { create } from 'zustand'
import { fetchStatus } from '../lib/api'

const storage = useStorage({ prefix: 'ps5lb.', type: 'localStorage' })
const ENABLED_KEY = 'enabled-platforms'

const defaultEnabled: Record<Platform, boolean> = { bilibili: true, xiaohongshu: false }
const savedEnabled = storage.getStorage<Record<Platform, boolean>>(ENABLED_KEY)

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
  enabled: savedEnabled ?? defaultEnabled,

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
    const next = { ...current, [platform]: !current[platform] }
    storage.setStorage(ENABLED_KEY, next)
    set({ enabled: next })
  },
}))
