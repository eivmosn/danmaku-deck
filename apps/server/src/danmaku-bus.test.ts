import { describe, expect, it } from 'vitest'
import { DanmakuBus, FileDanmakuStore, type DanmakuStore } from './danmaku-bus'
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { DanmakuEvent } from '@danmaku-deck/shared'

function event(n: number): DanmakuEvent {
  return {
    platform: 'bilibili',
    kind: 'chat',
    user: `u${n}`,
    text: `t${n}`,
    count: 0,
    at: `2026-11-20T10:00:${String(n % 60).padStart(2, '0')}Z`,
  }
}

/** 内存实现，只用来验证 bus 的读写顺序 */
class MemoryStore implements DanmakuStore {
  events: DanmakuEvent[] = []
  trimCalls: number[] = []
  load() {
    return [...this.events]
  }
  append(e: DanmakuEvent) {
    this.events.push(e)
  }
  trim(keep: number) {
    this.trimCalls.push(keep)
    this.events = this.events.slice(-keep)
  }
  clear() {
    this.events = []
  }
}

describe('DanmakuBus', () => {
  it('超过容量丢最旧的', () => {
    const bus = new DanmakuBus(3)
    for (let i = 1; i <= 5; i += 1) bus.publish(event(i))
    expect(bus.recent().map((e) => e.user)).toEqual(['u3', 'u4', 'u5'])
  })

  it('重启后从落盘恢复历史', () => {
    const store = new MemoryStore()
    const first = new DanmakuBus(10, store)
    first.publish(event(1))
    first.publish(event(2))

    const second = new DanmakuBus(10, store)
    expect(second.recent().map((e) => e.user)).toEqual(['u1', 'u2'])
  })

  it('攒够一轮会压缩文件', () => {
    const store = new MemoryStore()
    const bus = new DanmakuBus(2, store)
    // 容量 2，攒到 8 条压缩一次
    for (let i = 1; i <= 8; i += 1) bus.publish(event(i))
    expect(store.trimCalls).toEqual([4])
    expect(store.events).toHaveLength(4)
  })
})

describe('FileDanmakuStore', () => {
  it('写入后能读回，坏行跳过', () => {
    const dir = mkdtempSync(join(tmpdir(), 'danmaku-bus-'))
    const path = join(dir, 'danmaku.jsonl')
    const store = new FileDanmakuStore(path)
    store.append(event(1))
    store.append(event(2))
    // 手工塞一条坏行
    writeFileSync(path, `${readFileSync(path, 'utf8')}not json\n`)

    expect(store.load().map((e) => e.user)).toEqual(['u1', 'u2'])
  })

  it('trim 只留最后 keep 条', () => {
    const dir = mkdtempSync(join(tmpdir(), 'danmaku-bus-'))
    const path = join(dir, 'danmaku.jsonl')
    const store = new FileDanmakuStore(path)
    for (let i = 1; i <= 5; i += 1) store.append(event(i))
    store.trim(2)
    expect(store.load().map((e) => e.user)).toEqual(['u4', 'u5'])
  })
})
