import { EventEmitter } from 'node:events'
import { describe, expect, it, vi } from 'vitest'
import { parseCatbusLine, parseCatbusRawLine, XiaohongshuDanmakuClient } from './danmaku'

/** 行格式来自 catbus 的实际输出（旧桥 xhs-bridge.mjs 里同款解析） */
const lines = {
  chat: '{"type":"chat","time":"2026-11-20T10:00:00Z","user":{"name":"观众乙","id":"u1"},"text":"主播好呀"}',
  gift: '{"type":"gift","time":"2026-11-20T10:00:01Z","user":{"name":"观众乙"},"gift":{"name":"花","count":3}}',
  enter: '{"type":"enter","time":"2026-11-20T10:00:02Z","user":{"name":"路人"}}',
  follow: '{"type":"follow","time":"2026-11-20T10:00:03Z","user":{"name":"新粉"}}',
  noise: 'warning: something happened',
  unknown: '{"type":"viewer_heart","user":{"name":"x"}}',
}

describe('parseCatbusLine', () => {
  it('弹幕', () => {
    expect(parseCatbusLine(lines.chat)).toMatchObject({
      platform: 'xiaohongshu',
      kind: 'chat',
      user: '观众乙',
      text: '主播好呀',
    })
  })

  it('礼物带数量', () => {
    expect(parseCatbusLine(lines.gift)).toMatchObject({
      kind: 'gift',
      user: '观众乙',
      text: '花',
      count: 3,
    })
  })

  it('进场、关注都有兜底文案', () => {
    expect(parseCatbusLine(lines.enter)).toMatchObject({ kind: 'enter', text: '进入了直播间' })
    expect(parseCatbusLine(lines.follow)).toMatchObject({ kind: 'follow', text: '关注了主播' })
  })

  it('非 JSON 行与无关事件被忽略', () => {
    expect(parseCatbusLine(lines.noise)).toBeNull()
    expect(parseCatbusLine(lines.unknown)).toBeNull()
    expect(parseCatbusLine('')).toBeNull()
  })
})

describe('XiaohongshuDanmakuClient', () => {
  it('把进程输出按行解析成事件', async () => {
    const child = Object.assign(new EventEmitter(), {
      stdout: new EventEmitter(),
      stderr: new EventEmitter(),
      kill: vi.fn(),
    })
    const events: unknown[] = []
    const client = new XiaohongshuDanmakuClient({
      roomId: '700000000000000001',
      cookie: 'a1=x',
      onEvent: (event) => events.push(event),
      spawnImpl: vi.fn(() => child) as never,
    })

    await client.connect()
    child.stdout.emit('data', Buffer.from(`${lines.chat}\n${lines.gift}\n`))

    expect(events).toHaveLength(2)
    client.stop()
    expect(child.kill).toHaveBeenCalledWith('SIGTERM')
  })

  it('半行会等到下一块再解析', async () => {
    const child = Object.assign(new EventEmitter(), {
      stdout: new EventEmitter(),
      stderr: new EventEmitter(),
      kill: vi.fn(),
    })
    const events: unknown[] = []
    const client = new XiaohongshuDanmakuClient({
      roomId: 'r',
      cookie: 'c',
      onEvent: (event) => events.push(event),
      spawnImpl: vi.fn(() => child) as never,
    })

    await client.connect()
    const full = lines.chat
    child.stdout.emit('data', Buffer.from(full.slice(0, 20)))
    expect(events).toHaveLength(0)
    child.stdout.emit('data', Buffer.from(`${full.slice(20)}\n`))
    expect(events).toHaveLength(1)
    client.stop()
  })
})

/** catbus 带 --duration 3600，满一小时会自己退出；退出后不重连就会永久静默 */
function makeChild(): EventEmitter & {
  stdout: EventEmitter
  stderr: EventEmitter
  kill: () => void
} {
  return Object.assign(new EventEmitter(), {
    stdout: new EventEmitter(),
    stderr: new EventEmitter(),
    kill: vi.fn(),
  }) as never
}

