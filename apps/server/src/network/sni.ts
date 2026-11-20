/**
 * 从 TLS ClientHello 里取出 SNI。
 *
 * 结构（RFC 8446 / 5246）：
 *   记录头 5 字节：0x16 | 版本(2) | 长度(2)
 *   握手头 4 字节：0x01 | 长度(3)
 *   版本(2) 随机数(32) 会话ID(1+n) 密码套件(2+n) 压缩(1+n) 扩展(2+n)
 *   扩展里 type=0x0000 的是 SNI：列表长度(2) | 类型(1) | 名字长度(2) | 名字
 */

export interface ParsedClientHello {
  sni: string | null
  /** 这条记录的总长度（含 5 字节记录头），用于知道要读多少 */
  recordLength: number
}

/** 缓冲区不够时返回 null，调用方继续读 */
export function parseClientHello(buffer: Buffer): ParsedClientHello | null {
  if (buffer.length < 5) return null
  if (buffer[0] !== 0x16) return { sni: null, recordLength: 0 }

  const recordLength = 5 + buffer.readUInt16BE(3)
  if (buffer.length < recordLength) return null
  if (buffer.length < 6 + 4) return { sni: null, recordLength }

  if (buffer[5] !== 0x01) return { sni: null, recordLength }

  let offset = 9
  // 版本 + 随机数
  offset += 2 + 32
  if (offset >= recordLength) return { sni: null, recordLength }

  // 会话 ID
  offset += 1 + (buffer[offset] ?? 0)
  if (offset + 2 > recordLength) return { sni: null, recordLength }

  // 密码套件
  offset += 2 + buffer.readUInt16BE(offset)
  if (offset + 1 > recordLength) return { sni: null, recordLength }

  // 压缩方法
  offset += 1 + (buffer[offset] ?? 0)
  if (offset + 2 > recordLength) return { sni: null, recordLength }

  const extLength = buffer.readUInt16BE(offset)
  offset += 2
  const extEnd = Math.min(offset + extLength, recordLength)

  while (offset + 4 <= extEnd) {
    const type = buffer.readUInt16BE(offset)
    const length = buffer.readUInt16BE(offset + 2)
    offset += 4
    if (type === 0x0000 && offset + 5 <= extEnd) {
      const nameLength = buffer.readUInt16BE(offset + 3)
      const name = buffer.subarray(offset + 5, offset + 5 + nameLength).toString('ascii')
      return { sni: name.toLowerCase() || null, recordLength }
    }
    offset += length
  }

  return { sni: null, recordLength }
}

/** 域名是否命中白名单（含子域） */
export function matchesDomain(host: string, domains: string[]): boolean {
  return domains.some((domain) => host === domain || host.endsWith(`.${domain}`))
}
