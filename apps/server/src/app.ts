import Fastify, { type FastifyInstance } from 'fastify'
import { AccountsStore } from '@/accounts/store'
import { DanmakuBus } from '@/danmaku-bus'
import { BilibiliAuth } from '@/platforms/bilibili/auth'
import { registerAccountRoutes } from '@/http/accounts'
import { registerBilibiliLoginRoutes, type BilibiliAuthPort } from '@/http/bilibili-login'
import { registerEventRoutes } from '@/http/events'
import { registerHookRoutes } from '@/http/hooks'
import { registerLogRoutes } from '@/http/logs'
import { registerPlatformRoutes } from '@/http/platforms'
import { registerStatusRoutes } from '@/http/status'
import { createLogger, LogService } from '@/logger'
import { Orchestrator } from '@/orchestrator'

export interface BuildAppOptions {
  logger?: boolean
  orchestrator?: Orchestrator
  logs?: LogService
  bus?: DanmakuBus
  accounts?: AccountsStore
  bilibiliAuth?: BilibiliAuthPort
}

/** 组装 Fastify 实例，便于测试注入 */
export function buildApp(options: BuildAppOptions = {}): FastifyInstance {
  const logs = options.logs ?? new LogService()
  const bus = options.bus ?? new DanmakuBus()
  const accounts = options.accounts ?? new AccountsStore()
  const orchestrator =
    options.orchestrator ?? new Orchestrator({ logger: createLogger(logs, '收流') })
  const app = Fastify({ logger: options.logger ?? false })

  registerStatusRoutes(app, orchestrator)
  registerHookRoutes(app, orchestrator)
  registerLogRoutes(app, logs)
  registerEventRoutes(app, logs, bus)
  registerPlatformRoutes(app, orchestrator)
  registerAccountRoutes(app, accounts)
  registerBilibiliLoginRoutes(app, {
    auth: options.bilibiliAuth ?? new BilibiliAuth(),
    accounts,
    orchestrator,
    logs,
  })

  return app
}
