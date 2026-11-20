import type { DanmakuEvent } from '@danmaku-deck/shared'
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
  parseSendGiftV2,
  type Packet,
} from './danmaku'
import { clearWbiCache, signWbi } from './wbi'

const ROOM_INIT_URL = 'https://api.live.bilibili.com/room/v1/Room/room_init'
/**
 * 弹幕服务器配置。
 * 用 room/v1/Danmu/getConf：不需要登录、不触发风控（getDanmuInfo 会返回 -352）。
 * 它只给 token，不给服务器列表，所以固定用官方默认弹幕入口。
 */
const DANMU_CONF_URL = 'https://api.live.bilibili.com/room/v1/Danmu/getConf'
const DEFAULT_DANMAKU_WS = 'wss://broadcastlv.chat.bilibili.com/sub'
/** 带登录态的弹幕信息（匿名收不到进场事件） */
const DANMU_INFO_URL = 'https://api.live.bilibili.com/xlive/web-room/v1/index/getDanmuInfo'

const UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/155.0.0.0 Safari/537.36'

export type DanmakuState = 'connecting' | 'online' | 'closed' | 'error'

export interface BilibiliDanmakuOptions {
  /** 真实房间号或短号，内部会 room_init 规整 */
  roomId: string
  /** 登录账号的 uid；匿名连接（0）收不到进场事件 */
  uid?: number
  cookie: string
  onEvent: (event: DanmakuEvent) => void
  onState?: (state: DanmakuState, detail?: string) => void
  onLog?: (message: string) => void
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
  /** 临时诊断：统计收到的原始 cmd */
  private readonly cmdCounts = new Map<string, number>()
  private cmdTimer: ReturnType<typeof setInterval> | null = null

  constructor(options: BilibiliDanmakuOptions) {
    this.options = options
    this.fetchImpl = options.fetchImpl ?? fetch
  }

  async connect(): Promise<void> {
    const { roomId } = this.options
    this.options.onState?.('connecting')

    const realRoom = await this.resolveRoom(roomId)
    const info = await this.fetchDanmuInfo(realRoom)
    this.options.onLog?.(
      `房间 ${realRoom}｜${info.authenticated ? '登录态' : '匿名'} token｜uid=${this.options.uid ?? 0}`,
    )
    if (this.closed) return

    const buvid = /(?:^|;\s*)buvid3=([^;]+)/.exec(this.options.cookie)?.[1]
    const socket = new WebSocket(info.url, {
      headers: {
        'User-Agent': UA,
        Origin: 'https://live.bilibili.com',
        Referer: `https://live.bilibili.com/${realRoom}`,
      },
    })
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
        uid: info.authenticated ? (this.options.uid ?? 0) : 0,
        roomid: realRoom,
        protover: 3,
        ...(buvid ? { buvid } : {}),
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
    if (this.cmdTimer) clearInterval(this.cmdTimer)
    this.cmdTimer = null
  }

  private handleMessage(data: unknown): void {
    const chunk = Buffer.from(data as ArrayBuffer)
    this.pending = Buffer.concat([this.pending, chunk])
    const { packets, consumed } = decodePackets(this.pending)
    if (consumed > 0) this.pending = this.pending.subarray(consumed)

    for (const packet of packets) {
      if (packet.op === OP_AUTH_REPLY) {
        this.options.onState?.('online')
        this.startDiagnostics()
        continue
      }
      if (packet.op === OP_HEARTBEAT_REPLY || packet.op !== OP_MESSAGE) continue
      this.emitFrom(packet)
    }
  }

  /** 临时诊断：每 15 秒汇报一次收到的原始 cmd，定位「收不到」还是「被过滤」 */
  private startDiagnostics(): void {
    if (this.cmdTimer) return
    this.cmdTimer = setInterval(() => {
      if (this.cmdCounts.size === 0) {
        this.options.onLog?.('15 秒内没有收到任何弹幕包')
        return
      }
      const summary = [...this.cmdCounts.entries()]
        .map(([cmd, count]) => `${cmd}×${count}`)
        .join(', ')
      this.options.onLog?.(`收到：${summary}`)
      this.cmdCounts.clear()
    }, 15_000)
  }

