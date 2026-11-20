import { appendFileSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'
import ansis from 'ansis'

export type LogLevel = 'debug' | 'info' | 'warn' | 'error'

/** 日志作用域，中文便于按平台过滤 */
export type LogScope = '系统' | '收流' | 'B站' | '小红书' | '代理' | '推送'

export interface LogEntry {
  id: number
  /** UTC ISO，机器读 */
  at: string
  /** 本地时间，给人看：2026-11-20 13:21:02 */
  atLocal: string
  level: LogLevel
  scope: LogScope
  message: string
  fields?: Record<string, unknown>
}

const LEVEL_LABEL: Record<LogLevel, string> = {
  debug: '调试',
  info: '信息',
  warn: '警告',
  error: '错误',
}

const LEVEL_COLOR: Record<LogLevel, (text: string) => string> = {
  debug: (text) => ansis.gray(text),
  info: (text) => ansis.cyan(text),
  warn: (text) => ansis.yellow(text),
  error: (text) => ansis.red(text),
}

/** 固定的展示时区，默认中国标准时间 */
const DISPLAY_TZ = process.env.PS5LB_TZ ?? 'Asia/Shanghai'

const timeFormatter = new Intl.DateTimeFormat('zh-CN', {
  timeZone: DISPLAY_TZ,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hourCycle: 'h23',
})

/** 中国时区时间：YYYY-MM-DD HH:mm:ss */
function toLocalText(date: Date): string {
  const parts = Object.fromEntries(
    timeFormatter.formatToParts(date).map((part) => [part.type, part.value]),
  )
  return `${parts.year}-${parts.month}-${parts.day} ${parts.hour}:${parts.minute}:${parts.second}`
}

/** 中国时区日期：YYYY-MM-DD，用于按天分文件 */
function toLocalDay(date: Date): string {
  return toLocalText(date).slice(0, 10)
}

const SCOPE_COLOR: Record<LogScope, (text: string) => string> = {
  系统: (text) => ansis.bold(text),
  收流: (text) => ansis.magenta(text),
  B站: (text) => ansis.hex('#fb7299')(text),
  小红书: (text) => ansis.hex('#ff2442')(text),
  代理: (text) => ansis.blue(text),
  推送: (text) => ansis.green(text),
}

export interface LoggerOptions {
  capacity?: number
  now?: () => number
  /** 同时输出到终端；测试里关掉 */
  console?: boolean
  json?: boolean
  /** 落盘目录；不传则只在内存里 */
  dir?: string
}

/**
 * 日志服务：内存环形缓冲 + 订阅。
 * - 终端按中文格式打印，便于直接看
 * - 缓冲供 /api/logs 查询与 /api/logs/stream 实时推送
 */
export class LogService {
  private readonly capacity: number
  private readonly now: () => number
  private readonly toConsole: boolean
  private readonly json: boolean
  private readonly dir?: string
  private readonly entries: LogEntry[] = []
  private readonly listeners = new Set<(entry: LogEntry) => void>()
  private seq = 0

  constructor(options: LoggerOptions = {}) {
    this.capacity = options.capacity ?? 200
    this.now = options.now ?? Date.now
    this.toConsole = options.console ?? true
    this.json = options.json ?? process.env.PS5LB_LOG_FORMAT === 'json'
    this.dir = options.dir ?? process.env.PS5LB_LOG_DIR
    if (this.dir) {
      try {
        mkdirSync(this.dir, { recursive: true })
      } catch {
        this.dir = undefined
      }
    }
  }

  write(
    level: LogLevel,
    scope: LogScope,
    message: string,
    fields?: Record<string, unknown>,
  ): LogEntry {
    const now = new Date(this.now())
    const entry: LogEntry = {
      id: ++this.seq,
      at: now.toISOString(),
      atLocal: toLocalText(now),
      level,
      scope,
      message,
      ...(fields ? { fields } : {}),
    }

    this.entries.push(entry)
    if (this.entries.length > this.capacity) this.entries.shift()

    if (this.toConsole) this.print(entry)
    this.persist(entry)
    for (const listener of this.listeners) listener(entry)
    return entry
  }

  /** 最近的日志，按时间正序返回 */
  recent(limit = 100): LogEntry[] {
    return this.entries.slice(-limit)
  }

  onEntry(listener: (entry: LogEntry) => void): () => void {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  /** 按天落盘成 JSONL，方便事后排查 */
  private persist(entry: LogEntry): void {
    if (!this.dir) return
    const day = toLocalDay(new Date(this.now()))
    try {
      appendFileSync(join(this.dir, `${day}.jsonl`), `${JSON.stringify(entry)}\n`)
    } catch (error) {
      process.stderr.write(
        `日志落盘失败：${error instanceof Error ? error.message : String(error)}\n`,
      )
    }
  }

  private print(entry: LogEntry): void {
    if (this.json) {
      process.stdout.write(`${JSON.stringify(entry)}\n`)
      return
    }
    const time = ansis.gray(entry.atLocal)
    const level = LEVEL_COLOR[entry.level](LEVEL_LABEL[entry.level])
    const scope = SCOPE_COLOR[entry.scope](`[${entry.scope}]`)
    const extra = entry.fields ? ` ${ansis.gray(JSON.stringify(entry.fields))}` : ''
    process.stdout.write(`${time} ${level} ${scope} ${entry.message}${extra}\n`)
  }
}

/** 带作用域的便捷记录器 */
export function createLogger(logs: LogService, scope: LogScope) {
  return {
    debug: (message: string, fields?: Record<string, unknown>) =>
      logs.write('debug', scope, message, fields),
    info: (message: string, fields?: Record<string, unknown>) =>
      logs.write('info', scope, message, fields),
    warn: (message: string, fields?: Record<string, unknown>) =>
      logs.write('warn', scope, message, fields),
    error: (message: string, fields?: Record<string, unknown>) =>
      logs.write('error', scope, message, fields),
  }
}
