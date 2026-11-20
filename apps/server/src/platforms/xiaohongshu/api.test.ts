import { describe, expect, it } from 'vitest'
import { extractPush, XiaohongshuApi } from './api'

/** 响应结构来自现有桥（xhs-bridge.mjs）的实际解析逻辑 */
function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  })
}

describe('extractPush', () => {
  it('优先取 main_push_info 下划线与驼峰两种命名', () => {
    expect(
      extractPush({ main_push_info: { stream_key: 'k1', server_address: 'rtmp://a/' } }),
    ).toEqual({
      key: 'k1',
      server: 'rtmp://a/',
    })
    expect(extractPush({ mainPushInfo: { streamKey: 'k2', serverAddress: 'rtmp://b/' } })).toEqual({
      key: 'k2',
      server: 'rtmp://b/',
    })
  })

  it('回退到 push_url 字段，服务器用默认值', () => {
    const info = extractPush({ push_url: 'k3' })
    expect(info.key).toBe('k3')
    expect(info.server).toBe('rtmp://live-push.xhscdn.com/live/')
  })
})

describe('XiaohongshuApi', () => {
  it('host_auth_info 返回 OBS 权限', async () => {
    const api = new XiaohongshuApi(async () => jsonResponse({ code: 0, data: { allow_obs: true } }))
    expect(await api.hostAuth('a1=x')).toEqual({ ok: true, data: { allowObs: true } })
  })

  it('没有权限时返回 allowObs=false 而不是报错', async () => {
    const api = new XiaohongshuApi(async () => jsonResponse({ code: 0, data: { allow_obs: 0 } }))
    expect(await api.hostAuth('a1=x')).toEqual({ ok: true, data: { allowObs: false } })
  })

  it('用开播码换到推流地址', async () => {
    const calls: string[] = []
    const api = new XiaohongshuApi(async (url) => {
      calls.push(String(url))
      return jsonResponse({
        code: 0,
        data: {
          main_push_info: { stream_key: 'room?txSecret=abc', server_address: 'rtmp://push/' },
        },
      })
    })

    const result = await api.pushUrlByCode('a1=x', '985074')
    expect(result.ok).toBe(true)
    expect(result.data).toEqual({ key: 'room?txSecret=abc', server: 'rtmp://push/' })
    expect(calls[0]).toContain('code=985074')
  })

  it('没在直播时 living_push_url 返回失败原因', async () => {
    const api = new XiaohongshuApi(async () => jsonResponse({ code: 0, data: { living: false } }))
    const result = await api.livingPushUrl('a1=x')
    expect(result.ok).toBe(false)
    expect(result.detail).toBe('当前没有在直播')
  })

  it('接口返回业务错误时带上原因', async () => {
    const api = new XiaohongshuApi(async () => jsonResponse({ code: -100, msg: '登录已过期' }))
    const result = await api.hostAuth('a1=x')
    expect(result).toEqual({ ok: false, detail: '登录已过期' })
  })

  it('没有 cookie 时直接返回提示', async () => {
    const api = new XiaohongshuApi(async () => jsonResponse({ code: 0, data: {} }))
    expect(await api.hostAuth('')).toEqual({ ok: false, detail: '还没配置小红书 cookie' })
  })
})
