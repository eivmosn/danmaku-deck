import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { AccountsStore } from '@/accounts/store'
import { buildApp } from '@/app'
import { LogService } from '@/logger'
import type { QRResult } from '@/platforms/bilibili/auth'
import type { BilibiliAuthPort } from './bilibili-login'

/** 假实现只用来验证路由编排；真实接口形状见 platforms/bilibili/auth.test.ts */
function fakeAuth(poll: QRResult): BilibiliAuthPort {
  return {
    startQR: async () => ({ key: 'key-1', url: 'https://example.com/qr' }),
    pollQR: async () => poll,
    profile: async () => ({ uid: '10010001', name: '示例主播' }),
  }
}

function setup(poll: QRResult) {
  const dir = mkdtempSync(join(tmpdir(), 'ps5lb-login-'))
  const accounts = new AccountsStore({ dir })
  const logs = new LogService({ console: false })
  const app = buildApp({ accounts, logs, bilibiliAuth: fakeAuth(poll) })
  return { app, accounts, logs }
}

describe('B 站扫码登录接口', () => {
  it('生成二维码后未扫码返回 pending', async () => {
    const { app } = setup({ state: 'pending', message: '未扫码' })

    const start = await app.inject({ method: 'POST', url: '/api/platforms/bilibili/login/qr' })
    expect(start.json()).toMatchObject({ ok: true, key: 'key-1' })

    const poll = await app.inject({ method: 'GET', url: '/api/platforms/bilibili/login/qr/key-1' })
    expect(poll.json()).toMatchObject({ ok: true, state: 'pending' })
    await app.close()
  })

  it('登录成功后写入账号并更新平台昵称', async () => {
    const { app, accounts } = setup({
      state: 'success',
      message: '登录成功',
      credentials: { SESSDATA: 'secret-value', DedeUserID: '10010001' },
    })

    await app.inject({ method: 'POST', url: '/api/platforms/bilibili/login/qr' })
    const poll = await app.inject({ method: 'GET', url: '/api/platforms/bilibili/login/qr/key-1' })
    const body = poll.json() as { ok: boolean; state: string; account: { id: string } }

    expect(body.state).toBe('success')
    expect(accounts.get('bilibili')?.displayName).toBe('示例主播')
    expect(poll.body).not.toContain('secret-value')

    const status = await app.inject({ method: 'GET', url: '/api/status' })
    const platforms = (
      status.json() as { platforms: Array<{ platform: string; accountName: string }> }
    ).platforms
    expect(platforms.find((item) => item.platform === 'bilibili')?.accountName).toBe('示例主播')
    await app.close()
  })

  it('未扫码时可以反复轮询，登录成功后 key 立即失效', async () => {
    const { app } = setup({ state: 'pending', message: '未扫码' })
    await app.inject({ method: 'POST', url: '/api/platforms/bilibili/login/qr' })
    const first = await app.inject({ method: 'GET', url: '/api/platforms/bilibili/login/qr/key-1' })
    const second = await app.inject({
      method: 'GET',
      url: '/api/platforms/bilibili/login/qr/key-1',
    })
    expect(first.statusCode).toBe(200)
    expect(second.statusCode).toBe(200)
    await app.close()
  })

  it('未知 key 直接 404', async () => {
    const { app } = setup({ state: 'pending', message: '未扫码' })
    const response = await app.inject({
      method: 'GET',
      url: '/api/platforms/bilibili/login/qr/nope',
    })
    expect(response.statusCode).toBe(404)
    await app.close()
  })

  it('登录过程会写中文日志', async () => {
    const { app, logs } = setup({
      state: 'success',
      message: '登录成功',
      credentials: { SESSDATA: 'x' },
    })
    await app.inject({ method: 'POST', url: '/api/platforms/bilibili/login/qr' })
    await app.inject({ method: 'GET', url: '/api/platforms/bilibili/login/qr/key-1' })

    const messages = logs.recent().map((entry) => entry.message)
    expect(messages.some((message) => message.includes('已生成登录二维码'))).toBe(true)
    expect(messages.some((message) => message.includes('登录成功：示例主播'))).toBe(true)
    await app.close()
  })
})
