import { platformSchema } from '@ps5lb/shared'
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify'
import { z } from 'zod'
import type { LogService } from '@/logger'
import type { PushTargetsStore } from '@/push/targets-store'

const bodySchema = z.object({
  server: z.string().min(1),
  key: z.string().min(1),
})

export function registerPushRoutes(
  app: FastifyInstance,
  store: PushTargetsStore,
  logs: LogService,
): void {
  app.get('/api/push/targets', async () => ({ ok: true, targets: store.snapshot() }))

  app.put('/api/push/targets/:platform', async (request: FastifyRequest, reply: FastifyReply) => {
    const platform = platformSchema.safeParse((request.params as { platform?: string }).platform)
    const body = bodySchema.safeParse(request.body)
    if (!platform.success || !body.success) {
      reply.code(400)
      return { ok: false, error: '平台或地址不正确' }
    }
    store.set(platform.data, { server: body.data.server, key: body.data.key })
    logs.write('info', platform.data === 'bilibili' ? 'B站' : '小红书', '已更新推流地址', {
      server: body.data.server,
    })
    return { ok: true }
  })

  app.delete(
    '/api/push/targets/:platform',
    async (request: FastifyRequest, reply: FastifyReply) => {
      const platform = platformSchema.safeParse((request.params as { platform?: string }).platform)
      if (!platform.success) {
        reply.code(400)
        return { ok: false, error: '平台不正确' }
      }
      store.clear(platform.data)
      return { ok: true }
    },
  )
}
