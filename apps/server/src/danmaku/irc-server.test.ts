import { connect } from 'node:net'
import { afterEach, describe, expect, it } from 'vitest'
import type { DanmakuEvent } from '@ps5lb/shared'
import { IrcServer } from './irc-server'

let server: IrcServer | null = null
let nextPort = 17667

/** 起一个服务端并接一个假 PS5 客户端，返回收到的所有行 */
async function setup(): Promise<{
  irc: IrcServer
  received: string[]
  send: (line: string) => void
  waitFor: (predicate: (lines: string[]) => boolean) => Promise<void>
}> {
  const port = nextPort++
  const irc = new IrcServer({ port, enterWindowMs: 50 })
  await irc.listen()
  server = irc

  const received: string[] = []
  const socket = connect(port, '127.0.0.1')
  socket.on('data', (chunk) =>
    received.push(...chunk.toString('utf8').split('\r\n').filter(Boolean)),
  )
  await new Promise<void>((resolve) => socket.once('connect', () => resolve()))

  const send = (line: string): void => {
    socket.write(`${line}\r\n`)
  }

  const waitFor = (predicate: (lines: string[]) => boolean): Promise<void> =>
    new Promise((resolve, reject) => {
      let attempts = 0
      const check = (): void => {
        if (predicate(received)) {
          resolve()
          return
        }
        attempts += 1
        if (attempts > 100) {
          reject(new Error(`等待超时，当前收到：${received.join(' | ')}`))
          return
        }
        setTimeout(check, 20)
      }
      check()
    })

  return { irc, received, send, waitFor }
}

const chat = (text: string, user = '苏苏花'): DanmakuEvent => ({
  platform: 'bilibili',
  kind: 'chat',
  user,
  text,
  count: 0,
  at: '2026-11-20T10:00:00Z',
})

afterEach(async () => {
  await server?.close()
  server = null
})

describe('IrcServer', () => {
  it('完成 Twitch 握手并回复 PING', async () => {
    const { received, send, waitFor } = await setup()

    send('PASS oauth:test')
    send('NICK justinfan1')
    send('USER justinfan1 8 * :justinfan1')

    await waitFor((lines) => lines.some((line) => line.includes('376')))
    expect(received.some((line) => line.includes('001 justinfan1'))).toBe(true)

    send('PING tmi.twitch.tv')
    await waitFor((lines) => lines.some((line) => line.startsWith(':tmi.twitch.tv PONG')))
  })

  it('加入频道后能收到弹幕', async () => {
    const { irc, send, waitFor } = await setup()

    send('NICK justinfan2')
    send('USER justinfan2 8 * :justinfan2')
    send('JOIN #ps5')
    await waitFor((lines) => lines.some((line) => line.includes('366')))

    irc.broadcast(chat('来了老弟'))
    await waitFor((lines) => lines.some((line) => line.includes('PRIVMSG #ps5 :来了老弟')))
  })

  it('没加入频道前不推送', async () => {
    const { irc, received, send, waitFor } = await setup()

    send('NICK justinfan3')
    irc.broadcast(chat('提前发的'))
    await new Promise<void>((resolve) => setTimeout(resolve, 120))
    expect(received.some((line) => line.includes('PRIVMSG'))).toBe(false)

    send('JOIN #ps5')
    await waitFor((lines) => lines.some((line) => line.includes('366')))
    irc.broadcast(chat('后来的'))
    await waitFor((lines) => lines.some((line) => line.includes('后来的')))
  })

  it('进场事件在窗口内合并成一条', async () => {
    const { irc, send, waitFor } = await setup()

    send('NICK justinfan4')
    send('JOIN #ps5')
    await waitFor((lines) => lines.some((line) => line.includes('366')))

    for (const user of ['甲', '乙', '丙']) {
      irc.broadcast({ ...chat('', user), kind: 'enter', text: '进入了直播间' })
    }
    await waitFor((lines) => lines.some((line) => line.includes('等 3 人进入了直播间')))
  })

  it('礼物按统一文案推送', async () => {
    const { irc, send, waitFor } = await setup()

    send('NICK justinfan5')
    send('JOIN #ps5')
    await waitFor((lines) => lines.some((line) => line.includes('366')))

    irc.broadcast({
      ...chat('', '甜心'),
      platform: 'xiaohongshu',
      kind: 'gift',
      text: '花',
      count: 3,
    })
    await waitFor((lines) => lines.some((line) => line.includes('PRIVMSG #ps5 :送出 花 ×3')))
  })
})
