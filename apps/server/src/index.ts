import { buildApp } from '@/app'
import { printBanner } from '@/banner'
import { loadConfig } from '@/config'
import { createLogger, LogService } from '@/logger'
import { Orchestrator } from '@/orchestrator'

const config = loadConfig()
const logs = new LogService({ dir: process.env.PS5LB_LOG_DIR ?? 'logs' })
const orchestrator = new Orchestrator({ logger: createLogger(logs, '收流') })
const app = buildApp({ orchestrator, logs, logger: config.logLevel !== 'fatal' })

await printBanner({
  version: process.env.PS5LB_VERSION ?? '0.0.1',
  host: config.host,
  port: config.port,
  mode: process.env.NODE_ENV ?? 'development',
})

await app.listen({ host: config.host, port: config.port })
createLogger(logs, '系统').info('服务已启动', { host: config.host, port: config.port })

const shutdown = async (signal: string): Promise<void> => {
  app.log.info({ signal }, '准备退出')
  await app.close()
  process.exit(0)
}

process.on('SIGINT', () => void shutdown('SIGINT'))
process.on('SIGTERM', () => void shutdown('SIGTERM'))
