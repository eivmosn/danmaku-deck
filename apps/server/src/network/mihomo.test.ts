import { describe, expect, it } from 'vitest'
import { MihomoClient } from './mihomo'

/** 结构与 NAS 上实际返回一致：{ now, all, ... } */
function jsonResponse(body: unknown, ok = true): Response {
  return new Response(JSON.stringify(body), {
    status: ok ? 200 : 500,
    headers: { 'Content-Type': 'application/json' },
  })
}

describe('MihomoClient', () => {
  it('读取当前节点与节点列表', async () => {
    const client = new MihomoClient({
      fetchImpl: (async () =>
        jsonResponse({
          now: '🇨🇭 瑞士 | CHE',
          all: ['🇸🇬 新加坡 | SGP', '🇨🇭 瑞士 | CHE'],
        })) as typeof fetch,
    })

    const status = await client.status()
    expect(status.group).toBe('AUTO')
    expect(status.node).toBe('🇨🇭 瑞士 | CHE')
    expect(status.nodes).toHaveLength(2)
  })

  it('切节点会 PUT 到对应分组', async () => {
    const calls: Array<{ url: string; init?: RequestInit }> = []
    const client = new MihomoClient({
      fetchImpl: (async (url: string | URL, init?: RequestInit) => {
        calls.push({ url: String(url), init })
        return new Response(null, { status: 204 })
      }) as unknown as typeof fetch,
    })

    expect(await client.selectNode('🇸🇬 新加坡 | SGP')).toBe(true)
    expect(calls[0]?.url).toContain('/proxies/AUTO')
    expect(String(calls[0]?.init?.body)).toContain('新加坡')
  })

  it('重载配置带上 force 与路径', async () => {
    let seen = ''
    const client = new MihomoClient({
      fetchImpl: (async (url: string | URL, init?: RequestInit) => {
        seen = `${String(url)}|${String(init?.body ?? '')}`
        return new Response(null, { status: 204 })
      }) as unknown as typeof fetch,
    })

    await client.reload('/root/.config/mihomo/config.yaml')
    expect(seen).toContain('force=true')
    expect(seen).toContain('/root/.config/mihomo/config.yaml')
  })

  it('接口不可用时抛出原因', async () => {
    const client = new MihomoClient({
      fetchImpl: (async () => jsonResponse({}, false)) as typeof fetch,
    })
    await expect(client.status()).rejects.toThrow('mihomo 返回 500')
  })
})
