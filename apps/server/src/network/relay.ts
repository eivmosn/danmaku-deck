import { createServer, connect, type Server, type Socket } from 'node:net'
import { matchesDomain, parseClientHello } from './sni'
import { socks5Connect } from './socks5'

export interface RelayOptions {
  port: number
  host?: string
  /** 这些域名走代理，其余直连 */
  proxyDomains: string[]
  proxy: { host: string; port: number }
  /** 代理不可用时是否直连兜底 */
  fallbackDirect?: boolean
  onRoute?: (host: string, viaProxy: boolean) => void
}

/**
 * TLS SNI 中继：
 * PS5 把 twitch 相关域名的连接重定向到这里，我们按 SNI 决定走代理还是直连，
 * 再把字节流双向转发。
 */
export class SniRelay {
  private server: Server | null = null
  private readonly options: RelayOptions

  constructor(options: RelayOptions) {
    this.options = options
  }

  listen(): Promise<void> {
    return new Promise((resolve, reject) => {
      const server = createServer((socket) => this.handle(socket))
      server.once('error', reject)
      server.listen(this.options.port, this.options.host ?? '0.0.0.0', () => {
        server.off('error', reject)
        resolve()
      })
      this.server = server
    })
  }

  close(): Promise<void> {
    return new Promise((resolve) => {
      if (!this.server) return resolve()
      this.server.close(() => resolve())
      this.server = null
    })
  }

  private handle(client: Socket): void {
    let pending = Buffer.alloc(0)
    let settled = false

    const onData = (chunk: Buffer): void => {
      pending = Buffer.concat([pending, chunk])
      const parsed = parseClientHello(pending)
      if (!parsed) return

      settled = true
      client.off('data', onData)
      client.pause()

      const host = parsed.sni
      if (!host) {
        client.destroy()
        return
      }

      void this.route(client, host, pending).catch(() => client.destroy())
    }

    client.on('data', onData)
    client.once('error', () => client.destroy())
    // 10 秒内没等到完整 ClientHello 就断开，避免半开连接堆积
    setTimeout(() => {
      if (!settled) client.destroy()
    }, 10_000).unref()
  }

  private async route(client: Socket, host: string, initial: Buffer): Promise<void> {
    const viaProxy = matchesDomain(host, this.options.proxyDomains)
    this.options.onRoute?.(host, viaProxy)

    let upstream: Socket | null = null
    if (viaProxy) {
      upstream = await socks5Connect(this.options.proxy, { host, port: 443 }).catch(() => null)
      if (!upstream && !this.options.fallbackDirect) throw new Error('代理不可用')
    }
    upstream ??= connect(443, host)

    await new Promise<void>((resolve, reject) => {
      upstream!.once('connect', () => resolve())
      upstream!.once('error', reject)
    }).catch(() => {
      client.destroy()
      upstream?.destroy()
      throw new Error('目标不可达')
    })

    upstream.write(initial)
    client.pipe(upstream)
    upstream.pipe(client)
    client.resume()

    const cleanup = (): void => {
      client.destroy()
      upstream?.destroy()
    }
    client.once('close', cleanup)
    upstream.once('close', cleanup)
    client.once('error', cleanup)
    upstream.once('error', cleanup)
  }
}
