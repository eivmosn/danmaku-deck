import { buildApp } from './app.js'
import { printBanner } from './banner.js'
import { loadConfig } from './config.js'

const config = loadConfig()
const app = buildApp({ logger: config.logLevel !== 'fatal' })

await printBanner({
  version: process.env.PS5LB_VERSION ?? '0.0.1',
  host: config.host,
  port: config.port,
  mode: process.env.NODE_ENV ?? 'development',
})

await app.listen({ host: config.host, port: config.port })

const shutdown = async (signal: string): Promise<void> => {
  app.log.info({ signal }, '准备退出')
  await app.close()
  process.exit(0)
}

process.on('SIGINT', () => void shutdown('SIGINT'))
process.on('SIGTERM', () => void shutdown('SIGTERM'))
