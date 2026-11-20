import { describe, expect, it } from 'vitest'
import { statusSchema } from '@ps5lb/shared'
import { buildApp } from './app.js'
import { LogService } from './logger.js'
import { Orchestrator } from './orchestrator.js'

const fixedClock = (): number => 1_700_000_000_000

describe('http', () => {
  it('健康检查返回 ok', async () => {
    const app = buildApp()
    const response = await app.inject({ method: 'GET', url: '/api/health' })
    expect(response.statusCode).toBe(200)
    expect(response.json()).toEqual({ ok: true })
    await app.close()
  })

  it('状态接口符合约定 schema', async () => {
    const orchestrator = new Orchestrator({ now: fixedClock })
    const app = buildApp({ orchestrator })

    const response = await app.inject({ method: 'GET', url: '/api/status' })
    const parsed = statusSchema.parse(response.json())
    expect(parsed.state).toBe('idle')
    expect(parsed.streamPath).toBeNull()
    await app.close()
  })

  // 事件契约来自 MediaMTX docs/2-features/19-hooks.md 的 runOnAvailable / runOnUnavailable
  it('收流可用 hook 让状态进入 live', async () => {
    const orchestrator = new Orchestrator({ now: fixedClock })
    const app = buildApp({ orchestrator })

    const response = await app.inject({
      method: 'GET',
      url: '/api/hooks/stream/available?path=ps5&source_type=rtmpConn',
    })
    expect(response.json()).toEqual({ ok: true, state: 'live' })
    expect(orchestrator.snapshot().streamPath).toBe('ps5')
    await app.close()
  })

  it('收流不可用 hook 让状态回到 idle', async () => {
    const orchestrator = new Orchestrator({ now: fixedClock })
    const app = buildApp({ orchestrator })

    await app.inject({ method: 'GET', url: '/api/hooks/stream/available?path=ps5' })
    const response = await app.inject({
      method: 'GET',
      url: '/api/hooks/stream/unavailable?path=ps5',
    })
    expect(response.json()).toEqual({ ok: true, state: 'idle' })
    await app.close()
  })

  it('收流事件会写进中文日志并可从 /api/logs 读到', async () => {
    const logs = new LogService({ console: false })
    const app = buildApp({ logs })

    await app.inject({ method: 'GET', url: '/api/hooks/stream/available?path=ps5' })
    const response = await app.inject({ method: 'GET', url: '/api/logs' })
    const body = response.json() as { ok: boolean; entries: Array<{ scope: string; message: string }> }

    expect(body.ok).toBe(true)
    expect(body.entries.some((entry) => entry.scope === '收流' && entry.message.includes('开始推流'))).toBe(true)
    await app.close()
  })

  it('日志接口校验 limit 范围', async () => {
    const app = buildApp()
    const response = await app.inject({ method: 'GET', url: '/api/logs?limit=999' })
    expect(response.statusCode).toBe(400)
    await app.close()
  })

  it('弹幕与礼物事件写入中文日志', async () => {
    const logs = new LogService({ console: false })
    const app = buildApp({ logs })

    await app.inject({
      method: 'POST',
      url: '/api/events/danmaku',
      payload: {
        platform: 'bilibili',
        kind: 'chat',
        user: '苏苏花',
        text: '来了老弟',
        at: '2026-11-20T10:00:00Z',
      },
    })
    await app.inject({
      method: 'POST',
      url: '/api/events/danmaku',
      payload: {
        platform: 'xiaohongshu',
        kind: 'gift',
        user: '甜心',
        text: '花',
        count: 3,
        at: '2026-11-20T10:00:01Z',
      },
    })

    const messages = logs.recent().map((entry) => `${entry.scope}|${entry.message}`)
    expect(messages).toContain('B站|苏苏花：来了老弟')
    expect(messages).toContain('小红书|甜心 送出 花 ×3')
    await app.close()
  })

  it('弹幕事件缺少必填字段时返回 400', async () => {
    const app = buildApp()
    const response = await app.inject({
      method: 'POST',
      url: '/api/events/danmaku',
      payload: { platform: 'bilibili' },
    })
    expect(response.statusCode).toBe(400)
    await app.close()
  })

  it('缺少 path 时 hook 返回 400', async () => {
    const app = buildApp()
    const response = await app.inject({ method: 'GET', url: '/api/hooks/stream/available' })
    expect(response.statusCode).toBe(400)
    await app.close()
  })
})
