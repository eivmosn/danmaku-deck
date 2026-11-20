import type { DanmakuEvent } from '@ps5lb/shared'

/** 弹幕广播 + 最近历史：SSE 只推新事件，刷新页面时用 recent 补历史 */
export class DanmakuBus {
  private readonly listeners = new Set<(event: DanmakuEvent) => void>()
  private readonly history: DanmakuEvent[] = []

  constructor(private readonly capacity = 200) {}

  publish(event: DanmakuEvent): void {
    this.history.push(event)
    if (this.history.length > this.capacity) this.history.shift()
    for (const listener of this.listeners) listener(event)
  }

  recent(limit = 100): DanmakuEvent[] {
    return this.history.slice(-limit)
  }

  clear(): void {
    this.history.length = 0
  }

  subscribe(listener: (event: DanmakuEvent) => void): () => void {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }
}
