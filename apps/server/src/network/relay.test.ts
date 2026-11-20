import { connect, createServer, type Server } from 'node:net'
import { connect as tlsConnect } from 'node:tls'
import { afterEach, describe, expect, it } from 'vitest'
import { SniRelay } from './relay'
import { matchesDomain, parseClientHello } from './sni'
import { socks5Connect } from './socks5'

/**
 * 用 Node 的 TLS 客户端真实发起一次握手，抓下它发出的 ClientHello 字节，
 * 以此验证解析器对真实报文的处理（而不是手搓字节）。
 */
async function captureClientHello(servername: string): Promise<Buffer> {
  let captured: Buffer = Buffer.alloc(0)
  const server = createServer((socket) => {
    socket.once('data', (chunk: Buffer) => {
      captured = chunk
      socket.destroy()
    })
  })
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  const port = (server.address() as { port: number }).port

  await new Promise<void>((resolve) => {
    const client = tlsConnect({ host: '127.0.0.1', port, servername, rejectUnauthorized: false })
    client.on('error', () => resolve())
    client.on('secureConnect', () => {
      client.destroy()
      resolve()
    })
  })
  await new Promise((resolve) => setTimeout(resolve, 10))
  server.close()
  return captured
}

let relay: SniRelay | null = null
let target: Server | null = null

afterEach(async () => {
  await relay?.close()
  relay = null
  target?.close()
  target = null
})

describe('parseClientHello', () => {
  it('从真实 ClientHello 里取出 SNI', async () => {
    const hello = await captureClientHello('contribute.live-video.net')
    expect(hello.length).toBeGreaterThan(40)
    expect(parseClientHello(hello)?.sni).toBe('contribute.live-video.net')
  })

  it('数据不足时返回 null 等待更多数据', async () => {
    const hello = await captureClientHello('irc.twitch.tv')
    expect(parseClientHello(hello.subarray(0, 20))).toBeNull()
  })

  it('非 TLS 数据没有 SNI', () => {
    expect(
      parseClientHello(Buffer.from([0x47, 0x45, 0x54, 0x20, 0x2f, 0x20, 0x48]))?.sni,
    ).toBeNull()
  })
})

describe('matchesDomain', () => {
  const domains = ['twitch.tv', 'live-video.net']
  it('命中自身与子域，不误伤相似域名', () => {
    expect(matchesDomain('gql.twitch.tv', domains)).toBe(true)
    expect(matchesDomain('live-video.net', domains)).toBe(true)
    expect(matchesDomain('nottwitch.tv', domains)).toBe(false)
  })
})

describe('socks5Connect', () => {
  it('完成 SOCKS5 握手并把目标地址发给代理', async () => {
    let received = Buffer.alloc(0)
    let greeted = false
    const proxy = createServer((socket) => {
      socket.on('data', (chunk: Buffer) => {
        received = Buffer.concat([received, chunk])
        if (!greeted && received.length >= 3) {
          greeted = true
          socket.write(Buffer.from([0x05, 0x00]))
          return
        }
        // 请求头 4 字节 + 地址类型 1 + 域名长度 1 + 域名 + 端口 2
        if (greeted && received.length >= 7) {
          const nameLength = received[3 + 1 + 1] ?? 0
          if (received.length >= 3 + 5 + nameLength + 2) {
            socket.write(Buffer.from([0x05, 0x00, 0x00, 0x01, 0, 0, 0, 0, 0, 0]))
          }
        }
      })
    })
    await new Promise<void>((resolve) => proxy.listen(0, '127.0.0.1', resolve))
    const port = (proxy.address() as { port: number }).port

    const socket = await socks5Connect(
      { host: '127.0.0.1', port },
      { host: 'irc.twitch.tv', port: 443 },
    )
    await new Promise((resolve) => setTimeout(resolve, 20))

    expect(received.includes(Buffer.from('irc.twitch.tv'))).toBe(true)
    socket.destroy()
    proxy.close()
  })
})

describe('SniRelay', () => {
  it('按 SNI 判定路由：twitch 域名走代理、其他直连', async () => {
    target = createServer((socket) => socket.on('data', (chunk: Buffer) => socket.write(chunk)))
    await new Promise<void>((resolve) => target?.listen(0, '127.0.0.1', () => resolve()))

    const routes: Array<{ host: string; viaProxy: boolean }> = []
    relay = new SniRelay({
      port: 0,
      proxyDomains: ['twitch.tv'],
      proxy: { host: '127.0.0.1', port: 1 },
      fallbackDirect: true,
      onRoute: (host, viaProxy) => routes.push({ host, viaProxy }),
    })
    await relay.listen()

    const relayPort = (
      (relay as unknown as { server: Server }).server.address() as { port: number }
    ).port
    const hello = await captureClientHello('www.twitch.tv')

    const client = connect(relayPort, '127.0.0.1')
    await new Promise<void>((resolve) => client.once('connect', () => resolve()))
    client.write(hello)
    await new Promise((resolve) => setTimeout(resolve, 60))

    expect(routes).toEqual([{ host: 'www.twitch.tv', viaProxy: true }])
    client.destroy()
  })
})