describe('子进程退出后自动重连', () => {
  it('exit 之后会自动再 spawn 一个', async () => {
    vi.useFakeTimers()
    const children = [makeChild(), makeChild()]
    let index = 0
    const spawnImpl = vi.fn(() => children[index++])
    const states: string[] = []
    const client = new XiaohongshuDanmakuClient({
      roomId: 'r',
      cookie: 'c',
      onEvent: () => {},
      onState: (state) => states.push(state),
      spawnImpl: spawnImpl as never,
    })

    await client.connect()
    expect(spawnImpl).toHaveBeenCalledTimes(1)

    children[0]!.emit('exit')
    expect(states).toContain('closed')

    await vi.advanceTimersByTimeAsync(1200)
    expect(spawnImpl).toHaveBeenCalledTimes(2)
    client.stop()
    vi.useRealTimers()
  })

  it('catbus 的重连提示走 notice，不算 error', async () => {
    const child = makeChild()
    const states: string[] = []
    const details: string[] = []
    const client = new XiaohongshuDanmakuClient({
      roomId: 'r',
      cookie: 'c',
      onEvent: () => {},
      onState: (state, detail) => {
        states.push(state)
        if (detail) details.push(detail)
      },
      spawnImpl: (() => child) as never,
    })

    await client.connect()
    child.stderr.emit('data', Buffer.from('[catbus] 4 秒后重连（第 3 次）\n'))
    expect(states).toContain('notice')
    expect(states).not.toContain('error')
    client.stop()
  })

  it('stop 之后不再重连', async () => {
    vi.useFakeTimers()
    const child = makeChild()
    const spawnImpl = vi.fn(() => child)
    const client = new XiaohongshuDanmakuClient({
      roomId: 'r',
      cookie: 'c',
      onEvent: () => {},
      spawnImpl: spawnImpl as never,
    })

    await client.connect()
    client.stop()
    child.emit('exit')
    await vi.advanceTimersByTimeAsync(5000)
    expect(spawnImpl).toHaveBeenCalledTimes(1)
    vi.useRealTimers()
  })
})

describe('进场消息', () => {
  it('没有昵称的进场也不丢，昵称留空由界面兜底', () => {
    const event = parseCatbusLine('{"type":"enter","time":"2026-11-20T10:00:02Z"}')
    expect(event).toMatchObject({ platform: 'xiaohongshu', kind: 'enter', user: '' })
    expect(event?.text).toBe('进入了直播间')
  })

  it('弹幕没有昵称仍然丢弃', () => {
    expect(parseCatbusLine('{"type":"chat","text":"你好"}')).toBeNull()
  })

  it('无法归类的事件仍然丢弃', () => {
    expect(parseCatbusLine('{"type":"other","user":null,"text":null}')).toBeNull()
  })
})

describe('parseCatbusRawLine（--raw 模式）', () => {
  /** 真实报文：2026-11-20 22:31 抓自 catbus xhs live listen --raw */
  const realText = JSON.stringify({
    command: 1,
    customData: {
      type: 'text',
      current_time: 1795185111904,
      desc: '她',
      profile: { nickname: '喵喵喵大福', user_id: '59f3046811be10677b852191' },
    },
    ts: 1795185111928,
  })

  it('真实弹幕报文能解析出昵称和正文', () => {
    const event = parseCatbusRawLine(realText)
    expect(event).toMatchObject({
      platform: 'xiaohongshu',
      kind: 'chat',
      user: '喵喵喵大福',
      text: '她',
    })
  })

  it('进场/关注/点赞按 catbus 的字段映射', () => {
    const at = '{"ts":1795185111928,"customData":{"type":"come","profile":{"nickname":"路人甲"}}}'
    expect(parseCatbusRawLine(at)).toMatchObject({ kind: 'enter', user: '路人甲' })

    const follow =
      '{"ts":1795185111928,"customData":{"type":"follow","profile":{"nickname":"新粉"}}}'
    expect(parseCatbusRawLine(follow)).toMatchObject({ kind: 'follow', user: '新粉' })

    const praise =
      '{"ts":1795185111928,"customData":{"type":"praise","profile":{"nickname":"点赞的"}}}'
    expect(parseCatbusRawLine(praise)).toMatchObject({ kind: 'like', user: '点赞的' })
  })

  it('礼物取 gift.name / count', () => {
    const gift = JSON.stringify({
      ts: 1795185111928,
      customData: {
        type: 'gift',
        gift: { name: '小心心', count: 3 },
        profile: { nickname: '送礼的' },
      },
    })
    expect(parseCatbusRawLine(gift)).toMatchObject({
      kind: 'gift',
      user: '送礼的',
      text: '小心心',
      count: 3,
    })
  })

  it('内部事件（心跳/人数/信件）忽略', () => {
    for (const type of ['viewer_heart', 'audience_num', 'letter_refresh']) {
      expect(parseCatbusRawLine(`{"customData":{"type":"${type}"}}`)).toBeNull()
    }
  })
})
