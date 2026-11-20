import { EventEmitter } from 'node:events'
import { describe, expect, it, vi } from 'vitest'
import { parseCatbusLine, XiaohongshuDanmakuClient } from './danmaku'

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
