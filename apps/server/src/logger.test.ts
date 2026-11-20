import { mkdtempSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { createLogger, LogService } from './logger.js'

const fixedClock = (): number => 1_700_000_000_000

function makeService(capacity?: number): LogService {
  return new LogService({ console: false, now: fixedClock, ...(capacity ? { capacity } : {}) })
}

describe('LogService', () => {
  it('写入后可查询，字段与作用域完整', () => {
    const logs = makeService()
    const bili = createLogger(logs, 'B站')
    bili.info('弹幕已连接', { roomId: 31455973 })

    const [entry] = logs.recent()
    expect(entry?.scope).toBe('B站')
    expect(entry?.message).toBe('弹幕已连接')
    expect(entry?.fields).toEqual({ roomId: 31455973 })
    expect(entry?.at).toBe('2023-11-14T22:13:20.000Z')
    // UTC 22:13:20 对应中国时间次日 06:13:20
    expect(entry?.atLocal).toBe('2023-11-15 06:13:20')
  })

  it('超出容量时丢弃最旧的', () => {
    const logs = makeService(2)
    const sys = createLogger(logs, '系统')
    sys.info('一')
    sys.info('二')
    sys.info('三')

    expect(logs.recent().map((entry) => entry.message)).toEqual(['二', '三'])
  })

  it('recent 支持只取最近 N 条', () => {
    const logs = makeService()
    const xhs = createLogger(logs, '小红书')
    for (let index = 0; index < 5; index += 1) xhs.debug(`第 ${index} 条`)

    expect(logs.recent(2).map((entry) => entry.message)).toEqual(['第 3 条', '第 4 条'])
  })

  it('日志按天落盘为 JSONL', () => {
    const dir = mkdtempSync(join(tmpdir(), 'ps5lb-log-'))
    const logs = new LogService({ console: false, now: fixedClock, dir })
    logs.write('info', '推送', '已开始推流', { platform: 'bilibili' })

    const [first] = logs.recent()
    const day = first?.atLocal.slice(0, 10) ?? ''
    const file = readFileSync(join(dir, `${day}.jsonl`), 'utf8').trim().split('\n')
    expect(file).toHaveLength(1)
    const parsed = JSON.parse(file[0] ?? '{}') as { scope: string; message: string }
    expect(parsed.scope).toBe('推送')
    expect(parsed.message).toBe('已开始推流')
  })

  it('订阅能收到新日志，退订后不再收到', () => {
    const logs = makeService()
    const received: string[] = []
    const unsubscribe = logs.onEntry((entry) => received.push(entry.message))

    logs.write('info', '系统', '已启动')
    unsubscribe()
    logs.write('warn', '代理', '节点失效')

    expect(received).toEqual(['已启动'])
  })
})
