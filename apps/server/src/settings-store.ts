import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import type { Platform } from '@danmaku-deck/shared'
import { z } from 'zod'

const schema = z.object({
  version: z.literal(1),
  enabled: z.record(z.string(), z.boolean()).default({}),
})

type Settings = z.infer<typeof schema>

/** 进程重启后要保留的界面状态（目前只有平台开关） */
export class SettingsStore {
  private readonly path: string
  private cache: Settings | null = null

  constructor(options: { dir?: string } = {}) {
    const dir = options.dir ?? join(process.cwd(), '.ps5lb')
    this.path = join(dir, 'settings.json')
  }

  enabled(platform: Platform): boolean {
    return this.read().enabled[platform] ?? false
  }

  setEnabled(platform: Platform, value: boolean): void {
    const data = this.read()
    data.enabled[platform] = value
    this.write(data)
  }

  private read(): Settings {
    if (this.cache) return this.cache
    if (!existsSync(this.path)) {
      this.cache = { version: 1, enabled: {} }
      return this.cache
    }
    this.cache = schema.parse(JSON.parse(readFileSync(this.path, 'utf8')))
    return this.cache
  }

  private write(data: Settings): void {
    this.cache = data
    mkdirSync(dirname(this.path), { recursive: true, mode: 0o700 })
    writeFileSync(this.path, `${JSON.stringify(data, null, 2)}\n`, { mode: 0o600 })
  }
}
