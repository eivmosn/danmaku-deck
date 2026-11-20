import { brotliDecompressSync, inflateSync } from 'node:zlib'
import type { DanmakuEvent, DanmakuKind } from '@danmaku-deck/shared'
import { decodeProto, protoInt, protoString } from './protobuf'

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

/**
 * 解出包里的消息。
 *
 * 关键：版本 3（brotli）/ 版本 2（zlib）压缩的载荷解开后**仍然是一串数据包**，
 * 每个带 16 字节头，要递归拆开才能拿到 JSON；直接 JSON.parse 会整包丢弃。
 */
export function decodeBody(packet: Packet): unknown {
  const messages: unknown[] = []
  expandPacket(packet, messages)
  if (messages.length === 0) return null
  return messages.length === 1 ? messages[0] : messages
}

function expandPacket(packet: Packet, out: unknown[]): void {
  if (packet.op !== OP_MESSAGE) return
  if (packet.version === 3 || packet.version === 2) {
    let raw: Buffer
    try {
      raw = packet.version === 3 ? brotliDecompressSync(packet.body) : inflateSync(packet.body)
    } catch {
      return
    }
    const { packets } = decodePackets(raw)
    if (packets.length > 0) {
      for (const inner of packets) expandPacket(inner, out)
      return
    }
    // 兜底：个别消息解开直接就是 JSON（不套数据包头）
    try {
      const parsed = JSON.parse(raw.toString('utf8')) as unknown
      if (Array.isArray(parsed)) out.push(...parsed)
      else out.push(parsed)
    } catch {
      // 两种都解不出就放弃这个包
    }
    return
  }
  try {
    const parsed = JSON.parse(packet.body.toString('utf8')) as unknown
    if (Array.isArray(parsed)) out.push(...parsed)
    else out.push(parsed)
  } catch {
    // 单条解析失败不影响同包其他内容
  }
}

/** INTERACT_WORD_V2：protobuf 载荷，字段 2 是昵称，字段 5 是类型（1 进入） */
export function parseInteractV2(base64Body: string, at: string): DanmakuEvent | null {
  let raw: Buffer
  try {
    raw = Buffer.from(base64Body, 'base64')
  } catch {
    return null
  }
  const fields = decodeProto(raw)
  const user = protoString(fields, 2)
  if (!user) return null

  const msgType = protoInt(fields, 5)
  const kind: DanmakuKind = msgType === 2 ? 'follow' : 'enter'
  const text = msgType === 2 ? '关注了主播' : msgType === 3 ? '分享了直播间' : '进入了直播间'
  return { platform: 'bilibili', kind, user, text, count: 1, at }
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

  if (cmd === 'INTERACT_WORD_V2') {
    const pb = (message.data as { pb?: string } | undefined)?.pb
    if (!pb) return null
    return parseInteractV2(pb, at)
  }

  if (cmd === 'ENTRY_EFFECT') {
    const data = (message.data ?? {}) as Record<string, unknown>
    const user = String(data.uname ?? '')
    if (!user) return null
    return {
      platform: 'bilibili',
      kind: 'enter',
      user,
      text: '进入了直播间',
      count: 1,
      at,
    }
  }

  if (cmd === 'LIKE_INFO_V3_CLICK') {
    // 单个观众点赞；LIKE_INFO_V3_UPDATE 是累计数（每 15 秒一条），不适合当弹幕刷屏
    const data = message.data ?? {}
    const user = String(data.uname ?? '')
    if (!user) return null
    return {
      platform: 'bilibili',
      kind: 'like',
      user,
      text: String(data.like_text ?? '点赞了'),
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
