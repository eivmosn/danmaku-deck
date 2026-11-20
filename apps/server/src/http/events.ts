import { danmakuEventSchema } from '@ps5lb/shared'
import type { FastifyInstance, FastifyReply } from 'fastify'
import type { DanmakuBus } from '@/danmaku-bus'
import { describe, levelFor } from '@/danmaku-format'
import type { LogService } from '@/logger'

export function registerEventRoutes(app: FastifyInstance, logs: LogService, bus: DanmakuBus): void {
  app.post('/api/events/danmaku', async (request, reply: FastifyReply) => {
    const parsed = danmakuEventSchema.safeParse(request.body)
    if (!parsed.success) {
      reply.code(400)
      return { ok: false, error: '弹幕事件格式不正确' }
    }
    const event = parsed.data
    const scope = event.platform === 'bilibili' ? 'B站' : '小红书'
    logs.write(levelFor(event), scope, describe(event), {
      kind: event.kind,
      user: event.user,
    })
    bus.publish(event)
    return { ok: true }
  })

  app.get('/api/events/danmaku/recent', async (request, reply) => {
    const limit = Number((request.query as Record<string, string>).limit ?? 100)
    if (!Number.isInteger(limit) || limit < 1 || limit > 200) {
      reply.code(400)
      return { ok: false, error: 'limit 需在 1..200 之间' }
    }
    return { ok: true, events: bus.recent(limit) }
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
