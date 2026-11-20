import { describe, expect, it } from 'vitest'
import { BilibiliAuth } from './auth'

/** 响应结构来自 2026-11-20 对真实接口的实测，见 auth.ts 顶部注释 */
function jsonResponse(body: unknown, setCookie: string[] = []): Response {
  const headers = new Headers({ 'Content-Type': 'application/json' })
  for (const cookie of setCookie) headers.append('set-cookie', cookie)
  return new Response(JSON.stringify(body), { status: 200, headers })
}

describe('BilibiliAuth', () => {
  it('申请二维码返回 key 与 url', async () => {
    const auth = new BilibiliAuth(async () =>
      jsonResponse({
        code: 0,
        data: { url: 'https://account.bilibili.com/h5?qrcode_key=abc', qrcode_key: 'abc' },
      }),
    )

    const start = await auth.startQR()
    expect(start.key).toBe('abc')
    expect(start.url).toContain('qrcode_key=abc')
  })

  it('未扫码时返回 pending', async () => {
    const auth = new BilibiliAuth(async () =>
      jsonResponse({ code: 0, data: { url: '', code: 86101, message: '未扫码' } }),
    )
    expect(await auth.pollQR('abc')).toEqual({ state: 'pending', message: '未扫码' })
  })

  it('已扫码待确认返回 scanned，过期返回 expired', async () => {
    const scanned = new BilibiliAuth(async () =>
      jsonResponse({ code: 0, data: { code: 86090, message: '已扫码' } }),
    )
    expect((await scanned.pollQR('abc')).state).toBe('scanned')

    const expired = new BilibiliAuth(async () =>
      jsonResponse({ code: 0, data: { code: 86038, message: '二维码已过期' } }),
    )
    expect((await expired.pollQR('abc')).state).toBe('expired')
  })

  it('登录成功从 Set-Cookie 解析出凭证', async () => {
    const auth = new BilibiliAuth(async () =>
      jsonResponse(
        {
          code: 0,
          data: {
            code: 0,
            message: '0',
            url: 'https://passport.biligame.com/crossDomain?DedeUserID=42',
          },
        },
        [
          'SESSDATA=abc%2C123; Path=/; Domain=.bilibili.com',
          'bili_jct=token123; Path=/',
          'DedeUserID=42; Path=/',
          'other=skip; Path=/',
        ],
      ),
    )

    const result = await auth.pollQR('abc')
    expect(result.state).toBe('success')
    expect(result.credentials).toMatchObject({
      SESSDATA: 'abc,123',
      bili_jct: 'token123',
      DedeUserID: '42',
    })
    expect(result.credentials?.other).toBeUndefined()
  })

  it('凭证无效时 profile 抛错', async () => {
    const auth = new BilibiliAuth(async () => jsonResponse({ code: -101, data: {} }))
    await expect(auth.profile({ SESSDATA: 'x' })).rejects.toThrow('凭证无效')
  })

  it('有效凭证返回昵称与 uid', async () => {
    const auth = new BilibiliAuth(async () =>
      jsonResponse({ code: 0, data: { mid: 10010001, uname: '示例主播' } }),
    )
    expect(await auth.profile({ SESSDATA: 'x' })).toEqual({ uid: '10010001', name: '示例主播' })
  })
})
