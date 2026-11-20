import type { DanmakuEvent } from '@ps5lb/shared'

/** 弹幕广播：写入口推给所有 SSE 订阅者（Web / App 实时列表） */
export class DanmakuBus {
  private readonly listeners = new Set<(event: DanmakuEvent) => void>()

  publish(event: DanmakuEvent): void {
    for (const listener of this.listeners) listener(event)
  }

  subscribe(listener: (event: DanmakuEvent) => void): () => void {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }
}
