import { describe, expect, it } from 'vitest'
import { statusSchema } from '@ps5lb/shared'
import { buildApp } from './app.js'
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

  it('缺少 path 时 hook 返回 400', async () => {
    const app = buildApp()
    const response = await app.inject({ method: 'GET', url: '/api/hooks/stream/available' })
    expect(response.statusCode).toBe(400)
    await app.close()
  })
})
