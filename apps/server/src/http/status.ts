import type { FastifyInstance } from 'fastify'
import type { Orchestrator } from '../orchestrator.js'

export function registerStatusRoutes(app: FastifyInstance, orchestrator: Orchestrator): void {
  app.get('/api/health', async () => ({ ok: true }))

  app.get('/api/status', async () => orchestrator.snapshot())

  // SSE：状态变化立刻推给 App / Web
  app.get('/api/events', (request, reply) => {
    reply.raw.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    })

    const send = (status: unknown): void => {
      reply.raw.write(`data: ${JSON.stringify(status)}\n\n`)
    }

    send(orchestrator.snapshot())
    const unsubscribe = orchestrator.onStatus(send)
    request.raw.on('close', () => {
      unsubscribe()
      reply.raw.end()
    })
  })
}
