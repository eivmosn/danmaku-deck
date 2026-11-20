import type { Orchestrator } from '@/orchestrator'

interface PathItem {
  name?: string
  ready?: boolean
  readers?: unknown[]
}

/**
 * 和 mediamtx 对账。
 *
 * hook 只在「流可用/不可用」的瞬间触发，服务重启、hook 丢失都会导致状态不同步，
 * 所以启动时和运行中都要主动查一次 `/v3/paths/list`。
 */
interface ResolvedOptions {
  orchestrator: Orchestrator
  apiUrl: string
  intervalMs: number
  fetchImpl: typeof fetch
  onChange?: (path: string, live: boolean) => void
}

export class MediaMtxSync {
  private timer: ReturnType<typeof setInterval> | null = null
  private readonly options: ResolvedOptions

  constructor(options: MediaMtxSyncOptions) {
    this.options = {
      orchestrator: options.orchestrator,
      apiUrl: options.apiUrl ?? 'http://127.0.0.1:19997',
      intervalMs: options.intervalMs ?? 5000,
      fetchImpl: options.fetchImpl ?? fetch,
      onChange: options.onChange,
    }
  }

  start(): void {
    if (this.timer) return
    void this.tick()
    this.timer = setInterval(() => void this.tick(), this.options.intervalMs)
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer)
    this.timer = null
  }

  /** 查一次并对账 */
  async tick(): Promise<void> {
    const live = await this.activePaths()
    if (live === null) return

    const snapshot = this.options.orchestrator.snapshot()
    const current = snapshot.streamPath ?? ''
    const first = live[0]

    if (live.length > 0 && !current && first) {
      this.options.orchestrator.streamStarted(first)
      this.options.onChange?.(first, true)
      return
    }
    if (live.length === 0 && current) {
      this.options.orchestrator.streamStopped()
      this.options.onChange?.(current, false)
      return
    }
    // 换了一条流（比如 PS5 重开播）
    if (live.length > 0 && current && !live.includes(current) && first) {
      this.options.orchestrator.streamStopped()
      this.options.orchestrator.streamStarted(first)
      this.options.onChange?.(first, true)
    }
  }

  /** 返回正在推流的路径；接口不可用时返回 null（不改变状态） */
  private async activePaths(): Promise<string[] | null> {
    try {
      const response = await this.options.fetchImpl(`${this.options.apiUrl}/v3/paths/list`, {
        signal: AbortSignal.timeout(3000),
      })
      if (!response.ok) return null
      const body = (await response.json()) as { items?: PathItem[] }
      return (body.items ?? [])
        .filter((item) => item.ready === true && item.name)
        .map((item) => item.name as string)
    } catch {
      return null
    }
  }
}

export interface MediaMtxSyncOptions {
  orchestrator: Orchestrator
  /** mediamtx 控制接口，默认本机 19997 */
  apiUrl?: string
  intervalMs?: number
  fetchImpl?: typeof fetch
  onChange?: (path: string, live: boolean) => void
}
