import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { AccountsStore } from '@/accounts/store'
import { buildApp } from '@/app'
import { LogService } from '@/logger'
import { XiaohongshuApi } from '@/platforms/xiaohongshu/api'
import { PushTargetsStore } from '@/push/targets-store'

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  })
}

function setup(handler: (url: string) => Response) {
  const dir = mkdtempSync(join(tmpdir(), 'ps5lb-xhs-'))
  const accounts = new AccountsStore({ dir })
  const pushTargets = new PushTargetsStore({ dir })
  const logs = new LogService({ console: false })
  const api = new XiaohongshuApi((async (url: string | URL) =>
    handler(String(url))) as typeof fetch)
  const app = buildApp({ accounts, pushTargets, logs, xiaohongshu: api })
  return { app, accounts, pushTargets, logs }
}

describe('小红书接口', () => {
  it('cookie 有效时登录成功并记录 OBS 权限', async () => {
    const { app, accounts, logs } = setup(() =>
      jsonResponse({ code: 0, data: { allow_obs: true } }),
    )

    const response = await app.inject({
      method: 'POST',
      url: '/api/platforms/xiaohongshu/login',
      payload: { cookie: 'a1=abcdef; web_session=xyz' },
    })

    expect(response.statusCode).toBe(200)
    expect(accounts.get('xiaohongshu')?.displayName).toBe('小红书账号')
    expect(logs.recent().some((entry) => entry.message.includes('OBS 权限正常'))).toBe(true)
    await app.close()
  })

  it('cookie 失效时返回 400 并写日志', async () => {
    const { app, accounts, logs } = setup(() => jsonResponse({ code: -100, msg: '登录已过期' }))

    const response = await app.inject({
      method: 'POST',
      url: '/api/platforms/xiaohongshu/login',
      payload: { cookie: 'a1=expired' },
    })

    expect(response.statusCode).toBe(400)
    expect(accounts.get('xiaohongshu')).toBeNull()
    expect(logs.recent().some((entry) => entry.message.includes('登录失败'))).toBe(true)
    await app.close()
  })

  it('6 位开播码兑换后保存推流地址', async () => {
    const { app, accounts, pushTargets } = setup((url) =>
      url.includes('/push_url')
        ? jsonResponse({
            code: 0,
            data: {
              main_push_info: { stream_key: 'room-a?txSecret=x', server_address: 'rtmp://push/' },
            },
          })
        : jsonResponse({ code: 0, data: { allow_obs: true } }),
    )

    await app.inject({
      method: 'POST',
      url: '/api/platforms/xiaohongshu/login',
      payload: { cookie: 'a1=abcdef123456' },
    })
    const response = await app.inject({
      method: 'POST',
      url: '/api/platforms/xiaohongshu/code',
      payload: { code: '985074' },
    })

    expect(response.statusCode).toBe(200)
    expect(pushTargets.get('xiaohongshu')).toEqual({
      platform: 'xiaohongshu',
      server: 'rtmp://push/',
      key: 'room-a?txSecret=x',
    })
    expect(accounts.get('xiaohongshu')).not.toBeNull()
    await app.close()
  })

  it('开播码格式不对返回 400', async () => {
    const { app } = setup(() => jsonResponse({ code: 0, data: {} }))
    const response = await app.inject({
      method: 'POST',
      url: '/api/platforms/xiaohongshu/code',
      payload: { code: '12ab' },
    })
    expect(response.statusCode).toBe(400)
    await app.close()
  })

  it('未登录时兑换开播码返回 409', async () => {
    const { app } = setup(() => jsonResponse({ code: 0, data: {} }))
    const response = await app.inject({
      method: 'POST',
      url: '/api/platforms/xiaohongshu/code',
      payload: { code: '985074' },
    })
    expect(response.statusCode).toBe(409)
    await app.close()
  })
})
