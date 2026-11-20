import { danmakuEventSchema, type DanmakuEvent } from '@ps5lb/shared'
import type { FastifyInstance, FastifyReply } from 'fastify'
import type { DanmakuBus } from '@/danmaku-bus'
import type { LogService } from '@/logger'

/** 把一条弹幕事件转成中文日志文案 */
function describe(event: DanmakuEvent): string {
  switch (event.kind) {
    case 'gift':
      return `${event.user} 送出 ${event.text}${event.count > 1 ? ` ×${event.count}` : ''}`
    case 'guard':
      return `${event.user} 开通了舰长`
    case 'superchat':
      return `${event.user} 发了醒目留言：${event.text}`
    case 'enter':
      return `${event.user} 进入了直播间`
    case 'follow':
      return `${event.user} 关注了主播`
    case 'like':
      return `${event.user} 点了赞`
    default:
      return `${event.user}：${event.text}`
  }
}

export function registerEventRoutes(app: FastifyInstance, logs: LogService, bus: DanmakuBus): void {
  app.post('/api/events/danmaku', async (request, reply: FastifyReply) => {
    const parsed = danmakuEventSchema.safeParse(request.body)
    if (!parsed.success) {
      reply.code(400)
      return { ok: false, error: '弹幕事件格式不正确' }
    }
    const event = parsed.data
    const scope = event.platform === 'bilibili' ? 'B站' : '小红书'
    logs.write(event.kind === 'gift' ? 'info' : 'debug', scope, describe(event), {
      kind: event.kind,
      user: event.user,
    })
    bus.publish(event)
    return { ok: true }
  })

  // 弹幕实时流：Web / App 订阅
  app.get('/api/events/danmaku/stream', (request, reply) => {
    reply.raw.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    })
    const send = (event: unknown): void => {
      reply.raw.write(`data: ${JSON.stringify(event)}\n\n`)
    }
    const unsubscribe = bus.subscribe(send)
    request.raw.on('close', () => {
      unsubscribe()
      reply.raw.end()
    })
  })
}
