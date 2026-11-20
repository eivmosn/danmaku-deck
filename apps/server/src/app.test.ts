import { describe, expect, it } from 'vitest'
import { statusSchema } from '@ps5lb/shared'
import { buildApp } from './app.js'
import { LiveStateStore } from './state.js'

describe('server', () => {
  it('健康检查返回 ok', async () => {
    const app = buildApp()
    const response = await app.inject({ method: 'GET', url: '/api/health' })
    expect(response.statusCode).toBe(200)
    expect(response.json()).toEqual({ ok: true })
    await app.close()
  })

  it('状态接口符合约定 schema', async () => {
    const store = new LiveStateStore(() => 1_700_000_000_000)
    store.setState('live')
    store.setPlatform('bilibili', { enabled: true, accountName: '丘野', live: true })
    const app = buildApp({ store })

    const response = await app.inject({ method: 'GET', url: '/api/status' })
    const parsed = statusSchema.parse(response.json())
    expect(parsed.state).toBe('live')
    expect(parsed.platforms.find((item) => item.platform === 'bilibili')?.enabled).toBe(true)
    await app.close()
  })

  it('未开播时 uptime 为 0', async () => {
    const store = new LiveStateStore(() => 1_700_000_000_000)
    expect(store.snapshot().uptimeSeconds).toBe(0)
  })
})
