import type { LiveState, Platform, PlatformStatus, Status } from '@ps5lb/shared'

const PLATFORMS: Platform[] = ['bilibili', 'xiaohongshu']

/**
 * 直播编排状态。P0 阶段是内存实现，后续接 mediamtx 事件与平台适配器。
 * 保持纯函数 + 显式变更，方便单测与后续替换成事件驱动。
 */
export class LiveStateStore {
  private state: LiveState = 'idle'
  private startedAt: number | null = null
  private readonly platforms = new Map<Platform, PlatformStatus>()

  constructor(now: () => number = Date.now) {
    this.now = now
    for (const platform of PLATFORMS) {
      this.platforms.set(platform, {
        platform,
        enabled: false,
        accountName: null,
        live: false,
        error: null,
      })
    }
  }

  private readonly now: () => number

  setState(state: LiveState): void {
    this.state = state
    this.startedAt = state === 'live' ? this.now() : null
  }

  setPlatform(
    platform: Platform,
    patch: Partial<Omit<PlatformStatus, 'platform'>>
  ): PlatformStatus {
    const current = this.platforms.get(platform)
    if (!current) throw new Error(`未知平台：${platform}`)
    const next = { ...current, ...patch, platform }
    this.platforms.set(platform, next)
    return next
  }

  snapshot(): Status {
    const uptime =
      this.startedAt === null ? 0 : Math.max(0, Math.floor((this.now() - this.startedAt) / 1000))
    return {
      state: this.state,
      uptimeSeconds: uptime,
      platforms: [...this.platforms.values()],
      updatedAt: new Date(this.now()).toISOString(),
    }
  }
}
