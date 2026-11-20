import { EventEmitter } from 'node:events'
import { describe, expect, it, vi } from 'vitest'
import { parseCatbusLine, XiaohongshuDanmakuClient } from './danmaku'

/** 行格式来自 catbus 的实际输出（旧桥 xhs-bridge.mjs 里同款解析） */
const lines = {
  chat: '{"type":"chat","time":"2026-11-20T10:00:00Z","user":{"name":"甜心","id":"u1"},"text":"主播好呀"}',
  gift: '{"type":"gift","time":"2026-11-20T10:00:01Z","user":{"name":"甜心"},"gift":{"name":"花","count":3}}',
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
      user: '甜心',
      text: '主播好呀',
    })
  })

  it('礼物带数量', () => {
    expect(parseCatbusLine(lines.gift)).toMatchObject({
      kind: 'gift',
      user: '甜心',
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
      roomId: '570548867313498219',
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
