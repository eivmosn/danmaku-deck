import { createServer, type Server, type Socket } from 'node:net'
import type { DanmakuEvent } from '@ps5lb/shared'
import { describeBody } from '@/danmaku-format'

/**
 * Twitch 兼容的 IRC 服务，供 PS5 的聊天窗口连接。
 *
 * PS5 连接 irc.twitch.tv:6667 后会走标准 Twitch 流程：
 *   PASS / NICK / USER → 001~004 + MOTD → JOIN #channel → 366
 * 之后服务端主动下发 PRIVMSG 即可显示在 PS5 屏幕上。
 */

/** 去掉换行并截断，避免注入额外 IRC 命令 */
function sanitize(value: string): string {
  return value.replace(/[\r\n]/g, ' ').slice(0, 300)
}

interface Session {
  socket: Socket
  nick: string
  channel: string | null
  buffer: string
}

export interface IrcServerOptions {
  port: number
  host?: string
  /** 一次性把多个进场合并成一条的窗口 */
  enterWindowMs?: number
  now?: () => number
}

export class IrcServer {
  private server: Server | null = null
  private readonly sessions = new Set<Session>()
  private pendingEnters: DanmakuEvent[] = []
  private enterTimer: ReturnType<typeof setTimeout> | null = null
  private readonly options: Required<Omit<IrcServerOptions, 'host'>> & { host: string }

  constructor(options: IrcServerOptions) {
    this.options = {
      host: '0.0.0.0',
      enterWindowMs: 3000,
      now: Date.now,
      ...options,
    }
  }

  get sessionCount(): number {
    return this.sessions.size
  }

  listen(): Promise<void> {
    return new Promise((resolve, reject) => {
      const server = createServer((socket) => this.handleClient(socket))
      server.once('error', reject)
      server.listen(this.options.port, this.options.host, () => {
        server.off('error', reject)
        resolve()
      })
      this.server = server
    })
  }

  close(): Promise<void> {
    if (this.enterTimer) clearTimeout(this.enterTimer)
    this.enterTimer = null
    this.pendingEnters = []
    for (const session of this.sessions) session.socket.destroy()
    this.sessions.clear()
    return new Promise((resolve) => {
      if (!this.server) return resolve()
      this.server.close(() => resolve())
      this.server = null
    })
  }

  /** 把一条弹幕事件广播给所有已加入频道的 PS5 客户端 */
  broadcast(event: DanmakuEvent): void {
    if (event.kind === 'enter') {
      this.pendingEnters.push(event)
      this.enterTimer ??= setTimeout(() => this.flushEnters(), this.options.enterWindowMs)
      return
    }
    this.send(event.user || '观众', describeBody(event))
  }

  private flushEnters(): void {
    this.enterTimer = null
    const batch = this.pendingEnters
    this.pendingEnters = []
    if (batch.length === 0) return

    const names = [...new Set(batch.map((event) => event.user).filter(Boolean))]
    if (names.length === 0) return
    const text =
      names.length > 1
        ? `${names.slice(0, 3).join('、')} 等 ${names.length} 人进入了直播间`
        : `${names[0]} 进入了直播间`
    this.send('入场', text)
  }

  private send(user: string, text: string): void {
    const nick = sanitize(user).replace(/\s+/g, '') || '观众'
    for (const session of this.sessions) {
      if (!session.channel) continue
      session.socket.write(
        `:${nick}!${nick}@tmi.twitch.tv PRIVMSG ${session.channel} :${sanitize(text)}\r\n`,
      )
    }
  }

  private handleClient(socket: Socket): void {
    const session: Session = { socket, nick: 'justinfan', channel: null, buffer: '' }
    this.sessions.add(session)

    socket.on('data', (chunk) => {
      session.buffer += chunk.toString('utf8')
      const lines = session.buffer.split(/\r?\n/)
      session.buffer = lines.pop() ?? ''
      for (const line of lines) {
        if (line.trim()) this.handleLine(session, line.trim())
      }
    })

    const cleanup = (): void => {
      this.sessions.delete(session)
    }
    socket.on('close', cleanup)
    socket.on('error', cleanup)
  }

  private handleLine(session: Session, line: string): void {
    const [rawCommand, ...rest] = line.split(' ')
    const command = (rawCommand ?? '').toUpperCase()

    switch (command) {
      case 'PASS':
        break
      case 'NICK': {
        const nick = rest[0]
        if (nick) session.nick = nick.replace(/^:/, '')
        this.write(session, `:tmi.twitch.tv 001 ${session.nick} :Welcome to the Twitch IRC Server!`)
        this.write(session, `:tmi.twitch.tv 002 ${session.nick} :Your host is tmi.twitch.tv`)
        this.write(session, `:tmi.twitch.tv 003 ${session.nick} :This server is rather new`)
        this.write(session, `:tmi.twitch.tv 004 ${session.nick} :-`)
        break
      }
      case 'USER':
        this.write(session, `:tmi.twitch.tv 375 ${session.nick} :-`)
        this.write(session, `:tmi.twitch.tv 372 ${session.nick} :PS5 Live Bridge`)
        this.write(session, `:tmi.twitch.tv 376 ${session.nick} :End of /MOTD command.`)
        break
      case 'JOIN': {
        const channel = rest[0]?.startsWith('#') ? rest[0] : '#ps5livebridge'
        session.channel = channel
        this.write(session, `:${session.nick}!${session.nick}@tmi.twitch.tv JOIN ${channel}`)
        this.write(session, `:tmi.twitch.tv 366 ${session.nick} ${channel} :End of /NAMES list`)
        break
      }
      case 'PING':
        this.write(
          session,
          `:tmi.twitch.tv PONG tmi.twitch.tv :${rest.join(' ').replace(/^:/, '')}`,
        )
        break
      case 'QUIT':
        session.socket.end()
        break
      default:
        break
    }
  }

  private write(session: Session, line: string): void {
    if (!session.socket.destroyed) session.socket.write(`${line}\r\n`)
  }
}
