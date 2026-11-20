import type { DanmakuEvent, Status } from '@ps5lb/shared'
import type { AccountsStore } from '@/accounts/store'
import type { DanmakuBus } from '@/danmaku-bus'
import type { LogService } from '@/logger'
import type { Orchestrator } from '@/orchestrator'
import { BilibiliDanmakuClient } from '@/platforms/bilibili/client'

export interface DanmakuClientPort {
  connect: () => Promise<void>
  stop: () => void
}

export interface DanmakuServiceDeps {
  orchestrator: Orchestrator
  accounts: AccountsStore
  bus: DanmakuBus
  logs: LogService
  /** 便于测试替换 */
  createClient?: (cookie: string, onEvent: (event: DanmakuEvent) => void) => DanmakuClientPort
}

/**
 * 只在直播期间连接 B 站弹幕：
 *   状态变 live 且平台开启 → 连接
 *   离开 live、平台关闭或没有账号 → 断开
 */
export class DanmakuService {
  private client: DanmakuClientPort | null = null
  private unsubscribe: (() => void) | null = null
  private starting = false

  constructor(private readonly deps: DanmakuServiceDeps) {}

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
    this.disconnect()
  }

  private async sync(status: Status): Promise<void> {
    const platform = status.platforms.find((item) => item.platform === 'bilibili')
    const account = this.deps.accounts.active('bilibili')
    const shouldRun = status.state === 'live' && Boolean(platform?.enabled) && account !== null

    if (!shouldRun) {
      this.disconnect()
      return
    }
    if (this.client || this.starting) return

    const credentials = this.deps.accounts.secret(account.id) ?? {}
    const cookie = Object.entries(credentials)
      .map(([name, value]) => `${name}=${value}`)
      .join('; ')

    this.starting = true
    try {
      const client =
        this.deps.createClient?.(cookie, (event) => {
          this.deps.bus.publish(event)
        }) ??
        new BilibiliDanmakuClient({
          roomId: account.externalId,
          cookie,
          onEvent: (event) => this.deps.bus.publish(event),
          onState: (state, detail) => {
            if (state === 'online') {
              this.deps.logs.write('info', 'B站', '弹幕已连接', { room: account.externalId })
            }
            if (state === 'closed') this.deps.logs.write('warn', 'B站', '弹幕连接已断开')
            if (state === 'error')
              this.deps.logs.write('error', 'B站', `弹幕连接出错：${detail ?? ''}`)
          },
        })

      await client.connect()
      this.client = client
      this.deps.logs.write('info', 'B站', '已开始接收弹幕')
    } catch (error) {
      const message = error instanceof Error ? error.message : '未知错误'
      this.deps.logs.write('error', 'B站', `弹幕连接失败：${message}`)
    } finally {
      this.starting = false
    }
  }

  private disconnect(): void {
    if (!this.client) return
    this.client.stop()
    this.client = null
    this.deps.logs.write('info', 'B站', '已断开弹幕连接')
  }
}
