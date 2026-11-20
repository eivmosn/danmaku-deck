import { spawn } from 'node:child_process'
import type { ChildProcess } from 'node:child_process'
import type { DanmakuEvent, DanmakuKind } from '@danmaku-deck/shared'

/**
 * 小红书弹幕通过 catbus CLI 获取（旧桥验证过的方案）：
 *   catbus xhs live listen <roomId> --duration 3600
 * 每行一个 JSON，字段：{ type, time, user: { name, id }, text, gift: { name, count } }
 */

interface RawEvent {
  type?: string
  time?: string
  user?: { name?: string; id?: string }
  text?: string | null
  gift?: { name?: string; count?: number } | null
}

const LABEL: Record<string, string> = {
  enter: '进入了直播间',
  follow: '关注了主播',
  like: '点了赞',
}

/** 把 catbus 的一行 JSON 转成统一事件；无关事件返回 null */
export function parseCatbusLine(line: string): DanmakuEvent | null {
  const trimmed = line.trim()
  if (!trimmed.startsWith('{')) return null

  let raw: RawEvent
  try {
    raw = JSON.parse(trimmed) as RawEvent
  } catch {
    return null
  }

  const kind = raw.type ?? ''
  const user = raw.user?.name ?? ''
  if (!user) return null

  const giftName = raw.gift?.name ?? ''
  const giftCount = Number(raw.gift?.count ?? 0)
  const giftText = giftName ? (giftCount > 1 ? `${giftName} ×${giftCount}` : giftName) : ''
  const text = (raw.text ?? '').trim() || giftText || LABEL[kind] || ''
  if (!text) return null

  const mapped: DanmakuKind =
    kind === 'gift'
      ? 'gift'
      : kind === 'enter'
        ? 'enter'
        : kind === 'follow'
          ? 'follow'
          : kind === 'like'
            ? 'like'
            : 'chat'

  if (
    kind !== 'chat' &&
    kind !== 'gift' &&
    kind !== 'enter' &&
    kind !== 'follow' &&
    kind !== 'like'
  ) {
    return null
  }

  return {
    platform: 'xiaohongshu',
    kind: mapped,
    user,
    text: mapped === 'gift' ? giftName || text : text,
    count: mapped === 'gift' ? giftCount : 0,
    at: raw.time ?? new Date().toISOString(),
  }
}

export interface XhsDanmakuOptions {
  roomId: string
  cookie: string
  onEvent: (event: DanmakuEvent) => void
  onState?: (state: 'connecting' | 'online' | 'closed' | 'error', detail?: string) => void
  spawnImpl?: typeof spawn
  /** catbus 可执行文件路径，默认从 PATH 找 */
  command?: string
}

export class XiaohongshuDanmakuClient {
  private child: ChildProcess | null = null
  private buffer = ''
  private stopped = false
  private readonly options: XhsDanmakuOptions

  constructor(options: XhsDanmakuOptions) {
    this.options = options
  }

  async connect(): Promise<void> {
    this.options.onState?.('connecting')
    const spawnImpl = this.options.spawnImpl ?? spawn
    // catbus 通过环境变量拿 cookie，避免命令里出现凭证
    const child = spawnImpl(
      this.options.command ?? 'catbus',
      ['xhs', 'live', 'listen', this.options.roomId, '--duration', '3600'],
      {
        env: { ...process.env, CATBUS_XHS_COOKIE: this.options.cookie },
        stdio: ['ignore', 'pipe', 'pipe'],
      },
    )
    this.child = child

    child.stdout?.on('data', (chunk: Buffer) => this.handleChunk(chunk))
    child.stderr?.on('data', (chunk: Buffer) => {
      const line = chunk.toString('utf8').trim()
      if (line) this.options.onState?.('error', line.slice(0, 200))
    })
    child.on('error', (error) => {
      this.options.onState?.('error', error.message)
    })
    child.on('exit', () => {
      this.child = null
      if (!this.stopped) this.options.onState?.('closed')
    })

    this.options.onState?.('online')
  }

  stop(): void {
    this.stopped = true
    const child = this.child
    this.child = null
    child?.kill('SIGTERM')
  }

  private handleChunk(chunk: Buffer): void {
    this.buffer += chunk.toString('utf8')
    const lines = this.buffer.split(/\r?\n/)
    this.buffer = lines.pop() ?? ''
    for (const line of lines) {
      const event = parseCatbusLine(line)
      if (event) this.options.onEvent(event)
    }
  }
}
