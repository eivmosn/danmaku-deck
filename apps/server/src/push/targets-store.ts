import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import type { Platform } from '@ps5lb/shared'
import { z } from 'zod'
import type { PushTarget } from './ffmpeg-pusher'

const entrySchema = z.object({
  server: z.string().min(1),
  key: z.string().min(1),
})

const fileSchema = z.object({
  version: z.literal(1),
  targets: z.record(z.string(), entrySchema).default({}),
})

type TargetsFile = z.infer<typeof fileSchema> & { version: 1 }

/**
 * 手动配置的推流地址。
 * B 站正式接入前，先用这里填的地址验证整条推送链路；
 * 小红书可以用 6 位码换到的地址。
 */
export class PushTargetsStore {
  private readonly path: string
  private cache: TargetsFile | null = null

  constructor(options: { dir?: string } = {}) {
    const dir = options.dir ?? join(process.cwd(), '.ps5lb')
    this.path = join(dir, 'push-targets.json')
  }

  get(platform: Platform): PushTarget | null {
    const entry = this.read().targets[platform]
    if (!entry) return null
    return { platform, server: entry.server, key: entry.key }
  }

  set(platform: Platform, target: { server: string; key: string }): void {
    const data = this.read()
    data.targets[platform] = { server: target.server, key: target.key }
    this.write(data)
  }

  clear(platform: Platform): void {
    const data = this.read()
    delete data.targets[platform]
    this.write(data)
  }

  /** 给接口用：只回显 server，密钥打码 */
  snapshot(): Array<{ platform: Platform; server: string; hasKey: boolean }> {
    const data = this.read()
    return (['bilibili', 'xiaohongshu'] as Platform[]).flatMap((platform) => {
      const entry = data.targets[platform]
      return entry ? [{ platform, server: entry.server, hasKey: Boolean(entry.key) }] : []
    })
  }

  private read(): TargetsFile {
    if (this.cache) return this.cache
    if (!existsSync(this.path)) {
      this.cache = { version: 1, targets: {} }
      return this.cache
    }
    this.cache = fileSchema.parse(JSON.parse(readFileSync(this.path, 'utf8'))) as TargetsFile
    return this.cache
  }

  private write(data: TargetsFile): void {
    this.cache = data
    mkdirSync(dirname(this.path), { recursive: true, mode: 0o700 })
    writeFileSync(this.path, `${JSON.stringify(data, null, 2)}\n`, { mode: 0o600 })
  }
}
