import { buildApp } from './app.js'
import { loadConfig } from './config.js'

const config = loadConfig()
const app = buildApp({ logger: config.logLevel !== 'fatal' })

await app.listen({ host: config.host, port: config.port })

const shutdown = async (signal: string): Promise<void> => {
  app.log.info({ signal }, '准备退出')
  await app.close()
  process.exit(0)
}

process.on('SIGINT', () => void shutdown('SIGINT'))
process.on('SIGTERM', () => void shutdown('SIGTERM'))
