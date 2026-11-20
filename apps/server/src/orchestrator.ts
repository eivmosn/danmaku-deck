import type { LiveState, Platform, PlatformStatus, Status } from '@danmaku-deck/shared'

const PLATFORMS: Platform[] = ['bilibili', 'xiaohongshu']

export interface OrchestratorLogger {
  info: (message: string, fields?: Record<string, unknown>) => unknown
}

export interface OrchestratorOptions {
  /** 注入时钟，测试用 */
  now?: () => number
  /** 领域日志；不传则静默 */
  logger?: OrchestratorLogger
}

/**
 * 直播编排状态机。
 *
 * 状态迁移由收流事件驱动（MediaMTX 的 runOnAvailable / runOnUnavailable）：
 *   idle --收流开始--> starting --> live
 *   live --收流结束--> stopping --> idle
 *
 * 迁移过程会通知订阅者（SSE 用），每次通知都带完整快照。
 */
export class Orchestrator {
  private readonly now: () => number
  private state: LiveState = 'idle'
  private startedAt: number | null = null
  private streamPath: string | null = null
  private readonly platforms = new Map<Platform, PlatformStatus>()
  private readonly listeners = new Set<(status: Status) => void>()
  private readonly logger?: OrchestratorLogger

  constructor(options: OrchestratorOptions = {}) {
    this.now = options.now ?? Date.now
    this.logger = options.logger
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

  /** 重新广播当前快照：登录、切开关、改推流地址之后用它触发服务重新同步 */
  refresh(): void {
    this.emit()
  }

  /** 订阅状态变化，返回取消订阅函数 */
  onStatus(listener: (status: Status) => void): () => void {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  /** PS5 开始推流 */
  streamStarted(path: string): void {
    if (this.state === 'live' || this.state === 'starting') return
    this.streamPath = path
    this.logger?.info('检测到 PS5 开始推流', { path })
    this.transition('starting')
    this.startedAt = this.now()
    this.transition('live')
  }

  /** PS5 停止推流 */
  streamStopped(): void {
    if (this.state === 'idle' || this.state === 'stopping') return
    this.logger?.info('PS5 已停止推流', { path: this.streamPath })
    this.transition('stopping')
    this.startedAt = null
    this.streamPath = null
    this.transition('idle')
  }

  setPlatform(
    platform: Platform,
    patch: Partial<Omit<PlatformStatus, 'platform'>>,
  ): PlatformStatus {
    const current = this.platforms.get(platform)
    if (!current) throw new Error(`未知平台：${platform}`)
    const next: PlatformStatus = { ...current, ...patch, platform }
    this.platforms.set(platform, next)
    this.emit()
    return next
  }

  snapshot(): Status {
    const uptime =
      this.startedAt === null ? 0 : Math.max(0, Math.floor((this.now() - this.startedAt) / 1000))
    return {
      state: this.state,
      uptimeSeconds: uptime,
      platforms: [...this.platforms.values()],
      streamPath: this.streamPath,
      updatedAt: new Date(this.now()).toISOString(),
    }
  }

  private transition(next: LiveState): void {
    this.state = next
    this.emit()
  }

  private emit(): void {
    const snapshot = this.snapshot()
    for (const listener of this.listeners) {
      listener(snapshot)
    }
  }
}