  private emitFrom(packet: Packet): void {
    const decoded = decodeBody(packet)
    if (!decoded) return
    const list = Array.isArray(decoded) ? decoded : [decoded]
    for (const item of list) {
      const cmd = typeof item.cmd === 'string' ? item.cmd.split(':')[0] : '?'
      this.cmdCounts.set(cmd, (this.cmdCounts.get(cmd) ?? 0) + 1)
      const event = parseCommand(item)
      if (event) {
        this.options.onEvent(event)
      } else if (cmd === 'SEND_GIFT_V2') {
        // 新协议是 base64 protobuf，且 gift_list 可能一次多个礼物
        const pb = (item.data as { pb?: string } | undefined)?.pb
        if (pb) {
          for (const gift of parseSendGiftV2(pb, new Date().toISOString())) {
            this.options.onEvent(gift)
          }
        }
      }
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

  /**
   * 取弹幕 token。
   *
   * 优先登录态（getDanmuInfo）：匿名连接收不到进场、关注这类事件。
   * -352 是风控，需要 buvid3 设备指纹；拿不到就退回匿名 getConf。
   */
  /**
   * 取弹幕 token 和服务器。
   *
   * 照旧桥做法：wbi 签名的 getDanmuInfo 才给真实 host_list；
   * 不带签名会被风控返回 -352，只能退回 getConf（默认入口常常收不到房间消息）。
   */

  /**
   * 取弹幕 token 和服务器（照旧桥做法）。
   *
   * wbi 签名的 getDanmuInfo 才会给真实 host_list；不签名会被风控返回 -352，
   * 只能退回 getConf，而它给的默认入口常常收不到房间消息。
   */
  private async fetchDanmuInfo(
    roomId: number,
  ): Promise<{ token: string; url: string; authenticated: boolean }> {
    const signed = await this.fetchDanmuInfoSigned(roomId)
    if (signed) return signed
    return this.fetchDanmuInfoLegacy(roomId)
  }

  private async fetchDanmuInfoSigned(
    roomId: number,
    retried = false,
  ): Promise<{ token: string; url: string; authenticated: boolean } | null> {
    if (retried) clearWbiCache()
    try {
      const query = await signWbi({ id: roomId, type: 0 }, this.fetchImpl)
      const headers: Record<string, string> = {
        'User-Agent': UA,
        Referer: `https://live.bilibili.com/${roomId}`,
        Origin: 'https://live.bilibili.com',
      }
      if (this.options.cookie) headers.Cookie = this.options.cookie

      const response = await this.fetchImpl(`${DANMU_INFO_URL}?${query}`, { headers })
      const payload = (await response.json()) as {
        code?: number
        data?: { token?: string; host_list?: Array<{ host: string; wss_port: number }> }
      }
      const token = payload.data?.token
      const host = payload.data?.host_list?.[0]
      if (payload.code === 0 && token && host) {
        return {
          token,
          url: `wss://${host.host}:${host.wss_port}/sub`,
          authenticated: Boolean(this.options.cookie),
        }
      }
      this.options.onLog?.(`弹幕 token 接口返回 ${payload.code ?? '-'}`)
      // -352 多半是 wbi 密钥过期，换一次密钥再试
      if (payload.code === -352 && !retried) return this.fetchDanmuInfoSigned(roomId, true)
    } catch (error) {
      this.options.onLog?.(`弹幕 token 请求失败：${(error as Error).message}`)
    }
    return null
  }

  /** 兜底：不需要签名的旧接口，但拿不到真实服务器列表 */
  private async fetchDanmuInfoLegacy(
    roomId: number,
  ): Promise<{ token: string; url: string; authenticated: boolean }> {
    const response = await this.fetchImpl(
      `${DANMU_CONF_URL}?room_id=${roomId}&platform=pc&player=web`,
      { headers: { 'User-Agent': UA, Referer: `https://live.bilibili.com/${roomId}` } },
    )
    const payload = (await response.json()) as {
      code?: number
      msg?: string
      data?: { token?: string; host_list?: Array<{ host: string; wss_port: number }> }
    }
    const token = payload.data?.token
    const host = payload.data?.host_list?.[0]
    if (payload.code !== 0 || !token) {
      throw new Error(`取不到弹幕 token（code=${payload.code ?? '-'} ${payload.msg ?? ''}）`)
    }
    const url = host ? `wss://${host.host}:${host.wss_port}/sub` : DEFAULT_DANMAKU_WS
    return { token, url, authenticated: false }
  }
}
