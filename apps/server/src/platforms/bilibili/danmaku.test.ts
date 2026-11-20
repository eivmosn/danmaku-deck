import { brotliCompressSync } from 'node:zlib'
import { describe, expect, it } from 'vitest'
import { buildPacket, decodeBody, decodePackets, parseCommand, OP_MESSAGE } from './danmaku'

/** 消息结构对齐 ps5lb /app/core/danmaku.py 里的 parse_message */
describe('parseCommand', () => {
  const at = '2026-11-20T10:00:00.000Z'

  it('弹幕取 info[1] 与 info[2][1]', () => {
    const event = parseCommand(
      { cmd: 'DANMU_MSG', info: [[0], '来了老弟', [12345, '苏苏花'], []] },
      at,
    )
    expect(event).toEqual({
      platform: 'bilibili',
      kind: 'chat',
      user: '苏苏花',
      text: '来了老弟',
      count: 0,
      at,
    })
  })

  it('礼物带数量', () => {
    const event = parseCommand(
      { cmd: 'SEND_GIFT', data: { uname: '苏苏花', giftName: '辣条', num: 3, total_coin: 300 } },
      at,
    )
    expect(event).toMatchObject({ kind: 'gift', user: '苏苏花', text: '辣条', count: 3 })
  })

  it('舰长按等级映射名字', () => {
    const admiral = parseCommand(
      { cmd: 'GUARD_BUY', data: { username: '舰长甲', guard_level: 1 } },
      at,
    )
    const captain = parseCommand(
      { cmd: 'GUARD_BUY', data: { username: '舰长乙', guard_level: 3 } },
      at,
    )
    expect(admiral?.text).toBe('总督')
    expect(captain?.text).toBe('舰长')
  })

  it('醒目留言用 user_info.uname 和 message', () => {
    const event = parseCommand(
      {
        cmd: 'SUPER_CHAT_MESSAGE',
        data: { user_info: { uname: '老板' }, message: '加油', price: 30 },
      },
      at,
    )
    expect(event).toMatchObject({ kind: 'superchat', user: '老板', text: '加油' })
  })

  it('互动消息按 msg_type 映射进场/关注/分享', () => {
    const cases: Array<[number, string]> = [
      [1, 'enter'],
      [2, 'follow'],
      [3, 'like'],
    ]
    for (const [msgType, kind] of cases) {
      const event = parseCommand(
        { cmd: 'INTERACT_WORD', data: { uname: '路人', msg_type: msgType } },
        at,
      )
      expect(event?.kind).toBe(kind)
    }
  })

  it('缺用户名或未知命令返回 null', () => {
    expect(parseCommand({ cmd: 'DANMU_MSG', info: [[0], '文本', []] }, at)).toBeNull()
    expect(parseCommand({ cmd: 'ONLINE_RANK_COUNT', data: {} }, at)).toBeNull()
    expect(parseCommand(null, at)).toBeNull()
  })
})

describe('数据包编解码', () => {
  it('buildPacket 写出的头能被 decodePackets 还原', () => {
    const packet = buildPacket(OP_MESSAGE, { cmd: 'SEND_GIFT', data: { uname: 'a', num: 1 } })
    const { packets, consumed } = decodePackets(packet)

    expect(consumed).toBe(packet.length)
    expect(packets).toHaveLength(1)
    expect(packets[0]?.op).toBe(OP_MESSAGE)
    expect(decodeBody(packets[0]!)).toMatchObject({ cmd: 'SEND_GIFT' })
  })

  it('半包时只消费完整的部分', () => {
    const full = buildPacket(OP_MESSAGE, { cmd: 'A' })
    const partial = full.subarray(0, full.length - 2)
    const { packets, consumed } = decodePackets(partial)
    expect(packets).toHaveLength(0)
    expect(consumed).toBe(0)
  })

  it('版本 3 的载荷是 brotli 压缩的 JSON 数组', () => {
    const payload = brotliCompressSync(Buffer.from(JSON.stringify([{ cmd: 'A' }, { cmd: 'B' }])))
    const header = Buffer.alloc(16)
    header.writeUInt32BE(16 + payload.length, 0)
    header.writeUInt16BE(16, 4)
    header.writeUInt16BE(3, 6)
    header.writeUInt32BE(OP_MESSAGE, 8)
    header.writeUInt32BE(1, 12)

    const { packets } = decodePackets(Buffer.concat([header, payload]))
    expect(decodeBody(packets[0]!)).toEqual([{ cmd: 'A' }, { cmd: 'B' }])
  })

  it('坏载荷返回 null 而不是抛错', () => {
    expect(decodeBody({ version: 0, op: OP_MESSAGE, body: Buffer.from('not json') })).toBeNull()
  })
})
