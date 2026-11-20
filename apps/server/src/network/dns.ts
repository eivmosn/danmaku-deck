import { createSocket, type Socket } from 'node:dgram'
import type { AddressInfo } from 'node:net'

/**
 * 最小 DNS 服务：只做「按域名改写 A 记录」，其余查询转发给上游。
 *
 * 用途是让 PS5 以为 Twitch 的推流/聊天域名在 NAS 上：
 *   contribute.live-video.net / irc.twitch.tv / *.twitch.tv
 * 只解析 A 记录（IPv4）和内联的 OPT 记录，够用且实现简单。
 */

export interface DnsQuery {
  id: number
  name: string
  type: number
  /** 原始查询的前半段，回复时原样带回 */
  questionEnd: number
}

const TYPE_A = 1
const TYPE_OPT = 41

/** 解析问题段；只支持单问题查询（PS5 只发这种） */
export function parseQuery(packet: Buffer): DnsQuery | null {
  if (packet.length < 12) return null
  const flags = packet.readUInt16BE(2)
  const qdcount = packet.readUInt16BE(4)
  // 只看标准查询
  if ((flags & 0x8000) !== 0 || qdcount < 1) return null

  let offset = 12
  const labels: string[] = []
  while (offset < packet.length) {
    const length = packet[offset] ?? 0
    if (length === 0) {
      offset += 1
      break
    }
    if ((length & 0xc0) !== 0) return null
    const label = packet.subarray(offset + 1, offset + 1 + length).toString('ascii')
    labels.push(label)
    offset += 1 + length
  }
  if (packet.length < offset + 4) return null

  const type = packet.readUInt16BE(offset)
  return {
    id: packet.readUInt16BE(0),
    name: labels.join('.').toLowerCase(),
    type,
    questionEnd: offset + 4,
  }
}

/** 构造只有一条 A 记录的应答 */
export function buildAResponse(query: DnsQuery, ip: string, ttl = 60): Buffer {
  const header = Buffer.alloc(12)
  header.writeUInt16BE(query.id, 0)
  // 标准响应 + 递归可用
  header.writeUInt16BE(0x8180, 2)
  header.writeUInt16BE(1, 4) // qdcount
  header.writeUInt16BE(1, 6) // ancount
  header.writeUInt16BE(0, 8)
  header.writeUInt16BE(0, 10)

  const answer = Buffer.alloc(16)
  // 指针指回问题段的名字
  answer.writeUInt16BE(0xc00c, 0)
  answer.writeUInt16BE(TYPE_A, 2)
  answer.writeUInt16BE(1, 4) // IN
  answer.writeUInt32BE(ttl, 6)
  answer.writeUInt16BE(4, 10)
  const octets = ip.split('.').map((part) => Number(part))
  answer[12] = octets[0] ?? 0
  answer[13] = octets[1] ?? 0
  answer[14] = octets[2] ?? 0
  answer[15] = octets[3] ?? 0

  return Buffer.concat([header, buildQuestion(query), answer])
}

/** 构造「没有这条记录」的应答（NOERROR + 0 条答案），让客户端立刻回落到 A 记录 */
export function buildEmptyResponse(query: DnsQuery): Buffer {
  const header = Buffer.alloc(12)
  header.writeUInt16BE(query.id, 0)
  // 标准响应 + 递归可用；rcode 0 表示查询成功，只是没有该类型的记录
  header.writeUInt16BE(0x8180, 2)
  header.writeUInt16BE(1, 4) // qdcount
  header.writeUInt16BE(0, 6) // ancount
  header.writeUInt16BE(0, 8) // nscount
  header.writeUInt16BE(0, 10) // arcount
  return Buffer.concat([header, buildQuestion(query)])
}

/** 原样重建问题段（不依赖压缩指针，简单可靠） */
export function buildQuestion(query: DnsQuery): Buffer {
  const parts = query.name.split('.').filter(Boolean)
  const chunks: Buffer[] = []
  for (const part of parts) {
    const label = Buffer.from(part, 'ascii')
    chunks.push(Buffer.from([label.length]), label)
  }
  chunks.push(Buffer.from([0]))
  const tail = Buffer.alloc(4)
  tail.writeUInt16BE(query.type, 0)
  tail.writeUInt16BE(1, 2) // IN
  chunks.push(tail)
  return Buffer.concat(chunks)
}

/** 判断域名是否需要被劫持（含子域） */
export function shouldHijack(name: string, domains: string[]): boolean {
  return domains.some((domain) => name === domain || name.endsWith(`.${domain}`))
}

export interface DnsServerOptions {
  port?: number
  address?: string
  /** 这些域名的 A 记录改写为 hijackIp */
  hijackDomains: string[]
  hijackIp: string
  /** 未命中劫持时转发到上游 */
  upstream?: { address: string; port?: number }
  onResolve?: (name: string, hijacked: boolean) => void
}

export class DnsServer {
  private socket: Socket | null = null
  private readonly options: Required<Omit<DnsServerOptions, 'onResolve'>> & {
    onResolve?: DnsServerOptions['onResolve']
  }

  constructor(options: DnsServerOptions) {
    this.options = {
      port: 53,
      address: '0.0.0.0',
      upstream: { address: '223.5.5.5', port: 53 },
      ...options,
    }
  }

  listen(): Promise<void> {
    return new Promise((resolve, reject) => {
      const socket = createSocket('udp4')
      socket.once('error', reject)
      socket.on('message', (packet, remote) => {
        void this.handle(packet, remote.address, remote.port)
      })
      socket.bind(this.options.port, this.options.address, () => {
        socket.off('error', reject)
        resolve()
      })
      this.socket = socket
    })
  }

  close(): void {
    this.socket?.close()
    this.socket = null
  }

  private async handle(packet: Buffer, host: string, port: number): Promise<void> {
    const query = parseQuery(packet)
    if (!query) return

    const hijackedDomain = shouldHijack(query.name, this.options.hijackDomains)
    const hijacked = hijackedDomain && query.type === TYPE_A
    this.options.onResolve?.(query.name, hijacked)

    if (hijacked) {
      this.socket?.send(buildAResponse(query, this.options.hijackIp), port, host)
      return
    }
    if (query.type === TYPE_OPT) return

    // 被劫持的域名只认我们的 A 记录：AAAA 绝不能再转给上游，
    // 否则国内 DNS 会返回被污染的地址（实测 ingest.twitch.tv 的 AAAA
    // 是 2a03:2880:...:face:b00c:...，Facebook 的段），PS5 会优先走 IPv6 连到不存在的机器。
    if (hijackedDomain) {
      this.socket?.send(buildEmptyResponse(query), port, host)
      return
    }

    const forwarded = await this.forward(packet)
    if (forwarded) this.socket?.send(forwarded, port, host)
  }

  /** 转发到上游；失败就不回复，让客户端自己超时重试 */
  private forward(packet: Buffer): Promise<Buffer | null> {
    return new Promise((resolve) => {
      const client = createSocket('udp4')
      const timer = setTimeout(() => {
        client.close()
        resolve(null)
      }, 2000)

      client.once('message', (response) => {
        clearTimeout(timer)
        client.close()
        resolve(response)
      })
      client.once('error', () => {
        clearTimeout(timer)
        client.close()
        resolve(null)
      })
      client.send(packet, this.options.upstream.port, this.options.upstream.address)
    })
  }
}

export type { AddressInfo }
