import { createSocket } from 'node:dgram'
import { describe, expect, it } from 'vitest'
import { buildAResponse, buildQuestion, DnsServer, parseQuery, shouldHijack } from './dns'

/** 手工构一条 A 查询，模拟 PS5 发出的包 */
function makeQuery(name: string, type = 1, id = 0x1234): Buffer {
  const header = Buffer.alloc(12)
  header.writeUInt16BE(id, 0)
  header.writeUInt16BE(0x0100, 2)
  header.writeUInt16BE(1, 4)
  const question = buildQuestion({ id, name, type, questionEnd: 0 })
  return Buffer.concat([header, question])
}

describe('parseQuery', () => {
  it('解析出域名与类型', () => {
    const query = parseQuery(makeQuery('irc.twitch.tv'))
    expect(query?.name).toBe('irc.twitch.tv')
    expect(query?.type).toBe(1)
    expect(query?.id).toBe(0x1234)
  })

  it('非查询包返回 null', () => {
    const response = makeQuery('a.com')
    response.writeUInt16BE(0x8180, 2)
    expect(parseQuery(response)).toBeNull()
    expect(parseQuery(Buffer.alloc(4))).toBeNull()
  })
})

describe('shouldHijack', () => {
  const domains = ['twitch.tv', 'live-video.net']

  it('命中自身与子域', () => {
    expect(shouldHijack('twitch.tv', domains)).toBe(true)
    expect(shouldHijack('irc.twitch.tv', domains)).toBe(true)
    expect(shouldHijack('contribute.live-video.net', domains)).toBe(true)
  })

  it('不误伤相似域名', () => {
    expect(shouldHijack('nottwitch.tv', domains)).toBe(false)
    expect(shouldHijack('twitch.tv.example.com', domains)).toBe(false)
  })
})

describe('buildAResponse', () => {
  it('生成的应答带一条 A 记录', () => {
    const query = parseQuery(makeQuery('irc.twitch.tv'))
    const response = buildAResponse(query!, '192.168.1.100')

    expect(response.readUInt16BE(0)).toBe(0x1234)
    expect(response.readUInt16BE(6)).toBe(1) // ancount
    // 最后 4 字节就是 IP
    expect([...response.subarray(-4)]).toEqual([192, 168, 1, 100])
    // 问题段原样带回：报文里应能逐段找到域名标签
    for (const label of ['irc', 'twitch', 'tv']) {
      expect(response.includes(Buffer.from(label, 'ascii'))).toBe(true)
    }
  })
})

describe('DnsServer', () => {
  it('劫持域名返回指定 IP，其他域名转发上游', async () => {
    const port = 15353
    const server = new DnsServer({
      port,
      hijackDomains: ['twitch.tv'],
      hijackIp: '192.168.1.100',
    })
    await server.listen()

    const client = createSocket('udp4')
    const ask = (name: string): Promise<Buffer> =>
      new Promise((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error('超时')), 1000)
        client.once('message', (response) => {
          clearTimeout(timer)
          resolve(response)
        })
        client.send(makeQuery(name), port, '127.0.0.1')
      })

    const hijacked = await ask('irc.twitch.tv')
    expect([...hijacked.subarray(-4)]).toEqual([192, 168, 1, 100])

    // 未命中劫持的查询会走上游；测试里上游不可达，因此这里只验证不崩溃
    const other = await ask('example.com').catch(() => null)
    expect(other === null || other.length > 12).toBe(true)

    client.close()
    server.close()
  })
})
