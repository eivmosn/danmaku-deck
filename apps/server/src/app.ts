import { existsSync } from 'node:fs'
import { join } from 'node:path'
import fastifyStatic from '@fastify/static'
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
  /** 前端构建产物目录，传了才托管 */
  webDir?: string
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
  registerAccountRoutes(app, accounts, orchestrator, logs)

  if (options.webDir && existsSync(join(options.webDir, 'index.html'))) {
    void app.register(fastifyStatic, { root: options.webDir })
    // 前端是单页应用，非 /api 的路径都回 index.html
    app.setNotFoundHandler((request, reply) => {
      if (request.url.startsWith('/api/')) {
        reply.code(404)
        return { ok: false, error: '接口不存在' }
      }
      return reply.sendFile('index.html')
    })
  }
  registerBilibiliLoginRoutes(app, {
    auth: options.bilibiliAuth ?? new BilibiliAuth(),
    accounts,
    orchestrator,
    logs,
  })

  return app
}
