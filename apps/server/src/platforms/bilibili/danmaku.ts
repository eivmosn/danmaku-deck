import { brotliDecompressSync } from 'node:zlib'
import type { DanmakuEvent, DanmakuKind } from '@ps5lb/shared'

/**
 * B 站直播弹幕协议。
 *
 * 字段路径对齐 ps5lb 的工作实现（/app/core/danmaku.py parse_message）：
 *   DANMU_MSG          info[1]=文本, info[2][1]=用户名
 *   SEND_GIFT          data.uname / giftName / num / total_coin
 *   GUARD_BUY          data.username / guard_level(1总督 2提督 3舰长) / num
 *   SUPER_CHAT_MESSAGE data.user_info.uname / message / price
 *   INTERACT_WORD      data.uname / msg_type(1进入 2关注 3分享)
 *
 * 数据包格式（与小红的桥、ps5lb 一致）：
 *   4 字节总长 | 2 字节头长 | 2 字节版本 | 4 字节 op | 4 字节 seq | 载荷
 *   版本 3 的载荷是 brotli 压缩的 JSON 数组
 */

export const OP_HEARTBEAT = 2
export const OP_HEARTBEAT_REPLY = 3
export const OP_MESSAGE = 5
export const OP_AUTH = 7
export const OP_AUTH_REPLY = 8

export interface Packet {
  version: number
  op: number
  body: Buffer
}

/** 把收到的字节流拆成逻辑包；返回已消费长度，剩余留到下次 */
export function decodePackets(buffer: Buffer): { packets: Packet[]; consumed: number } {
  const packets: Packet[] = []
  let offset = 0
  while (offset + 16 <= buffer.length) {
    const total = buffer.readUInt32BE(offset)
    if (total < 16 || offset + total > buffer.length) break
    const version = buffer.readUInt16BE(offset + 6)
    const op = buffer.readUInt32BE(offset + 8)
    packets.push({ version, op, body: buffer.subarray(offset + 16, offset + total) })
    offset += total
  }
  return { packets, consumed: offset }
}

/** 解出包里的 JSON（版本 3 需要 brotli） */
export function decodeBody(packet: Packet): unknown {
  try {
    if (packet.version === 3 || packet.version === 2) {
      return JSON.parse(brotliDecompressSync(packet.body).toString('utf8'))
    }
    return JSON.parse(packet.body.toString('utf8'))
  } catch {
    return null
  }
}

export function buildPacket(op: number, body: unknown): Buffer {
  const payload = Buffer.from(typeof body === 'string' ? body : JSON.stringify(body))
  const header = Buffer.alloc(16)
  header.writeUInt32BE(16 + payload.length, 0)
  header.writeUInt16BE(16, 4)
  header.writeUInt16BE(1, 6)
  header.writeUInt32BE(op, 8)
  header.writeUInt32BE(1, 12)
  return Buffer.concat([header, payload])
}

interface RawMessage {
  cmd?: string
  info?: unknown[]
  data?: Record<string, unknown>
}

const GUARD_NAME: Record<number, string> = { 1: '总督', 2: '提督', 3: '舰长' }
const INTERACT: Record<number, { kind: DanmakuKind; text: string }> = {
  1: { kind: 'enter', text: '进入了直播间' },
  2: { kind: 'follow', text: '关注了主播' },
  3: { kind: 'like', text: '分享了直播间' },
}

/** 把一条 B 站消息规整成统一的事件；不认识返回 null */
export function parseCommand(raw: unknown, at = new Date().toISOString()): DanmakuEvent | null {
  if (!raw || typeof raw !== 'object') return null
  const message = raw as RawMessage
  const cmd = message.cmd ?? ''

  if (cmd.startsWith('DANMU_MSG')) {
    const info = message.info
    const text = info?.[1]
    const userPart = info?.[2]
    const user = Array.isArray(userPart) ? userPart[1] : undefined
    if (typeof text !== 'string' || typeof user !== 'string' || !user) return null
    return { platform: 'bilibili', kind: 'chat', user, text, count: 0, at }
  }

  if (cmd === 'SEND_GIFT') {
    const data = message.data ?? {}
    const user = String(data.uname ?? '')
    if (!user) return null
    return {
      platform: 'bilibili',
      kind: 'gift',
      user,
      text: String(data.giftName ?? '礼物'),
      count: Number(data.num ?? 1),
      at,
    }
  }

  if (cmd === 'GUARD_BUY') {
    const data = message.data ?? {}
    const user = String(data.username ?? '')
    if (!user) return null
    const level = Number(data.guard_level ?? 3)
    return {
      platform: 'bilibili',
      kind: 'guard',
      user,
      text: GUARD_NAME[level] ?? '舰长',
      count: Number(data.num ?? 1),
      at,
    }
  }

  if (cmd === 'SUPER_CHAT_MESSAGE') {
    const data = message.data ?? {}
    const userInfo = (data.user_info ?? {}) as Record<string, unknown>
    const user = String(userInfo.uname ?? '')
    if (!user) return null
    return {
      platform: 'bilibili',
      kind: 'superchat',
      user,
      text: String(data.message ?? ''),
      count: 1,
      at,
    }
  }

  if (cmd.startsWith('INTERACT_WORD')) {
    const data = message.data ?? {}
    const user = String(data.uname ?? '')
    const mapped = INTERACT[Number(data.msg_type ?? 0)]
    if (!user || !mapped) return null
    return { platform: 'bilibili', kind: mapped.kind, user, text: mapped.text, count: 0, at }
  }

  return null
}
