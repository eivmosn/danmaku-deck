import { connect, type Socket } from 'node:net'

/**
 * 最小 SOCKS5 客户端，只实现 CONNECT（mihomo 的混合端口支持它）。
 * 用于把 Twitch 的 TLS 流量经代理送出去。
 */
export function socks5Connect(
  proxy: { host: string; port: number },
  target: { host: string; port: number },
): Promise<Socket> {
  return new Promise((resolve, reject) => {
    const socket = connect(proxy.port, proxy.host)
    let stage: 'greeting' | 'request' | 'done' = 'greeting'
    let buffer = Buffer.alloc(0)

    const fail = (reason: string): void => {
      socket.destroy()
      reject(new Error(reason))
    }

    socket.once('connect', () => {
      // 只提供「无认证」方式
      socket.write(Buffer.from([0x05, 0x01, 0x00]))
    })

    socket.on('data', (chunk: Buffer) => {
      buffer = Buffer.concat([buffer, chunk])

      if (stage === 'greeting') {
        if (buffer.length < 2) return
        if (buffer[1] !== 0x00) return fail('代理不接受无认证方式')
        buffer = buffer.subarray(2)
        stage = 'request'

        const host = Buffer.from(target.host, 'ascii')
        const request = Buffer.concat([
          Buffer.from([0x05, 0x01, 0x00, 0x03, host.length]),
          host,
          Buffer.from([(target.port >> 8) & 0xff, target.port & 0xff]),
        ])
        socket.write(request)
      }

      if (stage === 'request') {
        if (buffer.length < 10) return
        if (buffer[1] !== 0x00) return fail(`代理拒绝连接（${buffer[1]}）`)
        stage = 'done'
        socket.removeAllListeners('data')
        // 把已经读到的剩余数据交还给调用方
        if (buffer.length > 10) socket.unshift(buffer.subarray(10))
        resolve(socket)
      }
    })

    socket.once('error', (error) => reject(error))
  })
}
