import type { DanmakuEvent } from '@ps5lb/shared'
import {
  buildPacket,
  decodeBody,
  decodePackets,
  OP_AUTH,
  OP_AUTH_REPLY,
  OP_HEARTBEAT,
  OP_HEARTBEAT_REPLY,
  OP_MESSAGE,
  parseCommand,
  type Packet,
} from './danmaku'

const ROOM_INIT_URL = 'https://api.live.bilibili.com/room/v1/Room/room_init'
/**
 * 弹幕服务器配置。
 * 用 room/v1/Danmu/getConf：不需要登录、不触发风控（getDanmuInfo 会返回 -352）。
 * 它只给 token，不给服务器列表，所以固定用官方默认弹幕入口。
 */
const DANMU_CONF_URL = 'https://api.live.bilibili.com/room/v1/Danmu/getConf'
const DEFAULT_DANMAKU_WS = 'wss://broadcastlv.chat.bilibili.com/sub'

const UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/155.0.0.0 Safari/537.36'

export type DanmakuState = 'connecting' | 'online' | 'closed' | 'error'

export interface BilibiliDanmakuOptions {
  /** 真实房间号或短号，内部会 room_init 规整 */
  roomId: string
  cookie: string
  onEvent: (event: DanmakuEvent) => void
  onState?: (state: DanmakuState, detail?: string) => void
  fetchImpl?: typeof fetch
  heartbeatMs?: number
}

export class BilibiliDanmakuClient {
  private socket: WebSocket | null = null
  private heartbeat: ReturnType<typeof setInterval> | null = null
  private pending = Buffer.alloc(0)
  private closed = false
  private readonly options: BilibiliDanmakuOptions
  private readonly fetchImpl: typeof fetch

  constructor(options: BilibiliDanmakuOptions) {
    this.options = options
    this.fetchImpl = options.fetchImpl ?? fetch
  }

  async connect(): Promise<void> {
    const { roomId } = this.options
    this.options.onState?.('connecting')

    const realRoom = await this.resolveRoom(roomId)
    const info = await this.fetchDanmuInfo(realRoom)
    if (this.closed) return

    const socket = new WebSocket(info.url)
    this.socket = socket
    socket.binaryType = 'arraybuffer'

    await new Promise<void>((resolve, reject) => {
      socket.addEventListener('open', () => resolve(), { once: true })
      socket.addEventListener('error', () => reject(new Error('弹幕服务器连接失败')), {
        once: true,
      })
    })

    socket.send(
      buildPacket(OP_AUTH, {
        uid: 0,
        roomid: realRoom,
        protover: 3,
        platform: 'web',
        type: 2,
        key: info.token,
      }),
    )

    const interval = this.options.heartbeatMs ?? 30_000
    this.heartbeat = setInterval(() => {
      try {
        socket.send(buildPacket(OP_HEARTBEAT, '[object Object]'))
      } catch {
        // 连接已断，等 close 事件处理
      }
    }, interval)

    socket.addEventListener('message', (event) => this.handleMessage(event.data))
    socket.addEventListener('close', () => {
      this.cleanup()
      if (!this.closed) this.options.onState?.('closed')
    })
    socket.addEventListener('error', () => {
      if (!this.closed) this.options.onState?.('error', '连接异常')
    })
  }

  stop(): void {
    this.closed = true
    this.cleanup()
    try {
      this.socket?.close()
    } catch {
      // 已经关闭
    }
  }

  private cleanup(): void {
    if (this.heartbeat) clearInterval(this.heartbeat)
    this.heartbeat = null
  }

  private handleMessage(data: unknown): void {
    const chunk = Buffer.from(data as ArrayBuffer)
    this.pending = Buffer.concat([this.pending, chunk])
    const { packets, consumed } = decodePackets(this.pending)
    if (consumed > 0) this.pending = this.pending.subarray(consumed)

    for (const packet of packets) {
      if (packet.op === OP_AUTH_REPLY) {
        this.options.onState?.('online')
        continue
      }
      if (packet.op === OP_HEARTBEAT_REPLY || packet.op !== OP_MESSAGE) continue
      this.emitFrom(packet)
    }
  }

  private emitFrom(packet: Packet): void {
    const decoded = decodeBody(packet)
    if (!decoded) return
    const list = Array.isArray(decoded) ? decoded : [decoded]
    for (const item of list) {
      const event = parseCommand(item)
      if (event) this.options.onEvent(event)
    }
  }

  private async resolveRoom(roomId: string): Promise<number> {
    const response = await this.fetchImpl(`${ROOM_INIT_URL}?id=${encodeURIComponent(roomId)}`, {
      headers: { 'User-Agent': UA, Referer: 'https://live.bilibili.com/' },
    })
    const payload = (await response.json()) as { code?: number; data?: { room_id?: number } }
    const id = payload.data?.room_id
    if (payload.code !== 0 || !id) throw new Error('取不到 B 站房间号')
    return id
  }

  private async fetchDanmuInfo(roomId: number): Promise<{ token: string; url: string }> {
    const response = await this.fetchImpl(
      `${DANMU_CONF_URL}?room_id=${roomId}&platform=pc&player=web`,
      {
        headers: { 'User-Agent': UA, Referer: `https://live.bilibili.com/${roomId}` },
      },
    )
    const payload = (await response.json()) as {
      code?: number
      msg?: string
      message?: string
      data?: { token?: string; host_list?: Array<{ host: string; wss_port: number }> }
    }
    const token = payload.data?.token
    const host = payload.data?.host_list?.[0]
    if (payload.code !== 0 || !token) {
      const detail = payload.msg ?? payload.message ?? ''
      throw new Error(`取不到弹幕 token（code=${payload.code ?? '-'} ${detail}）`)
    }
    // getConf 不带服务器列表时用默认入口
    const url = host ? `wss://${host.host}:${host.wss_port}/sub` : DEFAULT_DANMAKU_WS
    return { token, url }
  }
}
