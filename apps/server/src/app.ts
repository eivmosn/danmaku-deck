import Fastify, { type FastifyInstance } from 'fastify'
import { registerHookRoutes } from './http/hooks.js'
import { registerStatusRoutes } from './http/status.js'
import { Orchestrator } from './orchestrator.js'

export interface BuildAppOptions {
  logger?: boolean
  orchestrator?: Orchestrator
}

/** 组装 Fastify 实例，便于测试注入 */
export function buildApp(options: BuildAppOptions = {}): FastifyInstance {
  const orchestrator = options.orchestrator ?? new Orchestrator()
  const app = Fastify({ logger: options.logger ?? false })

  registerStatusRoutes(app, orchestrator)
  registerHookRoutes(app, orchestrator)

  return app
}
