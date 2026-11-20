import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'
import { danmakuEventSchema, type DanmakuEvent } from '@danmaku-deck/shared'

/** 弹幕历史的落盘接口；测试里换成内存实现 */
export interface DanmakuStore {
  load: () => DanmakuEvent[]
  append: (event: DanmakuEvent) => void
  /** 只保留最后 keep 条，避免文件无限长 */
  trim: (keep: number) => void
  clear: () => void
}

/**
 * JSONL 落盘。弹幕量不大（每秒个位数），同步写换取顺序确定、实现简单。
 * 坏行直接跳过，不能让一条脏数据把整个历史带崩。
 */
export class FileDanmakuStore implements DanmakuStore {
  constructor(private readonly path: string) {}

  load(): DanmakuEvent[] {
    if (!existsSync(this.path)) return []
    const events: DanmakuEvent[] = []
    for (const line of readFileSync(this.path, 'utf8').split('\n')) {
      const text = line.trim()
      if (!text) continue
      try {
        const parsed = danmakuEventSchema.safeParse(JSON.parse(text))
        if (parsed.success) events.push(parsed.data)
      } catch {
        // 跳过坏行
      }
    }
    return events
  }

  append(event: DanmakuEvent): void {
    try {
      mkdirSync(dirname(this.path), { recursive: true })
      appendFileSync(this.path, `${JSON.stringify(event)}\n`)
    } catch {
      // 落盘失败不影响实时推送
    }
  }

  trim(keep: number): void {
    try {
      const events = this.load().slice(-keep)
      writeFileSync(this.path, events.map((event) => `${JSON.stringify(event)}\n`).join(''))
    } catch {
      // 忽略
    }
  }

  clear(): void {
    try {
      writeFileSync(this.path, '')
    } catch {
      // 忽略
    }
  }
}

/** 弹幕广播 + 最近历史：SSE 只推新事件，刷新页面时用 recent 补历史 */
export class DanmakuBus {
  private readonly listeners = new Set<(event: DanmakuEvent) => void>()
  private readonly history: DanmakuEvent[] = []
  /** 自上次整理后写入了多少条 */
  private written = 0

  constructor(
    private readonly capacity = 200,
    private readonly store?: DanmakuStore,
  ) {
    if (!store) return
    // 重启后把历史接回来，部署一次不至于把观众的弹幕清空
    for (const event of store.load().slice(-capacity)) this.history.push(event)
  }

  publish(event: DanmakuEvent): void {
    this.history.push(event)
    if (this.history.length > this.capacity) this.history.shift()
    if (this.store) {
      this.store.append(event)
      this.written += 1
      // 攒够一轮就压一次文件
      if (this.written >= this.capacity * 4) {
        this.written = 0
        this.store.trim(this.capacity * 2)
      }
    }
    for (const listener of this.listeners) listener(event)
  }

  recent(limit = 100): DanmakuEvent[] {
    return this.history.slice(-limit)
  }

  clear(): void {
    this.history.length = 0
    this.written = 0
    this.store?.clear()
  }

  subscribe(listener: (event: DanmakuEvent) => void): () => void {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }
}
