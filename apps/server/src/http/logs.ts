import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import type { LogService } from '../logger.js'

const querySchema = z.object({
  limit: z.coerce.number().int().min(1).max(200).default(100),
})

export function registerLogRoutes(app: FastifyInstance, logs: LogService): void {
  app.get('/api/logs', async (request, reply) => {
    const parsed = querySchema.safeParse(request.query)
    if (!parsed.success) {
      reply.code(400)
      return { ok: false, error: 'limit 需在 1..200 之间' }
    }
    return { ok: true, entries: logs.recent(parsed.data.limit) }
  })

  app.get('/api/logs/stream', (request, reply) => {
    reply.raw.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    })

    const send = (entry: unknown): void => {
      reply.raw.write(`data: ${JSON.stringify(entry)}\n\n`)
    }

    const unsubscribe = logs.onEntry(send)
    request.raw.on('close', () => {
      unsubscribe()
      reply.raw.end()
    })
  })
}
