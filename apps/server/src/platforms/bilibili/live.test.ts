import { describe, expect, it } from 'vitest'
import { BilibiliLive } from './live'

/** 响应结构来自 ps5lb /app/core/bili.py start_live 的处理逻辑 */
function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  })
}

function fakeFetch(bodies: Record<string, unknown>) {
  const calls: Array<{ url: string; init?: RequestInit }> = []
  const impl = (async (url: string | URL, init?: RequestInit) => {
    const target = String(url)
    calls.push({ url: target, init })
    for (const [key, body] of Object.entries(bodies)) {
      if (target.includes(key)) return jsonResponse(body)
    }
    return jsonResponse({ code: -1, message: '未预期的请求' })
  }) as unknown as typeof fetch
  return { impl, calls }
}

describe('BilibiliLive', () => {
  it('按顺序拿房间号、时间、版本，最后返回推流地址', async () => {
    const { impl, calls } = fakeFetch({
      room_id_by_uid: { code: 0, data: { room_id: 31455973 } },
      'click/now': { code: 0, data: { now: 1700000000 } },
      getHomePageLiveVersion: { code: 0, data: { build: 1, curr_version: '1.0' } },
      startLive: {
        code: 0,
        data: { rtmp: { addr: 'rtmp://push.example.com/live', code: 'key-1' } },
      },
    })

    const live = new BilibiliLive(impl)
    const target = await live.startLive({ uid: '1', cookie: 'SESSDATA=x', csrf: 'csrf-token' })

    expect(target).toEqual({
      platform: 'bilibili',
      server: 'rtmp://push.example.com/live',
      key: 'key-1',
    })
    expect(calls.map((call) => call.url.split('?')[0])).toEqual([
      'https://api.live.bilibili.com/room/v2/Room/room_id_by_uid',
      'https://api.bilibili.com/x/report/click/now',
      'https://api.live.bilibili.com/xlive/app-blink/v1/liveVersionInfo/getHomePageLiveVersion',
      'https://api.live.bilibili.com/room/v1/Room/startLive',
    ])

    // 开播请求必须带 sign 与 csrf
    const body = String(calls.at(-1)?.init?.body ?? '')
    expect(body).toContain('sign=')
    expect(body).toContain('csrf_token=csrf-token')
    expect(body).toContain('platform=web_electron_link')
  })

  it('开播接口报错时抛出中文原因', async () => {
    const { impl } = fakeFetch({
      room_id_by_uid: { code: 0, data: { room_id: 1 } },
      'click/now': { code: 0, data: { now: 1700000000 } },
      getHomePageLiveVersion: { code: 0, data: {} },
      startLive: { code: -400, message: '分区不可用' },
    })

    const live = new BilibiliLive(impl)
    await expect(live.startLive({ uid: '1', cookie: 'x', csrf: 'c' })).rejects.toThrow('分区不可用')
  })

  it('拿不到房间号时直接失败', async () => {
    const { impl } = fakeFetch({ room_id_by_uid: { code: -1, message: '未登录' } })
    const live = new BilibiliLive(impl)
    await expect(live.startLive({ uid: '1', cookie: 'x', csrf: 'c' })).rejects.toThrow(
      '拿不到直播间号',
    )
  })
})
