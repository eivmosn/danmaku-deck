import Fastify, { type FastifyInstance } from 'fastify'
import { LiveStateStore } from './state.js'

export interface BuildAppOptions {
  logger?: boolean
  store?: LiveStateStore
}

/** 组装 Fastify 实例，便于测试注入 */
export function buildApp(options: BuildAppOptions = {}): FastifyInstance {
  const store = options.store ?? new LiveStateStore()
  const app = Fastify({ logger: options.logger ?? false })

  app.get('/api/health', async () => ({ ok: true }))

  app.get('/api/status', async () => store.snapshot())

  return app
}
