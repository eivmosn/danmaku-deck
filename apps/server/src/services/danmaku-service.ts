import type { DanmakuEvent, Platform, Status } from '@danmaku-deck/shared'
import type { AccountsStore } from '@/accounts/store'
import type { DanmakuBus } from '@/danmaku-bus'
import type { LogService } from '@/logger'
import type { Orchestrator } from '@/orchestrator'
import { BilibiliDanmakuClient } from '@/platforms/bilibili/client'
import { roomIdByUid } from '@/platforms/bilibili/room'
import type { XiaohongshuApi } from '@/platforms/xiaohongshu/api'
import { XiaohongshuDanmakuClient } from '@/platforms/xiaohongshu/danmaku'
import type { PushTargetsStore } from '@/push/targets-store'

export interface DanmakuClientPort {
  connect: () => Promise<void>
  stop: () => void
}

export interface DanmakuServiceDeps {
  orchestrator: Orchestrator
  accounts: AccountsStore
  pushTargets: PushTargetsStore
  bus: DanmakuBus
  logs: LogService
  /** 小红书弹幕房间号发现用 */
  xiaohongshu?: XiaohongshuApi
  /** 解析弹幕房间号；测试里替换成固定值，避免走网络 */
  resolveRoomId?: (platform: Platform, accountUserId: string) => Promise<string>
  /** 便于测试替换，按平台创建客户端 */
  createClient?: (
    platform: Platform,
    input: { cookie: string; roomId: string; uid?: number },
    onEvent: (event: DanmakuEvent) => void,
  ) => DanmakuClientPort
}

const LABEL: Record<Platform, 'B站' | '小红书'> = { bilibili: 'B站', xiaohongshu: '小红书' }

/** 小红书推流密钥的格式是 `<roomId>?txSecret=…`，前缀就是直播间号 */
function roomIdFromKey(key: string): string {
  return key.split('?')[0] ?? ''
}

function cookieOf(credentials: Record<string, string> | null): string {
  if (!credentials) return ''
  return Object.entries(credentials)
    .map(([name, value]) => `${name}=${value}`)
    .join('; ')
}

/**
 * 只在直播期间连接弹幕：
 *   状态 live 且平台开启且有账号 → 连接
 *   离开 live、平台关闭或没有账号 → 断开
 */
export class DanmakuService {
  private readonly clients = new Map<Platform, DanmakuClientPort>()
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
    for (const platform of ['bilibili', 'xiaohongshu'] as Platform[]) this.disconnect(platform)
  }

  private async sync(status: Status): Promise<void> {
    if (status.state !== 'live') {
      for (const platform of ['bilibili', 'xiaohongshu'] as Platform[]) this.disconnect(platform)
      return
    }
    const enabled = (platform: Platform): boolean =>
      Boolean(status.platforms.find((item) => item.platform === platform)?.enabled)

    for (const platform of this.clients.keys()) {
      if (!enabled(platform) || !this.deps.accounts.get(platform)) {
        this.disconnect(platform)
      }
    }

    if (this.starting) return
    this.starting = true
    try {
      const pending = (['bilibili', 'xiaohongshu'] as Platform[]).filter((platform) => {
        if (this.clients.has(platform)) return false
        return enabled(platform) && this.deps.accounts.get(platform) !== null
      })
      await Promise.all(pending.map((platform) => this.connectPlatform(platform)))
    } finally {
      this.starting = false
    }
  }

  private async connectPlatform(platform: Platform): Promise<void> {
    const label = LABEL[platform]
    const account = this.deps.accounts.get(platform)
    if (!account) return

    const cookie = platform === 'bilibili' ? cookieOf(this.deps.accounts.secret('bilibili')) : ''

    let roomId = ''
    if (this.deps.resolveRoomId) {
      roomId = await this.deps.resolveRoomId(platform, account.externalId)
    } else if (platform === 'bilibili') {
      // 账号里存的是 uid，弹幕要的是 room_id
      roomId = String(await roomIdByUid(account.externalId).catch(() => 0))
    } else {
      roomId = roomIdFromKey(this.deps.pushTargets.get('xiaohongshu')?.key ?? '')
      if (!roomId) {
        // 没填开播码时，用「当前场次」接口反查直播间号
        const secret = this.deps.accounts.secret('xiaohongshu')
        if (secret?.cookie && this.deps.xiaohongshu) {
          const living = await this.deps.xiaohongshu.livingPushUrl(secret.cookie).catch(() => null)
          if (living?.ok && living.data) roomId = roomIdFromKey(living.data.key)
        }
      }
    }

    if (!roomId) {
      this.deps.logs.write(
        'warn',
        label,
        platform === 'xiaohongshu' ? '还没拿到直播间号，先兑换开播码' : '取不到 B 站房间号',
      )
      return
    }

    const xhsCookie =
      platform === 'xiaohongshu' ? (this.deps.accounts.secret('xiaohongshu')?.cookie ?? '') : cookie

    try {
      const uid = Number(account.externalId) || 0
      const client =
        this.deps.createClient?.(platform, { cookie: xhsCookie, roomId }, (event) => {
          this.deps.bus.publish(event)
        }) ?? this.buildClient(platform, { cookie: xhsCookie, roomId, uid })

      await client.connect()
      this.clients.set(platform, client)
      this.deps.logs.write('info', label, '已开始接收弹幕', { room: roomId })
    } catch (error) {
      const message = error instanceof Error ? error.message : '未知错误'
      this.deps.logs.write('error', label, `弹幕连接失败：${message}`)
    }
  }

  private buildClient(
    platform: Platform,
    input: { cookie: string; roomId: string; uid?: number },
  ): DanmakuClientPort {
    if (platform === 'bilibili') {
      return new BilibiliDanmakuClient({
        roomId: input.roomId,
        uid: input.uid,
        cookie: input.cookie,
        onEvent: (event) => this.deps.bus.publish(event),
        onLog: (message) => this.deps.logs.write('info', 'B站', message),
        onState: (state, detail) => {
          if (state === 'online') this.deps.logs.write('info', 'B站', '弹幕已连接')
          if (state === 'closed') this.deps.logs.write('warn', 'B站', '弹幕连接已断开')
          if (state === 'error')
            this.deps.logs.write('error', 'B站', `弹幕连接出错：${detail ?? ''}`)
        },
      })
    }
    return new XiaohongshuDanmakuClient({
      roomId: input.roomId,
      cookie: input.cookie,
      onEvent: (event) => this.deps.bus.publish(event),
      onState: (state, detail) => {
        if (state === 'online') this.deps.logs.write('info', '小红书', '弹幕已连接')
        if (state === 'closed') this.deps.logs.write('warn', '小红书', '弹幕连接已断开')
        if (state === 'error')
          this.deps.logs.write('error', '小红书', `弹幕连接出错：${detail ?? ''}`)
      },
    })
  }

  private disconnect(platform: Platform): void {
    const client = this.clients.get(platform)
    if (!client) return
    client.stop()
    this.clients.delete(platform)
    this.deps.logs.write('info', LABEL[platform], '已断开弹幕连接')
  }
}
