import Fastify, { type FastifyInstance } from 'fastify'
import { registerEventRoutes } from './http/events.js'
import { registerHookRoutes } from './http/hooks.js'
import { registerLogRoutes } from './http/logs.js'
import { registerStatusRoutes } from './http/status.js'
import { createLogger, LogService } from './logger.js'
import { Orchestrator } from './orchestrator.js'

export interface BuildAppOptions {
  logger?: boolean
  orchestrator?: Orchestrator
  logs?: LogService
}

/** 组装 Fastify 实例，便于测试注入 */
export function buildApp(options: BuildAppOptions = {}): FastifyInstance {
  const logs = options.logs ?? new LogService()
  const orchestrator =
    options.orchestrator ?? new Orchestrator({ logger: createLogger(logs, '收流') })
  const app = Fastify({ logger: options.logger ?? false })

  registerStatusRoutes(app, orchestrator)
  registerHookRoutes(app, orchestrator)
  registerLogRoutes(app, logs)
  registerEventRoutes(app, logs)

  return app
}
