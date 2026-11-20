import { spawn } from 'node:child_process'
import type { ChildProcess } from 'node:child_process'

export interface PushTarget {
  /** 平台名，日志用 */
  platform: 'bilibili' | 'xiaohongshu'
  /** RTMP 服务器地址，如 rtmp://... */
  server: string
  /** 推流密钥 */
  key: string
}

export interface FfmpegPusherOptions {
  /** 输入地址，一般是 mediamtx 的本地 RTMP */
  input: string
  target: PushTarget
  ffmpegPath?: string
  /** 便于测试替换 */
  spawnImpl?: typeof spawn
  onExit?: (code: number | null, signal: NodeJS.Signals | null) => void
  onLog?: (line: string) => void
}

/** 推流参数：直接复制音视频，不转码，CPU 占用最低 */
export function buildArgs(input: string, target: PushTarget): string[] {
  return [
    '-hide_banner',
    '-loglevel',
    'warning',
    '-i',
    input,
    '-c',
    'copy',
    '-f',
    'flv',
    `${target.server.replace(/\/$/, '')}/${target.key}`,
  ]
}

export class FfmpegPusher {
  private child: ChildProcess | null = null
  private readonly options: FfmpegPusherOptions

  constructor(options: FfmpegPusherOptions) {
    this.options = options
  }

  get running(): boolean {
    return this.child !== null
  }

  start(): void {
    if (this.child) return
    const spawnImpl = this.options.spawnImpl ?? spawn
    const child = spawnImpl(
      this.options.ffmpegPath ?? 'ffmpeg',
      buildArgs(this.options.input, this.options.target),
      { stdio: ['ignore', 'ignore', 'pipe'] },
    )
    this.child = child

    child.stderr?.on('data', (chunk: Buffer) => {
      const line = chunk.toString('utf8').trim()
      if (line) this.options.onLog?.(line)
    })

    child.on('exit', (code, signal) => {
      this.child = null
      this.options.onExit?.(code, signal)
    })
  }

  stop(): void {
    const child = this.child
    if (!child) return
    this.child = null
    child.kill('SIGTERM')
  }
}
