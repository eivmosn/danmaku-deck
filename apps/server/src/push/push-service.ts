import type { Platform, Status } from '@ps5lb/shared'
import type { AccountsStore } from '@/accounts/store'
import type { LogService } from '@/logger'
import type { Orchestrator } from '@/orchestrator'
import { FfmpegPusher, type PushTarget } from './ffmpeg-pusher'

export interface PushProcessPort {
  start: () => void
  stop: () => void
  running: boolean
}

export interface PushServiceDeps {
  orchestrator: Orchestrator
  accounts: AccountsStore
  logs: LogService
  /** 由收流路径拼出本地拉流地址 */
  inputUrl: (streamPath: string) => string
  /** 解析平台推流地址；返回 null 表示暂时拿不到（如尚未开播） */
  resolveTarget: (platform: Platform) => Promise<PushTarget | null>
  createPusher?: (target: PushTarget) => PushProcessPort
}

const LABEL: Record<Platform, 'B站' | '小红书'> = { bilibili: 'B站', xiaohongshu: '小红书' }

/**
 * 推流编排：开播时按平台开关各起一路 ffmpeg，停播时全部收掉。
 * 推流地址由 resolveTarget 提供，拿不到就记录原因并跳过这一路。
 */
export class PushService {
  private readonly pushers = new Map<Platform, PushProcessPort>()
  private unsubscribe: (() => void) | null = null
  private starting = false

  constructor(private readonly deps: PushServiceDeps) {}

  start(): void {
    if (this.unsubscribe) return
    this.unsubscribe = this.deps.orchestrator.onStatus((status) => {
      void this.sync(status)
    })
    void this.sync(this.deps.orchestrator.snapshot())
  }

  stop(): void {
    this.unsubscribe?.()
    this.unsubscribe = null
    this.stopAll()
  }

  private async sync(status: Status): Promise<void> {
    if (status.state !== 'live') {
      this.stopAll()
      return
    }
    if (this.starting) return
    this.starting = true
    try {
      // 两路互不依赖，并发启动
      const pending = (['bilibili', 'xiaohongshu'] as Platform[]).filter((platform) => {
        if (this.pushers.has(platform)) return false
        return Boolean(status.platforms.find((item) => item.platform === platform)?.enabled)
      })
      await Promise.all(pending.map((platform) => this.startPlatform(platform)))
    } finally {
      this.starting = false
    }
  }

  private async startPlatform(platform: Platform): Promise<void> {
    const label = LABEL[platform]
    if (!this.deps.accounts.get(platform)) {
      this.deps.logs.write('warn', label, '未登录，跳过推流')
      return
    }

    let target: PushTarget | null = null
    try {
      target = await this.deps.resolveTarget(platform)
    } catch (error) {
      this.deps.logs.write('error', label, `取推流地址失败：${message(error)}`)
      return
    }
    if (!target) {
      this.deps.logs.write('warn', label, '暂时拿不到推流地址，稍后重试')
      return
    }

    const streamPath = this.deps.orchestrator.snapshot().streamPath ?? ''
    const pusher =
      this.deps.createPusher?.(target) ??
      new FfmpegPusher({
        input: this.deps.inputUrl(streamPath),
        target,
        onLog: (line) => this.deps.logs.write('debug', '推送', `${label} ${line}`),
        onExit: (code) => {
          this.pushers.delete(platform)
          this.deps.logs.write(
            code === 0 ? 'info' : 'error',
            '推送',
            `${label} 推流进程结束（code=${code ?? '-'}）`,
          )
        },
      })

    pusher.start()
    this.pushers.set(platform, pusher)
    this.deps.logs.write('info', label, '已开始推流', { server: target.server })
  }

  private stopAll(): void {
    for (const [platform, pusher] of this.pushers) {
      pusher.stop()
      this.deps.logs.write('info', LABEL[platform], '已停止推流')
    }
    this.pushers.clear()
  }
}

function message(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}
